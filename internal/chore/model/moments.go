package model

import (
	"fmt"
	"time"
)

// MomentsApply reports whether a task of this rhythm is put on moments by the
// migration: every rhythm with moments, which is all but "Toujours là", "Sur
// signal" and the intervals in hours.
func MomentsApply(frequencyType FrequencyType, metadata *FrequencyMetadata) bool {
	switch frequencyType {
	case FrequencyTypeDaily, FrequencyTypeDayOfTheWeek:
		return true
	}
	return IsDatedType(frequencyType, metadata)
}

// ToMoments gives a task saved before the moments the one moment that does the
// same thing: its time of day, "jusqu'à" from its limit (deadlineMinutes);
// it opens at midnight (the old window, completionWindow, is gone). It returns the task's new metadata and due date, or false when
// the task has no moments to take (already on moments, or no due date to take
// a time from). newID gives the identifier of a moment from its time of day.
//
// A limit that goes past the end of the day is dropped: a moment closes at
// midnight at the latest. A dated task whose day is gone moves to today.
func ToMoments(chore *Chore, loc *time.Location, now time.Time, newID func(clock string) string) (*FrequencyMetadata, *time.Time, bool) {
	if chore.HasSlots() || !MomentsApply(chore.FrequencyType, chore.FrequencyMetadataV2) {
		return nil, nil, false
	}
	metadata := &FrequencyMetadata{}
	if chore.FrequencyMetadataV2 != nil {
		*metadata = *chore.FrequencyMetadataV2
	}
	dated := IsDatedType(chore.FrequencyType, chore.FrequencyMetadataV2)

	var due time.Time
	switch {
	case chore.NextDueDate != nil:
		due = chore.NextDueDate.In(loc)
	case !dated:
		saved, err := time.Parse(time.RFC3339, metadata.Time)
		if err != nil {
			return nil, nil, false
		}
		due = saved.In(loc)
	default:
		return nil, nil, false
	}
	clock := due.Format("15:04")
	minutes := due.Hour()*60 + due.Minute()

	slot := Slot{ID: newID(clock), Time: clock}
	if chore.DeadlineMinutes != nil && *chore.DeadlineMinutes > 0 && minutes+*chore.DeadlineMinutes < 24*60 {
		end := due.Add(time.Duration(*chore.DeadlineMinutes) * time.Minute)
		slot.Until = end.Format("15:04")
	}
	lead := minutes // open from midnight
	if lead > MaxSlotLead {
		lead = MaxSlotLead
	}
	slot.OpensBefore = &lead
	metadata.Slots = []Slot{slot}

	next := chore.NextDueDate
	if dated {
		day := due
		today := dayStart(now.In(loc))
		if dayStart(due).Before(today) {
			day = time.Date(today.Year(), today.Month(), today.Day(), due.Hour(), due.Minute(), 0, 0, loc)
			utc := day.UTC()
			next = &utc
		}
		metadata.Day = day.Format("2006-01-02")
	}
	return metadata, next, true
}

// SlotIDKey names a moment for the identifier it shares across the copies of
// a task made for each child.
func SlotIDKey(familyID int, name, clock string) string {
	return fmt.Sprintf("%d|%s|%s", familyID, name, clock)
}

// MaxSlotLead is the longest a moment can open before its time, in minutes.
const MaxSlotLead = 24 * 60

func dayStart(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
}
