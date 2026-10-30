package games_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	cModel "github.com/nico87lbs/hopla/internal/circle/model"
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
	routine := Routine{CircleID: 1, Name: "Matin", Bonus: 4, ChoreIDs: []int{dress.ID, teeth.ID, bag.ID}}
	require.NoError(t, SaveRoutine(db, &routine))

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
	var member cModel.UserCircle
	require.NoError(t, db.Where("user_id = 2").First(&member).Error)
	require.Equal(t, 4, member.Points, "bonus once")
}

func TestATaskIsInOneRoutineOnly(t *testing.T) {
	db := setup(t)
	now := noon(0)
	teeth := chore(t, db, "Dents", 1, now, nil)
	teethAnna := chore(t, db, "Dents", 1, now, nil)
	bed := chore(t, db, "Lit", 1, now, nil)
	morning := Routine{CircleID: 1, Name: "Matin", ChoreIDs: []int{teeth.ID}}
	require.NoError(t, SaveRoutine(db, &morning))
	evening := Routine{CircleID: 1, Name: "Soir", ChoreIDs: []int{teethAnna.ID, bed.ID}}
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
