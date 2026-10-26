package points

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	pModel "github.com/nico87lbs/hopla/internal/points"
)

func TestJournalMixesLedgerAndTasksWithoutPoints(t *testing.T) {
	r, db := setup(t)
	base := time.Date(2026, 10, 25, 9, 0, 0, 0, time.UTC)
	at := func(minutes int) time.Time { return base.Add(time.Duration(minutes) * time.Minute) }
	ledger := func(action pModel.PointsHistoryAction, points, minutes int) {
		require.NoError(t, db.Create(&pModel.PointsHistory{Action: action, Points: points, UserID: 2, CreatedBy: 2,
			CircleID: 1, CreatedAt: at(minutes)}).Error)
	}
	ledger(pModel.PointsHistoryActionAdd, 5, 1)
	ledger(pModel.PointsHistoryActionGame, 3, 2)
	ledger(pModel.PointsHistoryActionBonus, 2, 3)
	ledger(pModel.PointsHistoryActionRedeem, 4, 5)

	public := chModel.Chore{Name: "Brosser les dents", CircleID: 1, CreatedBy: 1}
	private := chModel.Chore{Name: "Cadeau", CircleID: 1, CreatedBy: 1, IsPrivate: true}
	require.NoError(t, db.Create(&public).Error)
	require.NoError(t, db.Create(&private).Error)
	done := func(choreID, points, minutes int) {
		performed := at(minutes)
		require.NoError(t, db.Create(&chModel.ChoreHistory{ChoreID: choreID, CompletedBy: 2, PerformedAt: &performed,
			Status: chModel.ChoreHistoryStatusCompleted, Points: &points}).Error)
	}
	done(public.ID, 0, 4)
	done(public.ID, 5, 1) // has its ledger row already
	done(private.ID, 0, 6)

	rows, more, err := r.Journal(context.Background(), 1, 3, JournalFilter{})
	require.NoError(t, err)
	require.False(t, more)
	require.Len(t, rows, 5, "the private task stays hidden from someone else")
	require.Equal(t, pModel.PointsHistoryActionRedeem, rows[0].Action)
	require.Equal(t, "Brosser les dents", *rows[1].ChoreName)
	require.Equal(t, pModel.PointsHistoryActionAdd, rows[4].Action)

	rows, _, err = r.Journal(context.Background(), 1, 2, JournalFilter{Kind: JournalTasks})
	require.NoError(t, err)
	require.Len(t, rows, 3, "whoever did the private task sees it")
	require.Equal(t, "Cadeau", *rows[0].ChoreName)

	rows, _, err = r.Journal(context.Background(), 1, 2, JournalFilter{Kind: JournalGames})
	require.NoError(t, err)
	require.Len(t, rows, 1)

	// Pages back in time.
	rows, more, err = r.Journal(context.Background(), 1, 3, JournalFilter{Limit: 2})
	require.NoError(t, err)
	require.True(t, more)
	before := rows[1].CreatedAt
	rows, more, err = r.Journal(context.Background(), 1, 3, JournalFilter{Limit: 2, Before: &before})
	require.NoError(t, err)
	require.True(t, more)
	require.Equal(t, pModel.PointsHistoryActionBonus, rows[0].Action)
	require.Equal(t, pModel.PointsHistoryActionGame, rows[1].Action)
}
