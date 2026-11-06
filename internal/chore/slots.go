package chore

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	"github.com/nico87lbs/hopla/internal/zone"
)

// A task can be done at several times of the day, its slots: brushing teeth
// in the morning, at noon and in the evening. Each slot is ticked on its own,
// earns the task's points and, when the task needs approval, waits for a
// parent on its own. A slot opens an hour before its time, or as long before
// as it is set to, or halfway from the previous slot when they are closer,
// and stays open until the next one opens; the last one stays open until midnight. A slot can be given its own
// end instead, no later than the next slot's time. A slot closed without
// being done is missed, and a parent can still catch it up until midnight. Slot
// times are read in the family's time zone, like the games' days.

const (
	maxSlots    = 6
	maxSlotName = 30
	// maxOpenLead is the longest a slot can open before its time, in minutes.
	maxOpenLead = 12 * 60
	// allDayTime is the time of a moment all day: it is due at the end of the
	// day, and is open from midnight.
	allDayTime = "23:59"
)

var (
	errNoOpenSlot   = errors.New("no slot is open now")
	errSlotTaken    = errors.New("this slot is already done or waiting for a parent")
	errSlotNotFound = errors.New("no such slot today")
)

// parseSlotTime reads a slot's "15:04" time of day.
func parseSlotTime(value string) (hour, minute int, err error) {
	return chModel.ParseSlotTime(value)
}

// isOnceType reports whether a task is done once, on a day.
func isOnceType(frequencyType chModel.FrequencyType) bool {
	return frequencyType == chModel.FrequencyTypeOnce || frequencyType == chModel.FrequencyTypeNoRepeat
}

// setOnceDay gives a one-time task with slots the day they are on when it was
// not given one: the day of its due date, else today.
func setOnceDay(frequencyType chModel.FrequencyType, metadata *chModel.FrequencyMetadata, due *time.Time, familyID int) {
	if metadata == nil || len(metadata.Slots) == 0 || !isOnceType(frequencyType) || strings.TrimSpace(metadata.Day) != "" {
		return
	}
	at := time.Now().UTC()
	if due != nil {
		at = *due
	}
	metadata.Day = at.In(zone.Of(familyID)).Format("2006-01-02")
}

// onceDay returns local midnight of the day a one-time task's slots are on.
func onceDay(chore *chModel.Chore) (time.Time, bool) {
	if chore.FrequencyMetadataV2 == nil || chore.FrequencyMetadataV2.Day == "" {
		return time.Time{}, false
	}
	day, err := time.ParseInLocation("2006-01-02", chore.FrequencyMetadataV2.Day, choreLocation(chore))
	return day, err == nil
}

// normalizeSlots checks a task's slots and sorts them by time. Slots are for
// tasks done every day, on some days of the week or once, on a day.
func normalizeSlots(frequencyType chModel.FrequencyType, metadata *chModel.FrequencyMetadata) error {
	if metadata == nil {
		return nil
	}
	if len(metadata.Slots) == 0 || !isOnceType(frequencyType) {
		metadata.Day = ""
	}
	if len(metadata.Slots) == 0 {
		return nil
	}
	if frequencyType != chModel.FrequencyTypeDaily && frequencyType != chModel.FrequencyTypeDayOfTheWeek && !isOnceType(frequencyType) {
		// Slots only make sense every day, on days of the week or once:
		// switching the repeat to anything else drops them.
		metadata.Slots = nil
		return nil
	}
	if isOnceType(frequencyType) {
		metadata.Day = strings.TrimSpace(metadata.Day)
		if _, err := time.Parse("2006-01-02", metadata.Day); err != nil {
			return fmt.Errorf("invalid day %q", metadata.Day)
		}
	}
	if len(metadata.Slots) > maxSlots {
		return fmt.Errorf("a task has at most %d slots", maxSlots)
	}
	seen := map[string]bool{}
	seenIDs := map[string]bool{}
	for i := range metadata.Slots {
		slot := &metadata.Slots[i]
		if slot.ID == "" || seenIDs[slot.ID] {
			id, err := chModel.NewSlotID()
			if err != nil {
				return err
			}
			slot.ID = id
		}
		seenIDs[slot.ID] = true
		if slot.AllDay {
			// A moment with no hour is the whole day, and the only one.
			if len(metadata.Slots) > 1 {
				return errors.New("a task with a moment all day has no other moment")
			}
			slot.Time, slot.Until, slot.OpensBefore = allDayTime, "", nil
		}
		hour, minute, err := parseSlotTime(slot.Time)
		if err != nil {
			return err
		}
		slot.Time = fmt.Sprintf("%02d:%02d", hour, minute)
		if seen[slot.Time] {
			return fmt.Errorf("two slots at %s", slot.Time)
		}
		seen[slot.Time] = true
		if slot.Until = strings.TrimSpace(slot.Until); slot.Until != "" {
			untilHour, untilMinute, err := parseSlotTime(slot.Until)
			if err != nil {
				return err
			}
			slot.Until = fmt.Sprintf("%02d:%02d", untilHour, untilMinute)
			if slot.Until <= slot.Time {
				return fmt.Errorf("the slot at %s must end after it", slot.Time)
			}
		}
		if slot.OpensBefore != nil && (*slot.OpensBefore < 0 || *slot.OpensBefore > maxOpenLead) {
			return fmt.Errorf("the slot at %s opens at most %d minutes before", slot.Time, maxOpenLead)
		}
		slot.Name = strings.TrimSpace(slot.Name)
		if len([]rune(slot.Name)) > maxSlotName {
			slot.Name = string([]rune(slot.Name)[:maxSlotName])
		}
	}
	sort.SliceStable(metadata.Slots, func(a, b int) bool { return metadata.Slots[a].Time < metadata.Slots[b].Time })
	for i := 0; i+1 < len(metadata.Slots); i++ {
		if until := metadata.Slots[i].Until; until != "" && until > metadata.Slots[i+1].Time {
			return fmt.Errorf("the slot at %s must end by the next one, at %s", metadata.Slots[i].Time, metadata.Slots[i+1].Time)
		}
	}
	return nil
}

// shareSlotIDs gives the slots a task is saved with the identifiers of the
// same slots on its other copies (one copy per child), so a routine or a
// history entry means the same slot on every copy.
func (h *Handler) shareSlotIDs(ctx context.Context, familyID int, name string, exceptID int, metadata *chModel.FrequencyMetadata) error {
	if metadata == nil || len(metadata.Slots) == 0 {
		return nil
	}
	siblings, err := h.choreRepo.SiblingSlots(ctx, familyID, name, exceptID)
	if err != nil {
		return err
	}
	chModel.AdoptSlotIDs(metadata.Slots, siblings)
	return nil
}

// slotRunsOn reports whether the task's slots run on the given local day.
func slotRunsOn(chore *chModel.Chore, day time.Time) bool {
	return chore.SlotRunsOn(day)
}

// startOfDay returns local midnight of the day t falls on.
func startOfDay(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
}

// slotWindows returns the task's slots on the day starting at the given local
// midnight, with when each one opens and closes, or nothing on a day off.
func slotWindows(chore *chModel.Chore, day time.Time) []chModel.SlotStatus {
	return chore.SlotWindows(day)
}

// slotStatuses returns today's slots of the task with their state, from its
// slot history of the last days.
func slotStatuses(ctx context.Context, chore *chModel.Chore, history []*chModel.ChoreHistory, now time.Time) []chModel.SlotStatus {
	loc := choreLocation(chore)
	day := startOfDay(now.In(loc))
	statuses := slotWindows(chore, day)
	known := map[string]bool{}
	for _, status := range statuses {
		known[status.SlotID] = true
	}
	for i := range statuses {
		status := &statuses[i]
		if entry := slotEntry(history, status.Index, status.SlotID, known, day); entry != nil {
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

// sameSlot reports whether a history entry is about the slot: by identifier,
// or by number when the entry has none or an identifier the task lost.
func sameSlot(entry *chModel.ChoreHistory, index int, slotID string, known map[string]bool) bool {
	if entry.SlotID != nil && *entry.SlotID != "" && (*entry.SlotID == slotID || known[*entry.SlotID]) {
		return *entry.SlotID == slotID
	}
	return entry.Slot != nil && *entry.Slot == index
}

// slotEntry returns the newest completion of a slot on the given day, done
// or waiting for a parent; a rejected one leaves the slot to do again.
//
// An entry written under an identifier the task no longer has is found again
// by its number, so a slot already done does not come back to do.
func slotEntry(history []*chModel.ChoreHistory, index int, slotID string, known map[string]bool, day time.Time) *chModel.ChoreHistory {
	var found *chModel.ChoreHistory
	next := day.AddDate(0, 0, 1)
	for _, entry := range history {
		if entry.DueDate == nil {
			continue
		}
		if !sameSlot(entry, index, slotID, known) {
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
	day := startOfDay(now.In(choreLocation(chore)))
	if isOnceType(chore.FrequencyType) {
		// A one-time task has no next day but its own, if still to come.
		if when, ok := onceDay(chore); ok && when.After(day) {
			if windows := slotWindows(chore, when); len(windows) > 0 {
				at := windows[0].At.UTC()
				return &at
			}
		}
		return nil
	}
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
	if isOnceType(chore.FrequencyType) {
		return nil
	}
	day := startOfDay(t.In(choreLocation(chore)))
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
