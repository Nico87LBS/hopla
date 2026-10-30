package chore

import (
	"context"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	syncModel "github.com/nico87lbs/hopla/internal/sync/model"
	"gorm.io/gorm"
)

// visibilityDelta is who lost and who gained sight of one chore.
type visibilityDelta struct {
	choreID int
	revoked []int
	granted []int
}

// applyVisibilityDeltas records the sync-side consequences of users losing or
// gaining sight of chores:
//   - a lost chore gets a user-scoped tombstone for the chore and for each of its
//     history entries, so delta-sync clients drop their cached copies of both,
//   - a gained chore gets its history entries re-versioned so delta-sync clients
//     that synced past them still receive them, and any older user-scoped
//     tombstones of that user for the chore or its history are removed, so a
//     client that syncs the revocation and the re-grant together keeps the chore.
//
// It returns, per chore and revoked user, the version of the chore tombstone.
func (r *ChoreRepository) applyVisibilityDeltas(ctx context.Context, tx *gorm.DB, familyID int, deltas []visibilityDelta) (map[int]map[int]int64, error) {
	revocations := map[int]map[int]int64{}
	if len(deltas) == 0 {
		return revocations, nil
	}

	choreIDs := make([]int, 0, len(deltas))
	for _, d := range deltas {
		choreIDs = append(choreIDs, d.choreID)
	}
	var histories []chModel.ChoreHistory
	if err := tx.WithContext(ctx).Model(&chModel.ChoreHistory{}).Select("id, chore_id").
		Where("chore_id IN ?", choreIDs).Order("id asc").Find(&histories).Error; err != nil {
		return nil, err
	}
	historiesByChore := map[int][]int{}
	for _, h := range histories {
		historiesByChore[h.ChoreID] = append(historiesByChore[h.ChoreID], h.ID)
	}

	versionsNeeded := 0
	for _, d := range deltas {
		versionsNeeded += len(d.revoked) * (1 + len(historiesByChore[d.choreID]))
		if len(d.granted) > 0 {
			versionsNeeded += len(historiesByChore[d.choreID])
		}
	}
	nextVersion := int64(0)
	if versionsNeeded > 0 {
		var err error
		nextVersion, err = r.nextSyncVersionRangeWithDB(ctx, tx, familyID, versionsNeeded)
		if err != nil {
			return nil, err
		}
	}

	tombstones := make([]syncModel.Tombstone, 0)
	for _, d := range deltas {
		historyIDs := historiesByChore[d.choreID]
		for _, userID := range d.revoked {
			user := userID
			if revocations[d.choreID] == nil {
				revocations[d.choreID] = map[int]int64{}
			}
			revocations[d.choreID][user] = nextVersion
			tombstones = append(tombstones, syncModel.Tombstone{
				FamilyID: familyID, EntityType: syncModel.EntityTypeChore, EntityID: d.choreID,
				UserID: &user, SyncVersion: nextVersion,
			})
			nextVersion++
			for _, historyID := range historyIDs {
				tombstones = append(tombstones, syncModel.Tombstone{
					FamilyID: familyID, EntityType: syncModel.EntityTypeChoreHistory, EntityID: historyID,
					UserID: &user, SyncVersion: nextVersion,
				})
				nextVersion++
			}
		}
		if len(d.granted) > 0 {
			for _, historyID := range historyIDs {
				if err := tx.WithContext(ctx).Model(&chModel.ChoreHistory{}).Where("id = ?", historyID).
					Update("sync_version", nextVersion).Error; err != nil {
					return nil, err
				}
				nextVersion++
			}
			if err := tx.WithContext(ctx).
				Where("family_id = ? AND entity_type = ? AND entity_id = ? AND user_id IN ?", familyID, syncModel.EntityTypeChore, d.choreID, d.granted).
				Delete(&syncModel.Tombstone{}).Error; err != nil {
				return nil, err
			}
			if len(historyIDs) > 0 {
				if err := tx.WithContext(ctx).
					Where("family_id = ? AND entity_type = ? AND entity_id IN ? AND user_id IN ?", familyID, syncModel.EntityTypeChoreHistory, historyIDs, d.granted).
					Delete(&syncModel.Tombstone{}).Error; err != nil {
					return nil, err
				}
			}
		}
	}
	if len(tombstones) > 0 {
		if err := tx.WithContext(ctx).CreateInBatches(&tombstones, 200).Error; err != nil {
			return nil, err
		}
	}
	return revocations, nil
}

// TombstoneChoresLeavingFamily records family-wide tombstones for chores (and
// their history) that were moved out of familyID, e.g. when their creator leaves
// the family and takes them along. Without them, the devices of the remaining
// members would keep showing the moved chores until their cache is rebuilt.
func (r *ChoreRepository) TombstoneChoresLeavingFamily(ctx context.Context, familyID int, choreIDs []int) error {
	if len(choreIDs) == 0 {
		return nil
	}
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var historyIDs []int
		if err := tx.WithContext(ctx).Model(&chModel.ChoreHistory{}).Where("chore_id IN ?", choreIDs).
			Order("id asc").Pluck("id", &historyIDs).Error; err != nil {
			return err
		}
		next, err := r.nextSyncVersionRangeWithDB(ctx, tx, familyID, len(choreIDs)+len(historyIDs))
		if err != nil {
			return err
		}
		tombstones := make([]syncModel.Tombstone, 0, len(choreIDs)+len(historyIDs))
		for _, id := range choreIDs {
			tombstones = append(tombstones, syncModel.Tombstone{FamilyID: familyID, EntityType: syncModel.EntityTypeChore, EntityID: id, SyncVersion: next})
			next++
		}
		for _, id := range historyIDs {
			tombstones = append(tombstones, syncModel.Tombstone{FamilyID: familyID, EntityType: syncModel.EntityTypeChoreHistory, EntityID: id, SyncVersion: next})
			next++
		}
		return tx.WithContext(ctx).CreateInBatches(&tombstones, 200).Error
	})
}
