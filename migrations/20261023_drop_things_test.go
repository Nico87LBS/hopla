package migrations

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestDropThings(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "m.db")), &gorm.Config{})
	require.NoError(t, err)
	for _, stmt := range []string{
		`CREATE TABLE chores (id integer PRIMARY KEY, name text, completion_actions json)`,
		`CREATE TABLE things (id integer PRIMARY KEY, name text)`,
		`CREATE TABLE thing_chores (thing_id integer, chore_id integer)`,
		`CREATE TABLE thing_histories (id integer PRIMARY KEY, thing_id integer)`,
		`INSERT INTO chores (id, name, completion_actions) VALUES (1, 'Dents', '[]')`,
	} {
		require.NoError(t, db.Exec(stmt).Error)
	}

	require.NoError(t, DropThings20261023{}.Up(context.Background(), db))
	migrator := db.Migrator()
	for _, table := range []string{"things", "thing_chores", "thing_histories"} {
		require.False(t, migrator.HasTable(table), table)
	}
	require.False(t, migrator.HasColumn("chores", "completion_actions"))
	var name string
	require.NoError(t, db.Raw(`SELECT name FROM chores WHERE id = 1`).Scan(&name).Error)
	require.Equal(t, "Dents", name, "tasks stay")

	// A database that never had objects goes through as well.
	require.NoError(t, DropThings20261023{}.Up(context.Background(), db))
}
