package points

import (
	"context"
	"errors"
	"time"

	cModel "github.com/nico87lbs/hopla/internal/circle/model"
	pModel "github.com/nico87lbs/hopla/internal/points"
	"gorm.io/gorm"
)

var (
	ErrNotMember     = errors.New("user is not a member of this circle")
	ErrNoPoints      = errors.New("points must not be zero")
	ErrPresetMissing = errors.New("preset not found")
)

type PointsRepository struct {
	db *gorm.DB
}

func NewPointsRepository(db *gorm.DB) *PointsRepository {
	return &PointsRepository{db}
}

// Record adds a ledger row inside the transaction that changes the points.
func Record(tx *gorm.DB, entry pModel.PointsHistory) error {
	if entry.CreatedAt.IsZero() {
		entry.CreatedAt = time.Now().UTC()
	}
	return tx.Create(&entry).Error
}

// HistoryFilter narrows the ledger to one member and pages back in time.
type HistoryFilter struct {
	UserID   *int
	BeforeID *int
	Limit    int
}

// History returns ledger rows of a circle, newest first.
func (r *PointsRepository) History(c context.Context, circleID int, filter HistoryFilter) ([]pModel.PointsHistory, error) {
	limit := filter.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	query := r.db.WithContext(c).Where("circle_id = ?", circleID)
	if filter.UserID != nil {
		query = query.Where("user_id = ?", *filter.UserID)
	}
	if filter.BeforeID != nil {
		query = query.Where("id < ?", *filter.BeforeID)
	}
	var rows []pModel.PointsHistory
	err := query.Order("id desc").Limit(limit).Find(&rows).Error
	return rows, err
}

// Adjust gives a bonus (points > 0) or a penalty (points < 0) to a member.
//
// A bonus adds to the points earned. A penalty takes from them, so the
// balance left to spend, the rank and the podium all go down, but it never
// takes the balance below zero. It returns the ledger row, whose
// points are what was actually applied: a penalty larger than the balance is
// cut down to it, and can come to zero. Like every ledger row, its points are
// positive; the action tells which way they went.
func (r *PointsRepository) Adjust(c context.Context, circleID, userID, points, byUserID int, reason *string) (*pModel.PointsHistory, error) {
	if points == 0 {
		return nil, ErrNoPoints
	}
	var entry pModel.PointsHistory
	err := r.db.WithContext(c).Transaction(func(tx *gorm.DB) error {
		var member cModel.UserCircle
		if err := tx.Where("user_id = ? AND circle_id = ? AND is_active = ?", userID, circleID, true).
			First(&member).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotMember
			}
			return err
		}
		entry = pModel.PointsHistory{UserID: userID, CircleID: circleID, CreatedBy: byUserID, Reason: reason}
		if points > 0 {
			entry.Action = pModel.PointsHistoryActionBonus
			entry.Points = points
			if err := tx.Model(&member).Update("points", gorm.Expr("points + ?", points)).Error; err != nil {
				return err
			}
		} else {
			taken := min(-points, max(0, member.Points-member.PointsRedeemed))
			entry.Action = pModel.PointsHistoryActionPenalty
			entry.Points = taken
			if taken > 0 {
				if err := tx.Model(&member).Update("points", gorm.Expr("points - ?", taken)).Error; err != nil {
					return err
				}
			}
		}
		entry.CreatedAt = time.Now().UTC()
		return tx.Create(&entry).Error
	})
	if err != nil {
		return nil, err
	}
	return &entry, nil
}

// Reset sets members back to zero points, so to the first rank, such as for a
// new year. It keeps the ledger and adds a reset row per member, unless
// clearHistory, which erases their ledger instead.
// userID nil resets every member of the circle.
func (r *PointsRepository) Reset(c context.Context, circleID int, userID *int, byUserID int, clearHistory bool) ([]pModel.PointsHistory, error) {
	entries := []pModel.PointsHistory{}
	err := r.db.WithContext(c).Transaction(func(tx *gorm.DB) error {
		var members []cModel.UserCircle
		query := tx.Where("circle_id = ?", circleID)
		if userID != nil {
			query = query.Where("user_id = ?", *userID)
		}
		if err := query.Find(&members).Error; err != nil {
			return err
		}
		if len(members) == 0 {
			return ErrNotMember
		}
		ids := make([]int, 0, len(members))
		for _, member := range members {
			ids = append(ids, member.UserID)
		}
		now := time.Now().UTC()
		if err := tx.Model(&cModel.UserCircle{}).Where("circle_id = ? AND user_id IN ?", circleID, ids).
			Updates(map[string]any{"points": 0, "points_redeemed": 0, "streak_since": now}).Error; err != nil {
			return err
		}
		if clearHistory {
			// Quests done and challenges won stay recorded, so they do not pay again.
			return tx.Where("circle_id = ? AND user_id IN ?", circleID, ids).Delete(&pModel.PointsHistory{}).Error
		}
		reason := "Remise à zéro"
		for _, member := range members {
			entry := pModel.PointsHistory{Action: pModel.PointsHistoryActionReset, Points: max(0, member.Points-member.PointsRedeemed),
				UserID: member.UserID, CircleID: circleID, CreatedBy: byUserID, Reason: &reason, CreatedAt: now}
			if err := tx.Create(&entry).Error; err != nil {
				return err
			}
			entries = append(entries, entry)
		}
		return nil
	})
	return entries, err
}

// ClearGames forgets the games played and what was learned from them: the
// sessions behind the stats and the daily cap, and the cards of the spaced
// repetition. The games' settings stay. userID nil clears every member.
func (r *PointsRepository) ClearGames(c context.Context, circleID int, userID *int) error {
	return r.db.WithContext(c).Transaction(func(tx *gorm.DB) error {
		for _, table := range []string{"learn_sessions", "learn_cards"} {
			query := tx.Table(table).Where("circle_id = ?", circleID)
			if userID != nil {
				query = query.Where("user_id = ?", *userID)
			}
			if err := query.Delete(nil).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *PointsRepository) Presets(c context.Context, circleID int) ([]pModel.PointsPreset, error) {
	var presets []pModel.PointsPreset
	err := r.db.WithContext(c).Where("circle_id = ?", circleID).Order("points desc, name").Find(&presets).Error
	return presets, err
}

func (r *PointsRepository) CreatePreset(c context.Context, preset *pModel.PointsPreset) error {
	if preset.Points == 0 {
		return ErrNoPoints
	}
	return r.db.WithContext(c).Create(preset).Error
}

func (r *PointsRepository) UpdatePreset(c context.Context, circleID int, preset *pModel.PointsPreset) error {
	if preset.Points == 0 {
		return ErrNoPoints
	}
	result := r.db.WithContext(c).Model(&pModel.PointsPreset{}).
		Where("id = ? AND circle_id = ?", preset.ID, circleID).
		Updates(map[string]interface{}{"name": preset.Name, "points": preset.Points, "updated_at": time.Now().UTC()})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrPresetMissing
	}
	return nil
}

func (r *PointsRepository) DeletePreset(c context.Context, circleID, presetID int) error {
	result := r.db.WithContext(c).Where("id = ? AND circle_id = ?", presetID, circleID).Delete(&pModel.PointsPreset{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrPresetMissing
	}
	return nil
}
