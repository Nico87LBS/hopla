package points

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	cModel "github.com/nico87lbs/hopla/internal/circle/model"
	"github.com/nico87lbs/hopla/internal/database"
	pModel "github.com/nico87lbs/hopla/internal/points"
)

func setup(t *testing.T) (*PointsRepository, *gorm.DB) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "points.db")), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, database.Migration(db))
	require.NoError(t, db.Create(&cModel.UserCircle{UserID: 2, CircleID: 1, Role: cModel.UserRoleMember, IsActive: true,
		Points: 10, PointsRedeemed: 4}).Error)
	return NewPointsRepository(db), db
}

func member(t *testing.T, db *gorm.DB) cModel.UserCircle {
	var m cModel.UserCircle
	require.NoError(t, db.Where("user_id = ? AND circle_id = ?", 2, 1).First(&m).Error)
	return m
}

func TestBonusCountsAsEarned(t *testing.T) {
	repo, db := setup(t)
	reason := "Helped without being asked"
	entry, err := repo.Adjust(context.Background(), 1, 2, 5, 1, &reason)
	require.NoError(t, err)
	require.Equal(t, pModel.PointsHistoryActionBonus, entry.Action)
	require.Equal(t, 5, entry.Delta())
	require.NotZero(t, entry.ID, "the returned row is the saved one")
	require.False(t, entry.CreatedAt.IsZero())
	m := member(t, db)
	require.Equal(t, 15, m.Points)
	require.Equal(t, 4, m.PointsRedeemed)
}

// A penalty lowers only the balance, never the points earned that ranks are
// built on, and never below zero.
func TestPenaltyStopsAtZeroAndKeepsPointsEarned(t *testing.T) {
	repo, db := setup(t)
	entry, err := repo.Adjust(context.Background(), 1, 2, -4, 1, nil)
	require.NoError(t, err)
	require.Equal(t, -4, entry.Delta())
	entry, err = repo.Adjust(context.Background(), 1, 2, -10, 1, nil)
	require.NoError(t, err)
	require.Equal(t, 2, entry.Points, "only the 2 points left are taken")
	m := member(t, db)
	require.Equal(t, 10, m.Points)
	require.Equal(t, 10, m.PointsRedeemed)
	entry, err = repo.Adjust(context.Background(), 1, 2, -3, 1, nil)
	require.NoError(t, err)
	require.Equal(t, 0, entry.Points)
}

func TestAdjustRefusesOutsiders(t *testing.T) {
	repo, _ := setup(t)
	_, err := repo.Adjust(context.Background(), 1, 99, 5, 1, nil)
	require.ErrorIs(t, err, ErrNotMember)
	_, err = repo.Adjust(context.Background(), 2, 2, 5, 1, nil)
	require.ErrorIs(t, err, ErrNotMember, "a member of another circle")
	_, err = repo.Adjust(context.Background(), 1, 2, 0, 1, nil)
	require.ErrorIs(t, err, ErrNoPoints)
}

func TestHistoryIsNewestFirstAndPages(t *testing.T) {
	repo, _ := setup(t)
	ctx := context.Background()
	for _, points := range []int{1, 2, 3} {
		_, err := repo.Adjust(ctx, 1, 2, points, 1, nil)
		require.NoError(t, err)
	}
	rows, err := repo.History(ctx, 1, HistoryFilter{Limit: 2})
	require.NoError(t, err)
	require.Equal(t, []int{3, 2}, []int{rows[0].Points, rows[1].Points})
	rows, err = repo.History(ctx, 1, HistoryFilter{BeforeID: &rows[1].ID})
	require.NoError(t, err)
	require.Len(t, rows, 1)
	other := 3
	rows, err = repo.History(ctx, 1, HistoryFilter{UserID: &other})
	require.NoError(t, err)
	require.Empty(t, rows)
	rows, err = repo.History(ctx, 2, HistoryFilter{})
	require.NoError(t, err)
	require.Empty(t, rows, "another circle sees nothing")
}

func TestPresetsBelongToTheirCircle(t *testing.T) {
	repo, _ := setup(t)
	ctx := context.Background()
	preset := pModel.PointsPreset{CircleID: 1, Name: "Dishes forgotten", Points: -3}
	require.NoError(t, repo.CreatePreset(ctx, &preset))
	require.ErrorIs(t, repo.UpdatePreset(ctx, 2, &pModel.PointsPreset{ID: preset.ID, Name: "x", Points: 1}), ErrPresetMissing)
	require.ErrorIs(t, repo.DeletePreset(ctx, 2, preset.ID), ErrPresetMissing)
	require.NoError(t, repo.UpdatePreset(ctx, 1, &pModel.PointsPreset{ID: preset.ID, Name: "Dishes", Points: -2}))
	presets, err := repo.Presets(ctx, 1)
	require.NoError(t, err)
	require.Equal(t, "Dishes", presets[0].Name)
	require.Equal(t, -2, presets[0].Points)
	require.NoError(t, repo.DeletePreset(ctx, 1, preset.ID))
}
