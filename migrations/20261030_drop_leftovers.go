package migrations

import (
	"context"

	"github.com/nico87lbs/hopla/logging"
	"gorm.io/gorm"
)

// DropLeftovers20261030 removes what older databases kept from features
// Hopla never had: the chat id of the users and the subscription columns of
// the families. It also gives the images of the descriptions and notes the
// attribute they use today, data-hopla-path.
type DropLeftovers20261030 struct{}

func (m DropLeftovers20261030) ID() string {
	return "20261030_drop_leftovers"
}

func (m DropLeftovers20261030) Description() string {
	return `Drop users.chat_id, families.status and families.expired_at, and rename the image attribute of descriptions and notes to data-hopla-path.`
}

func (m DropLeftovers20261030) Down(ctx context.Context, db *gorm.DB) error {
	// No-op: nothing reads the dropped columns any more.
	return nil
}

func (m DropLeftovers20261030) Up(ctx context.Context, db *gorm.DB) error {
	log := logging.FromContext(ctx)
	db = db.WithContext(ctx)
	migrator := db.Migrator()
	for _, column := range []struct{ table, name string }{
		{"users", "chat_id"},
		{"families", "status"},
		{"families", "expired_at"},
	} {
		if !migrator.HasTable(column.table) || !migrator.HasColumn(column.table, column.name) {
			continue
		}
		log.Infof("Dropping column %s.%s", column.table, column.name)
		// Plain SQL: the SQLite migrator needs a model to drop a column.
		if err := db.Exec(`ALTER TABLE ` + column.table + ` DROP COLUMN ` + column.name).Error; err != nil {
			return err
		}
	}
	for _, column := range []struct{ table, name string }{
		{"chores", "description"},
		{"chore_histories", "notes"},
		{"rewards", "description"},
	} {
		if !migrator.HasTable(column.table) || !migrator.HasColumn(column.table, column.name) {
			continue
		}
		if err := db.Exec(`UPDATE `+column.table+` SET `+column.name+` = REPLACE(`+column.name+`, ?, ?) WHERE `+column.name+` LIKE ?`,
			"dt-data-path=", "data-hopla-path=", "%dt-data-path=%").Error; err != nil {
			return err
		}
	}
	return nil
}

func init() {
	Register(DropLeftovers20261030{})
}
