package chore

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	fModel "github.com/nico87lbs/hopla/internal/family/model"
	"github.com/nico87lbs/hopla/internal/games"
)

func TestComingBackMakesTheTasksDueToday(t *testing.T) {
	repo, db := newTestChoreRepo(t)
	ctx := context.Background()
	for _, id := range []int{testOwnerID, testOtherID, 3} {
		require.NoError(t, db.Create(&fModel.UserFamily{UserID: id, FamilyID: testFamilyID, IsActive: true}).Error)
	}
	local := time.Now()
	weekAgo := time.Date(local.Year(), local.Month(), local.Day(), 8, 30, 0, 0, time.Local).AddDate(0, 0, -7)
	nextWeek := weekAgo.AddDate(0, 0, 14)
	task := func(name string, due time.Time, assignedTo int, strategy chModel.AssignmentStrategy, assignees ...int) *chModel.Chore {
		chore := &chModel.Chore{Name: name, FamilyID: testFamilyID, IsActive: true, FrequencyType: "daily",
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

	lateBefore := task("Brosser le chien", weekAgo.AddDate(0, 0, -1), testOtherID, chModel.AssignmentStrategyRoundRobin, testOtherID)

	changed, err := repo.SetMemberAway(ctx, testFamilyID, testOtherID, true, weekAgo.Add(-time.Hour))
	require.NoError(t, err)
	require.True(t, changed)
	changed, err = repo.SetMemberAway(ctx, testFamilyID, testOtherID, true, weekAgo)
	require.NoError(t, err)
	require.False(t, changed, "already away")
	away, err := games.AwayMembers(db, testFamilyID)
	require.NoError(t, err)
	require.Equal(t, map[int]bool{testOtherID: true}, away)

	_, err = repo.SetMemberAway(ctx, testFamilyID, testOtherID, false, time.Now())
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
	require.True(t, weekAgo.AddDate(0, 0, -1).Equal(dueOf(lateBefore)), "already late when she left: stays late")

	var absences []games.Absence
	require.NoError(t, db.Find(&absences).Error)
	require.Len(t, absences, 1)
	require.NotNil(t, absences[0].EndAt)
}

func TestAMistakenAbsenceLeavesNoTrace(t *testing.T) {
	repo, db := newTestChoreRepo(t)
	ctx := context.Background()
	for _, id := range []int{testOwnerID, testOtherID, 3} {
		require.NoError(t, db.Create(&fModel.UserFamily{UserID: id, FamilyID: testFamilyID, IsActive: true}).Error)
	}
	require.NoError(t, db.Create(&games.Rules{FamilyID: testFamilyID, SurpriseEnabled: true, SurpriseBonus: 5}).Error)
	now := time.Now()
	local := now.In(time.Local)
	yesterday := time.Date(local.Year(), local.Month(), local.Day(), 8, 30, 0, 0, time.Local).AddDate(0, 0, -1)
	points := 3
	task := func(name string, assignedTo int) *chModel.Chore {
		due := yesterday
		chore := &chModel.Chore{Name: name, FamilyID: testFamilyID, IsActive: true, FrequencyType: "daily",
			NextDueDate: &due, AssignedTo: &assignedTo, AssignStrategy: chModel.AssignmentStrategyRoundRobin,
			Points: &points, Assignees: []chModel.ChoreAssignees{{UserID: assignedTo}}}
		require.NoError(t, db.Create(chore).Error)
		return chore
	}
	for i := 0; i < 6; i++ {
		task("Tâche d'Elena", testOtherID)
		task("Tâche d'Anna", 3)
	}
	before, err := games.TodaySurprise(db, testFamilyID, now)
	require.NoError(t, err)
	require.NotNil(t, before)
	var surpriseTask chModel.Chore
	require.NoError(t, db.First(&surpriseTask, before.ChoreID).Error)
	other := testOtherID
	if *surpriseTask.AssignedTo == testOtherID {
		other = 3
	}

	// The child whose task is not the surprise leaves and comes back.
	_, err = repo.SetMemberAway(ctx, testFamilyID, other, true, now)
	require.NoError(t, err)
	_, err = repo.SetMemberAway(ctx, testFamilyID, other, false, now.Add(time.Minute))
	require.NoError(t, err)
	after, err := games.TodaySurprise(db, testFamilyID, now.Add(time.Minute))
	require.NoError(t, err)
	require.Equal(t, before.ChoreID, after.ChoreID, "the surprise stays put")

	var late int64
	require.NoError(t, db.Model(&chModel.Chore{}).Where("next_due_date = ?", yesterday.UTC()).Count(&late).Error)
	require.EqualValues(t, 12, late, "the late tasks stay late")
	var absences int64
	require.NoError(t, db.Model(&games.Absence{}).Count(&absences).Error)
	require.Zero(t, absences, "a mistaken absence is erased")

	// The child whose task is the surprise leaves: it is drawn again among the others.
	_, err = repo.SetMemberAway(ctx, testFamilyID, *surpriseTask.AssignedTo, true, now.Add(2*time.Minute))
	require.NoError(t, err)
	drawn, err := games.TodaySurprise(db, testFamilyID, now.Add(2*time.Minute))
	require.NoError(t, err)
	require.NotNil(t, drawn)
	var drawnTask chModel.Chore
	require.NoError(t, db.First(&drawnTask, drawn.ChoreID).Error)
	require.Equal(t, other, *drawnTask.AssignedTo)

	// Back after more than a quarter of an hour: the absence is kept, the new surprise too.
	_, err = repo.SetMemberAway(ctx, testFamilyID, *surpriseTask.AssignedTo, false, now.Add(time.Hour))
	require.NoError(t, err)
	kept, err := games.TodaySurprise(db, testFamilyID, now.Add(time.Hour))
	require.NoError(t, err)
	require.Equal(t, drawn.ChoreID, kept.ChoreID)
	require.NoError(t, db.Model(&games.Absence{}).Count(&absences).Error)
	require.EqualValues(t, 1, absences)
}
