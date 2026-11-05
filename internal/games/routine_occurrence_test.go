package games_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	. "github.com/nico87lbs/hopla/internal/games"
)

func TestRoutineOccurrenceCanCrossMidnightAndExpires(t *testing.T) {
	db := setup(t)
	now := time.Date(2026, 11, 5, 23, 0, 0, 0, time.UTC)
	a := chore(t, db, "Se lever", 1, now, assignedTo(2))
	b := chore(t, db, "S'habiller", 1, now, assignedTo(2))
	routine := Routine{FamilyID: 1, Name: "Matin", ValidityMinutes: 180, ChoreIDs: []int{a.ID, b.ID}}
	require.NoError(t, SaveRoutine(db, &routine))

	first, err := StartRoutineOccurrence(db, 1, routine.ID, 2, now)
	require.NoError(t, err)
	require.Equal(t, now.Add(3*time.Hour), first.ExpiresAt)
	reused, err := StartRoutineOccurrence(db, 1, routine.ID, 2, now.Add(2*time.Hour))
	require.NoError(t, err)
	require.Equal(t, first.ID, reused.ID, "the same run continues after midnight")
	require.Len(t, reused.Items, 2)

	next, err := StartRoutineOccurrence(db, 1, routine.ID, 2, now.Add(4*time.Hour))
	require.NoError(t, err)
	require.NotEqual(t, first.ID, next.ID)
	var old RoutineOccurrence
	require.NoError(t, db.First(&old, first.ID).Error)
	require.Equal(t, RoutineOccurrenceExpired, old.Status)
}

func TestRoutineOccurrenceManualSkipAndExternalOverrideAreScopedAndIdempotent(t *testing.T) {
	db := setup(t)
	now := time.Date(2026, 11, 5, 8, 0, 0, 0, time.UTC)
	a := chore(t, db, "Manteau", 1, now, assignedTo(2))
	routine := Routine{FamilyID: 1, Name: "Départ", ValidityMinutes: 120, ChoreIDs: []int{a.ID}}
	require.NoError(t, SaveRoutine(db, &routine))
	run, err := StartRoutineOccurrence(db, 1, routine.ID, 2, now)
	require.NoError(t, err)
	itemID := run.Items[0].ID

	expiry := now.Add(30*time.Minute)
	input := RoutineOverrideInput{ItemID:itemID, Source:"external", Reason:"Il fait chaud",
		ExternalReference:"home-assistant/manteau", IdempotencyKey:"event-123", ExpiresAt:&expiry}
	updated, err := SkipRoutineOccurrenceItem(db, 1, run.ID, input, now.Add(time.Minute))
	require.NoError(t, err)
	require.Equal(t, RoutineOccurrenceItemSkipped, updated.Items[0].Status)
	retry, err := SkipRoutineOccurrenceItem(db, 1, run.ID, input, now.Add(2*time.Minute))
	require.NoError(t, err, "a retry with the same idempotency key is safe")
	require.Equal(t, run.ID, retry.ID)
	var count int64
	require.NoError(t, db.Model(&RoutineOverride{}).Where("occurrence_id = ?", run.ID).Count(&count).Error)
	require.EqualValues(t, 1, count)

	conflict := input
	conflict.Reason = "different reason"
	_, err = SkipRoutineOccurrenceItem(db, 1, run.ID, conflict, now.Add(3*time.Minute))
	require.ErrorIs(t, err, ErrRoutineOccurrenceConflict)

	_, err = SkipRoutineOccurrenceItem(db, 2, run.ID, input, now.Add(3*time.Minute))
	require.ErrorIs(t, err, ErrRoutineOccurrenceNotFound)
}

func TestRoutineOccurrenceRejectsExpiredAndOverlongOverrides(t *testing.T) {
	db := setup(t)
	now := time.Date(2026, 11, 5, 8, 0, 0, 0, time.UTC)
	a := chore(t, db, "Manteau", 1, now, assignedTo(2))
	routine := Routine{FamilyID: 1, Name: "Départ", ValidityMinutes: 30, ChoreIDs: []int{a.ID}}
	require.NoError(t, SaveRoutine(db, &routine))
	run, err := StartRoutineOccurrence(db, 1, routine.ID, 2, now)
	require.NoError(t, err)
	_, err = GetRoutineOccurrence(db, 1, run.ID, now.Add(31*time.Minute))
	require.NoError(t, err)
	_, err = SkipRoutineOccurrenceItem(db, 1, run.ID, RoutineOverrideInput{ItemID:run.Items[0].ID,Source:"manual"}, now.Add(32*time.Minute))
	require.ErrorIs(t, err, ErrRoutineOccurrenceExpired)

	run2, err := StartRoutineOccurrence(db, 1, routine.ID, 2, now.Add(time.Hour))
	require.NoError(t, err)
	tooLate := now.Add(4*time.Hour)
	_, err = SkipRoutineOccurrenceItem(db, 1, run2.ID, RoutineOverrideInput{ItemID:run2.Items[0].ID,Source:"external",
		ExternalReference:"ha/1",IdempotencyKey:"event-2",ExpiresAt:&tooLate}, now.Add(time.Hour))
	require.ErrorIs(t, err, ErrRoutineOccurrenceInvalid)
}
