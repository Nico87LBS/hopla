package chore

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"

	"github.com/nico87lbs/hopla/config"
	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	"github.com/nico87lbs/hopla/internal/database"
)

const (
	testFamilyID = 1
	testOwnerID  = 1
	testOtherID  = 2
)

func newTestChoreRepo(t *testing.T) (*ChoreRepository, *gorm.DB) {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "test_chores.db")
	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open sqlite: %v", err)
	}
	if err := database.Migration(db); err != nil {
		t.Fatalf("AutoMigrate failed: %v", err)
	}

	cfg := &config.Config{}
	cfg.Database.Type = "sqlite"
	return NewChoreRepository(db, cfg), db
}

// createChore inserts a chore with the given assignees.
func createChore(t *testing.T, db *gorm.DB, name string, createdBy int, isPrivate bool, assignees ...int) *chModel.Chore {
	t.Helper()

	chore := &chModel.Chore{
		Name:      name,
		FamilyID:  testFamilyID,
		CreatedBy: createdBy,
		IsPrivate: isPrivate,
		IsActive:  true,
	}
	if err := db.Create(chore).Error; err != nil {
		t.Fatalf("failed to create chore %q: %v", name, err)
	}
	for _, userID := range assignees {
		if err := db.Create(&chModel.ChoreAssignees{ChoreID: chore.ID, UserID: userID}).Error; err != nil {
			t.Fatalf("failed to assign chore %q to %d: %v", name, userID, err)
		}
	}
	return chore
}

func visibleChoreNames(t *testing.T, r *ChoreRepository, userID int) []string {
	t.Helper()

	chores, err := r.GetChores(context.Background(), testFamilyID, userID, false, nil, false)
	if err != nil {
		t.Fatalf("GetChores failed: %v", err)
	}
	names := make([]string, 0, len(chores))
	for _, chore := range chores {
		names = append(names, chore.Name)
	}
	return names
}

func contains(names []string, name string) bool {
	for _, n := range names {
		if n == name {
			return true
		}
	}
	return false
}

// A private chore is only visible to its creator and assignees.
func TestGetChoresKeepsChoreLevelPrivacy(t *testing.T) {
	r, db := newTestChoreRepo(t)

	createChore(t, db, "public", testOtherID, false)
	createChore(t, db, "private-assigned", testOtherID, true, testOwnerID)
	createChore(t, db, "private-theirs", testOtherID, true, testOtherID)

	names := visibleChoreNames(t, r, testOwnerID)
	for _, want := range []string{"public", "private-assigned"} {
		if !contains(names, want) {
			t.Errorf("got %v, want it to contain %q", names, want)
		}
	}
	if contains(names, "private-theirs") {
		t.Errorf("got %v, want it to hide a private chore of another user", names)
	}
}

func assertAssignees(t *testing.T, db *gorm.DB, choreID int, want []int) {
	t.Helper()

	var assignees []chModel.ChoreAssignees
	if err := db.Where("chore_id = ?", choreID).Order("user_id asc").Find(&assignees).Error; err != nil {
		t.Fatalf("failed to load assignees: %v", err)
	}
	got := make([]int, 0, len(assignees))
	for _, assignee := range assignees {
		got = append(got, assignee.UserID)
	}
	if len(got) != len(want) {
		t.Fatalf("assignees of chore %d = %v, want %v", choreID, got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("assignees of chore %d = %v, want %v", choreID, got, want)
		}
	}
}

// The chore view decides whether the delegate target still has to be added to the
// assignee pool from the details response, so it must carry the assignees (#848).
func TestGetChoreDetailByIDIncludesAssignees(t *testing.T) {
	r, db := newTestChoreRepo(t)
	chore := createChore(t, db, "shared", testOwnerID, false, testOwnerID, testOtherID)

	detail, err := r.GetChoreDetailByID(context.Background(), chore.ID, testFamilyID, testOwnerID)
	if err != nil {
		t.Fatalf("GetChoreDetailByID failed: %v", err)
	}
	got := map[int]bool{}
	for _, a := range detail.Assignees {
		got[a.UserID] = true
	}
	if len(detail.Assignees) != 2 || !got[testOwnerID] || !got[testOtherID] {
		t.Errorf("assignees = %+v, want users %d and %d", detail.Assignees, testOwnerID, testOtherID)
	}
}
