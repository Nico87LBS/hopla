package games_test

import (
	"testing"
	"time"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	fModel "github.com/nico87lbs/hopla/internal/family/model"
	. "github.com/nico87lbs/hopla/internal/games"
	"github.com/nico87lbs/hopla/internal/zone"
	"github.com/stretchr/testify/require"
)

// withMoments gives a daily task its moments of the day.
func withMoments(userID int, slots ...chModel.Slot) func(*chModel.Chore) {
	return func(c *chModel.Chore) {
		assignedTo(userID)(c)
		c.FrequencyMetadataV2 = &chModel.FrequencyMetadata{Slots: slots}
	}
}

func TestARoutineWithHoursOpensAtItsStartAndMissesWhatIsLeftAtItsEnd(t *testing.T) {
	db := setup(t)
	loc := zone.Of(1)
	today := time.Now().In(loc)
	at := func(hour, minute int) time.Time {
		return time.Date(today.Year(), today.Month(), today.Day(), hour, minute, 0, 0, loc)
	}
	teeth := chore(t, db, "Dents", 1, at(7, 30), withMoments(2,
		chModel.Slot{ID: "matin", Name: "Matin", Time: "07:30", Until: "07:45"},
		chModel.Slot{ID: "soir", Name: "Soir", Time: "20:00"}))
	bag := chore(t, db, "Cartable", 1, at(8, 0), assignedTo(2))
	routine := Routine{FamilyID: 1, Name: "Matin", Bonus: 5, StartsAt: "07:00", EndsAt: "08:30",
		ChoreIDs: []int{teeth.ID, bag.ID}, SlotIDs: []string{"matin", ""}}
	require.NoError(t, SaveRoutine(db, &routine))

	// Before its start, the routine is only coming: nothing to tick, no run.
	require.NoError(t, OpenRoutineOccurrences(db, at(6, 30)))
	views, err := RoutineViews(db, 1, []int{2}, at(6, 30))
	require.NoError(t, err)
	require.Equal(t, RoutineWindowUpcoming, views[0].Window)
	require.Nil(t, views[0].Members[0].Current)
	require.Nil(t, views[0].Members[0].Occurrence)
	_, err = StartRoutineOccurrence(db, 1, routine.ID, 2, at(6, 30))
	require.ErrorIs(t, err, ErrRoutineClosed)

	// From its start it runs until its end, whatever its validity.
	require.NoError(t, OpenRoutineOccurrences(db, at(7, 10)))
	views, err = RoutineViews(db, 1, []int{2}, at(7, 10))
	require.NoError(t, err)
	anna := views[0].Members[0]
	require.Equal(t, RoutineWindowOpen, views[0].Window)
	require.NotNil(t, anna.Occurrence)
	require.True(t, anna.Occurrence.ExpiresAt.Equal(at(8, 30)))
	require.Equal(t, teeth.ID, *anna.Current)

	// Once the morning moment closed, the step is missed and the child goes on.
	views, err = RoutineViews(db, 1, []int{2}, at(7, 50))
	require.NoError(t, err)
	anna = views[0].Members[0]
	require.Equal(t, []int{teeth.ID}, anna.Missed)
	require.Equal(t, bag.ID, *anna.Current)
	require.False(t, anna.Finished)

	// The bag done, the routine waits for the missed step: no bonus yet.
	done(t, db, bag.ID, 2, at(8, 0))
	require.NoError(t, AfterTask(db, 1, 2, at(8, 0), at(8, 0)))
	views, err = RoutineViews(db, 1, []int{2}, at(8, 5))
	require.NoError(t, err)
	anna = views[0].Members[0]
	require.False(t, anna.Finished)
	require.Nil(t, anna.Current)
	require.Equal(t, []int{teeth.ID}, anna.Missed)

	// Past its end the routine is over, and does not open again today.
	require.NoError(t, OpenRoutineOccurrences(db, at(8, 40)))
	views, err = RoutineViews(db, 1, []int{2}, at(8, 40))
	require.NoError(t, err)
	require.Equal(t, RoutineWindowOver, views[0].Window)
	anna = views[0].Members[0]
	require.Equal(t, []int{teeth.ID}, anna.Missed)
	require.Nil(t, anna.Current)
	var runs int64
	require.NoError(t, db.Model(&RoutineOccurrence{}).Where("routine_id = ?", routine.ID).Count(&runs).Error)
	require.EqualValues(t, 1, runs)

	// A parent catches the missed moment up: the routine is finished and paid.
	slotID, caught := "matin", at(9, 0)
	due := at(7, 30)
	require.NoError(t, db.Create(&chModel.ChoreHistory{ChoreID: teeth.ID, CompletedBy: 2, PerformedAt: &caught, DueDate: &due,
		SlotID: &slotID, Status: chModel.ChoreHistoryStatusCompleted}).Error)
	require.NoError(t, AfterTask(db, 1, 2, caught, caught))
	views, err = RoutineViews(db, 1, []int{2}, at(9, 1))
	require.NoError(t, err)
	require.True(t, views[0].Members[0].Finished)
	require.Empty(t, views[0].Members[0].Missed)
	var member fModel.UserFamily
	require.NoError(t, db.Where("user_id = ?", 2).First(&member).Error)
	require.Equal(t, 5, member.Points, "the bonus is paid once everything is caught up")
}

func TestRoutineHoursAreBothOrNoneAndInOrder(t *testing.T) {
	db := setup(t)
	now := noon(0)
	task := chore(t, db, "Dents", 1, now, assignedTo(2))
	for _, hours := range [][2]string{{"07:00", ""}, {"", "08:00"}, {"08:00", "07:00"}, {"7h", "8h"}} {
		routine := Routine{FamilyID: 1, Name: "Matin", StartsAt: hours[0], EndsAt: hours[1], ChoreIDs: []int{task.ID}}
		require.ErrorIs(t, SaveRoutine(db, &routine), ErrRoutineHours, hours)
	}
	routine := Routine{FamilyID: 1, Name: "Matin", StartsAt: " 7:05", EndsAt: "08:00", ChoreIDs: []int{task.ID}}
	require.NoError(t, SaveRoutine(db, &routine))
	saved, err := Routines(db, 1)
	require.NoError(t, err)
	require.Equal(t, "07:05", saved[0].StartsAt, "hours are tidied")
	require.Equal(t, "08:00", saved[0].EndsAt)
}
