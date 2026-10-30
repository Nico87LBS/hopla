package migrations

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	fModel "github.com/nico87lbs/hopla/internal/family/model"
	pModel "github.com/nico87lbs/hopla/internal/points"
)

func TestPastPenaltiesLowerPointsEarned(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "m.db")), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&fModel.UserFamily{}, &pModel.PointsHistory{}))
	now := time.Now().UTC()
	// Member 2 earned 50, spent 10 on a reward and lost 5 + 3 to penalties.
	// Member 3 lost 7 before a reset and 2 after it.
	require.NoError(t, db.Create(&[]fModel.UserFamily{
		{UserID: 2, FamilyID: 1, IsActive: true, Points: 50, PointsRedeemed: 18},
		{UserID: 3, FamilyID: 1, IsActive: true, Points: 20, PointsRedeemed: 2},
	}).Error)
	for _, row := range []pModel.PointsHistory{
		{UserID: 2, Action: pModel.PointsHistoryActionRedeem, Points: 10},
		{UserID: 2, Action: pModel.PointsHistoryActionPenalty, Points: 5},
		{UserID: 2, Action: pModel.PointsHistoryActionPenalty, Points: 3},
		{UserID: 3, Action: pModel.PointsHistoryActionPenalty, Points: 7},
		{UserID: 3, Action: pModel.PointsHistoryActionReset, Points: 10},
		{UserID: 3, Action: pModel.PointsHistoryActionPenalty, Points: 2},
	} {
		row.FamilyID, row.CreatedAt = 1, now
		require.NoError(t, db.Create(&row).Error)
	}

	require.NoError(t, PenaltiesLowerPointsEarned20261022{}.Up(context.Background(), db))

	var members []fModel.UserFamily
	require.NoError(t, db.Order("user_id").Find(&members).Error)
	require.Equal(t, 42, members[0].Points)
	require.Equal(t, 10, members[0].PointsRedeemed, "only the reward stays spent")
	require.Equal(t, 18, members[1].Points, "the penalty before the reset is already gone")
	require.Equal(t, 0, members[1].PointsRedeemed)
}
