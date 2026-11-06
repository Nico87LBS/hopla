package chore

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/nico87lbs/hopla/config"
	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	chRepo "github.com/nico87lbs/hopla/internal/chore/repo"
	fRepo "github.com/nico87lbs/hopla/internal/family/repo"
)

// A one-time task has moments on its own day only, and no next day.
func TestOnceSlots(t *testing.T) {
	familyIn(t, "Europe/Brussels")
	chore := teethChore("07:30", "19:00")
	chore.FrequencyType = chModel.FrequencyTypeOnce
	chore.FrequencyMetadataV2.Day = "2026-10-24"
	chore.FrequencyMetadataV2.Slots[1].Until = "20:00"

	require.Empty(t, slotWindows(chore, brussels(t, 23, 0, 0)), "not its day")
	require.Len(t, slotWindows(chore, brussels(t, 24, 0, 0)), 2)
	require.Empty(t, slotWindows(chore, brussels(t, 25, 0, 0)), "never again")

	// Before its day, it is due at its first moment.
	now := brussels(t, 23, 9, 0)
	next := nextSlotDue(context.Background(), chore, slotStatuses(context.Background(), chore, nil, now), now)
	require.NotNil(t, next)
	require.True(t, next.Equal(brussels(t, 24, 7, 30)))

	// On its day, after the last moment, it is due at nothing.
	now = brussels(t, 24, 21, 0)
	statuses := slotStatuses(context.Background(), chore, nil, now)
	require.Equal(t, chModel.SlotMissed, statuses[1].State)
	require.Nil(t, nextSlotDue(context.Background(), chore, statuses, now))
	require.Nil(t, firstSlotAfterDay(context.Background(), chore, now))
}

func TestNormalizeOnceSlots(t *testing.T) {
	slots := []chModel.Slot{{Time: "08:00"}}
	metadata := &chModel.FrequencyMetadata{Slots: slots, Day: "2026-10-24"}
	require.NoError(t, normalizeSlots(chModel.FrequencyTypeOnce, metadata))
	require.Equal(t, "2026-10-24", metadata.Day)

	require.Error(t, normalizeSlots(chModel.FrequencyTypeOnce, &chModel.FrequencyMetadata{Slots: []chModel.Slot{{Time: "08:00"}}}), "needs a day")
	require.Error(t, normalizeSlots(chModel.FrequencyTypeNoRepeat, &chModel.FrequencyMetadata{Slots: []chModel.Slot{{Time: "08:00"}}, Day: "tomorrow"}))

	// A repeated task keeps no day.
	daily := &chModel.FrequencyMetadata{Slots: []chModel.Slot{{Time: "08:00"}}, Day: "2026-10-24"}
	require.NoError(t, normalizeSlots(chModel.FrequencyTypeDaily, daily))
	require.Empty(t, daily.Day)

	// The day comes from the due date when not given.
	familyIn(t, "Europe/Brussels")
	given := &chModel.FrequencyMetadata{Slots: []chModel.Slot{{Time: "08:00"}}}
	due := brussels(t, 24, 0, 30).UTC()
	setOnceDay(chModel.FrequencyTypeOnce, given, &due, 1)
	require.Equal(t, "2026-10-24", given.Day, "the family's day, not the UTC one")
}

// A moment all day is open from midnight, due at the end of the day.
func TestAllDaySlot(t *testing.T) {
	familyIn(t, "Europe/Brussels")
	chore := teethChore("08:00")
	chore.FrequencyType = chModel.FrequencyTypeOnce
	chore.FrequencyMetadataV2 = &chModel.FrequencyMetadata{
		Timezone: "Europe/Brussels", Day: "2026-10-24",
		Slots: []chModel.Slot{{AllDay: true, Time: "07:00", Until: "09:00"}},
	}
	require.NoError(t, normalizeSlots(chore.FrequencyType, chore.FrequencyMetadataV2))
	slot := chore.FrequencyMetadataV2.Slots[0]
	require.Equal(t, "23:59", slot.Time, "no hour of its own")
	require.Empty(t, slot.Until)

	windows := slotWindows(chore, brussels(t, 24, 0, 0))
	require.Len(t, windows, 1)
	require.True(t, windows[0].AllDay)
	require.True(t, windows[0].OpensAt.Equal(brussels(t, 24, 0, 0)))
	require.True(t, windows[0].At.Equal(brussels(t, 24, 23, 59)))
	require.True(t, windows[0].ClosesAt.Equal(brussels(t, 25, 0, 0)))

	now := brussels(t, 24, 6, 0)
	require.Equal(t, chModel.SlotOpen, slotStatuses(context.Background(), chore, nil, now)[0].State, "open since midnight")

	// It stands alone.
	two := &chModel.FrequencyMetadata{Day: "2026-10-24", Slots: []chModel.Slot{{AllDay: true}, {Time: "18:00"}}}
	require.Error(t, normalizeSlots(chModel.FrequencyTypeOnce, two))
}

// A task every week has its moments on the day of its passage, then on the
// next one, a week later.
func TestWeeklySlots(t *testing.T) {
	familyIn(t, "Europe/Brussels")
	chore := teethChore("08:00")
	chore.FrequencyType = chModel.FrequencyTypeWeekly
	chore.FrequencyMetadataV2.Day = "2026-10-23"
	require.NoError(t, normalizeSlots(chore.FrequencyType, chore.FrequencyMetadataV2))

	require.Len(t, slotWindows(chore, brussels(t, 23, 0, 0)), 1)
	require.Empty(t, slotWindows(chore, brussels(t, 24, 0, 0)))

	// Before its day: due then.
	now := brussels(t, 21, 9, 0)
	next := nextSlotDue(context.Background(), chore, slotStatuses(context.Background(), chore, nil, now), now)
	require.True(t, next.Equal(brussels(t, 23, 8, 0)))

	// Its day, all done or gone: due a week later.
	now = brussels(t, 23, 21, 0)
	statuses := slotStatuses(context.Background(), chore, nil, now)
	statuses[0].State = chModel.SlotDone
	next = nextSlotDue(context.Background(), chore, statuses, now)
	require.NotNil(t, next)
	require.True(t, next.Equal(brussels(t, 30, 8, 0)), "a week later, got %s", next)

	// The calendar lists the passages one after the other.
	list := Occurrences(context.Background(), chore, brussels(t, 20, 0, 0), brussels(t, 31, 0, 0), 10)
	require.Len(t, list, 2)
	require.True(t, list[0].At.Equal(brussels(t, 23, 8, 0)))
	require.True(t, list[1].At.Equal(brussels(t, 30, 8, 0)))
}

// Once its day is over, a task every week moves to its next passage and a
// task done once is archived.
func TestSettlePassages(t *testing.T) {
	_, db, _ := newSlotTestRouter(t)
	familyIn(t, "Europe/Brussels")
	cfg := &config.Config{}
	cfg.Database.Type = "sqlite"
	h := &Handler{choreRepo: chRepo.NewChoreRepository(db, cfg), familyRepo: fRepo.NewFamilyRepository(db)}
	child := 2
	build := func(name string, frequencyType chModel.FrequencyType) *chModel.Chore {
		chore := &chModel.Chore{
			Name: name, FrequencyType: frequencyType, Frequency: 1, IsActive: true, FamilyID: 1, CreatedBy: 1,
			AssignedTo: &child, CreatedAt: brussels(t, 1, 12, 0).UTC(),
			FrequencyMetadataV2: &chModel.FrequencyMetadata{Timezone: "Europe/Brussels", Day: "2026-10-23", Slots: []chModel.Slot{{Time: "08:00"}}},
		}
		require.NoError(t, normalizeSlots(chore.FrequencyType, chore.FrequencyMetadataV2))
		require.NoError(t, db.Create(chore).Error)
		require.NoError(t, db.Create(&chModel.ChoreAssignees{ChoreID: chore.ID, UserID: child}).Error)
		return chore
	}
	weekly, once := build("Poubelles", chModel.FrequencyTypeWeekly), build("Rendez-vous", chModel.FrequencyTypeOnce)

	// The 24th at 10:00, the day of the 23rd is over.
	require.NoError(t, h.SettleMissedSlots(context.Background(), brussels(t, 24, 10, 0).UTC()))

	var after chModel.Chore
	require.NoError(t, db.First(&after, weekly.ID).Error)
	require.True(t, after.IsActive)
	require.Equal(t, "2026-10-30", after.FrequencyMetadataV2.Day)
	require.True(t, after.NextDueDate.Equal(brussels(t, 30, 8, 0)))
	var over chModel.Chore
	require.NoError(t, db.First(&over, once.ID).Error)
	require.False(t, over.IsActive, "a task done once is over")
	require.Nil(t, over.NextDueDate)

	// The missed moment of the 23rd was written for the child, once.
	var missed []chModel.ChoreHistory
	require.NoError(t, db.Where("status = ? AND chore_id = ?", chModel.ChoreHistoryStatusMissed, weekly.ID).Find(&missed).Error)
	require.Len(t, missed, 1)
}
