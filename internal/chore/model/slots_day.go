package model

import (
	"fmt"
	"strings"
	"time"
)

// SlotOpenLead is how long before its time a slot opens when it was not
// given its own lead.
const SlotOpenLead = time.Hour

// ParseSlotTime reads a slot's "15:04" time of day.
func ParseSlotTime(value string) (hour, minute int, err error) {
	t, err := time.Parse("15:04", strings.TrimSpace(value))
	if err != nil {
		return 0, 0, fmt.Errorf("invalid slot time %q", value)
	}
	return t.Hour(), t.Minute(), nil
}

// SlotRunsOn reports whether the task's slots run on the given local day.
func (c *Chore) SlotRunsOn(day time.Time) bool {
	switch c.FrequencyType {
	case FrequencyTypeDaily:
		return true
	case FrequencyTypeDayOfTheWeek:
		weekday := strings.ToLower(day.Weekday().String())
		for _, d := range c.FrequencyMetadataV2.Days {
			if d != nil && strings.ToLower(*d) == weekday {
				return true
			}
		}
	}
	// A task with moments on one day, the day of its passage.
	return IsDatedType(c.FrequencyType, c.FrequencyMetadataV2) &&
		c.FrequencyMetadataV2 != nil && c.FrequencyMetadataV2.Day == day.Format("2006-01-02")
}

// IsDatedType reports whether a rhythm is one whose moments are on one day,
// the day of the current passage.
func IsDatedType(frequencyType FrequencyType, metadata *FrequencyMetadata) bool {
	switch frequencyType {
	case FrequencyTypeOnce, FrequencyTypeNoRepeat, FrequencyTypeWeekly,
		FrequencyTypeMonthly, FrequencyTypeYearly, FrequencyTypeAdaptive,
		FrequencyTypeDayOfTheMonth:
		return true
	case FrequencyTypeInterval:
		return metadata == nil || metadata.Unit == nil || *metadata.Unit != "hours"
	}
	return false
}

// SlotWindows returns the task's slots on the day starting at the given local
// midnight, with when each one opens and closes, or nothing on a day off.
// The states are left empty: they depend on the task's history.
func (c *Chore) SlotWindows(day time.Time) []SlotStatus {
	if !c.HasSlots() || !c.SlotRunsOn(day) {
		return nil
	}
	next := day.AddDate(0, 0, 1)
	windows := make([]SlotStatus, 0, len(c.FrequencyMetadataV2.Slots))
	for i, slot := range c.FrequencyMetadataV2.Slots {
		hour, minute, err := ParseSlotTime(slot.Time)
		if err != nil {
			continue
		}
		at := time.Date(day.Year(), day.Month(), day.Day(), hour, minute, 0, 0, day.Location())
		lead := SlotOpenLead
		if slot.OpensBefore != nil {
			lead = time.Duration(*slot.OpensBefore) * time.Minute
		}
		opens := at.Add(-lead)
		if slot.AllDay {
			opens = day
		}
		if len(windows) == 0 {
			if opens.Before(day) {
				opens = day
			}
		} else if previous := windows[len(windows)-1].At; opens.Before(previous.Add(at.Sub(previous) / 2)) {
			opens = previous.Add(at.Sub(previous) / 2)
		}
		windows = append(windows, SlotStatus{Index: i, SlotID: slot.ID, Name: slot.Name, Time: slot.Time, Until: slot.Until, AllDay: slot.AllDay, At: at, OpensAt: opens, ClosesAt: next})
	}
	for i := range windows {
		if i+1 < len(windows) {
			windows[i].ClosesAt = windows[i+1].OpensAt
		}
		if windows[i].Until == "" {
			continue
		}
		hour, minute, err := ParseSlotTime(windows[i].Until)
		if err != nil {
			continue
		}
		until := time.Date(day.Year(), day.Month(), day.Day(), hour, minute, 0, 0, day.Location())
		windows[i].ClosesAt = until
		// The next slot never opens while this one is still the one to do.
		if i+1 < len(windows) && windows[i+1].OpensAt.Before(until) {
			windows[i+1].OpensAt = until
		}
	}
	return windows
}
