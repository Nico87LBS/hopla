package chore

import (
	"context"
	"time"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	"github.com/nico87lbs/hopla/internal/games"
	"github.com/nico87lbs/hopla/internal/zone"
	"gorm.io/gorm"
)

// SetMemberAway records that a member left or came back. Their tasks wait
// while they are away; when they come back, the tasks that fell due meanwhile
// are due today instead of piling up late; those already late before stay
// late. When the member leaves, today's surprise is drawn again if it was
// one of their tasks. It returns false when the member already was in that
// state.
func (r *ChoreRepository) SetMemberAway(ctx context.Context, familyID, userID int, away bool, now time.Time) (bool, error) {
	changed := false
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		awayBefore, err := games.AwayMembers(tx, familyID)
		if err != nil {
			return err
		}
		starts, err := games.AbsenceStarts(tx, familyID)
		if err != nil {
			return err
		}
		if changed, err = games.SetAway(tx, familyID, userID, away, now); err != nil || !changed {
			return err
		}
		if !away {
			return r.bringBackTasks(ctx, tx, familyID, awayBefore, starts, now)
		}
		return games.ForgetSurprise(tx, familyID, now)
	})
	return changed, err
}

// bringBackTasks moves the tasks that fell due while they waited for the
// members away before to today, at the time of day they were due. starts are
// when those members left.
func (r *ChoreRepository) bringBackTasks(ctx context.Context, tx *gorm.DB, familyID int, awayBefore map[int]bool,
	starts map[int]time.Time, now time.Time) error {
	awayNow, err := games.AwayMembers(tx, familyID)
	if err != nil {
		return err
	}
	loc := zone.Of(familyID)
	today := zone.StartOfDay(now, loc)
	var chores []*chModel.Chore
	if err := tx.Preload("Assignees").
		Where("family_id = ? AND is_active = ? AND next_due_date IS NOT NULL AND next_due_date < ? AND status <> ?",
			familyID, true, today.UTC(), chModel.ChoreStatusPendingApproval).
		Find(&chores).Error; err != nil {
		return err
	}
	var back []*chModel.Chore
	for _, chore := range chores {
		// A task with slots moves to its next slot on its own.
		if chore.HasSlots() || games.Paused(chore, awayNow) {
			continue
		}
		// A task already late when it started to wait stays late.
		if since, ok := games.PausedSince(chore, awayBefore, starts); ok && !chore.NextDueDate.Before(since) {
			back = append(back, chore)
		}
	}
	if len(back) == 0 {
		return nil
	}
	version, err := r.nextSyncVersionRangeWithDB(ctx, tx, familyID, len(back))
	if err != nil {
		return err
	}
	for i, chore := range back {
		due := chore.NextDueDate.In(loc)
		due = time.Date(today.Year(), today.Month(), today.Day(), due.Hour(), due.Minute(), due.Second(), 0, loc)
		if err := tx.Model(&chModel.Chore{}).Where("id = ?", chore.ID).Updates(map[string]interface{}{
			"next_due_date": due.UTC(),
			"sync_version":  version + int64(i),
		}).Error; err != nil {
			return err
		}
	}
	return nil
}
