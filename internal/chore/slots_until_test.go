package chore

import (
	"context"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"github.com/nico87lbs/hopla/config"
	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	chRepo "github.com/nico87lbs/hopla/internal/chore/repo"
	"github.com/nico87lbs/hopla/internal/database"
	fRepo "github.com/nico87lbs/hopla/internal/family/repo"
	"github.com/nico87lbs/hopla/internal/games"
)

// A slot given an end closes then, and the next one does not open before.
func TestSlotUntil(t *testing.T) {
	familyIn(t, "Europe/Brussels")
	chore := teethChore("07:30", "19:00")
	chore.FrequencyMetadataV2.Slots[0].Until = "08:15"
	chore.FrequencyMetadataV2.Slots[1].Until = "20:30"
	day := brussels(t, 23, 0, 0)
	windows := slotWindows(chore, day)
	require.Len(t, windows, 2)
	require.True(t, windows[0].ClosesAt.Equal(brussels(t, 23, 8, 15)))
	require.True(t, windows[1].OpensAt.Equal(brussels(t, 23, 18, 0)), "opens an hour before as usual")
	require.True(t, windows[1].ClosesAt.Equal(brussels(t, 23, 20, 30)), "not at midnight")

	statuses := slotStatuses(context.Background(), chore, nil, brussels(t, 23, 9, 0))
	require.Equal(t, chModel.SlotMissed, statuses[0].State, "past its end")
	require.Equal(t, chModel.SlotUpcoming, statuses[1].State)
	next := nextSlotDue(context.Background(), chore, statuses, brussels(t, 23, 9, 0))
	require.True(t, next.Equal(brussels(t, 23, 19, 0)), "moves on to the next slot")

	// An end later than the next slot's opening pushes it back.
	late := teethChore("07:30", "08:00")
	late.FrequencyMetadataV2.Slots[0].Until = "08:00"
	windows = slotWindows(late, day)
	require.True(t, windows[1].OpensAt.Equal(brussels(t, 23, 8, 0)))
}

func TestNormalizeSlotUntil(t *testing.T) {
	metadata := func(slots ...chModel.Slot) *chModel.FrequencyMetadata {
		return &chModel.FrequencyMetadata{Slots: slots}
	}
	ok := metadata(chModel.Slot{Time: "19:00", Until: " 20:30 "}, chModel.Slot{Time: "07:30", Until: "8:15"})
	require.NoError(t, normalizeSlots(chModel.FrequencyTypeDaily, ok))
	require.Equal(t, "08:15", ok.Slots[0].Until, "sorted and written HH:MM")
	require.Equal(t, "20:30", ok.Slots[1].Until)
	require.Error(t, normalizeSlots(chModel.FrequencyTypeDaily, metadata(chModel.Slot{Time: "19:00", Until: "18:00"})), "before its time")
	require.Error(t, normalizeSlots(chModel.FrequencyTypeDaily,
		metadata(chModel.Slot{Time: "07:30", Until: "12:30"}, chModel.Slot{Time: "12:00"})), "after the next slot")
	require.NoError(t, normalizeSlots(chModel.FrequencyTypeDaily,
		metadata(chModel.Slot{Time: "07:30", Until: "12:00"}, chModel.Slot{Time: "12:00"})), "up to the next slot")
}

// Slots of past days nobody did are written missed once, for the child they
// were for, except on a day she was away or before the task existed.
func TestSettleMissedSlots(t *testing.T) {
	familyIn(t, "Europe/Brussels")
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, database.Migration(db))

	now := brussels(t, 25, 10, 0).UTC()
	child := 2
	chore := &chModel.Chore{
		Name: "Dents", FrequencyType: chModel.FrequencyTypeDaily, Frequency: 1, IsActive: true, FamilyID: 1, CreatedBy: 1,
		AssignedTo: &child, CreatedAt: brussels(t, 22, 12, 0).UTC(),
		FrequencyMetadataV2: &chModel.FrequencyMetadata{Timezone: "Europe/Brussels", Slots: []chModel.Slot{
			{Name: "Matin", Time: "07:30"}, {Name: "Soir", Time: "19:00"},
		}},
	}
	require.NoError(t, normalizeSlots(chore.FrequencyType, chore.FrequencyMetadataV2))
	require.NoError(t, db.Create(chore).Error)
	require.NoError(t, db.Create(&chModel.ChoreAssignees{ChoreID: chore.ID, UserID: child}).Error)
	// The 24th morning was done; the 23rd she was away.
	due, slot0, id0 := brussels(t, 24, 7, 30).UTC(), 0, chore.FrequencyMetadataV2.Slots[0].ID
	performed := due.Add(time.Minute)
	require.NoError(t, db.Create(&chModel.ChoreHistory{ChoreID: chore.ID, CompletedBy: child, PerformedAt: &performed, DueDate: &due,
		Slot: &slot0, SlotID: &id0, Status: chModel.ChoreHistoryStatusCompleted}).Error)
	end := brussels(t, 23, 20, 0).UTC()
	require.NoError(t, db.Create(&games.Absence{FamilyID: 1, UserID: child, StartAt: brussels(t, 23, 6, 0).UTC(), EndAt: &end}).Error)

	cfg := &config.Config{}
	cfg.Database.Type = "sqlite"
	h := &Handler{choreRepo: chRepo.NewChoreRepository(db, cfg), familyRepo: fRepo.NewFamilyRepository(db)}
	for i := 0; i < 2; i++ { // the second pass writes nothing more
		require.NoError(t, h.SettleMissedSlots(context.Background(), now))
	}
	var missed []chModel.ChoreHistory
	require.NoError(t, db.Where("status = ?", chModel.ChoreHistoryStatusMissed).Order("due_date").Find(&missed).Error)
	require.Len(t, missed, 1, "only the 24th evening: the 23rd she was away, the 22nd is further back than the two days looked at")
	require.True(t, missed[0].DueDate.Equal(brussels(t, 24, 19, 0)))
	require.Equal(t, child, missed[0].CompletedBy)
	require.Equal(t, chore.FrequencyMetadataV2.Slots[1].ID, *missed[0].SlotID)
	require.True(t, missed[0].PerformedAt.Equal(brussels(t, 25, 0, 0)), "closed at midnight")
}
