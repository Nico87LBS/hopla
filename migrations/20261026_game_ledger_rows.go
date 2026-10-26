package migrations

import (
	"context"

	pModel "github.com/nico87lbs/hopla/internal/points"
	"gorm.io/gorm"
)

// GameLedgerRows20261026 gives their own type to the ledger rows the app wrote
// as bonuses for itself: games of Apprendre, streaks, quests and challenges.
// The journal can then tell them from the bonuses parents give.
type GameLedgerRows20261026 struct{}

func (m GameLedgerRows20261026) ID() string {
	return "20261026_game_ledger_rows"
}

func (m GameLedgerRows20261026) Description() string {
	return `Turn the bonus rows of games, streaks, quests and challenges into game rows.`
}

func (m GameLedgerRows20261026) Down(ctx context.Context, db *gorm.DB) error {
	return db.WithContext(ctx).Model(&pModel.PointsHistory{}).
		Where("action = ?", pModel.PointsHistoryActionGame).
		Update("action", pModel.PointsHistoryActionBonus).Error
}

func (m GameLedgerRows20261026) Up(ctx context.Context, db *gorm.DB) error {
	db = db.WithContext(ctx)
	if !db.Migrator().HasTable(&pModel.PointsHistory{}) {
		return nil
	}
	// A game may be played on a child's behalf; the other rows are always
	// written by the member themselves.
	return db.Model(&pModel.PointsHistory{}).
		Where("action = ?", pModel.PointsHistoryActionBonus).
		Where("reason LIKE ? OR (created_by = user_id AND (reason LIKE ? OR reason LIKE ? OR reason LIKE ?))",
			"Apprendre : %", "Quête : %", "Défi : %", "Série de % jours").
		Update("action", pModel.PointsHistoryActionGame).Error
}

func init() {
	Register(GameLedgerRows20261026{})
}
