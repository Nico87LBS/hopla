package migrations

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	pModel "github.com/nico87lbs/hopla/internal/points"
)

func TestGameLedgerRows(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "m.db")), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&pModel.PointsHistory{}))
	reason := func(s string) *string { return &s }
	rows := []pModel.PointsHistory{
		{Action: pModel.PointsHistoryActionBonus, Points: 3, UserID: 2, CreatedBy: 1, Reason: reason("Apprendre : Tables ★★☆")},
		{Action: pModel.PointsHistoryActionBonus, Points: 5, UserID: 2, CreatedBy: 2, Reason: reason("Quête : Mettre la table 2 fois")},
		{Action: pModel.PointsHistoryActionBonus, Points: 5, UserID: 2, CreatedBy: 2, Reason: reason("Défi : Lecture")},
		{Action: pModel.PointsHistoryActionBonus, Points: 10, UserID: 2, CreatedBy: 2, Reason: reason("Série de 7 jours")},
		// What parents give stays a bonus, even with words that look alike.
		{Action: pModel.PointsHistoryActionBonus, Points: 4, UserID: 2, CreatedBy: 1, Reason: reason("Défi : rangé sans râler")},
		{Action: pModel.PointsHistoryActionBonus, Points: 2, UserID: 2, CreatedBy: 1, Reason: reason("Aidé à cuisiner")},
		{Action: pModel.PointsHistoryActionAdd, Points: 5, UserID: 2, CreatedBy: 2, Reason: reason("Apprendre : la tâche")},
	}
	require.NoError(t, db.Create(&rows).Error)

	require.NoError(t, GameLedgerRows20261026{}.Up(context.Background(), db))

	var got []pModel.PointsHistory
	require.NoError(t, db.Order("id").Find(&got).Error)
	want := []pModel.PointsHistoryAction{pModel.PointsHistoryActionGame, pModel.PointsHistoryActionGame,
		pModel.PointsHistoryActionGame, pModel.PointsHistoryActionGame, pModel.PointsHistoryActionBonus,
		pModel.PointsHistoryActionBonus, pModel.PointsHistoryActionAdd}
	for i, row := range got {
		require.Equal(t, want[i], row.Action, *row.Reason)
	}
}
