package chore

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	cModel "github.com/nico87lbs/hopla/internal/circle/model"
	"github.com/nico87lbs/hopla/internal/games"
)

func TestComingBackMakesTheTasksDueToday(t *testing.T) {
	repo, db := newTestChoreRepo(t)
	ctx := context.Background()
	for _, id := range []int{testOwnerID, testOtherID, 3} {
		require.NoError(t, db.Create(&cModel.UserCircle{UserID: id, CircleID: testCircleID, IsActive: true}).Error)
	}
	local := time.Now()
	weekAgo := time.Date(local.Year(), local.Month(), local.Day(), 8, 30, 0, 0, time.Local).AddDate(0, 0, -7)
	nextWeek := weekAgo.AddDate(0, 0, 14)
	task := func(name string, due time.Time, assignedTo int, strategy chModel.AssignmentStrategy, assignees ...int) *chModel.Chore {
		chore := &chModel.Chore{Name: name, CircleID: testCircleID, IsActive: true, FrequencyType: "daily",
			NextDueDate: &due, AssignedTo: &assignedTo, AssignStrategy: strategy}
		for _, id := range assignees {
			chore.Assignees = append(chore.Assignees, chModel.ChoreAssignees{UserID: id})
		}
		require.NoError(t, db.Create(chore).Error)
		return chore
	}
	elenas := task("Faire son lit", weekAgo, testOtherID, chModel.AssignmentStrategyRoundRobin, testOtherID)
	later := task("Arroser", nextWeek, testOtherID, chModel.AssignmentStrategyRoundRobin, testOtherID)
	annas := task("Faire son lit", weekAgo, 3, chModel.AssignmentStrategyRoundRobin, 3)
	together := task("Ranger le salon", weekAgo, 0, chModel.AssignmentStrategyTogether, testOtherID, 3)
	mine := task("Vaisselle", weekAgo, testOwnerID, chModel.AssignmentStrategyRoundRobin, testOwnerID)

	changed, err := repo.SetMemberAway(ctx, testCircleID, testOtherID, true, time.Now())
	require.NoError(t, err)
	require.True(t, changed)
	changed, err = repo.SetMemberAway(ctx, testCircleID, testOtherID, true, time.Now())
	require.NoError(t, err)
	require.False(t, changed, "already away")
	away, err := games.AwayMembers(db, testCircleID)
	require.NoError(t, err)
	require.Equal(t, map[int]bool{testOtherID: true}, away)

	_, err = repo.SetMemberAway(ctx, testCircleID, testOtherID, false, time.Now())
	require.NoError(t, err)
	dueOf := func(chore *chModel.Chore) time.Time {
		var saved chModel.Chore
		require.NoError(t, db.First(&saved, chore.ID).Error)
		return saved.NextDueDate.In(time.Local)
	}
	today := time.Date(local.Year(), local.Month(), local.Day(), 8, 30, 0, 0, time.Local)
	require.True(t, today.Equal(dueOf(elenas)), "due today at the same time, not a week late")
	require.True(t, nextWeek.Equal(dueOf(later)), "a task not due yet keeps its date")
	require.True(t, weekAgo.Equal(dueOf(annas)), "the other child was here: her task stays late")
	require.True(t, weekAgo.Equal(dueOf(together)), "the other child could do it")
	require.True(t, weekAgo.Equal(dueOf(mine)))

	var absences []games.Absence
	require.NoError(t, db.Find(&absences).Error)
	require.Len(t, absences, 1)
	require.NotNil(t, absences[0].EndAt)
}
