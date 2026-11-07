package migrations

import (
	"context"

	"github.com/nico87lbs/hopla/logging"
	"gorm.io/gorm"
)

// DropCompletionWindow20261107 removes the old window "faisable en avance"
// of a task: a moment's "s'ouvre" does that now.
type DropCompletionWindow20261107 struct{}

func (m DropCompletionWindow20261107) ID() string {
	return "20261107_drop_completion_window"
}

func (m DropCompletionWindow20261107) Description() string {
	return `Drop the column chores.completion_window, replaced by the opening of a moment.`
}

func (m DropCompletionWindow20261107) Down(ctx context.Context, db *gorm.DB) error {
	// No-op: the windows are gone.
	return nil
}

func (m DropCompletionWindow20261107) Up(ctx context.Context, db *gorm.DB) error {
	db = db.WithContext(ctx)
	if !db.Migrator().HasTable("chores") || !db.Migrator().HasColumn("chores", "completion_window") {
		return nil
	}
	logging.FromContext(ctx).Info("Dropping column chores.completion_window")
	// Plain SQL: the SQLite migrator needs a model to drop a column.
	return db.Exec(`ALTER TABLE chores DROP COLUMN completion_window`).Error
}

func init() {
	Register(DropCompletionWindow20261107{})
}
