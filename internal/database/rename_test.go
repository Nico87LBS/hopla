package database

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

// A database made before the rename keeps its families, members, tasks and
// sessions under the names of today.
func TestRenameToFamilyKeepsTheRows(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "old.db")), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	// Today's schema, then put back under the old names, as 1.28.0 left it.
	if err := Migration(db); err != nil {
		t.Fatalf("Migration: %v", err)
	}
	tables, err := db.Migrator().GetTables()
	if err != nil {
		t.Fatal(err)
	}
	for _, table := range tables {
		if db.Migrator().HasColumn(table, "family_id") && table != "user_sessions" {
			if err := db.Exec(`ALTER TABLE ` + table + ` RENAME COLUMN family_id TO circle_id`).Error; err != nil {
				t.Fatal(err)
			}
		}
	}
	for _, stmt := range []string{
		`ALTER TABLE user_sessions RENAME COLUMN token_family TO family_id`,
		`ALTER TABLE families RENAME TO circles`,
		`ALTER TABLE user_families RENAME TO user_circles`,
		`DROP INDEX idx_user_family`,
		`CREATE UNIQUE INDEX idx_user_circle ON user_circles (user_id, circle_id)`,
		`DROP INDEX idx_chores_family_id`,
		`CREATE INDEX idx_chores_circle_id ON chores (circle_id)`,
		`INSERT INTO circles (id, name, invite_code) VALUES (7, 'Maison', 'abc')`,
		`INSERT INTO user_circles (user_id, circle_id, role) VALUES (1, 7, 'admin')`,
		`INSERT INTO chores (name, circle_id, created_by) VALUES ('Ranger', 7, 1)`,
		`INSERT INTO user_sessions (user_id, family_id, token_hash, expires_at, created_at) VALUES (1, 'token-family', 'h', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
	} {
		if err := db.Exec(stmt).Error; err != nil {
			t.Fatalf("%s: %v", stmt, err)
		}
	}

	if err := Migration(db); err != nil {
		t.Fatalf("Migration: %v", err)
	}
	// A second start finds nothing left to rename.
	if err := Migration(db); err != nil {
		t.Fatalf("second Migration: %v", err)
	}

	var name string
	db.Raw(`SELECT name FROM families WHERE id = 7`).Scan(&name)
	if name != "Maison" {
		t.Errorf("family name = %q, want Maison", name)
	}
	var familyID int
	db.Raw(`SELECT family_id FROM user_families WHERE user_id = 1`).Scan(&familyID)
	if familyID != 7 {
		t.Errorf("member family = %d, want 7", familyID)
	}
	db.Raw(`SELECT family_id FROM chores WHERE name = 'Ranger'`).Scan(&familyID)
	if familyID != 7 {
		t.Errorf("task family = %d, want 7", familyID)
	}
	var tokenFamily string
	db.Raw(`SELECT token_family FROM user_sessions WHERE user_id = 1`).Scan(&tokenFamily)
	if tokenFamily != "token-family" {
		t.Errorf("token family = %q, want token-family", tokenFamily)
	}
	for _, table := range []string{"circles", "user_circles"} {
		if db.Migrator().HasTable(table) {
			t.Errorf("table %s still there", table)
		}
	}
	var leftovers []string
	db.Raw(`SELECT name FROM sqlite_master WHERE name LIKE '%circle%' OR sql LIKE '%circle%'`).Scan(&leftovers)
	if len(leftovers) > 0 {
		t.Errorf("old names left: %s", strings.Join(leftovers, ", "))
	}
	// The member's uniqueness is back under its name of today.
	if err := db.Exec(`INSERT INTO user_families (user_id, family_id, role) VALUES (1, 7, 'member')`).Error; err == nil {
		t.Error("a member was added twice to the same family")
	}
}
