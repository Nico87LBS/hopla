package chore

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
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
