package games

import (
	"errors"
	"strings"
	"time"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	"github.com/nico87lbs/hopla/internal/zone"
	"gorm.io/gorm"
)

// routineUpcomingLead is how long before it opens a routine with hours shows
// as coming, like a moment.
const routineUpcomingLead = time.Hour

// Where a routine with hours stands today.
const (
	RoutineWindowClosed   = "closed"
	RoutineWindowUpcoming = "upcoming"
	RoutineWindowOpen     = "open"
	RoutineWindowOver     = "over"
)

// hasHours tells whether the routine opens and closes at set hours.
func (r Routine) hasHours() bool {
	return r.StartsAt != "" && r.EndsAt != ""
}

// checkRoutineHours checks and tidies a routine's hours: both or none, and
// the end after the start.
func checkRoutineHours(routine *Routine) error {
	routine.StartsAt = strings.TrimSpace(routine.StartsAt)
	routine.EndsAt = strings.TrimSpace(routine.EndsAt)
	if routine.StartsAt == "" && routine.EndsAt == "" {
		return nil
	}
	start, err := time.Parse("15:04", routine.StartsAt)
	if err != nil {
		return ErrRoutineHours
	}
	end, err := time.Parse("15:04", routine.EndsAt)
	if err != nil || !end.After(start) {
		return ErrRoutineHours
	}
	routine.StartsAt, routine.EndsAt = start.Format("15:04"), end.Format("15:04")
	return nil
}

// routineHoursOn returns when the routine opens and closes on the day now
// falls on, in the family's time zone.
func routineHoursOn(routine Routine, now time.Time) (opens, closes time.Time, ok bool) {
	if !routine.hasHours() {
		return time.Time{}, time.Time{}, false
	}
	loc := zone.Of(routine.FamilyID)
	local := now.In(loc)
	at := func(value string) (time.Time, bool) {
		hour, minute, err := chModel.ParseSlotTime(value)
		if err != nil {
			return time.Time{}, false
		}
		return time.Date(local.Year(), local.Month(), local.Day(), hour, minute, 0, 0, loc), true
	}
	opens, okOpen := at(routine.StartsAt)
	closes, okClose := at(routine.EndsAt)
	return opens, closes, okOpen && okClose && closes.After(opens)
}

// routineWindow tells where a routine with hours stands at now, or "" for a
// routine without hours.
func routineWindow(routine Routine, now time.Time) string {
	opens, closes, ok := routineHoursOn(routine, now)
	switch {
	case !ok:
		return ""
	case !now.Before(closes):
		return RoutineWindowOver
	case !now.Before(opens):
		return RoutineWindowOpen
	case !now.Before(opens.Add(-routineUpcomingLead)):
		return RoutineWindowUpcoming
	}
	return RoutineWindowClosed
}

// slotToday returns the window of a task's slot on the day now falls on, if
// the slot runs that day.
func slotToday(chore *chModel.Chore, slotID string, now time.Time) (chModel.SlotStatus, bool) {
	if chore == nil || slotID == "" {
		return chModel.SlotStatus{}, false
	}
	loc := zone.Of(chore.FamilyID)
	local := now.In(loc)
	day := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, loc)
	for _, window := range chore.SlotWindows(day) {
		if window.SlotID == slotID {
			return window, true
		}
	}
	return chModel.SlotStatus{}, false
}

// closedRoutineRunsToday returns the member's runs of routines with hours
// that closed earlier on the day of performedAt without being finished.
func closedRoutineRunsToday(tx *gorm.DB, familyID, userID int, performedAt time.Time) ([]RoutineOccurrence, error) {
	loc := zone.Of(familyID)
	local := performedAt.In(loc)
	dayStart := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, loc)
	var runs []RoutineOccurrence
	if err := tx.Where("family_id = ? AND user_id = ? AND status = ? AND started_at >= ? AND expires_at <= ?",
		familyID, userID, RoutineOccurrenceExpired, dayStart.UTC(), performedAt.UTC()).Find(&runs).Error; err != nil {
		return nil, err
	}
	kept := runs[:0]
	for _, run := range runs {
		var routine Routine
		err := tx.Select("id", "starts_at", "ends_at").Where("id = ?", run.RoutineID).First(&routine).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			continue
		}
		if err != nil {
			return nil, err
		}
		if routine.hasHours() {
			kept = append(kept, run)
		}
	}
	return kept, nil
}

// finishCaughtUpRun closes a run that closed with steps missed, once a parent
// caught every required one up: it is then paid like a finished run.
func finishCaughtUpRun(tx *gorm.DB, run *RoutineOccurrence, now time.Time) error {
	var items []RoutineOccurrenceItem
	if err := tx.Where("occurrence_id = ?", run.ID).Find(&items).Error; err != nil {
		return err
	}
	required := 0
	for _, item := range items {
		if !item.Required || item.Status == RoutineOccurrenceItemNotApplicable {
			continue
		}
		required++
		if item.Status != RoutineOccurrenceItemCompleted && item.Status != RoutineOccurrenceItemSkipped {
			return nil
		}
	}
	if required == 0 {
		return nil
	}
	return tx.Model(&RoutineOccurrence{}).Where("id = ? AND status = ?", run.ID, RoutineOccurrenceExpired).
		Updates(map[string]any{"status": RoutineOccurrenceFinished, "finished_at": now.UTC()}).Error
}
