package chore

import (
	"context"
	"time"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
)

// Occurrence is one time a task falls due: a slot of the day, or a passage of
// a repeated task.
type Occurrence struct {
	At time.Time
	// Ends is when it stops being the time to do it: the next slot for a
	// slot, nothing for the others.
	Ends     *time.Time
	Slot     *int
	SlotName string
}

// maxOccurrences bounds the passages of one task, for a task repeated every
// hour.
const maxOccurrences = 200

// Occurrences lists when a task falls due from its next due date until to,
// skipping those before from, at most limit of them. A task whose next
// passage depends on when it is done (rolling, adaptive) or that does not
// repeat has only its next due date.
func Occurrences(ctx context.Context, chore *chModel.Chore, from, to time.Time, limit int) []Occurrence {
	if limit <= 0 || limit > maxOccurrences {
		limit = maxOccurrences
	}
	if chore.HasSlots() {
		return slotOccurrences(chore, from, to, limit)
	}
	if chore.NextDueDate == nil {
		return nil
	}
	first := chore.NextDueDate.UTC()
	out := []Occurrence{}
	if !first.After(to) {
		out = append(out, Occurrence{At: first})
	}
	switch chore.FrequencyType {
	case chModel.FrequencyTypeOnce, chModel.FrequencyTypeNoRepeat, chModel.FrequencyTypeTrigger,
		chModel.FrequencyTypeAlways, chModel.FrequencyTypeAdaptive:
		return out
	}
	if chore.IsRolling {
		return out
	}
	copy := *chore
	at := first
	for len(out) < limit {
		copy.NextDueDate = &at
		next, err := scheduleNextDueDate(ctx, &copy, at)
		if err != nil || next == nil || !next.After(at) || next.After(to) {
			break
		}
		at = next.UTC()
		if !at.Before(from) {
			out = append(out, Occurrence{At: at})
		}
	}
	return out
}

// slotOccurrences lists the slots of a task day after day.
func slotOccurrences(chore *chModel.Chore, from, to time.Time, limit int) []Occurrence {
	loc := choreLocation(chore)
	out := []Occurrence{}
	for day := startOfDay(from.In(loc)); !day.After(to) && len(out) < limit; day = day.AddDate(0, 0, 1) {
		windows := slotWindows(chore, day)
		for i, w := range windows {
			if w.At.Before(from) || w.At.After(to) || len(out) >= limit {
				continue
			}
			index := w.Index
			o := Occurrence{At: w.At.UTC(), Slot: &index, SlotName: w.Name}
			if i+1 < len(windows) {
				ends := windows[i+1].At.UTC()
				o.Ends = &ends
			}
			out = append(out, o)
		}
	}
	return out
}
