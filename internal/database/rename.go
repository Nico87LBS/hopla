package database

import (
	"fmt"
	"strings"

	"gorm.io/gorm"
)

// The names the database used before a family was called a family.
const (
	oldWord   = "circle"
	oldTable  = "circles"
	oldColumn = "circle_id"
)

// renameToFamily renames, in a database made before Hopla 1.29.0, the tables
// and columns of the family to their names of today, keeping every row:
// the table of the families and their members, the column of the family in
// every table, and the column of the token family in user_sessions (its old
// name is the family's column of today). It runs before AutoMigrate, which
// would otherwise add the new names empty beside the old ones, and does
// nothing on a database already renamed or new.
func renameToFamily(db *gorm.DB) error {
	migrator := db.Migrator()
	renameColumn := func(table, from, to string) error {
		if !migrator.HasTable(table) || !migrator.HasColumn(table, from) || migrator.HasColumn(table, to) {
			return nil
		}
		return db.Exec(fmt.Sprintf(`ALTER TABLE %s RENAME COLUMN %s TO %s`, table, from, to)).Error
	}
	// First, so the family's column of today is free in user_sessions.
	if err := renameColumn("user_sessions", "family_id", "token_family"); err != nil {
		return err
	}
	for from, to := range map[string]string{oldTable: "families", "user_" + oldTable: "user_families"} {
		if migrator.HasTable(from) && !migrator.HasTable(to) {
			if err := db.Exec(fmt.Sprintf(`ALTER TABLE %s RENAME TO %s`, from, to)).Error; err != nil {
				return err
			}
		}
	}
	tables, err := migrator.GetTables()
	if err != nil {
		return err
	}
	for _, table := range tables {
		if err := renameColumn(table, oldColumn, "family_id"); err != nil {
			return err
		}
	}
	return dropOldIndexes(db)
}

// dropOldIndexes drops the indexes still named after the old words, on the
// renamed columns; AutoMigrate builds them again under their names of today.
func dropOldIndexes(db *gorm.DB) error {
	var names []string
	switch db.Dialector.Name() {
	case "sqlite":
		if err := db.Raw(`SELECT name FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL`).Scan(&names).Error; err != nil {
			return err
		}
	case "postgres":
		if err := db.Raw(`SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()`).Scan(&names).Error; err != nil {
			return err
		}
	default:
		return nil
	}
	for _, name := range names {
		if !strings.Contains(name, oldWord) && name != "idx_user_sessions_family_id" {
			continue
		}
		// A table's primary key is kept: Postgres names it after the old
		// table, which does no harm.
		if strings.HasSuffix(name, "_pkey") {
			continue
		}
		if err := db.Exec(fmt.Sprintf(`DROP INDEX IF EXISTS %q`, name)).Error; err != nil {
			return err
		}
	}
	return nil
}
