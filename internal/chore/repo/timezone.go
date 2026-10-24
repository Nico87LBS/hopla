package chore

import (
	"context"
	"time"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	"github.com/nico87lbs/hopla/internal/zone"
	"gorm.io/gorm"
)

// SetFamilyTimezone moves the family to another time zone, such as on
// holiday; an empty name brings it back to the server's. The tasks keep their
// time of day: one due at 07:00 at home is due at 07:00 where the family is.
// It returns false when the family already was in that zone.
func (r *ChoreRepository) SetFamilyTimezone(ctx context.Context, circleID int, name string) (bool, error) {
	to, err := zone.Load(name)
	if err != nil {
		return false, err
	}
	if to == nil {
		to = zone.Server()
	}
	changed := false
	err = r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var saved string
		if err := tx.Table("circles").Select("timezone").Where("id = ?", circleID).Scan(&saved).Error; err != nil {
			return err
		}
		if saved == name {
			return nil
		}
		changed = true
		from := zone.Server()
		if loc, err := zone.Load(saved); err == nil && loc != nil {
			from = loc
		}
		if err := tx.Table("circles").Where("id = ?", circleID).Update("timezone", name).Error; err != nil {
			return err
		}
		var chores []*chModel.Chore
		if err := tx.Where("circle_id = ? AND is_active = ?", circleID, true).Find(&chores).Error; err != nil {
			return err
		}
		if len(chores) == 0 {
			return nil
		}
		version, err := r.nextSyncVersionRangeWithDB(ctx, tx, circleID, len(chores))
		if err != nil {
			return err
		}
		for i, chore := range chores {
			fields := map[string]interface{}{"sync_version": version + int64(i)}
			if chore.NextDueDate != nil {
				fields["next_due_date"] = moveDueDate(*chore.NextDueDate, from, to)
			}
			if err := tx.Model(&chModel.Chore{}).Where("id = ?", chore.ID).Updates(fields).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err == nil && changed {
		zone.Set(circleID, to)
	}
	return changed, err
}

// moveDueDate keeps a due date's day and time of day in the new zone.
func moveDueDate(due time.Time, from, to *time.Location) time.Time {
	return zone.SameWallClock(due, from, to).UTC()
}
