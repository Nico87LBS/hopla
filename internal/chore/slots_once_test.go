package chore

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
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
