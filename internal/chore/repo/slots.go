package chore

import (
	"context"
	"errors"
	"time"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	"github.com/nico87lbs/hopla/internal/games"
	"gorm.io/gorm"
)

// ErrSlotNotPending is returned when approving or rejecting a slot that is not
// waiting for a parent.
var ErrSlotNotPending = errors.New("slot is not waiting for approval")

// GetSlotHistory returns, per task, the slot completions due between from and
// to, whatever their state.
func (r *ChoreRepository) GetSlotHistory(ctx context.Context, choreIDs []int, from, to time.Time) (map[int][]*chModel.ChoreHistory, error) {
	byChore := map[int][]*chModel.ChoreHistory{}
	if len(choreIDs) == 0 {
		return byChore, nil
	}
	var rows []*chModel.ChoreHistory
	if err := r.db.WithContext(ctx).
		Where("chore_id IN ? AND slot IS NOT NULL AND due_date >= ? AND due_date < ?", choreIDs, from.UTC(), to.UTC()).
		Order("id").Find(&rows).Error; err != nil {
		return nil, err
	}
	for _, row := range rows {
		byChore[row.ChoreID] = append(byChore[row.ChoreID], row)
	}
	return byChore, nil
}

// RecordSlot saves a slot completion, done or waiting for a parent, and moves
// the task's due date. A done slot earns the task's points, credited by
// byUserID.
func (r *ChoreRepository) RecordSlot(ctx context.Context, chore *chModel.Chore, entry *chModel.ChoreHistory, nextDueDate *time.Time, byUserID int) error {
	nextVersion, err := r.nextSyncVersion(ctx, chore.CircleID)
	if err != nil {
		return err
	}
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		done := entry.Status == chModel.ChoreHistoryStatusCompleted
		if done {
			if err := awardTask(tx, chore, &entry.Points, entry.CompletedBy, byUserID, *entry.PerformedAt); err != nil {
				return err
			}
		}
		entry.SyncVersion = nextVersion
		if err := tx.Create(entry).Error; err != nil {
			return err
		}
		if err := r.updateSlotChore(tx, chore.ID, nextDueDate, nextVersion); err != nil {
			return err
		}
		if done {
			return games.AfterTask(tx, chore.CircleID, entry.CompletedBy, *entry.PerformedAt, time.Now().UTC())
		}
		return nil
	})
}

// ApproveSlot marks a slot completion waiting for a parent as done and
// credits its points. The time the child ticked it stays its time.
func (r *ChoreRepository) ApproveSlot(ctx context.Context, chore *chModel.Chore, historyID int, adminUserID int, nextDueDate *time.Time) error {
	nextVersion, err := r.nextSyncVersion(ctx, chore.CircleID)
	if err != nil {
		return err
	}
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var entry chModel.ChoreHistory
		if err := tx.Where("id = ? AND chore_id = ?", historyID, chore.ID).First(&entry).Error; err != nil {
			return err
		}
		if entry.Status != chModel.ChoreHistoryStatusPendingApproval {
			return ErrSlotNotPending
		}
		performedAt := time.Now().UTC()
		if entry.PerformedAt != nil {
			performedAt = *entry.PerformedAt
		}
		if err := awardTask(tx, chore, &entry.Points, entry.CompletedBy, adminUserID, performedAt); err != nil {
			return err
		}
		entry.Status = chModel.ChoreHistoryStatusCompleted
		entry.SyncVersion = nextVersion
		if err := tx.Save(&entry).Error; err != nil {
			return err
		}
		if err := r.updateSlotChore(tx, chore.ID, nextDueDate, nextVersion); err != nil {
			return err
		}
		return games.AfterTask(tx, chore.CircleID, entry.CompletedBy, performedAt, time.Now().UTC())
	})
}

// RejectSlot turns down a slot completion waiting for a parent: the slot is to
// do again while it is open.
func (r *ChoreRepository) RejectSlot(ctx context.Context, chore *chModel.Chore, historyID int, note *string, nextDueDate *time.Time) error {
	nextVersion, err := r.nextSyncVersion(ctx, chore.CircleID)
	if err != nil {
		return err
	}
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var entry chModel.ChoreHistory
		if err := tx.Where("id = ? AND chore_id = ?", historyID, chore.ID).First(&entry).Error; err != nil {
			return err
		}
		if entry.Status != chModel.ChoreHistoryStatusPendingApproval {
			return ErrSlotNotPending
		}
		entry.Status = chModel.ChoreHistoryStatusRejected
		if note != nil {
			entry.Note = note
		}
		entry.SyncVersion = nextVersion
		if err := tx.Save(&entry).Error; err != nil {
			return err
		}
		return r.updateSlotChore(tx, chore.ID, nextDueDate, nextVersion)
	})
}

// SetSlotDueDate moves a task with slots to its next slot once the one it was
// due at has closed, without touching anything else.
func (r *ChoreRepository) SetSlotDueDate(ctx context.Context, chore *chModel.Chore, nextDueDate *time.Time) error {
	nextVersion, err := r.nextSyncVersion(ctx, chore.CircleID)
	if err != nil {
		return err
	}
	return r.updateSlotChore(r.db.WithContext(ctx), chore.ID, nextDueDate, nextVersion)
}

// updateSlotChore moves a task with slots to its next due date. Such a task
// never waits for approval as a whole: each slot does.
func (r *ChoreRepository) updateSlotChore(tx *gorm.DB, choreID int, nextDueDate *time.Time, version int64) error {
	return tx.Model(&chModel.Chore{}).Where("id = ?", choreID).Updates(map[string]interface{}{
		"next_due_date": nextDueDate,
		"status":        chModel.ChoreStatusNoStatus,
		"sync_version":  version,
	}).Error
}
