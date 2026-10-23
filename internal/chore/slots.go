package chore

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
)

// A task can be done at several times of the day, its slots: brushing teeth
// in the morning, at noon and in the evening. Each slot is ticked on its own,
// earns the task's points and, when the task needs approval, waits for a
// parent on its own. A slot opens an hour before its time, or halfway from
// the previous slot when they are closer, and stays open until the next one
// opens; the last one stays open until midnight. A slot closed without being
// done is missed, and a parent can still catch it up until midnight.

const (
	maxSlots     = 6
	maxSlotName  = 30
	slotOpenLead = time.Hour
)

var (
	errNoOpenSlot   = errors.New("no slot is open now")
	errSlotTaken    = errors.New("this slot is already done or waiting for a parent")
	errSlotNotFound = errors.New("no such slot today")
)

// parseSlotTime reads a slot's "15:04" time of day.
func parseSlotTime(value string) (hour, minute int, err error) {
	t, err := time.Parse("15:04", strings.TrimSpace(value))
	if err != nil {
		return 0, 0, fmt.Errorf("invalid slot time %q", value)
	}
	return t.Hour(), t.Minute(), nil
}

// normalizeSlots checks a task's slots and sorts them by time. Slots are for
// tasks done every day or on some days of the week.
func normalizeSlots(frequencyType chModel.FrequencyType, metadata *chModel.FrequencyMetadata) error {
	if metadata == nil || len(metadata.Slots) == 0 {
		return nil
	}
	if frequencyType != chModel.FrequencyTypeDaily && frequencyType != chModel.FrequencyTypeDayOfTheWeek {
		// Slots only make sense every day or on days of the week: switching
		// the repeat to anything else drops them.
		metadata.Slots = nil
		return nil
	}
	if len(metadata.Slots) > maxSlots {
		return fmt.Errorf("a task has at most %d slots", maxSlots)
	}
	seen := map[string]bool{}
	for i := range metadata.Slots {
		slot := &metadata.Slots[i]
		hour, minute, err := parseSlotTime(slot.Time)
		if err != nil {
			return err
		}
		slot.Time = fmt.Sprintf("%02d:%02d", hour, minute)
		if seen[slot.Time] {
			return fmt.Errorf("two slots at %s", slot.Time)
		}
		seen[slot.Time] = true
		slot.Name = strings.TrimSpace(slot.Name)
		if len([]rune(slot.Name)) > maxSlotName {
			slot.Name = string([]rune(slot.Name)[:maxSlotName])
		}
	}
	sort.SliceStable(metadata.Slots, func(a, b int) bool { return metadata.Slots[a].Time < metadata.Slots[b].Time })
	return nil
}

// slotRunsOn reports whether the task's slots run on the given local day.
func slotRunsOn(chore *chModel.Chore, day time.Time) bool {
	switch chore.FrequencyType {
	case chModel.FrequencyTypeDaily:
		return true
	case chModel.FrequencyTypeDayOfTheWeek:
		weekday := strings.ToLower(day.Weekday().String())
		for _, d := range chore.FrequencyMetadataV2.Days {
			if d != nil && strings.ToLower(*d) == weekday {
				return true
			}
		}
	}
	return false
}

// startOfDay returns local midnight of the day t falls on.
func startOfDay(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
}

// slotWindows returns the task's slots on the day starting at the given local
// midnight, with when each one opens and closes, or nothing on a day off.
func slotWindows(chore *chModel.Chore, day time.Time) []chModel.SlotStatus {
	if !chore.HasSlots() || !slotRunsOn(chore, day) {
		return nil
	}
	next := day.AddDate(0, 0, 1)
	windows := make([]chModel.SlotStatus, 0, len(chore.FrequencyMetadataV2.Slots))
	for i, slot := range chore.FrequencyMetadataV2.Slots {
		hour, minute, err := parseSlotTime(slot.Time)
		if err != nil {
			continue
		}
		at := time.Date(day.Year(), day.Month(), day.Day(), hour, minute, 0, 0, day.Location())
		opens := at.Add(-slotOpenLead)
		if len(windows) == 0 {
			if opens.Before(day) {
				opens = day
			}
		} else if previous := windows[len(windows)-1].At; opens.Before(previous.Add(at.Sub(previous) / 2)) {
			opens = previous.Add(at.Sub(previous) / 2)
		}
		windows = append(windows, chModel.SlotStatus{Index: i, Name: slot.Name, Time: slot.Time, At: at, OpensAt: opens, ClosesAt: next})
	}
	for i := 0; i+1 < len(windows); i++ {
		windows[i].ClosesAt = windows[i+1].OpensAt
	}
	return windows
}

// slotStatuses returns today's slots of the task with their state, from its
// slot history of the last days.
func slotStatuses(ctx context.Context, chore *chModel.Chore, history []*chModel.ChoreHistory, now time.Time) []chModel.SlotStatus {
	loc := choreLocation(ctx, chore)
	day := startOfDay(now.In(loc))
	statuses := slotWindows(chore, day)
	for i := range statuses {
		status := &statuses[i]
		if entry := slotEntry(history, status.Index, day); entry != nil {
			id, by := entry.ID, entry.CompletedBy
			status.HistoryID, status.CompletedBy = &id, &by
			if entry.Status == chModel.ChoreHistoryStatusPendingApproval {
				status.State = chModel.SlotPending
			} else {
				status.State = chModel.SlotDone
			}
			continue
		}
		switch {
		case now.Before(status.OpensAt):
			status.State = chModel.SlotUpcoming
		case now.Before(status.ClosesAt):
			status.State = chModel.SlotOpen
		default:
			status.State = chModel.SlotMissed
		}
	}
	return statuses
}

// slotEntry returns the newest completion of a slot on the given day, done
// or waiting for a parent; a rejected one leaves the slot to do again.
func slotEntry(history []*chModel.ChoreHistory, index int, day time.Time) *chModel.ChoreHistory {
	var found *chModel.ChoreHistory
	next := day.AddDate(0, 0, 1)
	for _, entry := range history {
		if entry.Slot == nil || *entry.Slot != index || entry.DueDate == nil {
			continue
		}
		if entry.Status != chModel.ChoreHistoryStatusCompleted && entry.Status != chModel.ChoreHistoryStatusPendingApproval {
			continue
		}
		if entry.DueDate.Before(day) || !entry.DueDate.Before(next) {
			continue
		}
		if found == nil || entry.ID > found.ID {
			found = entry
		}
	}
	return found
}

// nextSlotDue returns the task's next due date: the time of today's first
// slot still to do, open or upcoming, else of the first slot on the next day
// it runs.
func nextSlotDue(ctx context.Context, chore *chModel.Chore, statuses []chModel.SlotStatus, now time.Time) *time.Time {
	for _, status := range statuses {
		if status.State == chModel.SlotOpen || status.State == chModel.SlotUpcoming {
			at := status.At.UTC()
			return &at
		}
	}
	day := startOfDay(now.In(choreLocation(ctx, chore)))
	for i := 1; i <= 8; i++ {
		if windows := slotWindows(chore, day.AddDate(0, 0, i)); len(windows) > 0 {
			at := windows[0].At.UTC()
			return &at
		}
	}
	return nil
}

// firstSlotAfterDay returns the first slot on the days after the one t falls
// on: skipping a task with slots skips the rest of its day.
func firstSlotAfterDay(ctx context.Context, chore *chModel.Chore, t time.Time) *time.Time {
	day := startOfDay(t.In(choreLocation(ctx, chore)))
	for i := 1; i <= 8; i++ {
		if windows := slotWindows(chore, day.AddDate(0, 0, i)); len(windows) > 0 {
			at := windows[0].At.UTC()
			return &at
		}
	}
	return nil
}

// findSlot returns today's slot with the given index.
func findSlot(statuses []chModel.SlotStatus, index int) (*chModel.SlotStatus, error) {
	for i := range statuses {
		if statuses[i].Index == index {
			return &statuses[i], nil
		}
	}
	return nil, errSlotNotFound
}

// openSlot returns the slot that can be ticked now.
func openSlot(statuses []chModel.SlotStatus, now time.Time) (*chModel.SlotStatus, error) {
	for i := range statuses {
		status := &statuses[i]
		if now.Before(status.OpensAt) || !now.Before(status.ClosesAt) {
			continue
		}
		if status.State == chModel.SlotOpen {
			return status, nil
		}
		return nil, errSlotTaken
	}
	return nil, errNoOpenSlot
}
