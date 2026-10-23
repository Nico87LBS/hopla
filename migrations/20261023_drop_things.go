package migrations

import (
	"context"

	"github.com/nico87lbs/hopla/logging"
	"gorm.io/gorm"
)

// DropThings20261023 removes what is left of the objects (Things) in older
// databases: their tables, and the column of the actions that changed an
// object when a task was done.
type DropThings20261023 struct{}

func (m DropThings20261023) ID() string {
	return "20261023_drop_things"
}

func (m DropThings20261023) Description() string {
	return `Drop the tables things, thing_chores and thing_histories and the column chores.completion_actions, unused since objects were removed.`
}

func (m DropThings20261023) Down(ctx context.Context, db *gorm.DB) error {
	// No-op: objects are gone from the code, there is nothing to restore them for.
	return nil
}

func (m DropThings20261023) Up(ctx context.Context, db *gorm.DB) error {
	log := logging.FromContext(ctx)
	migrator := db.WithContext(ctx).Migrator()
	// Links and history first, then the objects they point to.
	for _, table := range []string{"thing_histories", "thing_chores", "things"} {
		if !migrator.HasTable(table) {
			continue
		}
		log.Infof("Dropping table %s", table)
		if err := migrator.DropTable(table); err != nil {
			return err
		}
	}
	if migrator.HasTable("chores") && migrator.HasColumn("chores", "completion_actions") {
		log.Info("Dropping column chores.completion_actions")
		// Plain SQL: the SQLite migrator needs a model to drop a column.
		if err := db.WithContext(ctx).Exec(`ALTER TABLE chores DROP COLUMN completion_actions`).Error; err != nil {
			return err
		}
	}
	return nil
}

func init() {
	Register(DropThings20261023{})
}
