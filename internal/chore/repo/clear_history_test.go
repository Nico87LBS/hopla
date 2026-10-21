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
	chore := createChore(t, db, "Chambre", testOwnerID, false, nil)
	other := &chModel.Chore{Name: "Other circle", CircleID: 2, CreatedBy: testOwnerID}
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
	deleted, err := repo.ClearHistory(context.Background(), testCircleID, []int{testOtherID})
	if err != nil || deleted != 1 || count(chore.ID) != 1 {
		t.Fatalf("one member: deleted %d, left %d, err %v", deleted, count(chore.ID), err)
	}
	deleted, err = repo.ClearHistory(context.Background(), testCircleID, nil)
	if err != nil || deleted != 1 || count(chore.ID) != 0 {
		t.Fatalf("everyone: deleted %d, left %d, err %v", deleted, count(chore.ID), err)
	}
	if count(other.ID) != 1 {
		t.Fatal("another circle's history must stay")
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
