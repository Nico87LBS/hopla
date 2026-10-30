package chore

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"time"

	config "github.com/nico87lbs/hopla/config"
	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	cModel "github.com/nico87lbs/hopla/internal/circle/model"
	"github.com/nico87lbs/hopla/internal/games"
	ptModel "github.com/nico87lbs/hopla/internal/points"
	ptRepo "github.com/nico87lbs/hopla/internal/points/repo"
	storageModel "github.com/nico87lbs/hopla/internal/storage/model"
	stModel "github.com/nico87lbs/hopla/internal/subtask/model"
	syncModel "github.com/nico87lbs/hopla/internal/sync/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type ChoreRepository struct {
	db     *gorm.DB
	dbType string
}

// SyncOptions configures sync-aware queries for chores and histories.
// When SyncVersion is nil, the query is NOT filtered by sync version (normal operation).
// When SyncVersion is set, the query returns only records with sync_version > *SyncVersion, in ascending order.
type SyncOptions struct {
	SyncVersion *int64 // nil = no sync filtering; pointer = filter by version
	Limit       int    // Number of records to fetch (used with sync filtering)
}

func NewChoreRepository(db *gorm.DB, cfg *config.Config) *ChoreRepository {
	return &ChoreRepository{db: db, dbType: cfg.Database.Type}
}

// privacyJoins adds the join privacyPredicate depends on: the current user's
// row in chore_assignees. It matches at most one row per chore, so it never
// multiplies results.
//
// Use as: privacyJoins(db, userID).Where(privacyPredicate(userID))
func privacyJoins(db *gorm.DB, userID int) *gorm.DB {
	return db.
		Joins("LEFT JOIN chore_assignees ON chores.id = chore_assignees.chore_id AND chore_assignees.user_id = ?", userID)
}

// privacyPredicate returns a GORM clause expression that enforces chore visibility
// rules using bound parameters (no string interpolation). A chore is visible when:
//   - It is not private, OR
//   - It is private AND (the user created it OR the user is assigned to it)
//
// Requires the join added by privacyJoins.
func privacyPredicate(userID int) clause.Expr {
	return clause.Expr{
		SQL:  `((chores.is_private = false) OR (chores.created_by = ? OR chore_assignees.user_id = ?))`,
		Vars: []interface{}{userID, userID},
	}
}

func (r *ChoreRepository) nextSyncVersionWithDB(ctx context.Context, db *gorm.DB, circleID int) (int64, error) {
	var version int64
	err := db.WithContext(ctx).Raw(`
		INSERT INTO sync_cursors (circle_id, entity_type, max_version)
		VALUES (?, ?, 1)
		ON CONFLICT (circle_id, entity_type) DO UPDATE SET max_version = sync_cursors.max_version + 1
		RETURNING max_version`,
		circleID, syncModel.EntityTypeChore,
	).Scan(&version).Error
	return version, err
}

func (r *ChoreRepository) nextSyncVersion(ctx context.Context, circleID int) (int64, error) {
	return r.nextSyncVersionWithDB(ctx, r.db, circleID)
}

// nextSyncVersionRangeWithDB atomically reserves count contiguous sync versions
// and returns the first (lowest) version in the range.
func (r *ChoreRepository) nextSyncVersionRangeWithDB(ctx context.Context, db *gorm.DB, circleID int, count int) (int64, error) {
	var endVersion int64
	err := db.WithContext(ctx).Raw(`
		INSERT INTO sync_cursors (circle_id, entity_type, max_version)
		VALUES (?, ?, ?)
		ON CONFLICT (circle_id, entity_type) DO UPDATE SET max_version = sync_cursors.max_version + ?
		RETURNING max_version`,
		circleID, syncModel.EntityTypeChore, count, count,
	).Scan(&endVersion).Error
	return endVersion - int64(count) + 1, err
}

func (r *ChoreRepository) insertTombstone(ctx context.Context, tx *gorm.DB, circleID int, entityID int) (int64, error) {
	// Use tx (not r.db) so the version increment and tombstone insert are atomic.
	version, err := r.nextSyncVersionWithDB(ctx, tx, circleID)
	if err != nil {
		return 0, err
	}
	if err := tx.WithContext(ctx).Create(&syncModel.Tombstone{
		CircleID:    circleID,
		EntityType:  syncModel.EntityTypeChore,
		EntityID:    entityID,
		SyncVersion: version,
	}).Error; err != nil {
		return 0, err
	}
	return version, nil
}

func choreViewerSet(chore *chModel.Chore, assigneeIDs []int, circleUserIDs []int) map[int]struct{} {
	viewers := make(map[int]struct{})
	if !chore.IsPrivate {
		for _, userID := range circleUserIDs {
			viewers[userID] = struct{}{}
		}
		return viewers
	}

	viewers[chore.CreatedBy] = struct{}{}
	for _, userID := range assigneeIDs {
		viewers[userID] = struct{}{}
	}
	return viewers
}

// UpdateChoreVisibility atomically updates a chore and its complete assignee set,
// recording a user-scoped tombstone for each circle member who loses visibility.
func (r *ChoreRepository) UpdateChoreVisibility(ctx context.Context, chore *chModel.Chore, assigneeIDs []int) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		lockedQuery := func() *gorm.DB {
			q := tx.WithContext(ctx)
			if r.dbType == "postgres" {
				q = q.Clauses(clause.Locking{Strength: "UPDATE"})
			}
			return q
		}

		var previousChore chModel.Chore
		if err := lockedQuery().Where("id = ? AND circle_id = ?", chore.ID, chore.CircleID).First(&previousChore).Error; err != nil {
			return err
		}
		var previousAssignees []chModel.ChoreAssignees
		if err := lockedQuery().Where("chore_id = ?", chore.ID).Find(&previousAssignees).Error; err != nil {
			return err
		}
		previousAssigneeIDs := make([]int, 0, len(previousAssignees))
		for _, assignee := range previousAssignees {
			previousAssigneeIDs = append(previousAssigneeIDs, assignee.UserID)
		}

		var circleUserIDs []int
		if err := tx.WithContext(ctx).Table("user_circles").Where("circle_id = ? AND is_active = ?", chore.CircleID, true).Pluck("user_id", &circleUserIDs).Error; err != nil {
			return err
		}

		previousViewers := choreViewerSet(&previousChore, previousAssigneeIDs, circleUserIDs)
		newViewers := choreViewerSet(chore, assigneeIDs, circleUserIDs)
		revokedUserIDs := make([]int, 0)
		for userID := range previousViewers {
			if _, stillVisible := newViewers[userID]; !stillVisible {
				revokedUserIDs = append(revokedUserIDs, userID)
			}
		}
		sort.Ints(revokedUserIDs)
		grantedUserIDs := make([]int, 0)
		for userID := range newViewers {
			if _, sawBefore := previousViewers[userID]; !sawBefore {
				grantedUserIDs = append(grantedUserIDs, userID)
			}
		}
		sort.Ints(grantedUserIDs)
		firstVersion, err := r.nextSyncVersionRangeWithDB(ctx, tx, chore.CircleID, 1)
		if err != nil {
			return err
		}
		chore.SyncVersion = firstVersion
		if err := tx.WithContext(ctx).Save(chore).Error; err != nil {
			return err
		}

		if err := tx.WithContext(ctx).Where("chore_id = ?", chore.ID).Delete(&chModel.ChoreAssignees{}).Error; err != nil {
			return err
		}
		assignees := make([]chModel.ChoreAssignees, 0, len(assigneeIDs))
		seenAssignees := make(map[int]struct{}, len(assigneeIDs))
		for _, userID := range assigneeIDs {
			if _, exists := seenAssignees[userID]; exists {
				continue
			}
			seenAssignees[userID] = struct{}{}
			assignees = append(assignees, chModel.ChoreAssignees{ChoreID: chore.ID, UserID: userID})
		}
		if len(assignees) > 0 {
			if err := tx.WithContext(ctx).Create(&assignees).Error; err != nil {
				return err
			}
		}

		if len(revokedUserIDs) > 0 || len(grantedUserIDs) > 0 {
			if _, err := r.applyVisibilityDeltas(ctx, tx, chore.CircleID, []visibilityDelta{{
				choreID: chore.ID,
				revoked: revokedUserIDs,
				granted: grantedUserIDs,
			}}); err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *ChoreRepository) UpdateChoreFields(ctx context.Context, choreID int, fields map[string]interface{}) error {
	var chore chModel.Chore
	if err := r.db.WithContext(ctx).Select("circle_id").First(&chore, choreID).Error; err != nil {
		return err
	}
	nextVersion, err := r.nextSyncVersion(ctx, chore.CircleID)
	if err != nil {
		return err
	}
	fields["sync_version"] = nextVersion
	return r.db.WithContext(ctx).Model(&chModel.Chore{}).Where("id = ?", choreID).Updates(fields).Error
}

func (r *ChoreRepository) nextSyncVersionRange(ctx context.Context, circleID int, count int) (int64, error) {
	return r.nextSyncVersionRangeWithDB(ctx, r.db, circleID, count)
}

func (r *ChoreRepository) UpdateChores(c context.Context, chores []*chModel.Chore) error {
	if len(chores) > 0 {
		circleIndexes := make(map[int][]int)
		for i, ch := range chores {
			circleIndexes[ch.CircleID] = append(circleIndexes[ch.CircleID], i)
		}

		for circleID, indexes := range circleIndexes {
			startVersion, err := r.nextSyncVersionRange(c, circleID, len(indexes))
			if err != nil {
				return err
			}
			for offset, idx := range indexes {
				chores[idx].SyncVersion = startVersion + int64(offset)
			}
		}
	}
	return r.db.WithContext(c).Save(&chores).Error
}
func (r *ChoreRepository) CreateChore(c context.Context, chore *chModel.Chore) (int, error) {
	nextVersion, err := r.nextSyncVersion(c, chore.CircleID)
	if err != nil {
		return 0, err
	}
	chore.SyncVersion = nextVersion
	if err := r.db.WithContext(c).Create(chore).Error; err != nil {
		return 0, err
	}
	return chore.ID, nil
}

// CreateChoreWithAssignees atomically creates a chore and its assignees.
func (r *ChoreRepository) CreateChoreWithAssignees(ctx context.Context, chore *chModel.Chore, assigneeIDs []int) (int, error) {
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		nextVersion, err := r.nextSyncVersionWithDB(ctx, tx, chore.CircleID)
		if err != nil {
			return err
		}
		chore.SyncVersion = nextVersion
		if err := tx.WithContext(ctx).Create(chore).Error; err != nil {
			return err
		}

		seen := make(map[int]struct{}, len(assigneeIDs))
		assignees := make([]chModel.ChoreAssignees, 0, len(assigneeIDs))
		for _, userID := range assigneeIDs {
			if _, duplicate := seen[userID]; duplicate {
				continue
			}
			seen[userID] = struct{}{}
			assignees = append(assignees, chModel.ChoreAssignees{ChoreID: chore.ID, UserID: userID})
		}
		if len(assignees) > 0 {
			if err := tx.WithContext(ctx).Create(&assignees).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	return chore.ID, nil
}

func (r *ChoreRepository) GetChore(c context.Context, choreID int, userID int, circleID int) (*chModel.Chore, error) {
	var chore chModel.Chore
	query := privacyJoins(r.db.WithContext(c).Model(&chModel.Chore{}), userID).
		Preload("SubTasks", "chore_id = ?", choreID).
		Preload("Assignees").
		Preload("LabelsV2").
		Where("chores.id = ? AND chores.circle_id = ?", choreID, circleID).
		Where(privacyPredicate(userID))

	if err := query.First(&chore).Error; err != nil {
		return nil, err
	}
	r.db.WithContext(c).Where("entity_type = ? AND entity_id = ?", storageModel.EntityTypeChoreAttachment, choreID).Find(&chore.Attachments)
	return &chore, nil
}

// GetChoreForSystem loads a chore with the relations the notification planner and
// realtime broadcaster need, without applying a user's visibility. Only for
// server-side work that decides recipients itself.
func (r *ChoreRepository) GetChoreForSystem(c context.Context, choreID int) (*chModel.Chore, error) {
	var chore chModel.Chore
	if err := r.db.WithContext(c).Preload("Assignees").First(&chore, choreID).Error; err != nil {
		return nil, err
	}
	return &chore, nil
}

// GetChores retrieves chores for a user in a circle, respecting privacy and optionally filtered by sync version.
// If syncOptions is nil or syncOptions.SyncVersion is nil, returns all visible chores ordered by next_due_date.
// If syncOptions.SyncVersion is set, returns only chores with sync_version > *SyncVersion, ordered by sync_version.
func (r *ChoreRepository) GetChores(c context.Context, circleID int, userID int, includeArchived bool, syncOptions *SyncOptions, includeSubtasks bool) ([]*chModel.Chore, error) {
	var chores []*chModel.Chore

	query := privacyJoins(r.db.WithContext(c).Model(&chModel.Chore{}), userID).
		Preload("Assignees").
		Preload("LabelsV2").
		Where("chores.circle_id = ?", circleID).
		Where(privacyPredicate(userID)).
		Group("chores.id")

	if includeSubtasks {
		query = query.Preload("SubTasks")
	}
	if !includeArchived {
		query = query.Where("chores.is_active = ?", true)
	}

	// Sync-specific filtering if provided.
	if syncOptions != nil && syncOptions.SyncVersion != nil {
		query = query.Where("chores.sync_version > ?", *syncOptions.SyncVersion).
			Order("chores.sync_version asc").
			Limit(syncOptions.Limit + 1)
	} else {
		// Normal ordering when not syncing.
		query = query.Order("next_due_date asc")
	}

	if err := query.Find(&chores).Error; err != nil {
		return nil, err
	}
	return chores, nil
}

func (r *ChoreRepository) GetArchivedChores(c context.Context, circleID int, userID int) ([]*chModel.Chore, error) {
	var chores []*chModel.Chore
	if err := privacyJoins(r.db.WithContext(c).Model(&chModel.Chore{}), userID).
		Preload("Assignees").
		Preload("LabelsV2").
		Where("chores.circle_id = ?", circleID).
		Where(privacyPredicate(userID)).
		Where("is_active = ?", false).
		Group("chores.id").
		Order("next_due_date asc").
		Find(&chores).Error; err != nil {
		return nil, err
	}
	return chores, nil
}

func (r *ChoreRepository) DeleteChore(c context.Context, id int) (int64, error) {
	var tombstoneSyncVersion int64
	err := r.db.WithContext(c).Transaction(func(tx *gorm.DB) error {
		query := tx.WithContext(c)
		if r.dbType == "postgres" {
			query = query.Clauses(clause.Locking{Strength: "UPDATE"})
		}
		var chore chModel.Chore
		if err := query.Select("id, circle_id").First(&chore, id).Error; err != nil {
			return err
		}

		// Delete all chore assignees
		if err := tx.Where("chore_id = ?", id).Delete(&chModel.ChoreAssignees{}).Error; err != nil {
			return err
		}
		// Delete all time sessions
		if err := tx.Where("chore_id = ?", id).Delete(&chModel.TimeSession{}).Error; err != nil {
			return err
		}
		// Delete all chore histories
		if err := tx.Where("chore_id = ?", id).Delete(&chModel.ChoreHistory{}).Error; err != nil {
			return err
		}
		// Delete all subtasks
		if err := tx.Where("chore_id = ?", id).Delete(&stModel.SubTask{}).Error; err != nil {
			return err
		}
		// Delete all chore labels
		if err := tx.Where("chore_id = ?", id).Delete(&chModel.ChoreLabels{}).Error; err != nil {
			return err
		}
		// Delete all storage files associated with the chore
		if err := tx.Where("entity_type = ? AND entity_id = ?", storageModel.EntityTypeChoreDescription, id).Delete(&storageModel.StorageFile{}).Error; err != nil {
			return err
		}
		if err := tx.Where("entity_type = ? AND entity_id = ?", storageModel.EntityTypeChoreAttachment, id).Delete(&storageModel.StorageFile{}).Error; err != nil {
			return err
		}
		// Delete the chore itself
		if err := tx.Delete(&chModel.Chore{}, id).Error; err != nil {
			return err
		}
		// Record tombstone so clients can remove it during sync
		version, err := r.insertTombstone(c, tx, chore.CircleID, id)
		if err != nil {
			return err
		}
		tombstoneSyncVersion = version
		return nil
	})
	if err != nil {
		return 0, err
	}
	return tombstoneSyncVersion, nil
}

func (r *ChoreRepository) SetChorePendingApproval(c context.Context, chore *chModel.Chore, note *string, userID int, completedDate *time.Time) error {
	nextVersion, err := r.nextSyncVersion(c, chore.CircleID)
	if err != nil {
		return err
	}
	err = r.db.WithContext(c).Transaction(func(tx *gorm.DB) error {
		// Look for existing chore history with start or pause status
		var existingHistory chModel.ChoreHistory
		err := tx.Where("chore_id = ? AND status = ? ",
			chore.ID, chModel.ChoreHistoryStatusStarted).
			First(&existingHistory).Error

		var ch *chModel.ChoreHistory
		switch {
		case err == nil:
			// Update existing history record to mark as pending approval
			existingHistory.PerformedAt = completedDate
			existingHistory.Note = note
			existingHistory.Status = chModel.ChoreHistoryStatusPendingApproval
			ch = &existingHistory
		case errors.Is(err, gorm.ErrRecordNotFound):
			// Create a new chore history record
			ch = &chModel.ChoreHistory{
				ChoreID:     chore.ID,
				PerformedAt: completedDate,
				CompletedBy: userID,
				AssignedTo:  chore.AssignedTo,
				DueDate:     chore.NextDueDate,
				Note:        note,
				Status:      chModel.ChoreHistoryStatusPendingApproval,
			}
		default:
			return err
		}

		ch.SyncVersion = nextVersion
		if err := tx.Save(ch).Error; err != nil {
			return err
		}

		// Set chore status to pending approval
		if err := tx.Model(&chModel.Chore{}).Where("id = ?", chore.ID).Updates(map[string]interface{}{
			"status":       chModel.ChoreStatusPendingApproval,
			"sync_version": nextVersion,
		}).Error; err != nil {
			return err
		}

		// if there is any time session associated with the chore, mark them as finished:
		var timeSessions []*chModel.TimeSession
		tx.Model(&chModel.TimeSession{}).Where("chore_id = ? AND status < ?", chore.ID, chModel.TimeSessionStatusCompleted).Find(&timeSessions)
		if len(timeSessions) != 0 {
			for _, session := range timeSessions {
				session.Finish(userID)
			}
			if err := tx.Save(&timeSessions).Error; err != nil {
				return err
			}
		}

		return nil
	})
	return err
}

func (r *ChoreRepository) ApproveChore(c context.Context, chore *chModel.Chore, adminUserID int, dueDate *time.Time, nextAssignedTo *int, applyPoints bool) error {
	nextVersion, err := r.nextSyncVersion(c, chore.CircleID)
	if err != nil {
		return err
	}
	err = r.db.WithContext(c).Transaction(func(tx *gorm.DB) error {
		choreUpdates := map[string]interface{}{}
		choreUpdates["next_due_date"] = dueDate
		choreUpdates["status"] = chModel.ChoreStatusNoStatus
		choreUpdates["sync_version"] = nextVersion

		if dueDate != nil {
			choreUpdates["assigned_to"] = nextAssignedTo
		} else {
			// one time task
			choreUpdates["is_active"] = false
		}

		// Get the latest history entry that's pending approval and update it to completed
		var history chModel.ChoreHistory
		err := tx.Where("chore_id = ? AND status = ?", chore.ID, chModel.ChoreHistoryStatusPendingApproval).
			Order("performed_at desc").
			First(&history).Error
		if err != nil {
			return err
		}

		// Update status to completed
		history.Status = chModel.ChoreHistoryStatusCompleted
		history.SyncVersion = nextVersion

		// Update UserCircle Points if applicable
		performedAt := time.Now().UTC()
		if history.PerformedAt != nil {
			performedAt = *history.PerformedAt
		}
		if applyPoints {
			if err := awardTask(tx, chore, &history, history.CompletedBy, adminUserID, performedAt); err != nil {
				return err
			}
		}

		// Save the updated history
		if err := tx.Save(&history).Error; err != nil {
			return err
		}
		if applyPoints {
			if err := games.AfterTask(tx, chore.CircleID, history.CompletedBy, performedAt, time.Now().UTC()); err != nil {
				return err
			}
		}

		// Perform the update operation once, using the prepared updates map.
		if err := tx.Model(&chModel.Chore{}).Where("id = ?", chore.ID).Updates(choreUpdates).Error; err != nil {
			return err
		}

		return nil
	})
	return err
}

func (r *ChoreRepository) RejectChore(c context.Context, choreID int, circleID int, rejectionNote *string) error {
	nextVersion, err := r.nextSyncVersion(c, circleID)
	if err != nil {
		return err
	}
	return r.db.WithContext(c).Transaction(func(tx *gorm.DB) error {
		// Reset chore status to normal
		if err := tx.Model(&chModel.Chore{}).Where("id = ? AND circle_id = ?", choreID, circleID).Updates(map[string]interface{}{
			"status":       chModel.ChoreStatusNoStatus,
			"sync_version": nextVersion,
		}).Error; err != nil {
			return err
		}

		// Get the latest pending approval history entry and mark it as rejected
		var history chModel.ChoreHistory
		err := tx.Where("chore_id = ? AND status = ?", choreID, chModel.ChoreHistoryStatusPendingApproval).
			Order("performed_at desc").
			First(&history).Error
		if err != nil {
			return err
		}

		// Update status to rejected
		history.Status = chModel.ChoreHistoryStatusRejected
		history.SyncVersion = nextVersion

		// Save the updated history
		if err := tx.Save(&history).Error; err != nil {
			return err
		}

		return nil
	})
}

func (r *ChoreRepository) CompleteChore(c context.Context, chore *chModel.Chore, note *string, userID int, dueDate *time.Time, completedDate *time.Time, nextAssignedTo *int, applyPoints bool) error {
	nextVersion, err := r.nextSyncVersion(c, chore.CircleID)
	if err != nil {
		return err
	}
	err = r.db.WithContext(c).Transaction(func(tx *gorm.DB) error {

		choreUpdates := map[string]interface{}{}
		choreUpdates["next_due_date"] = dueDate
		choreUpdates["status"] = chModel.ChoreStatusNoStatus
		choreUpdates["sync_version"] = nextVersion

		switch {
		case dueDate != nil:
			choreUpdates["assigned_to"] = nextAssignedTo
		case chore.FrequencyType == "trigger":
			// In case of trigger frequency type we need to still set the next assigned but need the task archived.
			choreUpdates["assigned_to"] = nextAssignedTo
			choreUpdates["is_active"] = false
		case chore.FrequencyType == "always":
			// Always chores have no due date but stay active and available immediately after completion.
			choreUpdates["assigned_to"] = nextAssignedTo
		default:
			// one time task
			choreUpdates["is_active"] = false
		}

		// Look for existing chore history with start or pause status
		var existingHistory chModel.ChoreHistory
		err := tx.Where("chore_id = ? AND status = ? ",
			chore.ID, chModel.ChoreHistoryStatusStarted).
			First(&existingHistory).Error

		var ch *chModel.ChoreHistory
		switch {
		case err == nil:
			// Update existing history record
			existingHistory.PerformedAt = completedDate
			existingHistory.Note = note
			existingHistory.Status = chModel.ChoreHistoryStatusCompleted
			ch = &existingHistory
		case errors.Is(err, gorm.ErrRecordNotFound):
			// Create a new chore history record
			ch = &chModel.ChoreHistory{
				ChoreID:     chore.ID,
				PerformedAt: completedDate,
				CompletedBy: userID,
				AssignedTo:  chore.AssignedTo,
				DueDate:     chore.NextDueDate,
				Note:        note,
				Status:      chModel.ChoreHistoryStatusCompleted,
			}
		default:
			return err
		}

		// Update UserCirclee Points :
		performedAt := time.Now().UTC()
		if completedDate != nil {
			performedAt = *completedDate
		}
		if applyPoints {
			if err := awardTask(tx, chore, ch, userID, userID, performedAt); err != nil {
				return err
			}
		}
		ch.SyncVersion = nextVersion
		// Perform the update operation once, using the prepared updates map.
		if err := tx.Model(&chModel.Chore{}).Where("id = ?", chore.ID).Updates(choreUpdates).Error; err != nil {
			return err
		}

		if err := tx.Save(ch).Error; err != nil {
			return err
		}
		if applyPoints {
			if err := games.AfterTask(tx, chore.CircleID, userID, performedAt, time.Now().UTC()); err != nil {
				return err
			}
		}
		// if there is any time session associated with the chore, mark them as finished:
		var timeSessions []*chModel.TimeSession
		tx.Model(&chModel.TimeSession{}).Where("chore_id = ? AND status < ?", chore.ID, chModel.TimeSessionStatusCompleted).Find(&timeSessions)
		if len(timeSessions) != 0 {
			for _, session := range timeSessions {
				session.Finish(userID)
			}
			if err := tx.Save(&timeSessions).Error; err != nil {
				return err
			}
		}

		return nil
	})
	return err
}

func (r *ChoreRepository) SkipChore(c context.Context, chore *chModel.Chore, userID int, dueDate *time.Time, nextAssignedTo *int, skippedAt *time.Time) error {
	nextVersion, err := r.nextSyncVersion(c, chore.CircleID)
	if err != nil {
		return err
	}
	err = r.db.WithContext(c).Transaction(func(tx *gorm.DB) error {
		choreUpdates := map[string]interface{}{}
		choreUpdates["next_due_date"] = dueDate
		choreUpdates["status"] = chModel.ChoreStatusNoStatus
		choreUpdates["sync_version"] = nextVersion

		if dueDate != nil {
			choreUpdates["assigned_to"] = nextAssignedTo
		} else {
			// one time task
			choreUpdates["is_active"] = false
		}

		// Look for existing chore history with start or pause status
		var existingHistory chModel.ChoreHistory
		err := tx.Where("chore_id = ? AND status = ? ",
			chore.ID, chModel.ChoreHistoryStatusStarted).
			First(&existingHistory).Error

		var ch *chModel.ChoreHistory
		effectiveSkippedAt := time.Now().UTC()
		if skippedAt != nil {
			effectiveSkippedAt = skippedAt.UTC()
		}

		switch {
		case err == nil && existingHistory.PerformedAt != nil:
			// Update existing history record
			existingHistory.PerformedAt = &effectiveSkippedAt
			existingHistory.Note = nil
			existingHistory.Status = chModel.ChoreHistoryStatusSkipped
			ch = &existingHistory
		case errors.Is(err, gorm.ErrRecordNotFound):
			// Create a new chore history record for the skipped chore
			ch = &chModel.ChoreHistory{
				ChoreID:     chore.ID,
				PerformedAt: &effectiveSkippedAt,
				CompletedBy: userID,
				AssignedTo:  chore.AssignedTo,
				DueDate:     chore.NextDueDate,
				Note:        nil,
				Status:      chModel.ChoreHistoryStatusSkipped,
			}
		default:
			return err
		}

		ch.SyncVersion = nextVersion
		// Perform the update operation once, using the prepared updates map.
		if err := tx.Model(&chModel.Chore{}).Where("id = ?", chore.ID).Updates(choreUpdates).Error; err != nil {
			return err
		}

		if err := tx.Save(ch).Error; err != nil {
			return err
		}

		// if there is any time session associated with the chore, mark them as finished:
		var timeSessions []*chModel.TimeSession
		tx.Model(&chModel.TimeSession{}).Where("chore_id = ? AND status < ?", chore.ID, chModel.TimeSessionStatusCompleted).Find(&timeSessions)
		if len(timeSessions) != 0 {
			for _, session := range timeSessions {
				session.Finish(userID)
			}
			if err := tx.Save(&timeSessions).Error; err != nil {
				return err
			}
		}

		return nil
	})
	return err
}

func (r *ChoreRepository) GetChoreHistory(c context.Context, choreID int) ([]*chModel.ChoreHistory, error) {
	var histories []*chModel.ChoreHistory
	if err := r.db.WithContext(c).
		Table("chore_histories").
		Select("chore_histories.*, time_sessions.duration").
		Joins("LEFT JOIN time_sessions ON chore_histories.id = time_sessions.chore_history_id").
		Where("chore_histories.chore_id = ?", choreID).
		Order("chore_histories.updated_at desc").
		Find(&histories).Error; err != nil {
		return nil, err
	}
	return histories, nil
}
func (r *ChoreRepository) GetChoreHistoryWithLimit(c context.Context, choreID int, limit int) ([]*chModel.ChoreHistory, error) {
	var histories []*chModel.ChoreHistory
	if err := r.db.WithContext(c).
		Table("chore_histories").
		Select("chore_histories.*, time_sessions.duration").
		Joins("LEFT JOIN time_sessions ON chore_histories.id = time_sessions.chore_history_id").
		Where("chore_histories.chore_id = ?", choreID).
		Order("chore_histories.performed_at desc").
		Limit(limit).
		Find(&histories).Error; err != nil {
		return nil, err
	}
	return histories, nil
}

func (r *ChoreRepository) GetChoreHistoryByID(c context.Context, choreID int, historyID int) (*chModel.ChoreHistory, error) {
	var history chModel.ChoreHistory
	if err := r.db.WithContext(c).Where("id = ? and chore_id = ? ", historyID, choreID).First(&history).Error; err != nil {
		return nil, err
	}
	return &history, nil
}

func (r *ChoreRepository) CreateChoreHistory(c context.Context, history *chModel.ChoreHistory) error {
	// Get the circle_id from the associated chore
	var chore chModel.Chore
	if err := r.db.WithContext(c).Select("circle_id").First(&chore, history.ChoreID).Error; err != nil {
		return fmt.Errorf("failed to get chore for history creation: %w", err)
	}

	// Allocate sync version for this history
	nextVersion, err := r.nextSyncVersion(c, chore.CircleID)
	if err != nil {
		return fmt.Errorf("failed to allocate sync version: %w", err)
	}

	history.SyncVersion = nextVersion
	return r.db.WithContext(c).Create(history).Error
}

func (r *ChoreRepository) UpdateChoreHistory(c context.Context, history *chModel.ChoreHistory) error {
	// Get the circle_id from the associated chore
	var chore chModel.Chore
	if err := r.db.WithContext(c).Select("circle_id").First(&chore, history.ChoreID).Error; err != nil {
		return fmt.Errorf("failed to get chore for history update: %w", err)
	}

	// Every history update must get a fresh sync version so it is visible to sync clients.
	nextVersion, err := r.nextSyncVersion(c, chore.CircleID)
	if err != nil {
		return fmt.Errorf("failed to allocate sync version: %w", err)
	}
	history.SyncVersion = nextVersion

	return r.db.WithContext(c).Save(history).Error
}

func (r *ChoreRepository) DeleteChoreHistory(c context.Context, historyID int, circleID int) error {
	// create transaction and delete all the chore timer associated with the chore history then delete the chore history
	return r.db.WithContext(c).Transaction(func(tx *gorm.DB) error {
		// Allocate next sync version within the transaction for atomicity
		nextVersion, err := r.nextSyncVersionWithDB(c, tx, circleID)
		if err != nil {
			return err
		}

		if err := tx.WithContext(c).Where("chore_history_id = ?", historyID).Delete(&chModel.TimeSession{}).Error; err != nil {
			return fmt.Errorf("failed to delete chore time sessions: %w", err)
		}
		// Now delete the chore history
		if err := tx.WithContext(c).Delete(&chModel.ChoreHistory{}, historyID).Error; err != nil {
			return fmt.Errorf("failed to delete chore history: %w", err)
		}
		// Record tombstone so clients can remove it during sync
		return tx.WithContext(c).Create(&syncModel.Tombstone{
			CircleID:    circleID,
			EntityType:  syncModel.EntityTypeChoreHistory,
			EntityID:    historyID,
			SyncVersion: nextVersion,
		}).Error
	})
}

// ClearHistory deletes the task history of a circle, or only what the given
// members did, with its timer sessions, and leaves tombstones so synced
// clients drop it too. The tasks done go back to do with the due date they
// had before. It returns how many entries were deleted.
func (r *ChoreRepository) ClearHistory(c context.Context, circleID int, userIDs []int) (int, error) {
	deleted := 0
	err := r.db.WithContext(c).Transaction(func(tx *gorm.DB) error {
		query := tx.Model(&chModel.ChoreHistory{}).
			Where("chore_id IN (?)", tx.Model(&chModel.Chore{}).Select("id").Where("circle_id = ?", circleID))
		if userIDs != nil {
			query = query.Where("completed_by IN ?", userIDs)
		}
		var rows []chModel.ChoreHistory
		if err := query.Select("id", "chore_id", "due_date").Order("id asc").Find(&rows).Error; err != nil {
			return err
		}
		if len(rows) == 0 {
			return nil
		}
		ids := make([]int, 0, len(rows))
		// The oldest cleared completion of each task holds the due date the
		// task had before it was done.
		first := map[int]chModel.ChoreHistory{}
		for _, row := range rows {
			ids = append(ids, row.ID)
			if _, ok := first[row.ChoreID]; !ok {
				first[row.ChoreID] = row
			}
		}
		// A task done again later by someone who keeps their history stays
		// as that completion left it.
		for choreID, row := range first {
			var later int64
			if err := tx.Model(&chModel.ChoreHistory{}).Where("chore_id = ? AND id > ?", choreID, row.ID).
				Where("id NOT IN ?", ids).Count(&later).Error; err != nil {
				return err
			}
			if later > 0 {
				delete(first, choreID)
			}
		}
		next, err := r.nextSyncVersionRangeWithDB(c, tx, circleID, len(ids)+len(first))
		if err != nil {
			return err
		}
		tombstones := make([]syncModel.Tombstone, 0, len(ids))
		for start := 0; start < len(ids); start += 500 {
			batch := ids[start:min(start+500, len(ids))]
			if err := tx.Where("chore_history_id IN ?", batch).Delete(&chModel.TimeSession{}).Error; err != nil {
				return fmt.Errorf("failed to delete chore time sessions: %w", err)
			}
			if err := tx.Where("id IN ?", batch).Delete(&chModel.ChoreHistory{}).Error; err != nil {
				return fmt.Errorf("failed to delete chore history: %w", err)
			}
		}
		for _, id := range ids {
			tombstones = append(tombstones, syncModel.Tombstone{CircleID: circleID, EntityType: syncModel.EntityTypeChoreHistory,
				EntityID: id, SyncVersion: next})
			next++
		}
		// Put the tasks back to do, as an undo of their first completion
		// would: same due date, active again, no pending approval.
		choreIDs := make([]int, 0, len(first))
		for choreID := range first {
			choreIDs = append(choreIDs, choreID)
		}
		sort.Ints(choreIDs)
		for _, choreID := range choreIDs {
			if err := tx.Model(&chModel.Chore{}).Where("id = ?", choreID).
				Select("next_due_date", "is_active", "status", "sync_version").
				Updates(map[string]interface{}{
					"next_due_date": first[choreID].DueDate,
					"is_active":     true,
					"status":        chModel.ChoreStatusNoStatus,
					"sync_version":  next,
				}).Error; err != nil {
				return fmt.Errorf("failed to put the task back to do: %w", err)
			}
			next++
		}
		deleted = len(ids)
		return tx.CreateInBatches(&tombstones, 200).Error
	})
	return deleted, err
}

func (r *ChoreRepository) RemoveChoreAssigneeByCircleID(c context.Context, userID int, circleID int) error {
	return r.db.WithContext(c).Where("user_id = ? AND chore_id IN (SELECT id FROM chores WHERE circle_id = ? and created_by != ?)", userID, circleID, userID).Delete(&chModel.ChoreAssignees{}).Error
}

func (r *ChoreRepository) GetChoreDetailByID(c context.Context, choreID int, circleID int, userID int) (*chModel.ChoreDetail, error) {
	var choreDetail chModel.ChoreDetail
	if err := privacyJoins(r.db.WithContext(c).Table("chores"), userID).
		Preload("Subtasks").
		Preload("Assignees").
		Select(`
        chores.id, 
        chores.name,
		chores.description, 
        chores.frequency_type, 
        chores.next_due_date, 
        chores.assigned_to,
        chores.created_by,
		chores.priority,
		chores.completion_window,
		chores.status,
		chores.is_active,
		chores.sync_version,
		CAST(MAX(time_sessions.duration) AS INTEGER) as duration,
		time_sessions.start_time as start_time,
		time_sessions.updated_at as timer_updated_at,
        recent_history.last_completed_date,
		recent_history.last_assigned_to,
		recent_history.notes,
        recent_history.last_completed_by as last_completed_by,
        COUNT(chore_histories.id) as total_completed`).
		Joins("LEFT JOIN chore_histories ON chores.id = chore_histories.chore_id").
		Joins(`LEFT JOIN (
        SELECT
            chore_id,
            assigned_to AS last_assigned_to,
            performed_at AS last_completed_date,
			completed_by AS last_completed_by,
			notes

        FROM chore_histories
        WHERE (chore_id, performed_at) IN (
            SELECT chore_id, MAX(performed_at)
            FROM chore_histories
            WHERE status IN (1, 2, 3, 4)
            GROUP BY chore_id
        )
        AND status IN (1, 2, 3, 4)
    ) AS recent_history ON chores.id = recent_history.chore_id`).
		Joins("LEFT JOIN time_sessions ON chores.id = time_sessions.chore_id AND time_sessions.status < ?", chModel.TimeSessionStatusCompleted).
		Where("chores.id = ? AND chores.circle_id = ?", choreID, circleID).
		Where(privacyPredicate(userID)).
		Group("chores.id, recent_history.last_completed_date, recent_history.last_assigned_to, recent_history.last_completed_by, recent_history.notes, time_sessions.start_time, time_sessions.updated_at").
		First(&choreDetail).Error; err != nil {
		return nil, err
	}
	r.db.WithContext(c).Where("entity_type = ? AND entity_id = ?", storageModel.EntityTypeChoreAttachment, choreID).Find(&choreDetail.Attachments)
	return &choreDetail, nil
}

func (r *ChoreRepository) ArchiveChore(c context.Context, choreID int, userID int, circleID int) error {
	nextVersion, err := r.nextSyncVersion(c, circleID)
	if err != nil {
		return err
	}
	result := r.db.WithContext(c).Model(&chModel.Chore{}).Where("id = ? AND created_by = ? AND circle_id = ?", choreID, userID, circleID).Updates(map[string]interface{}{
		"is_active":    false,
		"sync_version": nextVersion,
	})
	if result.RowsAffected == 0 {
		return errors.New("chore not found or not authorized")
	}
	return result.Error
}

func (r *ChoreRepository) UnarchiveChore(c context.Context, choreID int, userID int, circleID int) error {
	nextVersion, err := r.nextSyncVersion(c, circleID)
	if err != nil {
		return err
	}
	result := r.db.WithContext(c).Model(&chModel.Chore{}).Where("id = ? AND created_by = ? AND circle_id = ?", choreID, userID, circleID).Updates(map[string]interface{}{
		"is_active":    true,
		"sync_version": nextVersion,
	})
	if result.RowsAffected == 0 {
		return errors.New("chore not found or not authorized")
	}
	return result.Error
}

func (r *ChoreRepository) GetChoresHistoryByUserID(c context.Context, userID int, circleID int, days int, includeCircle bool) ([]*chModel.ChoreHistory, error) {

	var chores []*chModel.ChoreHistory
	since := time.Now().UTC().AddDate(0, 0, days*-1)
	query := r.db.WithContext(c).
		Table("chore_histories").
		Select("chore_histories.*, circles.id as circle_id, time_sessions.duration, time_sessions.start_time, time_sessions.updated_at as timer_updated_at").
		Joins("LEFT JOIN chores ON chore_histories.chore_id = chores.id").
		Joins("LEFT JOIN circles ON chores.circle_id = circles.id").
		Joins("LEFT JOIN time_sessions ON chore_histories.id = time_sessions.chore_history_id")
	query = privacyJoins(query, userID).
		Where("circles.id = ? AND chore_histories.updated_at > ?", circleID, since).
		Where(privacyPredicate(userID)).
		Order("chore_histories.performed_at desc, chore_histories.updated_at desc")

	if !includeCircle {
		query = query.Where("chore_histories.completed_by = ?", userID)
	}

	if err := query.Find(&chores).Error; err != nil {
		return nil, err
	}
	return chores, nil
}

// GetTombstonesSince returns global tombstones and tombstones scoped to userID.
func (r *ChoreRepository) GetTombstonesSince(c context.Context, circleID int, entityType syncModel.EntityType, userID int, since int64, limit int) ([]*syncModel.Tombstone, error) {
	var tombstones []*syncModel.Tombstone
	query := r.db.WithContext(c).
		Where("circle_id = ? AND entity_type = ? AND sync_version > ? AND (user_id IS NULL OR user_id = ?)", circleID, entityType, since, userID).
		Order("sync_version asc")
	if limit > 0 {
		query = query.Limit(limit)
	}
	if err := query.Find(&tombstones).Error; err != nil {
		return nil, err
	}
	return tombstones, nil
}

// GetChoresHistoryByCircle retrieves chore histories for a circle, respecting privacy and optionally filtered by sync version.
// A history is visible if the user can see the associated chore (privacy rules apply).
// If syncOptions is nil or syncOptions.SyncVersion is nil, returns all visible histories ordered by performed_at DESC.
// If syncOptions.SyncVersion is set, returns only histories with sync_version > *SyncVersion, ordered by sync_version ASC.
func (r *ChoreRepository) GetChoresHistoryByCircle(c context.Context, circleID int, userID int, syncOptions *SyncOptions) ([]*chModel.ChoreHistory, error) {
	var histories []*chModel.ChoreHistory

	query := r.db.WithContext(c).
		Table("chore_histories").
		Select("chore_histories.*, time_sessions.duration").
		Joins("JOIN chores ON chores.id = chore_histories.chore_id").
		Joins("LEFT JOIN time_sessions ON time_sessions.chore_history_id = chore_histories.id")
	query = privacyJoins(query, userID).
		Where("chores.circle_id = ?", circleID).
		Where(privacyPredicate(userID))

	// Sync-specific filtering if provided.
	if syncOptions != nil && syncOptions.SyncVersion != nil {
		query = query.Where("chore_histories.sync_version > ?", *syncOptions.SyncVersion).
			Order("chore_histories.sync_version asc").
			Limit(syncOptions.Limit + 1)
	} else {
		// Normal ordering when not syncing.
		query = query.Order("chore_histories.performed_at desc, chore_histories.updated_at desc")
	}

	if err := query.Find(&histories).Error; err != nil {
		return nil, err
	}
	return histories, nil
}

// GetUserLastChoreAction gets the user's most recent action on a chore (within time limit)
func (r *ChoreRepository) GetUserLastChoreAction(c context.Context, choreID int, userID int, timeLimit time.Duration) (*chModel.ChoreHistory, error) {
	var history chModel.ChoreHistory
	cutoffTime := time.Now().UTC().Add(-timeLimit)

	err := r.db.WithContext(c).
		Where("chore_id = ? AND completed_by = ? AND created_at > ?", choreID, userID, cutoffTime).
		Where("status IN (?)", []chModel.ChoreHistoryStatus{
			chModel.ChoreHistoryStatusCompleted,
			chModel.ChoreHistoryStatusSkipped,
			chModel.ChoreHistoryStatusPendingApproval,
			chModel.ChoreHistoryStatusRejected,
		}).
		Order("created_at desc").
		First(&history).Error

	if err != nil {
		return nil, err
	}
	return &history, nil
}

// UndoChoreAction undoes a chore action by restoring previous state and removing the history entry
func (r *ChoreRepository) UndoChoreAction(c context.Context, choreID int, historyID int, circleID int, previousAssignedTo *int, previousDueDate *time.Time) error {
	nextVersion, err := r.nextSyncVersion(c, circleID)
	if err != nil {
		return err
	}
	return r.db.WithContext(c).Transaction(func(tx *gorm.DB) error {
		// Get the history entry to undo
		var historyToUndo chModel.ChoreHistory
		if err := tx.First(&historyToUndo, historyID).Error; err != nil {
			return err
		}

		// Prepare chore updates
		choreUpdates := map[string]interface{}{
			"status":       chModel.ChoreStatusNoStatus,
			"sync_version": nextVersion,
		}

		// Build list of fields to explicitly update (including nullable fields)
		selectFields := []string{"status", "sync_version"}

		// Restore previous assignee
		if previousAssignedTo != nil {
			choreUpdates["assigned_to"] = *previousAssignedTo
		} else {
			choreUpdates["assigned_to"] = nil
		}
		selectFields = append(selectFields, "assigned_to")

		// Restore previous due date; always reactivate since the chore was
		// active before completion (e.g. "once" chores have no due date but
		// must be unarchived on undo).
		if previousDueDate != nil {
			choreUpdates["next_due_date"] = *previousDueDate
		} else {
			choreUpdates["next_due_date"] = nil
		}
		choreUpdates["is_active"] = true
		selectFields = append(selectFields, "next_due_date", "is_active")

		// Update the chore with explicit field selection to handle nil values
		if err := tx.Model(&chModel.Chore{}).Where("id = ?", choreID).Select(selectFields).Updates(choreUpdates).Error; err != nil {
			return err
		}

		// Remove points if they were added during completion/approval
		if historyToUndo.Points != nil && *historyToUndo.Points > 0 &&
			(historyToUndo.Status == chModel.ChoreHistoryStatusCompleted) {
			// Get the chore to find circle ID
			var chore chModel.Chore
			if err := tx.Select("id", "name", "circle_id").First(&chore, choreID).Error; err != nil {
				return err
			}
			// Subtract points from user
			if err := tx.Model(&cModel.UserCircle{}).
				Where("user_id = ? AND circle_id = ?", historyToUndo.CompletedBy, chore.CircleID).
				Update("points", gorm.Expr("points - ?", *historyToUndo.Points)).Error; err != nil {
				return err
			}
			undo := taskPoints(&chore, historyToUndo.CompletedBy, historyToUndo.CompletedBy, *historyToUndo.Points)
			undo.Action = ptModel.PointsHistoryActionRemove
			if err := ptRepo.Record(tx, undo); err != nil {
				return err
			}
		}

		// Delete the history entry being undone
		if err := tx.Delete(&chModel.ChoreHistory{}, historyID).Error; err != nil {
			return err
		}

		// Delete associated time sessions for this history entry
		if err := tx.Where("chore_history_id = ?", historyID).Delete(&chModel.TimeSession{}).Error; err != nil {
			return err
		}

		return nil
	})
}
