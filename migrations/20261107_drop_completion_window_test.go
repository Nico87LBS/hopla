package migrations

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestDropCompletionWindow(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "m.db")), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.Exec(`CREATE TABLE chores (id integer PRIMARY KEY, name text, completion_window integer)`).Error)
	require.NoError(t, db.Exec(`INSERT INTO chores (id, name, completion_window) VALUES (1, 'Brosser', 2)`).Error)

	require.NoError(t, DropCompletionWindow20261107{}.Up(context.Background(), db))
	require.False(t, db.Migrator().HasColumn("chores", "completion_window"))
	var name string
	require.NoError(t, db.Raw(`SELECT name FROM chores WHERE id = 1`).Scan(&name).Error)
	require.Equal(t, "Brosser", name)

	// A database without the column goes through.
	require.NoError(t, DropCompletionWindow20261107{}.Up(context.Background(), db))
}
