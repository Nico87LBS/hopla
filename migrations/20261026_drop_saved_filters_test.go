package migrations

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestDropSavedFilters(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "m.db")), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.Exec(`CREATE TABLE filters (id integer PRIMARY KEY, name text)`).Error)

	require.NoError(t, DropSavedFilters20261026{}.Up(context.Background(), db))
	require.False(t, db.Migrator().HasTable("filters"))
	// A database without saved filters goes through as well.
	require.NoError(t, DropSavedFilters20261026{}.Up(context.Background(), db))
}
