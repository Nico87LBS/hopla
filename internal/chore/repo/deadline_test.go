package chore

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	fModel "github.com/nico87lbs/hopla/internal/family/model"
)

// A task whose deadline is over is written missed, once per person sharing
// it, and moves on; a task done once is archived; a task waiting for a
// parent or done meanwhile is left alone.
func TestMissChore(t *testing.T) {
	repo, db := newTestChoreRepo(t)
	ctx := context.Background()
	for _, id := range []int{testOwnerID, testOtherID, 3} {
		require.NoError(t, db.Create(&fModel.UserFamily{UserID: id, FamilyID: testFamilyID, IsActive: true}).Error)
	}
	now := time.Now().UTC().Truncate(time.Second)
	hour := 60
	task := func(name string, frequency chModel.FrequencyType, due time.Time, strategy chModel.AssignmentStrategy, assignedTo *int, assignees ...int) *chModel.Chore {
		chore := &chModel.Chore{Name: name, FamilyID: testFamilyID, IsActive: true, FrequencyType: frequency,
			NextDueDate: &due, AssignedTo: assignedTo, AssignStrategy: strategy, DeadlineMinutes: &hour}
		for _, id := range assignees {
			chore.Assignees = append(chore.Assignees, chModel.ChoreAssignees{UserID: id})
		}
		require.NoError(t, db.Create(chore).Error)
		return chore
	}
	elena := testOtherID
	gone := now.Add(-2 * time.Hour)
	late := task("Faire son lit", "daily", gone, chModel.AssignmentStrategyRoundRobin, &elena, elena)
	together := task("Ranger le salon", "daily", gone, chModel.AssignmentStrategyTogether, nil, elena, 3)
	once := task("Rendre le livre", "once", gone, chModel.AssignmentStrategyRoundRobin, &elena, elena)
	stillLate := task("Arroser", "daily", now.Add(-30*time.Minute), chModel.AssignmentStrategyRoundRobin, &elena, elena)
	waiting := task("Vaisselle", "daily", gone, chModel.AssignmentStrategyRoundRobin, &elena, elena)
	require.NoError(t, db.Model(waiting).Update("status", chModel.ChoreStatusPendingApproval).Error)

	found, err := repo.ChoresPastDeadline(ctx, now)
	require.NoError(t, err)
	ids := []int{}
	for _, chore := range found {
		ids = append(ids, chore.ID)
	}
	require.ElementsMatch(t, []int{late.ID, together.ID, once.ID}, ids, "not before the deadline, not waiting for a parent")

	next := gone.Add(24 * time.Hour)
	for _, chore := range found {
		var to *time.Time
		if chore.FrequencyType != "once" {
			to = &next
		}
		_, done, err := repo.MissChore(ctx, chore, []time.Time{*chore.NextDueDate}, to)
		require.NoError(t, err)
		require.True(t, done)
	}

	missed := func(chore *chModel.Chore) []int {
		var entries []chModel.ChoreHistory
		require.NoError(t, db.Where("chore_id = ? AND status = ?", chore.ID, chModel.ChoreHistoryStatusMissed).Find(&entries).Error)
		who := []int{}
		for _, entry := range entries {
			require.True(t, entry.PerformedAt.Equal(gone.Add(time.Hour)), "missed at the deadline")
			who = append(who, entry.CompletedBy)
		}
		return who
	}
	require.Equal(t, []int{elena}, missed(late))
	require.ElementsMatch(t, []int{elena, 3}, missed(together), "everyone sharing it missed it")
	require.Equal(t, []int{elena}, missed(once))
	require.Empty(t, missed(stillLate))

	saved := func(chore *chModel.Chore) chModel.Chore {
		var s chModel.Chore
		require.NoError(t, db.First(&s, chore.ID).Error)
		return s
	}
	require.True(t, saved(late).NextDueDate.Equal(next))
	require.True(t, saved(late).IsActive)
	require.False(t, saved(once).IsActive, "a task done once leaves the list")

	// Done meanwhile: nothing is written.
	_, done, err := repo.MissChore(ctx, late, []time.Time{gone}, &next)
	require.NoError(t, err)
	require.False(t, done)
	require.Equal(t, []int{elena}, missed(late))
}
