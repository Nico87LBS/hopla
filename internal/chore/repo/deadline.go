package chore

import (
	"context"
	"time"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	"github.com/nico87lbs/hopla/internal/games"
	"gorm.io/gorm"
)

// ChoresPastDeadline returns the active tasks, of every family, whose
// deadline is over at now and that no one has done yet.
func (r *ChoreRepository) ChoresPastDeadline(ctx context.Context, now time.Time) ([]*chModel.Chore, error) {
	var chores []*chModel.Chore
	if err := r.db.WithContext(ctx).Preload("Assignees").
		Where("is_active = ? AND deadline_minutes > 0 AND next_due_date IS NOT NULL AND next_due_date < ? AND status <> ?",
			true, now.UTC(), chModel.ChoreStatusPendingApproval).
		Find(&chores).Error; err != nil {
		return nil, err
	}
	out := chores[:0]
	for _, chore := range chores {
		if at := chore.DeadlineAt(); at != nil && !at.After(now) {
			out = append(out, chore)
		}
	}
	return out, nil
}

// AwayMembers returns the members of a family away now.
func (r *ChoreRepository) AwayMembers(ctx context.Context, familyID int) (map[int]bool, error) {
	return games.AwayMembers(r.db.WithContext(ctx), familyID)
}

// MissedBy returns who missed a task: the person it was given to, everyone
// sharing it, or no one in particular.
func MissedBy(chore *chModel.Chore) []int {
	if chore.AssignedTo != nil {
		return []int{*chore.AssignedTo}
	}
	if chore.AssignStrategy == chModel.AssignmentStrategyTogether && len(chore.Assignees) > 0 {
		ids := make([]int, 0, len(chore.Assignees))
		for _, assignee := range chore.Assignees {
			ids = append(ids, assignee.UserID)
		}
		return ids
	}
	return []int{0}
}

// MissChore writes the passages of a task missed and moves it to next, or
// archives it when next is nil. It does nothing, and returns false, when the
// task changed meanwhile: done, moved or waiting for a parent.
func (r *ChoreRepository) MissChore(ctx context.Context, chore *chModel.Chore, missed []time.Time, next *time.Time) (int64, bool, error) {
	version, err := r.nextSyncVersion(ctx, chore.FamilyID)
	if err != nil {
		return 0, false, err
	}
	delay := time.Duration(*chore.DeadlineMinutes) * time.Minute
	done := false
	err = r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		updates := map[string]interface{}{
			"next_due_date": next,
			"status":        chModel.ChoreStatusNoStatus,
			"sync_version":  version,
		}
		if next == nil {
			updates["is_active"] = false
		}
		var now chModel.Chore
		if err := tx.Select("id, is_active, next_due_date, status").First(&now, chore.ID).Error; err != nil {
			return err
		}
		if !now.IsActive || now.Status == chModel.ChoreStatusPendingApproval || now.NextDueDate == nil ||
			!now.NextDueDate.Equal(*chore.NextDueDate) {
			return nil
		}
		if err := tx.Model(&chModel.Chore{}).Where("id = ?", chore.ID).Updates(updates).Error; err != nil {
			return err
		}
		for _, due := range missed {
			due := due
			at := due.Add(delay)
			for _, who := range MissedBy(chore) {
				entry := &chModel.ChoreHistory{
					ChoreID:     chore.ID,
					PerformedAt: &at,
					CompletedBy: who,
					AssignedTo:  chore.AssignedTo,
					DueDate:     &due,
					Status:      chModel.ChoreHistoryStatusMissed,
					SyncVersion: version,
				}
				if err := tx.Create(entry).Error; err != nil {
					return err
				}
			}
		}
		done = true
		return nil
	})
	return version, done, err
}

// ActiveSlotChores returns the active tasks with slots, of every family.
func (r *ChoreRepository) ActiveSlotChores(ctx context.Context) ([]*chModel.Chore, error) {
	var chores []*chModel.Chore
	if err := r.db.WithContext(ctx).Preload("Assignees").
		Where("is_active = ? AND frequency_type IN ?", true,
			[]chModel.FrequencyType{chModel.FrequencyTypeDaily, chModel.FrequencyTypeDayOfTheWeek}).
		Find(&chores).Error; err != nil {
		return nil, err
	}
	out := chores[:0]
	for _, chore := range chores {
		if chore.HasSlots() {
			out = append(out, chore)
		}
	}
	return out, nil
}

// AbsenceDays returns, per member of a family, the local days they were away
// since the given time.
func (r *ChoreRepository) AbsenceDays(ctx context.Context, familyID int, since, now time.Time) (map[int]map[string]bool, error) {
	return games.AbsenceDays(r.db.WithContext(ctx), familyID, since, now)
}

// MissedSlot is a slot of a past day nobody did: who missed it.
type MissedSlot struct {
	Slot     int
	DueDate  time.Time
	ClosedAt time.Time
	Who      []int
}

// RecordMissedSlots writes the slots of a task missed.
func (r *ChoreRepository) RecordMissedSlots(ctx context.Context, chore *chModel.Chore, missed []MissedSlot) error {
	if len(missed) == 0 {
		return nil
	}
	version, err := r.nextSyncVersion(ctx, chore.FamilyID)
	if err != nil {
		return err
	}
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, slot := range missed {
			slot := slot
			for _, who := range slot.Who {
				entry := &chModel.ChoreHistory{
					ChoreID:     chore.ID,
					PerformedAt: &slot.ClosedAt,
					CompletedBy: who,
					AssignedTo:  chore.AssignedTo,
					DueDate:     &slot.DueDate,
					Status:      chModel.ChoreHistoryStatusMissed,
					Slot:        &slot.Slot,
					SyncVersion: version,
				}
				if err := tx.Create(entry).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})
}
