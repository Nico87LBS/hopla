package migrations

import (
	"context"

	"github.com/nico87lbs/hopla/internal/sync/model"
	"github.com/nico87lbs/hopla/logging"
	"gorm.io/gorm"
)

type BackfillSyncVersionsForExistingData20260511 struct{}

func (m BackfillSyncVersionsForExistingData20260511) ID() string {
	return "20260511_backfill_sync_versions_for_existing_data"
}

func (m BackfillSyncVersionsForExistingData20260511) Description() string {
	return `Backfill sync_version for legacy chores, chore histories, and tombstones with zero values; align sync cursor per family.`
}

func (m BackfillSyncVersionsForExistingData20260511) Down(ctx context.Context, db *gorm.DB) error {
	// No-op: irreversible data migration
	return nil
}

func maxInt64(values ...int64) int64 {
	maxValue := int64(0)
	for _, value := range values {
		if value > maxValue {
			maxValue = value
		}
	}
	return maxValue
}

func (m BackfillSyncVersionsForExistingData20260511) Up(ctx context.Context, db *gorm.DB) error {
	log := logging.FromContext(ctx)

	type familyRow struct {
		FamilyID int `gorm:"column:family_id"`
	}
	type idRow struct {
		ID int `gorm:"column:id"`
	}

	var families []familyRow
	if err := db.WithContext(ctx).Raw(`
		SELECT family_id FROM chores
		UNION
		SELECT family_id FROM tombstones
		UNION
		SELECT family_id FROM sync_cursors
	`).Scan(&families).Error; err != nil {
		log.Errorf("Failed to load families for sync backfill: %v", err)
		return err
	}

	totalChoresUpdated := 0
	totalHistoriesUpdated := 0
	totalTombstonesUpdated := 0

	for _, family := range families {
		if family.FamilyID == 0 {
			continue
		}

		err := db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
			var maxChoreVersion int64
			if err := tx.Raw(`SELECT COALESCE(MAX(sync_version), 0) FROM chores WHERE family_id = ?`, family.FamilyID).Scan(&maxChoreVersion).Error; err != nil {
				return err
			}

			var maxHistoryVersion int64
			if err := tx.Raw(`
				SELECT COALESCE(MAX(chore_histories.sync_version), 0)
				FROM chore_histories
				JOIN chores ON chores.id = chore_histories.chore_id
				WHERE chores.family_id = ?
			`, family.FamilyID).Scan(&maxHistoryVersion).Error; err != nil {
				return err
			}

			var maxTombstoneVersion int64
			if err := tx.Raw(`SELECT COALESCE(MAX(sync_version), 0) FROM tombstones WHERE family_id = ?`, family.FamilyID).Scan(&maxTombstoneVersion).Error; err != nil {
				return err
			}

			var maxCursorVersion int64
			if err := tx.Raw(`
				SELECT COALESCE(MAX(max_version), 0)
				FROM sync_cursors
				WHERE family_id = ?
			`, family.FamilyID).Scan(&maxCursorVersion).Error; err != nil {
				return err
			}

			currentVersion := maxInt64(maxChoreVersion, maxHistoryVersion, maxTombstoneVersion, maxCursorVersion)

			// Batch update chores with sync_version = 0 using window functions
			var choreCount int64
			if err := tx.Raw(`
				SELECT COUNT(*) FROM chores WHERE family_id = ? AND sync_version = 0
			`, family.FamilyID).Scan(&choreCount).Error; err != nil {
				return err
			}

			if choreCount > 0 {
				if err := tx.Exec(`
					WITH numbered_chores AS (
						SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS rn
						FROM chores
						WHERE family_id = ? AND sync_version = 0
					)
					UPDATE chores
					SET sync_version = ? + nc.rn
					FROM numbered_chores nc
					WHERE chores.id = nc.id
				`, family.FamilyID, currentVersion).Error; err != nil {
					return err
				}
				currentVersion += choreCount
			}

			// Batch update chore histories with sync_version = 0 using window functions
			var historyCount int64
			if err := tx.Raw(`
				SELECT COUNT(chore_histories.id)
				FROM chore_histories
				JOIN chores ON chores.id = chore_histories.chore_id
				WHERE chores.family_id = ? AND chore_histories.sync_version = 0
			`, family.FamilyID).Scan(&historyCount).Error; err != nil {
				return err
			}

			if historyCount > 0 {
				if err := tx.Exec(`
					WITH numbered_histories AS (
						SELECT chore_histories.id, ROW_NUMBER() OVER (ORDER BY chore_histories.created_at ASC, chore_histories.id ASC) AS rn
						FROM chore_histories
						JOIN chores ON chores.id = chore_histories.chore_id
						WHERE chores.family_id = ? AND chore_histories.sync_version = 0
					)
					UPDATE chore_histories
					SET sync_version = ? + nh.rn
					FROM numbered_histories nh
					WHERE chore_histories.id = nh.id
				`, family.FamilyID, currentVersion).Error; err != nil {
					return err
				}
				currentVersion += historyCount
			}

			// Batch update tombstones with sync_version = 0 using window functions
			var tombstoneCount int64
			if err := tx.Raw(`
				SELECT COUNT(*) FROM tombstones WHERE family_id = ? AND sync_version = 0
			`, family.FamilyID).Scan(&tombstoneCount).Error; err != nil {
				return err
			}

			if tombstoneCount > 0 {
				if err := tx.Exec(`
					WITH numbered_tombstones AS (
						SELECT id, ROW_NUMBER() OVER (ORDER BY id ASC) AS rn
						FROM tombstones
						WHERE family_id = ? AND sync_version = 0
					)
					UPDATE tombstones
					SET sync_version = ? + nt.rn
					FROM numbered_tombstones nt
					WHERE tombstones.id = nt.id
				`, family.FamilyID, currentVersion).Error; err != nil {
					return err
				}
				currentVersion += tombstoneCount
			}

			if err := tx.Exec(`
				INSERT INTO sync_cursors (family_id, entity_type, max_version)
				VALUES (?, ?, ?)
				ON CONFLICT (family_id, entity_type)
				DO UPDATE SET max_version =
					CASE
						WHEN sync_cursors.max_version > excluded.max_version THEN sync_cursors.max_version
						ELSE excluded.max_version
					END
			`, family.FamilyID, model.EntityTypeChore, currentVersion).Error; err != nil {
				return err
			}

			totalChoresUpdated += int(choreCount)
			totalHistoriesUpdated += int(historyCount)
			totalTombstonesUpdated += int(tombstoneCount)

			if choreCount+historyCount+tombstoneCount > 0 {
				log.Infof("Sync backfill family=%d chores=%d histories=%d tombstones=%d maxVersion=%d", family.FamilyID, choreCount, historyCount, tombstoneCount, currentVersion)
			}

			return nil
		})
		if err != nil {
			log.Errorf("Failed sync backfill for family %d: %v", family.FamilyID, err)
			return err
		}
	}

	log.Infof("Sync backfill completed: chores=%d histories=%d tombstones=%d", totalChoresUpdated, totalHistoriesUpdated, totalTombstonesUpdated)
	return nil
}

func init() {
	Register(BackfillSyncVersionsForExistingData20260511{})
}
