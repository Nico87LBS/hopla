package chore

import (
	"context"
	"time"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	"github.com/nico87lbs/hopla/internal/games"
	"gorm.io/gorm"
)

// SetMemberAway records that a member left or came back. Their tasks wait
// while they are away; when they come back, the tasks that fell due meanwhile
// are due today instead of piling up late. Today's surprise is drawn again
// among the tasks of the members who are here. It returns false when the
// member already was in that state.
func (r *ChoreRepository) SetMemberAway(ctx context.Context, circleID, userID int, away bool, now time.Time) (bool, error) {
	changed := false
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		awayBefore, err := games.AwayMembers(tx, circleID)
		if err != nil {
			return err
		}
		if changed, err = games.SetAway(tx, circleID, userID, away, now); err != nil || !changed {
			return err
		}
		if !away {
			if err := r.bringBackTasks(ctx, tx, circleID, awayBefore, now); err != nil {
				return err
			}
		}
		return games.ForgetSurprise(tx, circleID, now)
	})
	return changed, err
}

// bringBackTasks moves the tasks that waited for the members away before to
// today, at the time of day they were due.
func (r *ChoreRepository) bringBackTasks(ctx context.Context, tx *gorm.DB, circleID int, awayBefore map[int]bool, now time.Time) error {
	awayNow, err := games.AwayMembers(tx, circleID)
	if err != nil {
		return err
	}
	local := now.In(time.Local)
	today := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, time.Local)
	var chores []*chModel.Chore
	if err := tx.Preload("Assignees").
		Where("circle_id = ? AND is_active = ? AND next_due_date IS NOT NULL AND next_due_date < ? AND status <> ?",
			circleID, true, today.UTC(), chModel.ChoreStatusPendingApproval).
		Find(&chores).Error; err != nil {
		return err
	}
	var back []*chModel.Chore
	for _, chore := range chores {
		// A task with slots moves to its next slot on its own.
		if !chore.HasSlots() && games.Paused(chore, awayBefore) && !games.Paused(chore, awayNow) {
			back = append(back, chore)
		}
	}
	if len(back) == 0 {
		return nil
	}
	version, err := r.nextSyncVersionRangeWithDB(ctx, tx, circleID, len(back))
	if err != nil {
		return err
	}
	for i, chore := range back {
		due := chore.NextDueDate.In(time.Local)
		due = time.Date(today.Year(), today.Month(), today.Day(), due.Hour(), due.Minute(), due.Second(), 0, time.Local)
		if err := tx.Model(&chModel.Chore{}).Where("id = ?", chore.ID).Updates(map[string]interface{}{
			"next_due_date": due.UTC(),
			"sync_version":  version + int64(i),
		}).Error; err != nil {
			return err
		}
	}
	return nil
}
