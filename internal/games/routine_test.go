package games_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	fModel "github.com/nico87lbs/hopla/internal/family/model"
	"github.com/nico87lbs/hopla/internal/zone"
	. "github.com/nico87lbs/hopla/internal/games"
)

func assignedTo(userID int) func(*chModel.Chore) {
	return func(c *chModel.Chore) {
		c.AssignedTo = &userID
		c.AssignStrategy = chModel.AssignmentStrategy("random")
		c.Assignees = []chModel.ChoreAssignees{{UserID: userID}}
	}
}

func TestARoutineShowsOneStepAtATimeAndPaysOnceFinished(t *testing.T) {
	db := setup(t)
	now := noon(0)
	dress := chore(t, db, "S'habiller", 1, now, assignedTo(2))
	teeth := chore(t, db, "Dents", 1, now, assignedTo(2))
	teethAnna := chore(t, db, "dents", 1, now, assignedTo(3))
	bag := chore(t, db, "Cartable", 1, now.AddDate(0, 0, 2), assignedTo(2))
	routine := Routine{FamilyID: 1, Name: "Matin", Bonus: 4, ChoreIDs: []int{dress.ID, teeth.ID, bag.ID}}
	require.NoError(t, SaveRoutine(db, &routine))
	require.NoError(t, OpenRoutineOccurrences(db, now), "the day's routines are opened before the steps are done")

	views, err := RoutineViews(db, 1, []int{2, 3}, now)
	require.NoError(t, err)
	require.Len(t, views, 1)
	require.ElementsMatch(t, []int{dress.ID, teeth.ID, teethAnna.ID, bag.ID}, views[0].TaskIDs, "copies count")
	elena := views[0].Members[0]
	require.Equal(t, dress.ID, *elena.Current)
	require.Equal(t, []int{1, 0, 2}, []int{elena.Step, elena.Done, elena.Total}, "the bag is not due today")
	anna := views[0].Members[1]
	require.Equal(t, teethAnna.ID, *anna.Current, "Anna's copy")

	done(t, db, dress.ID, 1, now)
	views, err = RoutineViews(db, 1, []int{1}, now)
	require.NoError(t, err)
	require.Empty(t, views[0].Members, "a parent doing a child's step is not in the routine")

	done(t, db, dress.ID, 2, now)
	tomorrow := now.AddDate(0, 0, 1)
	require.NoError(t, db.Model(dress).Update("next_due_date", tomorrow).Error)
	require.NoError(t, AfterTask(db, 1, 2, now, now))
	views, err = RoutineViews(db, 1, []int{2}, now)
	require.NoError(t, err)
	elena = views[0].Members[0]
	require.Equal(t, teeth.ID, *elena.Current)
	require.Equal(t, []int{2, 1, 2}, []int{elena.Step, elena.Done, elena.Total})

	done(t, db, teeth.ID, 2, now)
	require.NoError(t, db.Model(teeth).Update("next_due_date", tomorrow).Error)
	require.NoError(t, AfterTask(db, 1, 2, now, now))
	require.NoError(t, AfterTask(db, 1, 2, now, now), "a second task does not pay again")
	views, err = RoutineViews(db, 1, []int{2}, now)
	require.NoError(t, err)
	require.True(t, views[0].Members[0].Finished)
	require.Nil(t, views[0].Members[0].Current)
	var member fModel.UserFamily
	require.NoError(t, db.Where("user_id = 2").First(&member).Error)
	require.Equal(t, 4, member.Points, "bonus once")
}

func TestATaskIsInOneRoutineOnly(t *testing.T) {
	db := setup(t)
	now := noon(0)
	teeth := chore(t, db, "Dents", 1, now, nil)
	teethAnna := chore(t, db, "Dents", 1, now, nil)
	bed := chore(t, db, "Lit", 1, now, nil)
	morning := Routine{FamilyID: 1, Name: "Matin", ChoreIDs: []int{teeth.ID}}
	require.NoError(t, SaveRoutine(db, &morning))
	evening := Routine{FamilyID: 1, Name: "Soir", ChoreIDs: []int{teethAnna.ID, bed.ID}}
	require.ErrorIs(t, SaveRoutine(db, &evening), ErrRoutineTaskTaken, "the same task by its copy")
	evening.ChoreIDs = []int{bed.ID, bed.ID}
	require.ErrorIs(t, SaveRoutine(db, &evening), ErrRoutineTaskTwice)
	evening.ChoreIDs = []int{}
	require.ErrorIs(t, SaveRoutine(db, &evening), ErrRoutineEmpty)
	evening.ChoreIDs = []int{bed.ID, 999}
	require.ErrorIs(t, SaveRoutine(db, &evening), ErrRoutineTask)

	morning.ChoreIDs = []int{bed.ID, teeth.ID}
	require.NoError(t, SaveRoutine(db, &morning), "editing keeps its own tasks")
	routines, err := Routines(db, 1)
	require.NoError(t, err)
	require.Equal(t, []int{bed.ID, teeth.ID}, routines[0].ChoreIDs)
	require.NoError(t, DeleteRoutine(db, 1, morning.ID))
	routines, err = Routines(db, 1)
	require.NoError(t, err)
	require.Empty(t, routines)
}

func TestRoutineGraphPersistsDependenciesAndOffersParallelTasks(t *testing.T) {
	db := setup(t)
	now := noon(0)
	first := chore(t, db, "Se lever", 1, now, assignedTo(2))
	second := chore(t, db, "S'habiller", 1, now, assignedTo(2))
	third := chore(t, db, "Faire son lit", 1, now, assignedTo(2))
	routine := Routine{
		FamilyID: 1,
		Name: "Matin",
		ChoreIDs: []int{first.ID, second.ID, third.ID},
		GraphEnabled: true,
		Dependencies: []RoutineDependency{
			{StepID: 2, DependsOnStepID: 1},
			{StepID: 3, DependsOnStepID: 1},
		},
	}
	require.NoError(t, SaveRoutine(db, &routine))
	stored, err := Routines(db, 1)
	require.NoError(t, err)
	require.Len(t, stored, 1)
	require.Equal(t, []RoutineDependency{{RoutineID: 1, StepID: 2, DependsOnStepID: 1}, {RoutineID: 1, StepID: 3, DependsOnStepID: 1}}, stored[0].Dependencies)

	views, err := RoutineViews(db, 1, []int{2}, now)
	require.NoError(t, err)
	require.ElementsMatch(t, []int{first.ID}, views[0].Members[0].Available)
	done(t, db, first.ID, 2, now)
	views, err = RoutineViews(db, 1, []int{2}, now)
	require.NoError(t, err)
	require.ElementsMatch(t, []int{second.ID, third.ID}, views[0].Members[0].Available)
}


func TestRoutineCanUseDifferentStableSlotsOfTheSameTask(t *testing.T) {
	db := setup(t)
	now := noon(0)
	morningID, eveningID := "slot-morning-001", "slot-evening-001"
	metadata := &chModel.FrequencyMetadata{Timezone:"Europe/Paris",Slots:[]chModel.Slot{
		{ID:morningID,Name:"Matin",Time:"07:00"},
		{ID:eveningID,Name:"Soir",Time:"19:00"},
	}}
	first := chore(t, db, "Brosser les dents", 1, now, assignedTo(2))
	second := chore(t, db, "Brosser les dents", 1, now, assignedTo(3))
	for _, task := range []*chModel.Chore{first, second} {
		task.FrequencyType = chModel.FrequencyTypeDaily
		task.FrequencyMetadataV2 = metadata
		require.NoError(t, db.Model(task).Updates(map[string]any{
			"frequency_type": task.FrequencyType,
			"frequency_meta_v2": metadata,
		}).Error)
	}
	morning := Routine{FamilyID:1,Name:"Matin",ChoreIDs:[]int{first.ID},SlotIDs:[]string{morningID}}
	require.NoError(t, SaveRoutine(db,&morning))
	evening := Routine{FamilyID:1,Name:"Soir",ChoreIDs:[]int{second.ID},SlotIDs:[]string{eveningID}}
	require.NoError(t, SaveRoutine(db,&evening), "the evening slot can belong to another routine")

	conflict := Routine{FamilyID:1,Name:"Encore le matin",ChoreIDs:[]int{first.ID},SlotIDs:[]string{morningID}}
	require.ErrorIs(t, SaveRoutine(db,&conflict),ErrRoutineTaskTaken)
	invalid := Routine{FamilyID:1,Name:"Créneau supprimé",ChoreIDs:[]int{first.ID},SlotIDs:[]string{"missing-slot"}}
	require.ErrorIs(t, SaveRoutine(db,&invalid),ErrRoutineSlot)

	stored, err := Routines(db,1)
	require.NoError(t,err)
	require.Equal(t,[]string{morningID},stored[0].SlotIDs)
	require.Equal(t,[]string{eveningID},stored[1].SlotIDs)
}

func TestRoutineCompletionOnlyCountsTheSelectedSlot(t *testing.T) {
	db := setup(t)
	now := noon(0)
	morningID, eveningID := "slot-morning-002", "slot-evening-002"
	task := chore(t,db,"Brosser les dents",1,now,assignedTo(2))
	metadata := &chModel.FrequencyMetadata{Timezone:"Europe/Paris",Slots:[]chModel.Slot{
		{ID:morningID,Name:"Matin",Time:"07:00"},
		{ID:eveningID,Name:"Soir",Time:"19:00"},
	}}
	task.FrequencyType = chModel.FrequencyTypeDaily
	task.FrequencyMetadataV2 = metadata
	require.NoError(t,db.Model(task).Updates(map[string]any{"frequency_type":task.FrequencyType,"frequency_meta_v2":metadata}).Error)
	routine := Routine{FamilyID:1,Name:"Dents du matin",Bonus:3,ValidityMinutes:720,ChoreIDs:[]int{task.ID},SlotIDs:[]string{morningID}}
	require.NoError(t,SaveRoutine(db,&routine))
	require.NoError(t,OpenRoutineOccurrences(db,now))

	day := now.In(zone.Of(1))
	morningAt := time.Date(day.Year(),day.Month(),day.Day(),7,0,0,0,day.Location()).UTC()
	eveningAt := time.Date(day.Year(),day.Month(),day.Day(),19,0,0,0,day.Location()).UTC()
	eveningSlot := 1
	eveningHistory := chModel.ChoreHistory{ChoreID:task.ID,PerformedAt:&now,CompletedBy:2,DueDate:&eveningAt,Slot:&eveningSlot,SlotID:&eveningID,Status:chModel.ChoreHistoryStatusCompleted}
	require.NoError(t,db.Create(&eveningHistory).Error)

	views,err:=RoutineViews(db,1,[]int{2},now)
	require.NoError(t,err)
	require.Equal(t,[]int{task.ID},views[0].Members[0].Available,"evening completion does not complete the morning slot")
	runID:=views[0].Members[0].Occurrence.ID

	morningSlot:=0
	morningHistory:=chModel.ChoreHistory{ChoreID:task.ID,PerformedAt:&now,CompletedBy:2,DueDate:&morningAt,Slot:&morningSlot,SlotID:&morningID,Status:chModel.ChoreHistoryStatusCompleted}
	require.NoError(t,db.Create(&morningHistory).Error)
	require.NoError(t,AfterTask(db,1,2,now,now))
	run,err:=GetRoutineOccurrence(db,1,runID,now)
	require.NoError(t,err)
	require.Equal(t,RoutineOccurrenceFinished,run.Status)
	require.Equal(t,RoutineOccurrenceItemCompleted,run.Items[0].Status)
	var member fModel.UserFamily
	require.NoError(t,db.Where("user_id = 2").First(&member).Error)
	require.Equal(t,3,member.Points)
}

func TestOptionalStepsAreSavedByPlace(t *testing.T) {
	db := setup(t)
	now := noon(0)
	dress := chore(t, db, "S'habiller", 1, now, assignedTo(2))
	teeth := chore(t, db, "Dents", 1, now, assignedTo(2))
	routine := Routine{FamilyID: 1, Name: "Matin", ChoreIDs: []int{dress.ID, teeth.ID},
		GraphEnabled: true, Dependencies: []RoutineDependency{}, OptionalStepIDs: []int{2}}
	require.NoError(t, SaveRoutine(db, &routine))
	stored, err := Routines(db, 1)
	require.NoError(t, err)
	require.Equal(t, []int{2}, stored[0].OptionalStepIDs, "the second step stays optional")

	// Saving again without the optional steps makes every step required.
	routine.OptionalStepIDs = []int{}
	require.NoError(t, SaveRoutine(db, &routine))
	stored, err = Routines(db, 1)
	require.NoError(t, err)
	require.Empty(t, stored[0].OptionalStepIDs)
}

// Showing the routines writes nothing; the occurrences are opened apart.
func TestShowingRoutinesOpensNoOccurrence(t *testing.T) {
	db := setup(t)
	now := noon(0)
	dress := chore(t, db, "S'habiller", 1, now, assignedTo(2))
	teeth := chore(t, db, "Dents", 1, now, assignedTo(2))
	routine := Routine{FamilyID: 1, Name: "Matin", Bonus: 4, ChoreIDs: []int{dress.ID, teeth.ID}}
	require.NoError(t, SaveRoutine(db, &routine))
	count := func() int64 {
		var n int64
		require.NoError(t, db.Model(&RoutineOccurrence{}).Count(&n).Error)
		return n
	}

	views, err := RoutineViews(db, 1, []int{2}, now)
	require.NoError(t, err)
	require.Equal(t, dress.ID, *views[0].Members[0].Current, "the steps still show")
	require.Zero(t, count(), "showing the routines wrote nothing")

	require.NoError(t, OpenRoutineOccurrences(db, now))
	require.EqualValues(t, 1, count(), "the job opens the occurrence")
	views, err = RoutineViews(db, 1, []int{2}, now)
	require.NoError(t, err)
	require.NotNil(t, views[0].Members[0].Occurrence, "then it shows")
	require.EqualValues(t, 1, count(), "showing again opens no second one")

	// A run that ran out is left as it is by the display, closed by the job.
	later := now.Add(30 * time.Hour)
	_, err = RoutineViews(db, 1, []int{2}, later)
	require.NoError(t, err)
	var run RoutineOccurrence
	require.NoError(t, db.First(&run).Error)
	require.Equal(t, RoutineOccurrenceActive, run.Status)
	require.NoError(t, OpenRoutineOccurrences(db, later))
	require.NoError(t, db.First(&run).Error)
	require.Equal(t, RoutineOccurrenceExpired, run.Status)
}
