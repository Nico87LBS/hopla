package migrations

import (
	"context"

	"github.com/nico87lbs/hopla/logging"
	"gorm.io/gorm"
)

// DropSavedFilters20261026 removes the saved task filters: the task list
// still filters by label, person or due date, but no longer keeps filters.
type DropSavedFilters20261026 struct{}

func (m DropSavedFilters20261026) ID() string {
	return "20261026_drop_saved_filters"
}

func (m DropSavedFilters20261026) Description() string {
	return `Drop the table filters, unused since saved filters were removed.`
}

func (m DropSavedFilters20261026) Down(ctx context.Context, db *gorm.DB) error {
	// No-op: saved filters are gone from the code.
	return nil
}

func (m DropSavedFilters20261026) Up(ctx context.Context, db *gorm.DB) error {
	migrator := db.WithContext(ctx).Migrator()
	if !migrator.HasTable("filters") {
		return nil
	}
	logging.FromContext(ctx).Info("Dropping table filters")
	return migrator.DropTable("filters")
}

func init() {
	Register(DropSavedFilters20261026{})
}
