package migrations

import (
	"context"

	fModel "github.com/nico87lbs/hopla/internal/family/model"
	pModel "github.com/nico87lbs/hopla/internal/points"
	"github.com/nico87lbs/hopla/logging"
	"gorm.io/gorm"
)

// PenaltiesLowerPointsEarned20261022 moves the penalties given so far out of
// the points spent and into the points earned, as a penalty now lowers the
// points earned, and so the rank. Only the penalties since a member's last
// reset count, since a reset already set both back to zero.
type PenaltiesLowerPointsEarned20261022 struct{}

func (m PenaltiesLowerPointsEarned20261022) ID() string {
	return "20261022_penalties_lower_points_earned"
}

func (m PenaltiesLowerPointsEarned20261022) Description() string {
	return `Take the penalties given so far from the points earned instead of adding them to the points spent.`
}

func (m PenaltiesLowerPointsEarned20261022) Down(ctx context.Context, db *gorm.DB) error {
	return nil
}

func (m PenaltiesLowerPointsEarned20261022) Up(ctx context.Context, db *gorm.DB) error {
	log := logging.FromContext(ctx)
	return db.Transaction(func(tx *gorm.DB) error {
		var members []fModel.UserFamily
		if err := tx.Find(&members).Error; err != nil {
			return err
		}
		moved := 0
		for _, member := range members {
			var lastReset int
			if err := tx.Model(&pModel.PointsHistory{}).Select("COALESCE(MAX(id), 0)").
				Where("family_id = ? AND user_id = ? AND action = ?", member.FamilyID, member.UserID, pModel.PointsHistoryActionReset).
				Scan(&lastReset).Error; err != nil {
				return err
			}
			var penalties int
			if err := tx.Model(&pModel.PointsHistory{}).Select("COALESCE(SUM(points), 0)").
				Where("family_id = ? AND user_id = ? AND action = ? AND id > ?", member.FamilyID, member.UserID, pModel.PointsHistoryActionPenalty, lastReset).
				Scan(&penalties).Error; err != nil {
				return err
			}
			penalties = min(penalties, member.PointsRedeemed)
			if penalties <= 0 {
				continue
			}
			if err := tx.Model(&fModel.UserFamily{}).Where("id = ?", member.ID).Updates(map[string]any{
				"points":          gorm.Expr("points - ?", penalties),
				"points_redeemed": gorm.Expr("points_redeemed - ?", penalties),
			}).Error; err != nil {
				return err
			}
			moved++
		}
		log.Infof("Moved past penalties into the points earned for %d members", moved)
		return nil
	})
}

func init() {
	Register(PenaltiesLowerPointsEarned20261022{})
}
