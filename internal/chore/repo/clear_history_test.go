package chore

import (
	"context"
	"testing"
	"time"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	syncModel "github.com/nico87lbs/hopla/internal/sync/model"
)

func TestClearHistoryForgetsTasksDone(t *testing.T) {
	repo, db := newTestChoreRepo(t)
	chore := createChore(t, db, "Chambre", testOwnerID, false)
	other := &chModel.Chore{Name: "Other family", FamilyID: 2, CreatedBy: testOwnerID}
	if err := db.Create(other).Error; err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	for _, h := range []chModel.ChoreHistory{
		{ChoreID: chore.ID, CompletedBy: testOwnerID, PerformedAt: &now, Status: chModel.ChoreHistoryStatusCompleted},
		{ChoreID: chore.ID, CompletedBy: testOtherID, PerformedAt: &now, Status: chModel.ChoreHistoryStatusCompleted},
		{ChoreID: other.ID, CompletedBy: testOtherID, PerformedAt: &now, Status: chModel.ChoreHistoryStatusCompleted},
	} {
		if err := db.Create(&h).Error; err != nil {
			t.Fatal(err)
		}
	}

	count := func(choreID int) (n int64) {
		db.Model(&chModel.ChoreHistory{}).Where("chore_id = ?", choreID).Count(&n)
		return n
	}
	deleted, err := repo.ClearHistory(context.Background(), testFamilyID, []int{testOtherID})
	if err != nil || deleted != 1 || count(chore.ID) != 1 {
		t.Fatalf("one member: deleted %d, left %d, err %v", deleted, count(chore.ID), err)
	}
	deleted, err = repo.ClearHistory(context.Background(), testFamilyID, nil)
	if err != nil || deleted != 1 || count(chore.ID) != 0 {
		t.Fatalf("everyone: deleted %d, left %d, err %v", deleted, count(chore.ID), err)
	}
	if count(other.ID) != 1 {
		t.Fatal("another family's history must stay")
	}
	var tombstones int64
	db.Model(&syncModel.Tombstone{}).Where("entity_type = ?", syncModel.EntityTypeChoreHistory).Count(&tombstones)
	if tombstones != 2 {
		t.Fatalf("want 2 tombstones, got %d", tombstones)
	}
	var chores int64
	db.Model(&chModel.Chore{}).Where("id = ?", chore.ID).Count(&chores)
	if chores != 1 {
		t.Fatal("the task itself stays")
	}
}

// A real reset: a task done goes back to do, with the due date it had before
// its first cleared completion, unless someone who keeps their history did it
// again afterwards.
func TestClearHistoryPutsTasksBackToDo(t *testing.T) {
	repo, db := newTestChoreRepo(t)
	once := createChore(t, db, "Ranger", testOwnerID, false)
	weekly := createChore(t, db, "Poubelles", testOwnerID, false)
	shared := createChore(t, db, "Vaisselle", testOwnerID, false)
	before := time.Date(2026, 10, 20, 18, 0, 0, 0, time.UTC)
	later := before.AddDate(0, 0, 14)
	db.Model(&chModel.Chore{}).Where("id = ?", once.ID).Updates(map[string]interface{}{"is_active": false, "next_due_date": nil})
	db.Model(&chModel.Chore{}).Where("id IN ?", []int{weekly.ID, shared.ID}).Update("next_due_date", later)
	now := time.Now()
	for _, h := range []chModel.ChoreHistory{
		{ChoreID: once.ID, CompletedBy: testOtherID, PerformedAt: &now, DueDate: &before, Status: chModel.ChoreHistoryStatusCompleted},
		{ChoreID: weekly.ID, CompletedBy: testOtherID, PerformedAt: &now, DueDate: &before, Status: chModel.ChoreHistoryStatusCompleted},
		{ChoreID: weekly.ID, CompletedBy: testOtherID, PerformedAt: &now, DueDate: &later, Status: chModel.ChoreHistoryStatusCompleted},
		{ChoreID: shared.ID, CompletedBy: testOtherID, PerformedAt: &now, DueDate: &before, Status: chModel.ChoreHistoryStatusCompleted},
		{ChoreID: shared.ID, CompletedBy: testOwnerID, PerformedAt: &now, DueDate: &later, Status: chModel.ChoreHistoryStatusCompleted},
	} {
		if err := db.Create(&h).Error; err != nil {
			t.Fatal(err)
		}
	}

	if _, err := repo.ClearHistory(context.Background(), testFamilyID, []int{testOtherID}); err != nil {
		t.Fatal(err)
	}
	load := func(id int) (c chModel.Chore) {
		db.First(&c, id)
		return c
	}
	if c := load(once.ID); !c.IsActive || c.NextDueDate == nil || !c.NextDueDate.Equal(before) {
		t.Errorf("one-time task: active %v, due %v, want active and due %v", c.IsActive, c.NextDueDate, before)
	}
	if c := load(weekly.ID); c.NextDueDate == nil || !c.NextDueDate.Equal(before) {
		t.Errorf("recurring task due %v, want %v", c.NextDueDate, before)
	}
	if c := load(shared.ID); c.NextDueDate == nil || !c.NextDueDate.Equal(later) {
		t.Errorf("task done again by someone else: due %v, want it unchanged at %v", c.NextDueDate, later)
	}
}
