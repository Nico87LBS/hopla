package games_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	fModel "github.com/nico87lbs/hopla/internal/family/model"
	. "github.com/nico87lbs/hopla/internal/games"
)

func TestRoutineOccurrenceCanCrossMidnightAndExpires(t *testing.T) {
	db := setup(t)
	now := time.Date(2026, 11, 5, 23, 0, 0, 0, time.UTC)
	a := chore(t, db, "Se lever", 1, now, assignedTo(2))
	b := chore(t, db, "S'habiller", 1, now, assignedTo(2))
	routine := Routine{FamilyID: 1, Name: "Matin", ValidityMinutes: 180, ChoreIDs: []int{a.ID, b.ID}}
	require.NoError(t, SaveRoutine(db, &routine))

	first, err := StartRoutineOccurrence(db, 1, routine.ID, 2, now)
	require.NoError(t, err)
	require.Equal(t, now.Add(3*time.Hour), first.ExpiresAt)
	require.Equal(t, "Matin", first.RoutineName)
	require.Equal(t, "Se lever", first.Items[0].ChoreName)
	active, err := ListActiveRoutineOccurrences(db, 1, now.Add(time.Minute))
	require.NoError(t, err)
	require.Len(t, active, 1)
	require.Equal(t, first.ID, active[0].ID)
	reused, err := StartRoutineOccurrence(db, 1, routine.ID, 2, now.Add(2*time.Hour))
	require.NoError(t, err)
	require.Equal(t, first.ID, reused.ID, "the same run continues after midnight")
	require.Len(t, reused.Items, 2)
	views, err := RoutineViews(db, 1, []int{2}, now.Add(2*time.Hour))
	require.NoError(t, err)
	require.Equal(t, first.ID, views[0].Members[0].Occurrence.ID, "the active run remains visible after midnight")

	next, err := StartRoutineOccurrence(db, 1, routine.ID, 2, now.Add(4*time.Hour))
	require.NoError(t, err)
	require.NotEqual(t, first.ID, next.ID)
	var old RoutineOccurrence
	require.NoError(t, db.First(&old, first.ID).Error)
	require.Equal(t, RoutineOccurrenceExpired, old.Status)
}

func TestRoutineOccurrenceManualSkipAndExternalOverrideAreScopedAndIdempotent(t *testing.T) {
	db := setup(t)
	now := time.Date(2026, 11, 5, 8, 0, 0, 0, time.UTC)
	a := chore(t, db, "Manteau", 1, now, assignedTo(2))
	routine := Routine{FamilyID: 1, Name: "Départ", ValidityMinutes: 120, ChoreIDs: []int{a.ID}}
	require.NoError(t, SaveRoutine(db, &routine))
	run, err := StartRoutineOccurrence(db, 1, routine.ID, 2, now)
	require.NoError(t, err)
	itemID := run.Items[0].ID

	expiry := now.Add(30*time.Minute)
	input := RoutineOverrideInput{ItemID:itemID, Source:"external", Reason:"Il fait chaud",
		ExternalReference:"home-assistant/manteau", IdempotencyKey:"event-123", ExpiresAt:&expiry}
	updated, err := SkipRoutineOccurrenceItem(db, 1, run.ID, input, now.Add(time.Minute))
	require.NoError(t, err)
	require.Equal(t, RoutineOccurrenceItemSkipped, updated.Items[0].Status)
	retry, err := SkipRoutineOccurrenceItem(db, 1, run.ID, input, now.Add(2*time.Minute))
	require.NoError(t, err, "a retry with the same idempotency key is safe")
	require.Equal(t, run.ID, retry.ID)
	var count int64
	require.NoError(t, db.Model(&RoutineOverride{}).Where("occurrence_id = ?", run.ID).Count(&count).Error)
	require.EqualValues(t, 1, count)

	conflict := input
	conflict.Reason = "different reason"
	_, err = SkipRoutineOccurrenceItem(db, 1, run.ID, conflict, now.Add(3*time.Minute))
	require.ErrorIs(t, err, ErrRoutineOccurrenceConflict)

	_, err = SkipRoutineOccurrenceItem(db, 2, run.ID, input, now.Add(3*time.Minute))
	require.ErrorIs(t, err, ErrRoutineOccurrenceNotFound)
}

func TestRoutineOccurrenceRejectsExpiredAndOverlongOverrides(t *testing.T) {
	db := setup(t)
	now := time.Date(2026, 11, 5, 8, 0, 0, 0, time.UTC)
	a := chore(t, db, "Manteau", 1, now, assignedTo(2))
	routine := Routine{FamilyID: 1, Name: "Départ", ValidityMinutes: 30, ChoreIDs: []int{a.ID}}
	require.NoError(t, SaveRoutine(db, &routine))
	run, err := StartRoutineOccurrence(db, 1, routine.ID, 2, now)
	require.NoError(t, err)
	_, err = GetRoutineOccurrence(db, 1, run.ID, now.Add(31*time.Minute))
	require.NoError(t, err)
	_, err = SkipRoutineOccurrenceItem(db, 1, run.ID, RoutineOverrideInput{ItemID:run.Items[0].ID,Source:"manual"}, now.Add(32*time.Minute))
	require.ErrorIs(t, err, ErrRoutineOccurrenceExpired)

	run2, err := StartRoutineOccurrence(db, 1, routine.ID, 2, now.Add(time.Hour))
	require.NoError(t, err)
	tooLate := now.Add(4*time.Hour)
	_, err = SkipRoutineOccurrenceItem(db, 1, run2.ID, RoutineOverrideInput{ItemID:run2.Items[0].ID,Source:"external",
		ExternalReference:"ha/1",IdempotencyKey:"event-2",ExpiresAt:&tooLate}, now.Add(time.Hour))
	require.ErrorIs(t, err, ErrRoutineOccurrenceInvalid)
}


func TestRoutineOccurrenceCompletesFromTaskHistoryAndPaysPerRun(t *testing.T) {
	db := setup(t)
	now := noon(0)
	task := chore(t, db, "Se brosser les dents", 1, now, assignedTo(2))
	routine := Routine{FamilyID:1, Name:"Matin", Bonus:7, ValidityMinutes:180, ChoreIDs:[]int{task.ID}}
	require.NoError(t, SaveRoutine(db, &routine))
	run, err := StartRoutineOccurrence(db, 1, routine.ID, 2, now)
	require.NoError(t, err)
	require.Len(t, run.Items, 1)
	require.True(t, run.Items[0].Available)

	done(t, db, task.ID, 2, now)
	require.NoError(t, AfterTask(db, 1, 2, now, now))
	finished, err := GetRoutineOccurrence(db, 1, run.ID, now)
	require.NoError(t, err)
	require.Equal(t, RoutineOccurrenceFinished, finished.Status)
	require.True(t, finished.BonusPaid)
	require.Equal(t, RoutineOccurrenceItemCompleted, finished.Items[0].Status)

	var member fModel.UserFamily
	require.NoError(t, db.Where("user_id = ?", 2).First(&member).Error)
	require.Equal(t, 7, member.Points, "the reward is attached to this run")

	nextDay := now.AddDate(0, 0, 1)
	require.NoError(t, db.Model(task).Update("next_due_date", nextDay).Error)
	second, err := StartRoutineOccurrence(db, 1, routine.ID, 2, nextDay)
	require.NoError(t, err)
	done(t, db, task.ID, 2, nextDay)
	require.NoError(t, AfterTask(db, 1, 2, nextDay, nextDay))
	second, err = GetRoutineOccurrence(db, 1, second.ID, nextDay)
	require.NoError(t, err)
	require.Equal(t, RoutineOccurrenceFinished, second.Status)
	require.True(t, second.BonusPaid)
	require.NoError(t, db.Where("user_id = ?", 2).First(&member).Error)
	require.Equal(t, 14, member.Points, "each occurrence pays at most once")
}

func TestExpiredExternalSkipIsRevertedUnlessADependentStepWasPassed(t *testing.T) {
	db := setup(t)
	now := noon(0)
	first := chore(t, db, "Manteau", 1, now, assignedTo(2))
	second := chore(t, db, "Voiture", 1, now, assignedTo(2))
	routine := Routine{FamilyID:1, Name:"Départ", ValidityMinutes:180, ChoreIDs:[]int{first.ID, second.ID},
		GraphEnabled:true, Dependencies:[]RoutineDependency{{StepID:2, DependsOnStepID:1}}}
	require.NoError(t, SaveRoutine(db, &routine))
	run, err := StartRoutineOccurrence(db, 1, routine.ID, 2, now)
	require.NoError(t, err)
	var item RoutineOccurrenceItem
	for _, candidate := range run.Items { if candidate.Position == 0 { item = candidate } }
	expires := now.Add(20*time.Minute)
	_, err = SkipRoutineOccurrenceItem(db, 1, run.ID, RoutineOverrideInput{ItemID:item.ID,Source:"external",
		Reason:"Pas besoin",ExternalReference:"ha/coat",IdempotencyKey:"weather-1",ExpiresAt:&expires}, now.Add(time.Minute))
	require.NoError(t, err)
	afterExpiry, err := GetRoutineOccurrence(db, 1, run.ID, now.Add(21*time.Minute))
	require.NoError(t, err)
	require.Equal(t, RoutineOccurrenceItemPending, afterExpiry.Items[0].Status)
	require.True(t, afterExpiry.Items[0].Available)
}


func TestExternalRoutineSkipCanBeRestoredBeforeDependentStepPasses(t *testing.T) {
	db := setup(t)
	now := noon(0)
	first := chore(t, db, "Manteau", 1, now, assignedTo(2))
	second := chore(t, db, "Voiture", 1, now, assignedTo(2))
	routine := Routine{FamilyID:1,Name:"Départ",ValidityMinutes:180,ChoreIDs:[]int{first.ID,second.ID},
		GraphEnabled:true,Dependencies:[]RoutineDependency{{StepID:2,DependsOnStepID:1}}}
	require.NoError(t,SaveRoutine(db,&routine))
	run,err:=StartRoutineOccurrence(db,1,routine.ID,2,now)
	require.NoError(t,err)
	itemID:=run.Items[0].ID
	expires:=now.Add(30*time.Minute)
	skip:=RoutineOverrideInput{ItemID:itemID,Source:"external",Reason:"Pas besoin",
		ExternalReference:"home-assistant/manteau",IdempotencyKey:"skip-1",ExpiresAt:&expires}
	_,err=SkipRoutineOccurrenceItem(db,1,run.ID,skip,now.Add(time.Minute))
	require.NoError(t,err)
	restore:=RoutineOverrideInput{ItemID:itemID,Source:"external",Reason:"Le temps change",
		ExternalReference:"home-assistant/manteau",IdempotencyKey:"restore-1"}
	updated,err:=RestoreRoutineOccurrenceItem(db,1,run.ID,restore,now.Add(2*time.Minute))
	require.NoError(t,err)
	require.Equal(t,RoutineOccurrenceItemPending,updated.Items[0].Status)
	require.True(t,updated.Items[0].Available)
	_,err=RestoreRoutineOccurrenceItem(db,1,run.ID,restore,now.Add(3*time.Minute))
	require.NoError(t,err,"repeated restore events are idempotent")

	skip.IdempotencyKey = "skip-2"
	_,err=SkipRoutineOccurrenceItem(db,1,run.ID,skip,now.Add(4*time.Minute))
	require.NoError(t,err)
	var dependent RoutineOccurrenceItem
	require.NoError(t,db.Where("occurrence_id = ? AND position = ?",run.ID,1).First(&dependent).Error)
	require.NoError(t,db.Model(&dependent).Update("status",RoutineOccurrenceItemCompleted).Error)
	_,err=RestoreRoutineOccurrenceItem(db,1,run.ID,RoutineOverrideInput{
		ItemID:itemID,Source:"external",Reason:"Trop tard",ExternalReference:"home-assistant/manteau",IdempotencyKey:"restore-2",
	},now.Add(5*time.Minute))
	require.ErrorIs(t,err,ErrRoutineOccurrenceConflict,"do not roll back after a dependent step has passed")
}


func TestExternalRestoreCannotUndoAManualSkip(t *testing.T) {
	db := setup(t)
	now := noon(0)
	task := chore(t, db, "Manteau", 1, now, assignedTo(2))
	routine := Routine{FamilyID:1,Name:"Départ",ValidityMinutes:120,ChoreIDs:[]int{task.ID}}
	require.NoError(t,SaveRoutine(db,&routine))
	run,err:=StartRoutineOccurrence(db,1,routine.ID,2,now)
	require.NoError(t,err)
	itemID:=run.Items[0].ID
	_,err=SkipRoutineOccurrenceItem(db,1,run.ID,RoutineOverrideInput{
		ItemID:itemID,Source:"manual",Reason:"Décision du parent",
	},now.Add(time.Minute))
	require.NoError(t,err)
	_,err=RestoreRoutineOccurrenceItem(db,1,run.ID,RoutineOverrideInput{
		ItemID:itemID,Source:"external",Reason:"Météo modifiée",
		ExternalReference:"home-assistant/manteau",IdempotencyKey:"restore-manual",
	},now.Add(2*time.Minute))
	require.ErrorIs(t,err,ErrRoutineOccurrenceConflict)
}


func TestOccurrenceKeepsItsDependencySnapshotWhenRoutineIsEdited(t *testing.T) {
	db:=setup(t)
	now:=noon(0)
	first:=chore(t,db,"Réveil",1,now,assignedTo(2))
	second:=chore(t,db,"Habillage",1,now,assignedTo(2))
	routine:=Routine{FamilyID:1,Name:"Matin",ValidityMinutes:180,ChoreIDs:[]int{first.ID,second.ID},
		GraphEnabled:true,Dependencies:[]RoutineDependency{{StepID:2,DependsOnStepID:1}}}
	require.NoError(t,SaveRoutine(db,&routine))
	run,err:=StartRoutineOccurrence(db,1,routine.ID,2,now)
	require.NoError(t,err)
	require.Len(t,run.Dependencies,1)
	require.True(t,run.Items[0].Available)
	require.False(t,run.Items[1].Available)

	stored,err:=Routines(db,1)
	require.NoError(t,err)
	edited:=stored[0]
	edited.Dependencies=[]RoutineDependency{}
	require.NoError(t,SaveRoutine(db,&edited))

	reloaded,err:=GetRoutineOccurrence(db,1,run.ID,now.Add(time.Minute))
	require.NoError(t,err)
	require.Len(t,reloaded.Dependencies,1,"the running occurrence keeps its original dependency edge")
	require.True(t,reloaded.Items[0].Available)
	require.False(t,reloaded.Items[1].Available,"editing the routine must not unlock an in-progress occurrence")
}


func TestOccurrenceKeepsItsFinalRewardWhenRoutineIsEdited(t *testing.T) {
	db:=setup(t)
	now:=noon(0)
	task:=chore(t,db,"Ranger les chaussures",1,now,assignedTo(2))
	routine:=Routine{FamilyID:1,Name:"Départ",Bonus:3,ValidityMinutes:120,ChoreIDs:[]int{task.ID}}
	require.NoError(t,SaveRoutine(db,&routine))
	run,err:=StartRoutineOccurrence(db,1,routine.ID,2,now)
	require.NoError(t,err)
	stored,err:=Routines(db,1)
	require.NoError(t,err)
	edited:=stored[0]
	edited.Bonus=10
	require.NoError(t,SaveRoutine(db,&edited))

	done(t, db, task.ID, 2, now)
	require.NoError(t,AfterTask(db,1,2,now,now))
	updated,err:=GetRoutineOccurrence(db,1,run.ID,now)
	require.NoError(t,err)
	require.Equal(t,3,updated.Bonus)
	require.True(t,updated.BonusPaid)
	var member fModel.UserFamily
	require.NoError(t,db.Where("user_id = 2").First(&member).Error)
	require.Equal(t,3,member.Points,"the in-flight occurrence pays its snapshotted bonus")
}


func TestOptionalRoutineItemCanBeSkippedAfterRequiredStepsFinish(t *testing.T) {
	db:=setup(t)
	now:=noon(0)
	required:=chore(t,db,"Se lever",1,now,assignedTo(2))
	optional:=chore(t,db,"Mettre le manteau",1,now,assignedTo(2))
	routine:=Routine{FamilyID:1,Name:"Départ",Bonus:2,ValidityMinutes:120,
		ChoreIDs:[]int{required.ID,optional.ID},OptionalChoreIDs:[]int{optional.ID},GraphEnabled:true}
	require.NoError(t,SaveRoutine(db,&routine))
	run,err:=StartRoutineOccurrence(db,1,routine.ID,2,now)
	require.NoError(t,err)
	done(t, db, required.ID, 2, now)
	require.NoError(t,AfterTask(db,1,2,now,now))
	run,err=GetRoutineOccurrence(db,1,run.ID,now)
	require.NoError(t,err)
	require.Equal(t,RoutineOccurrenceFinished,run.Status)
	require.Equal(t,RoutineOccurrenceItemPending,run.Items[1].Status)
	require.True(t,run.Items[1].Available)
	updated,err:=SkipRoutineOccurrenceItem(db,1,run.ID,RoutineOverrideInput{
		ItemID:run.Items[1].ID,Source:"manual",Reason:"Pas nécessaire aujourd'hui",
	},now.Add(time.Minute))
	require.NoError(t,err)
	require.Equal(t,RoutineOccurrenceFinished,updated.Status)
	require.Equal(t,RoutineOccurrenceItemSkipped,updated.Items[1].Status)
}


func TestRoutineStartsAnOccurrenceForRemainingOptionalSteps(t *testing.T) {
	db:=setup(t)
	now:=noon(0)
	required:=chore(t,db,"Se lever",1,now,assignedTo(2))
	optional:=chore(t,db,"Mettre le manteau",1,now,assignedTo(2))
	routine:=Routine{FamilyID:1,Name:"Départ",Bonus:2,ValidityMinutes:120,
		ChoreIDs:[]int{required.ID,optional.ID},OptionalChoreIDs:[]int{optional.ID},GraphEnabled:true}
	require.NoError(t,SaveRoutine(db,&routine))
	done(t, db, required.ID, 2, now)
	require.NoError(t,AfterTask(db,1,2,now,now))
	var member fModel.UserFamily
	require.NoError(t,db.Where("user_id = 2").First(&member).Error)
	require.Equal(t,2,member.Points,"legacy completion pays the reward once")

	views,err:=RoutineViews(db,1,[]int{2},now.Add(time.Minute))
	require.NoError(t,err)
	require.Len(t,views,1)
	require.Len(t,views[0].Members,1)
	progress:=views[0].Members[0]
	require.NotNil(t,progress.Occurrence)
	require.Equal(t,RoutineOccurrenceFinished,progress.Occurrence.Status)
	require.Equal(t,RoutineOccurrenceItemCompleted,progress.Occurrence.Items[0].Status)
	require.Equal(t,RoutineOccurrenceItemPending,progress.Occurrence.Items[1].Status)
	require.Contains(t,progress.Available,optional.ID)
	require.NoError(t,db.Where("user_id = 2").First(&member).Error)
	require.Equal(t,2,member.Points,"starting the occurrence must not pay the legacy reward twice")
}


func TestTemporaryExternalSkipDoesNotFinishOrPayUntilItExpires(t *testing.T) {
	db := setup(t)
	now := noon(0)
	task := chore(t, db, "Mettre le manteau", 1, now, assignedTo(2))
	routine := Routine{FamilyID: 1, Name: "Départ", Bonus: 9, ValidityMinutes: 120, ChoreIDs: []int{task.ID}}
	require.NoError(t, SaveRoutine(db, &routine))
	run, err := StartRoutineOccurrence(db, 1, routine.ID, 2, now)
	require.NoError(t, err)

	overrideExpiry := now.Add(15 * time.Minute)
	_, err = SkipRoutineOccurrenceItem(db, 1, run.ID, RoutineOverrideInput{
		ItemID: run.Items[0].ID,
		Source: "external",
		Reason: "Condition météo temporaire",
		ExternalReference: "home-assistant/manteau",
		IdempotencyKey: "weather-temporary-1",
		ExpiresAt: &overrideExpiry,
	}, now.Add(time.Minute))
	require.NoError(t, err)

	pendingReward, err := GetRoutineOccurrence(db, 1, run.ID, now.Add(2*time.Minute))
	require.NoError(t, err)
	require.Equal(t, RoutineOccurrenceActive, pendingReward.Status)
	require.False(t, pendingReward.BonusPaid)

	restored, err := GetRoutineOccurrence(db, 1, run.ID, overrideExpiry.Add(time.Minute))
	require.NoError(t, err)
	require.Equal(t, RoutineOccurrenceActive, restored.Status)
	require.Equal(t, RoutineOccurrenceItemPending, restored.Items[0].Status)
	require.False(t, restored.BonusPaid)

	done(t, db, task.ID, 2, overrideExpiry.Add(2*time.Minute))
	require.NoError(t, AfterTask(db, 1, 2, overrideExpiry.Add(2*time.Minute), overrideExpiry.Add(2*time.Minute)))
	finished, err := GetRoutineOccurrence(db, 1, run.ID, overrideExpiry.Add(2*time.Minute))
	require.NoError(t, err)
	require.Equal(t, RoutineOccurrenceFinished, finished.Status)
	require.True(t, finished.BonusPaid)
	var member fModel.UserFamily
	require.NoError(t, db.Where("user_id = ?", 2).First(&member).Error)
	require.Equal(t, 9, member.Points)
}
