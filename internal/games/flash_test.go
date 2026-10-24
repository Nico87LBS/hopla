package games_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	. "github.com/nico87lbs/hopla/internal/games"
)

func withFlash(points, minutes int) func(*chModel.Chore) {
	return func(c *chModel.Chore) { c.FlashPoints, c.FlashMinutes = &points, &minutes }
}

func TestTheTaskFlashBonusPaysUntilMinutesAfterTheDueTime(t *testing.T) {
	db := setup(t)
	due := noon(0)
	task := chore(t, db, "Chambre", 3, due, withFlash(5, 15))

	for _, c := range []struct {
		at     time.Time
		points int
		why    string
	}{
		{due.Add(-3 * time.Hour), 5, "done before the due time"},
		{due.Add(14 * time.Minute), 5, "done within the minutes"},
		{due.Add(15 * time.Minute), 0, "done too late"},
		{due.Add(-13 * time.Hour), 0, "done the day before"},
	} {
		earning, err := FlashBonus(db, task, 7, &due, c.at)
		require.NoError(t, err)
		require.Equal(t, c.points, earning.Points, c.why)
		require.Nil(t, earning.FlashID)
	}
	earning, err := FlashBonus(db, task, 7, &due, due)
	require.NoError(t, err)
	require.Equal(t, " (⏱️ chrono +5)", earning.Reason)

	plain := chore(t, db, "Table", 3, due, nil)
	earning, err = FlashBonus(db, plain, 7, &due, due)
	require.NoError(t, err)
	require.Zero(t, earning.Points)
}

func TestALaunchedFlashPaysEachChildOnceOnEveryCopy(t *testing.T) {
	db := setup(t)
	now := noon(0)
	elena := chore(t, db, "Ranger", 3, now.Add(5*time.Hour), nil)
	anna := chore(t, db, "ranger ", 3, now.Add(5*time.Hour), nil)
	other := chore(t, db, "Table", 3, now, nil)

	flash, err := LaunchFlash(db, 1, elena.ID, 10, 15, 1, now)
	require.NoError(t, err)

	earning, err := FlashBonus(db, anna, 8, anna.NextDueDate, now.Add(10*time.Minute))
	require.NoError(t, err)
	require.Equal(t, 10, earning.Points, "the copy counts")
	require.Equal(t, flash.ID, *earning.FlashID)
	at := now.Add(10 * time.Minute)
	require.NoError(t, db.Create(&chModel.ChoreHistory{ChoreID: anna.ID, CompletedBy: 8, PerformedAt: &at,
		Status: chModel.ChoreHistoryStatusCompleted, FlashID: earning.FlashID}).Error)

	earning, err = FlashBonus(db, anna, 8, anna.NextDueDate, now.Add(11*time.Minute))
	require.NoError(t, err)
	require.Zero(t, earning.Points, "won once")
	earning, err = FlashBonus(db, elena, 7, elena.NextDueDate, now.Add(11*time.Minute))
	require.NoError(t, err)
	require.Equal(t, 10, earning.Points, "the other child still can")
	earning, err = FlashBonus(db, elena, 7, elena.NextDueDate, now.Add(16*time.Minute))
	require.NoError(t, err)
	require.Zero(t, earning.Points, "over")
	earning, err = FlashBonus(db, other, 7, other.NextDueDate, now.Add(time.Minute))
	require.NoError(t, err)
	require.Zero(t, earning.Points, "another task")
}

func TestLaunchingAgainReplacesTheRunningFlash(t *testing.T) {
	db := setup(t)
	now := noon(0)
	task := chore(t, db, "Ranger", 3, now, nil)
	first, err := LaunchFlash(db, 1, task.ID, 10, 15, 1, now)
	require.NoError(t, err)
	second, err := LaunchFlash(db, 1, task.ID, 20, 5, 1, now.Add(time.Minute))
	require.NoError(t, err)
	require.NoError(t, db.First(first, first.ID).Error)
	require.Equal(t, now.Add(time.Minute).UTC(), first.EndsAt.UTC())

	earning, err := FlashBonus(db, task, 7, task.NextDueDate, now.Add(2*time.Minute))
	require.NoError(t, err)
	require.Equal(t, 20, earning.Points)
	require.Equal(t, second.ID, *earning.FlashID)

	require.NoError(t, StopFlash(db, second, now.Add(3*time.Minute)))
	earning, err = FlashBonus(db, task, 7, task.NextDueDate, now.Add(4*time.Minute))
	require.NoError(t, err)
	require.Zero(t, earning.Points)

	_, err = LaunchFlash(db, 2, task.ID, 10, 15, 1, now)
	require.ErrorIs(t, err, ErrNoTask, "a task of another family")
}

func TestFillFlashesShowsTheFlashOpenNow(t *testing.T) {
	db := setup(t)
	now := noon(0)
	own := chore(t, db, "Dents", 3, now.Add(-10*time.Minute), withFlash(5, 15))
	late := chore(t, db, "Lit", 3, now.Add(-20*time.Minute), withFlash(5, 15))
	launched := chore(t, db, "Ranger", 3, now.Add(time.Hour), withFlash(5, 15))
	flash, err := LaunchFlash(db, 1, launched.ID, 10, 30, 1, now)
	require.NoError(t, err)

	tasks := []*chModel.Chore{own, late, launched}
	require.NoError(t, FillFlashes(db, 1, tasks, now.Add(time.Minute)))
	require.Equal(t, &chModel.FlashWindow{Points: 5, EndsAt: own.NextDueDate.Add(15 * time.Minute)}, own.Flash)
	require.Nil(t, late.Flash)
	require.Equal(t, 10, launched.Flash.Points)
	require.Equal(t, flash.ID, launched.Flash.LiveID)

	done(t, db, launched.ID, 7, now.Add(2*time.Minute))
	require.NoError(t, FillFlashes(db, 1, tasks, now.Add(3*time.Minute)))
	require.Equal(t, 5, launched.Flash.Points, "done since the launch: its own speed bonus is left")
	require.Zero(t, launched.Flash.LiveID)
}
