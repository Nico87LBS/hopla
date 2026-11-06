package migrations

import (
	"context"
	"time"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	syncModel "github.com/nico87lbs/hopla/internal/sync/model"
	"github.com/nico87lbs/hopla/internal/zone"
	"github.com/nico87lbs/hopla/logging"
	"gorm.io/gorm"
)

// momentsBackupTable keeps the tasks as they were before the migration, to
// put them back (Down) and to read what changed.
const momentsBackupTable = "chores_avant_moments"

// TasksToMoments20261106 puts every task with a rhythm that has moments on
// one moment: its time of day, its limit as "jusqu'à", its window as "s'ouvre".
// A dated task gets the day of its passage. "Toujours là", "Sur signal" and
// the intervals in hours stay as they are.
type TasksToMoments20261106 struct{}

func (m TasksToMoments20261106) ID() string {
	return "20261106_tasks_to_moments"
}

func (m TasksToMoments20261106) Description() string {
	return `Give every task without moments its one moment (time, until, opens before), keeping the old values in chores_avant_moments.`
}

// momentsBackup is a task as it was before the migration.
type momentsBackup struct {
	ID               int                        `gorm:"column:id;primaryKey"`
	FrequencyMeta    *chModel.FrequencyMetadata `gorm:"column:frequency_meta_v2;type:json"`
	NextDueDate      *time.Time                 `gorm:"column:next_due_date"`
	DeadlineMinutes  *int                       `gorm:"column:deadline_minutes"`
	CompletionWindow *int                       `gorm:"column:completion_window"`
	SavedAt          time.Time                  `gorm:"column:saved_at"`
}

func (momentsBackup) TableName() string { return momentsBackupTable }

func (m TasksToMoments20261106) Up(ctx context.Context, db *gorm.DB) error {
	log := logging.FromContext(ctx)
	if err := db.WithContext(ctx).AutoMigrate(&momentsBackup{}); err != nil {
		return err
	}
	var chores []*chModel.Chore
	if err := db.WithContext(ctx).Find(&chores).Error; err != nil {
		return err
	}
	zones := map[int]*time.Location{}
	location := func(familyID int) *time.Location {
		if loc, ok := zones[familyID]; ok {
			return loc
		}
		loc := time.Local
		var name string
		if db.WithContext(ctx).Table("families").Select("timezone").Where("id = ?", familyID).Scan(&name).Error == nil {
			if l, err := zone.Load(name); err == nil && l != nil {
				loc = l
			}
		}
		zones[familyID] = loc
		return loc
	}
	ids := map[string]string{}
	now := time.Now().UTC()
	moved := 0
	return db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, task := range chores {
			metadata, due, ok := chModel.ToMoments(task, location(task.FamilyID), now, func(clock string) string {
				key := chModel.SlotIDKey(task.FamilyID, task.Name, clock)
				if id, found := ids[key]; found {
					return id
				}
				id, err := chModel.NewSlotID()
				if err != nil {
					id = key
				}
				ids[key] = id
				return id
			})
			if !ok {
				continue
			}
			saved := momentsBackup{ID: task.ID, FrequencyMeta: task.FrequencyMetadataV2, NextDueDate: task.NextDueDate,
				DeadlineMinutes: task.DeadlineMinutes, CompletionWindow: task.CompletionWindow, SavedAt: now}
			if err := tx.Save(&saved).Error; err != nil {
				return err
			}
			var version int64
			if err := tx.Raw(`
				INSERT INTO sync_cursors (family_id, entity_type, max_version)
				VALUES (?, ?, 1)
				ON CONFLICT (family_id, entity_type) DO UPDATE SET max_version = sync_cursors.max_version + 1
				RETURNING max_version`, task.FamilyID, syncModel.EntityTypeChore).Scan(&version).Error; err != nil {
				return err
			}
			if err := tx.Model(&chModel.Chore{}).Where("id = ?", task.ID).Updates(map[string]interface{}{
				"frequency_meta_v2": metadata,
				"next_due_date":     due,
				"deadline_minutes":  nil,
				"completion_window": nil,
				"sync_version":      version,
			}).Error; err != nil {
				return err
			}
			moved++
		}
		log.Infow("Tasks put on moments", "count", moved)
		return nil
	})
}

// Down puts the tasks back as they were; the table is kept.
func (m TasksToMoments20261106) Down(ctx context.Context, db *gorm.DB) error {
	if !db.WithContext(ctx).Migrator().HasTable(momentsBackupTable) {
		return nil
	}
	var saved []momentsBackup
	if err := db.WithContext(ctx).Find(&saved).Error; err != nil {
		return err
	}
	return db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, s := range saved {
			var meta interface{}
			if s.FrequencyMeta != nil {
				meta = s.FrequencyMeta
			}
			if err := tx.Model(&chModel.Chore{}).Where("id = ?", s.ID).Updates(map[string]interface{}{
				"frequency_meta_v2": meta,
				"next_due_date":     s.NextDueDate,
				"deadline_minutes":  s.DeadlineMinutes,
				"completion_window": s.CompletionWindow,
			}).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func init() {
	Register(TasksToMoments20261106{})
}
