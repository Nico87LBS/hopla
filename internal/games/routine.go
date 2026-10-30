package games

import (
	"errors"
	"slices"
	"time"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	"github.com/nico87lbs/hopla/internal/zone"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Routine chains real tasks in order, such as the morning: get dressed,
// breakfast, teeth, school bag. A child sees one step at a time, and earns
// Bonus extra points the first time in a day all their steps are done.
type Routine struct {
	ID       int    `json:"id" gorm:"primaryKey"`
	FamilyID int    `json:"-" gorm:"column:family_id;index;not null"`
	Name     string `json:"name" gorm:"column:name;not null"`
	Bonus    int    `json:"bonus" gorm:"column:bonus;not null;default:0"`
	// ChoreIDs are the steps in order. A step stands for every task with the
	// same name, so each child's copy of a task is the same step.
	ChoreIDs  []int         `json:"choreIds" gorm:"-"`
	Steps     []RoutineStep `json:"-" gorm:"foreignKey:RoutineID"`
	CreatedBy int           `json:"createdBy" gorm:"column:created_by"`
	CreatedAt time.Time     `json:"createdAt" gorm:"column:created_at"`
	UpdatedAt time.Time     `json:"updatedAt" gorm:"column:updated_at"`
}

func (Routine) TableName() string { return "routines" }

// RoutineStep is one task of a routine, at its place.
type RoutineStep struct {
	ID        int `gorm:"primaryKey"`
	RoutineID int `gorm:"column:routine_id;index;not null"`
	Position  int `gorm:"column:position;not null"`
	ChoreID   int `gorm:"column:chore_id;not null"`
}

func (RoutineStep) TableName() string { return "routine_steps" }

// RoutineWin records that a member finished a routine on a day, so the bonus
// is paid once.
type RoutineWin struct {
	RoutineID int    `gorm:"primaryKey;autoIncrement:false"`
	UserID    int    `gorm:"primaryKey;autoIncrement:false"`
	Day       string `gorm:"primaryKey;size:10"`
}

func (RoutineWin) TableName() string { return "routine_wins" }

// RoutineProgress is where a member stands in a routine today. Total counts
// the steps that are theirs today: steps without a task of theirs due today,
// or done today, are left out.
type RoutineProgress struct {
	UserID int `json:"userId"`
	// Current is the task of the step to do now, nil when nothing is left.
	Current *int `json:"current"`
	// Step is the place of the current step, from 1, among Total.
	Step     int  `json:"step"`
	Done     int  `json:"done"`
	Total    int  `json:"total"`
	Finished bool `json:"finished"`
}

// RoutineView is a routine with every task it covers and each member's
// progress today.
type RoutineView struct {
	Routine
	// TaskIDs are the tasks of every step, each child's copy included.
	TaskIDs []int             `json:"taskIds"`
	Members []RoutineProgress `json:"members"`
}

const maxRoutineSteps = 20

var (
	ErrRoutineEmpty     = errors.New("a routine needs at least one task")
	ErrRoutineTooLong   = errors.New("a routine has too many tasks")
	ErrRoutineTaskTwice = errors.New("a task is twice in the routine")
	ErrRoutineTaskTaken = errors.New("a task is already in another routine")
	ErrRoutineTask      = errors.New("a task of the routine is not in the family")
)

// Routines returns a family's routines with their steps, oldest first.
func Routines(db *gorm.DB, familyID int) ([]Routine, error) {
	var routines []Routine
	err := db.Where("family_id = ?", familyID).
		Preload("Steps", func(db *gorm.DB) *gorm.DB { return db.Order("position") }).
		Order("id").Find(&routines).Error
	for i := range routines {
		routines[i].ChoreIDs = []int{}
		for _, step := range routines[i].Steps {
			routines[i].ChoreIDs = append(routines[i].ChoreIDs, step.ChoreID)
		}
	}
	return routines, err
}

// stepTasks returns, for each step, the family's tasks with the step's name.
func stepTasks(db *gorm.DB, familyID int, choreIDs []int) (map[int][]int, error) {
	tasks := map[int][]int{}
	for _, choreID := range choreIDs {
		if _, ok := tasks[choreID]; ok {
			continue
		}
		ids, err := SameTaskIDs(db, familyID, choreID)
		if err != nil {
			return nil, err
		}
		tasks[choreID] = ids
	}
	return tasks, nil
}

// SaveRoutine creates the routine, or replaces it when it has an ID, after
// checking its tasks: in the family, each once, and in no other routine.
func SaveRoutine(db *gorm.DB, routine *Routine) error {
	if len(routine.ChoreIDs) == 0 {
		return ErrRoutineEmpty
	}
	if len(routine.ChoreIDs) > maxRoutineSteps {
		return ErrRoutineTooLong
	}
	return db.Transaction(func(tx *gorm.DB) error {
		tasks, err := stepTasks(tx, routine.FamilyID, routine.ChoreIDs)
		if err != nil {
			return err
		}
		mine := map[int]bool{}
		for _, choreID := range routine.ChoreIDs {
			if len(tasks[choreID]) == 0 {
				return ErrRoutineTask
			}
			for _, id := range tasks[choreID] {
				if mine[id] {
					return ErrRoutineTaskTwice
				}
				mine[id] = true
			}
		}
		others, err := Routines(tx, routine.FamilyID)
		if err != nil {
			return err
		}
		for _, other := range others {
			if other.ID == routine.ID {
				continue
			}
			theirs, err := stepTasks(tx, routine.FamilyID, other.ChoreIDs)
			if err != nil {
				return err
			}
			for _, ids := range theirs {
				for _, id := range ids {
					if mine[id] {
						return ErrRoutineTaskTaken
					}
				}
			}
		}
		if routine.ID == 0 {
			if err := tx.Omit("Steps").Create(routine).Error; err != nil {
				return err
			}
		} else {
			if err := tx.Model(&Routine{}).Where("id = ? AND family_id = ?", routine.ID, routine.FamilyID).
				Updates(map[string]any{"name": routine.Name, "bonus": routine.Bonus, "updated_at": time.Now().UTC()}).Error; err != nil {
				return err
			}
			if err := tx.Where("routine_id = ?", routine.ID).Delete(&RoutineStep{}).Error; err != nil {
				return err
			}
		}
		routine.Steps = nil
		for i, choreID := range routine.ChoreIDs {
			routine.Steps = append(routine.Steps, RoutineStep{RoutineID: routine.ID, Position: i, ChoreID: choreID})
		}
		return tx.Create(&routine.Steps).Error
	})
}

// DeleteRoutine removes a routine; its tasks stay.
func DeleteRoutine(db *gorm.DB, familyID, routineID int) error {
	return db.Transaction(func(tx *gorm.DB) error {
		result := tx.Where("id = ? AND family_id = ?", routineID, familyID).Delete(&Routine{})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		if err := tx.Where("routine_id = ?", routineID).Delete(&RoutineStep{}).Error; err != nil {
			return err
		}
		return tx.Where("routine_id = ?", routineID).Delete(&RoutineWin{}).Error
	})
}

// membersNow are who a task is for now: its assignee, or all of its
// assignees for a task everyone has at once.
func membersNow(chore *chModel.Chore) []int {
	if chore.AssignStrategy == chModel.AssignmentStrategyTogether {
		ids := []int{}
		for _, assignee := range chore.Assignees {
			ids = append(ids, assignee.UserID)
		}
		return ids
	}
	if chore.AssignedTo != nil {
		return []int{*chore.AssignedTo}
	}
	return nil
}

// routineDay is what the routines need to know about a family's day.
type routineDay struct {
	chores map[int]*chModel.Chore
	// doneBy holds, per member, the tasks they completed today.
	doneBy map[int]map[int]bool
	away   map[int]bool
	end    time.Time
}

func loadRoutineDay(db *gorm.DB, familyID int, taskIDs []int, now time.Time) (*routineDay, error) {
	loc := zone.Of(familyID)
	day := &routineDay{chores: map[int]*chModel.Chore{}, doneBy: map[int]map[int]bool{}, end: endOfDay(now, loc)}
	if len(taskIDs) == 0 {
		return day, nil
	}
	var chores []*chModel.Chore
	if err := db.Preload("Assignees").Where("id IN ? AND is_active = ?", taskIDs, true).Find(&chores).Error; err != nil {
		return nil, err
	}
	for _, chore := range chores {
		day.chores[chore.ID] = chore
	}
	var done []chModel.ChoreHistory
	start := day.end.Add(-24*time.Hour + time.Second)
	if err := db.Select("chore_id", "completed_by").
		Where("chore_id IN ? AND status = ? AND performed_at >= ?", taskIDs, chModel.ChoreHistoryStatusCompleted, start).
		Find(&done).Error; err != nil {
		return nil, err
	}
	for _, row := range done {
		if day.doneBy[row.CompletedBy] == nil {
			day.doneBy[row.CompletedBy] = map[int]bool{}
		}
		day.doneBy[row.CompletedBy][row.ChoreID] = true
	}
	away, err := AwayMembers(db, familyID)
	day.away = away
	return day, err
}

// isFor tells whether a task is one of the member's: a parent who does a
// child's step does not go through the routine.
func isFor(chore *chModel.Chore, userID int) bool {
	if chore == nil {
		return false
	}
	if chore.AssignedTo != nil && *chore.AssignedTo == userID {
		return true
	}
	for _, assignee := range chore.Assignees {
		if assignee.UserID == userID {
			return true
		}
	}
	return false
}

// progressOf walks a routine's steps for one member: a step is done when
// they completed one of their tasks of it today, to do when one of its tasks is theirs
// and due by tonight, and left out otherwise.
func (day *routineDay) progressOf(userID int, steps [][]int) RoutineProgress {
	progress := RoutineProgress{UserID: userID}
	for _, ids := range steps {
		done := false
		var todo *int
		for _, id := range ids {
			chore := day.chores[id]
			if day.doneBy[userID][id] && isFor(chore, userID) {
				done = true
				break
			}
			if todo == nil && chore != nil && chore.NextDueDate != nil && !chore.NextDueDate.After(day.end) &&
				slices.Contains(membersNow(chore), userID) && !Paused(chore, day.away) {
				todo = &chore.ID
			}
		}
		switch {
		case done:
			progress.Done++
			progress.Total++
		case todo != nil:
			progress.Total++
			if progress.Current == nil {
				progress.Current = todo
				progress.Step = progress.Total
			}
		}
	}
	progress.Finished = progress.Total > 0 && progress.Done == progress.Total
	return progress
}

// RoutineViews returns the family's routines with the given members'
// progress today.
func RoutineViews(db *gorm.DB, familyID int, userIDs []int, now time.Time) ([]RoutineView, error) {
	routines, err := Routines(db, familyID)
	if err != nil || len(routines) == 0 {
		return []RoutineView{}, err
	}
	steps := make([][][]int, len(routines))
	all := []int{}
	for i, routine := range routines {
		tasks, err := stepTasks(db, familyID, routine.ChoreIDs)
		if err != nil {
			return nil, err
		}
		for _, choreID := range routine.ChoreIDs {
			steps[i] = append(steps[i], tasks[choreID])
			all = append(all, tasks[choreID]...)
		}
	}
	day, err := loadRoutineDay(db, familyID, all, now)
	if err != nil {
		return nil, err
	}
	views := make([]RoutineView, 0, len(routines))
	for i, routine := range routines {
		view := RoutineView{Routine: routine, TaskIDs: []int{}, Members: []RoutineProgress{}}
		for _, ids := range steps[i] {
			view.TaskIDs = append(view.TaskIDs, ids...)
		}
		for _, userID := range userIDs {
			if progress := day.progressOf(userID, steps[i]); progress.Total > 0 {
				view.Members = append(view.Members, progress)
			}
		}
		views = append(views, view)
	}
	return views, nil
}

// awardRoutines pays the bonus of each routine the member finished today,
// once a day.
func awardRoutines(tx *gorm.DB, familyID, userID int, performedAt, now time.Time) error {
	loc := zone.Of(familyID)
	if dayKey(performedAt, loc) != dayKey(now, loc) {
		return nil
	}
	views, err := RoutineViews(tx, familyID, []int{userID}, now)
	if err != nil {
		return err
	}
	for _, view := range views {
		if view.Bonus <= 0 || len(view.Members) == 0 || !view.Members[0].Finished {
			continue
		}
		result := tx.Clauses(clause.OnConflict{DoNothing: true}).
			Create(&RoutineWin{RoutineID: view.ID, UserID: userID, Day: dayKey(now, loc)})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			continue
		}
		if _, err := giveBonus(tx, familyID, userID, view.Bonus, "Routine : "+view.Name); err != nil {
			return err
		}
	}
	return nil
}
