package games_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	. "github.com/nico87lbs/hopla/internal/games"
	"github.com/nico87lbs/hopla/internal/learn"
	ptModel "github.com/nico87lbs/hopla/internal/points"
)

func TestWeekSplitsTasksGamesAndBonuses(t *testing.T) {
	db := setup(t)
	wednesday := time.Date(2026, 10, 21, 12, 0, 0, 0, time.Local)
	task := chore(t, db, "Ranger", 10, wednesday, nil)
	credit(t, db, task.ID, 2, 10, wednesday.AddDate(0, 0, -1))
	credit(t, db, task.ID, 2, 10, wednesday.AddDate(0, 0, -3)) // last Sunday
	bonus := func(action ptModel.PointsHistoryAction, points int) {
		require.NoError(t, db.Create(&ptModel.PointsHistory{Action: action, Points: points, UserID: 2, FamilyID: 1,
			CreatedAt: wednesday}).Error)
	}
	bonus(ptModel.PointsHistoryActionBonus, 5)
	bonus(ptModel.PointsHistoryActionPenalty, 2)
	// A game writes its points as a game row.
	bonus(ptModel.PointsHistoryActionGame, 3)
	require.NoError(t, db.Create(&learn.Session{FamilyID: 1, ClientID: "a", UserID: 2, ModuleKey: "maths",
		Day: "2026-10-21", Correct: 8, Total: 10, Stars: 2, Points: 3, PlayedAt: wednesday}).Error)
	require.NoError(t, db.Create(&learn.Session{FamilyID: 1, ClientID: "b", UserID: 2, ModuleKey: "maths",
		Day: "2026-10-21", Correct: 2, Total: 10, PlayedAt: wednesday}).Error)

	// Away from Sunday to Tuesday: Monday and Tuesday are this week's.
	require.NoError(t, db.Create(&Absence{FamilyID: 1, UserID: 2, StartAt: wednesday.AddDate(0, 0, -3),
		EndAt: ptr(wednesday.AddDate(0, 0, -1))}).Error)

	stats, from, err := Week(db, 1, []int{2, 3}, wednesday)
	require.NoError(t, err)
	require.Equal(t, time.Date(2026, 10, 19, 0, 0, 0, 0, time.Local), from)
	require.Equal(t, []WeekStats{
		{UserID: 2, Tasks: 1, TaskPoints: 10, GamePoints: 3, BonusPoints: 3, Games: 2, DaysAway: 2},
		{UserID: 3},
	}, stats)
}

func ptr[T any](v T) *T { return &v }

func TestTodayTalliesCountTheDayOnly(t *testing.T) {
	db := setup(t)
	now := noon(0)
	task := chore(t, db, "Chambre", 3, now, nil)
	done(t, db, task.ID, 2, now)
	done(t, db, task.ID, 2, now.AddDate(0, 0, -1))
	for _, row := range []ptModel.PointsHistory{
		{UserID: 2, FamilyID: 1, Action: ptModel.PointsHistoryActionAdd, Points: 3, CreatedAt: now},
		{UserID: 2, FamilyID: 1, Action: ptModel.PointsHistoryActionBonus, Points: 5, CreatedAt: now},
		{UserID: 2, FamilyID: 1, Action: ptModel.PointsHistoryActionPenalty, Points: 2, CreatedAt: now},
		{UserID: 2, FamilyID: 1, Action: ptModel.PointsHistoryActionRedeem, Points: 10, CreatedAt: now},
		{UserID: 2, FamilyID: 1, Action: ptModel.PointsHistoryActionAdd, Points: 3, CreatedAt: now.AddDate(0, 0, -1)},
	} {
		require.NoError(t, db.Create(&row).Error)
	}
	tallies, err := TodayTallies(db, 1, now)
	require.NoError(t, err)
	require.Equal(t, DayTally{Done: 1, Earned: 6}, tallies[2])
	require.Zero(t, tallies[3])
}
