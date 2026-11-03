package backup

import (
	"bytes"
	"context"
	"io"
	"path/filepath"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"

	"github.com/nico87lbs/hopla/config"
	"github.com/nico87lbs/hopla/internal/database"
	"github.com/nico87lbs/hopla/internal/storage"
)

func setup(t *testing.T) (*Service, *gorm.DB, *storage.LocalStorage) {
	t.Helper()
	dir := t.TempDir()
	db, err := gorm.Open(sqlite.Open(filepath.Join(dir, "hopla.db")), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := database.Migration(db); err != nil {
		t.Fatal(err)
	}
	st := &storage.LocalStorage{BasePath: filepath.Join(dir, "files")}
	return NewService(db, st, &config.Config{}), db, st
}

func exec(t *testing.T, db *gorm.DB, sql string, args ...any) {
	t.Helper()
	if err := db.Exec(sql, args...).Error; err != nil {
		t.Fatalf("%s: %v", sql, err)
	}
}

func count(t *testing.T, db *gorm.DB, table, where string, args ...any) int64 {
	t.Helper()
	var n int64
	if err := db.Table(table).Where(where, args...).Count(&n).Error; err != nil {
		t.Fatal(err)
	}
	return n
}

// seed makes family 1 (a parent, a child, a task done twice, a reward, a
// photo) and family 2 (one parent, one task) on the same server.
func seed(t *testing.T, db *gorm.DB, st *storage.LocalStorage) time.Time {
	t.Helper()
	due := time.Date(2026, 11, 3, 7, 30, 0, 0, time.UTC)
	exec(t, db, `INSERT INTO families (id, name, created_by, invite_code, timezone) VALUES (1, 'Les Lapins', 1, 'abc', 'Europe/Paris'), (2, 'Voisins', 3, 'xyz', '')`)
	exec(t, db, `INSERT INTO users (id, display_name, username, password, family_id, image) VALUES (1, 'Nico', 'nico', 'hash1', 1, 'photos/nico.png'), (2, 'Anna', 'anna', 'hash2', 1, ''), (3, 'Voisin', 'voisin', 'hash3', 2, '')`)
	exec(t, db, `INSERT INTO user_families (id, user_id, family_id, role, is_active, points) VALUES (1, 1, 1, 'admin', true, 0), (2, 2, 1, 'member', true, 42), (3, 3, 2, 'admin', true, 7)`)
	exec(t, db, `INSERT INTO chores (id, name, frequency_type, family_id, created_by, next_due_date, is_active) VALUES (10, 'Ranger la chambre', 'daily', 1, 1, ?, true), (20, 'Sortir le chien', 'daily', 2, 3, ?, true)`, due, due)
	exec(t, db, `INSERT INTO chore_assignees (id, chore_id, user_id) VALUES (1, 10, 2)`)
	exec(t, db, `INSERT INTO chore_histories (id, chore_id, performed_at, completed_by, points, status) VALUES (1, 10, ?, 2, 5, 1), (2, 10, ?, 2, 5, 1)`, due.Add(-24*time.Hour), due.Add(-48*time.Hour))
	exec(t, db, `INSERT INTO rewards (id, family_id, name, points_cost, is_active) VALUES (1, 1, 'Glace', 30, true)`)
	exec(t, db, `INSERT INTO user_sessions (id, user_id, token_hash, token_family, created_at, expires_at) VALUES (1, 1, 'h', 'f', ?, ?)`, due, due)
	if err := st.Save(context.Background(), "photos/nico.png", bytes.NewBufferString("PNG")); err != nil {
		t.Fatal(err)
	}
	return due
}

func TestEveryTableIsListed(t *testing.T) {
	_, db, _ := setup(t)
	tables, err := db.Migrator().GetTables()
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range tables {
		if !known(name) {
			t.Errorf("la table %s n'est ni sauvegardée ni écartée : ajoutez-la dans backup/tables.go", name)
		}
	}
}

func TestBackupAndRestore(t *testing.T) {
	s, db, st := setup(t)
	due := seed(t, db, st)
	ctx := context.Background()

	var buf bytes.Buffer
	saved, err := s.Write(ctx, 1, &buf)
	if err != nil {
		t.Fatal(err)
	}
	if got := len(saved.Tables["users"]); got != 2 {
		t.Fatalf("users = %d, want 2 (the neighbour stays out)", got)
	}
	if len(saved.Files) != 1 {
		t.Fatalf("files = %v", saved.Files)
	}

	// Things go wrong in the family after the backup.
	exec(t, db, `DELETE FROM chore_histories WHERE chore_id = 10`)
	exec(t, db, `UPDATE user_families SET points = 0 WHERE user_id = 2`)
	exec(t, db, `INSERT INTO chores (id, name, frequency_type, family_id, created_by, is_active) VALUES (11, 'Tâche en trop', 'daily', 1, 1, true)`)
	_ = st.Delete(ctx, []string{"photos/nico.png"})

	data, z, err := Read(bytes.NewReader(buf.Bytes()), int64(buf.Len()))
	if err != nil {
		t.Fatal(err)
	}
	id, err := s.Restore(ctx, 1, data, z)
	if err != nil {
		t.Fatal(err)
	}
	if id != 1 {
		t.Fatalf("family = %d", id)
	}
	if n := count(t, db, "chore_histories", "chore_id = 10"); n != 2 {
		t.Errorf("history = %d, want 2", n)
	}
	if n := count(t, db, "chores", "id = 11"); n != 0 {
		t.Errorf("the task made after the backup is still there")
	}
	if n := count(t, db, "user_sessions", "user_id = 1"); n != 0 {
		t.Errorf("sessions kept: everyone should sign in again")
	}
	var points int
	db.Table("user_families").Where("user_id = 2").Select("points").Scan(&points)
	if points != 42 {
		t.Errorf("points = %d, want 42", points)
	}
	var password string
	db.Table("users").Where("id = 1").Select("password").Scan(&password)
	if password != "hash1" {
		t.Errorf("password = %q", password)
	}
	var next time.Time
	db.Table("chores").Where("id = 10").Select("next_due_date").Scan(&next)
	if !next.Equal(due) {
		t.Errorf("due = %v, want %v", next, due)
	}
	// The other family is untouched.
	if n := count(t, db, "chores", "family_id = 2"); n != 1 {
		t.Errorf("neighbour's tasks = %d", n)
	}
	if n := count(t, db, "users", "id = 3"); n != 1 {
		t.Errorf("neighbour's account is gone")
	}
	f, err := st.Get(ctx, "photos/nico.png")
	if err != nil {
		t.Fatalf("photo not restored: %v", err)
	}
	b, _ := io.ReadAll(f)
	f.Close()
	if string(b) != "PNG" {
		t.Errorf("photo = %q", b)
	}
}

func TestRestoreOnANewServer(t *testing.T) {
	s, db, st := setup(t)
	seed(t, db, st)
	ctx := context.Background()
	var buf bytes.Buffer
	if _, err := s.Write(ctx, 1, &buf); err != nil {
		t.Fatal(err)
	}

	// A new server: one fresh account made to sign in, in family 1.
	s2, db2, _ := setup(t)
	exec(t, db2, `INSERT INTO families (id, name, created_by, invite_code) VALUES (1, 'Nouvelle', 1, 'new')`)
	exec(t, db2, `INSERT INTO users (id, display_name, username, password, family_id) VALUES (1, 'Nico', 'nico2', 'tmp', 1)`)
	exec(t, db2, `INSERT INTO user_families (id, user_id, family_id, role, is_active) VALUES (1, 1, 1, 'admin', true)`)
	data, z, err := Read(bytes.NewReader(buf.Bytes()), int64(buf.Len()))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s2.Restore(ctx, 1, data, z); err != nil {
		t.Fatal(err)
	}
	var name string
	db2.Table("families").Where("id = 1").Select("name").Scan(&name)
	if name != "Les Lapins" {
		t.Errorf("family = %q", name)
	}
	var username string
	db2.Table("users").Where("id = 1").Select("username").Scan(&username)
	if username != "nico" {
		t.Errorf("username = %q: the old account should be back", username)
	}
}

func TestRestoreRefusesRowsOfAnotherFamily(t *testing.T) {
	s, db, st := setup(t)
	seed(t, db, st)
	ctx := context.Background()
	var buf bytes.Buffer
	if _, err := s.Write(ctx, 2, &buf); err != nil {
		t.Fatal(err)
	}
	data, z, err := Read(bytes.NewReader(buf.Bytes()), int64(buf.Len()))
	if err != nil {
		t.Fatal(err)
	}
	// Restoring the neighbours over family 1 would land on their own rows.
	if _, err := s.Restore(ctx, 1, data, z); err == nil {
		t.Fatal("restore over rows of another family should fail")
	}
	if n := count(t, db, "chores", "family_id = 1"); n != 1 {
		t.Errorf("family 1 changed although the restore failed")
	}
}

func TestReadRefusesOtherFiles(t *testing.T) {
	if _, _, err := Read(bytes.NewReader([]byte("pas un zip")), 10); err != ErrNotBackup {
		t.Fatalf("err = %v", err)
	}
}

func TestNightlyKeepsTheLastOnes(t *testing.T) {
	s, db, st := setup(t)
	seed(t, db, st)
	s.cfg.Backup.Dir = t.TempDir()
	s.cfg.Backup.Keep = 2
	ctx := context.Background()
	// 01:00 UTC is 02:00 in Paris: too early for family 1.
	early := time.Date(2026, 11, 3, 1, 0, 0, 0, time.UTC)
	if err := s.Nightly(ctx, early); err != nil {
		t.Fatal(err)
	}
	if list, _ := s.List(1); len(list) != 0 {
		t.Fatalf("backup before 03:00: %v", list)
	}
	for day := 3; day <= 6; day++ {
		at := time.Date(2026, 11, day, 4, 0, 0, 0, time.UTC)
		if err := s.Nightly(ctx, at); err != nil {
			t.Fatal(err)
		}
		if err := s.Nightly(ctx, at.Add(time.Hour)); err != nil {
			t.Fatal(err)
		}
	}
	list, _ := s.List(1)
	if len(list) != 2 || list[0].Day != "2026-11-06" || list[1].Day != "2026-11-05" {
		t.Fatalf("kept = %+v", list)
	}
	if s.Path(1, list[0].Name) == "" || s.Path(2, list[0].Name) != "" || s.Path(1, "../hopla.db") != "" {
		t.Fatal("Path must only give a family its own backups")
	}
}
