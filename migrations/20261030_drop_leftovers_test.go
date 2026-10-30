package migrations

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestDropLeftovers(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "m.db")), &gorm.Config{})
	require.NoError(t, err)
	for _, stmt := range []string{
		`CREATE TABLE users (id integer PRIMARY KEY, username text, chat_id integer)`,
		`CREATE TABLE families (id integer PRIMARY KEY, name text, status text, expired_at datetime)`,
		`CREATE TABLE chores (id integer PRIMARY KEY, description text)`,
		`INSERT INTO users (id, username, chat_id) VALUES (1, 'nico', 0)`,
		`INSERT INTO families (id, name) VALUES (1, 'Maison')`,
		`INSERT INTO chores (id, description) VALUES (1, '<p>Voir <img src="x" dt-data-path="files/1.png"></p>')`,
	} {
		require.NoError(t, db.Exec(stmt).Error)
	}

	require.NoError(t, DropLeftovers20261030{}.Up(context.Background(), db))
	migrator := db.Migrator()
	require.False(t, migrator.HasColumn("users", "chat_id"))
	require.False(t, migrator.HasColumn("families", "status"))
	require.False(t, migrator.HasColumn("families", "expired_at"))
	var description string
	require.NoError(t, db.Raw(`SELECT description FROM chores WHERE id = 1`).Scan(&description).Error)
	require.Equal(t, `<p>Voir <img src="x" data-hopla-path="files/1.png"></p>`, description)

	// A database without the old columns, or without the tables, goes through.
	require.NoError(t, DropLeftovers20261030{}.Up(context.Background(), db))
}
