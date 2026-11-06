package chore

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/nico87lbs/hopla/config"
	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	chRepo "github.com/nico87lbs/hopla/internal/chore/repo"
)

// The copies of a task share the identifier of each slot.
func TestAdoptSlotIDsTakesTheIDOfTheSameSlot(t *testing.T) {
	siblings := [][]chModel.Slot{{{ID: "matin", Name: "Matin", Time: "07:30"}, {ID: "soir", Name: "Soir", Time: "19:30"}}}
	slots := []chModel.Slot{{Name: "Soir", Time: "19:30"}, {Name: "Matin renommé", Time: "07:30"}, {Name: "Goûter", Time: "16:00"}}
	chModel.AdoptSlotIDs(slots, siblings)
	require.Equal(t, "soir", slots[0].ID)
	require.Equal(t, "matin", slots[1].ID, "same time, another name")
	require.Empty(t, slots[2].ID, "a new slot gets its own identifier when normalized")

	// An identifier already there is kept, and not given twice.
	slots = []chModel.Slot{{ID: "soir", Time: "07:30"}, {Time: "19:30"}}
	chModel.AdoptSlotIDs(slots, siblings)
	require.Equal(t, "soir", slots[0].ID)
	require.NotEqual(t, "soir", slots[1].ID)
}

// Saving a second copy keeps the slots of the first.
func TestACopyOfATaskGetsTheSlotIDsOfTheFirst(t *testing.T) {
	_, db, first := newSlotTestRouter(t)
	cfg := &config.Config{}
	cfg.Database.Type = "sqlite"
	h := &Handler{choreRepo: chRepo.NewChoreRepository(db, cfg)}
	metadata := &chModel.FrequencyMetadata{Timezone: first.FrequencyMetadataV2.Timezone, Slots: []chModel.Slot{
		{Name: "Matin", Time: first.FrequencyMetadataV2.Slots[0].Time},
		{Name: "Soir", Time: first.FrequencyMetadataV2.Slots[2].Time},
	}}
	require.NoError(t, h.shareSlotIDs(context.Background(), 1, " dents ", 0, metadata))
	require.NoError(t, normalizeSlots(chModel.FrequencyTypeDaily, metadata))
	require.Equal(t, first.FrequencyMetadataV2.Slots[0].ID, metadata.Slots[0].ID)
	require.Equal(t, first.FrequencyMetadataV2.Slots[2].ID, metadata.Slots[1].ID)
}

// What was done under an identifier the task lost is still done.
func TestASlotDoneUnderAnOldIDStaysDone(t *testing.T) {
	chore := teethChore("07:00", "19:00")
	chore.FrequencyMetadataV2.Slots[0].ID, chore.FrequencyMetadataV2.Slots[1].ID = "new-a", "new-b"
	loc, err := time.LoadLocation("Europe/Brussels")
	require.NoError(t, err)
	familyIn(t, "Europe/Brussels")
	now := time.Date(2026, 10, 23, 20, 0, 0, 0, loc)
	due := time.Date(2026, 10, 23, 7, 0, 0, 0, loc).UTC()
	old, index := "old-a", 0
	history := []*chModel.ChoreHistory{{ID: 1, ChoreID: 1, Slot: &index, SlotID: &old, DueDate: &due, Status: chModel.ChoreHistoryStatusCompleted, CompletedBy: 2}}
	statuses := slotStatuses(context.Background(), chore, history, now)
	require.Equal(t, chModel.SlotDone, statuses[0].State)
	require.Equal(t, chModel.SlotOpen, statuses[1].State)

	// An entry of another slot of the task is not mistaken for this one.
	other := "new-b"
	history[0].SlotID = &other
	statuses = slotStatuses(context.Background(), chore, history, now)
	require.Equal(t, chModel.SlotMissed, statuses[0].State)
	require.Equal(t, chModel.SlotDone, statuses[1].State)
}
