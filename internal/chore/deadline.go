package chore

import (
	"context"
	"time"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	chRepo "github.com/nico87lbs/hopla/internal/chore/repo"
	"github.com/nico87lbs/hopla/internal/games"
	"github.com/nico87lbs/hopla/logging"
	"go.uber.org/fx"
)

// A task can have a deadline: how long after its due time it can still be
// done. Between the two it is late, as any task; once the deadline passes it
// is missed: written so in its history and the family journal, without hops.
// A repeated task then falls due at its next passage, a task done once leaves
// the list. A task waiting for a parent was done in time and is never missed,
// nor a task waiting while its people are away.

// maxMissed bounds the passages written missed at once, for a server left
// off a long time.
const maxMissed = 31

// deadlineMinutes is the deadline a saved task keeps: none where it does not
// apply.
func deadlineMinutes(req ChoreReq) *int {
	if req.DeadlineMinutes == nil || *req.DeadlineMinutes <= 0 ||
		!chModel.DeadlineAllowed(req.FrequencyType, req.FrequencyMetadata) {
		return nil
	}
	return req.DeadlineMinutes
}

// missedPassages returns the passages of a task whose deadline is over at
// now, and its next due date after them: nil for a task done once.
func missedPassages(ctx context.Context, chore *chModel.Chore, now time.Time) ([]time.Time, *time.Time, error) {
	if chore.DeadlineAt() == nil {
		return nil, chore.NextDueDate, nil
	}
	delay := time.Duration(*chore.DeadlineMinutes) * time.Minute
	due := chore.NextDueDate.UTC()
	copy := *chore
	missed := []time.Time{}
	for !due.Add(delay).After(now) {
		if len(missed) == maxMissed {
			// Long gone: start again from today without writing every
			// passage missed.
			copy.NextDueDate = &due
			next, err := nextDueAfterDone(ctx, &copy, now)
			return missed, next, err
		}
		missed = append(missed, due)
		copy.NextDueDate = &due
		next, err := scheduleNextDueDate(ctx, &copy, due)
		if err != nil {
			return nil, nil, err
		}
		if next == nil || !next.After(due) {
			return missed, nil, nil
		}
		due = next.UTC()
	}
	return missed, &due, nil
}

// SettleDeadlines writes missed the tasks whose deadline is over and moves
// them on, then tells the family.
func (h *Handler) SettleDeadlines(ctx context.Context, now time.Time) error {
	chores, err := h.choreRepo.ChoresPastDeadline(ctx, now)
	if err != nil {
		return err
	}
	away := map[int]map[int]bool{}
	for _, chore := range chores {
		if _, ok := away[chore.FamilyID]; !ok {
			members, err := h.choreRepo.AwayMembers(ctx, chore.FamilyID)
			if err != nil {
				return err
			}
			away[chore.FamilyID] = members
		}
		if games.Paused(chore, away[chore.FamilyID]) {
			continue
		}
		missed, next, err := missedPassages(ctx, chore, now)
		if err != nil {
			logging.FromContext(ctx).Errorw("Failed to find the passages missed", "error", err, "choreID", chore.ID)
			continue
		}
		if len(missed) == 0 {
			continue
		}
		version, done, err := h.choreRepo.MissChore(ctx, chore, missed, next)
		if err != nil {
			logging.FromContext(ctx).Errorw("Failed to write a task missed", "error", err, "choreID", chore.ID)
			continue
		}
		if !done || h.realTimeService == nil {
			continue
		}
		chore.NextDueDate, chore.SyncVersion = next, version
		if next == nil {
			chore.IsActive = false
		}
		h.realTimeService.GetEventBroadcaster().BroadcastChoreUpdated(chore, nil,
			map[string]interface{}{"missed": len(missed), "nextDueDate": next, "isActive": chore.IsActive}, nil)
	}
	return nil
}

// slotLookback is how many past days the slots missed are looked for, for a
// server off at midnight.
const slotLookback = 2

// SettleMissedSlots writes missed the slots of the past days nobody did, once
// a parent can no longer catch them up. A slot is not missed by someone away
// that day, nor before the task existed.
func (h *Handler) SettleMissedSlots(ctx context.Context, now time.Time) error {
	chores, err := h.choreRepo.ActiveSlotChores(ctx)
	if err != nil || len(chores) == 0 {
		return err
	}
	ids := make([]int, 0, len(chores))
	for _, chore := range chores {
		ids = append(ids, chore.ID)
	}
	history, err := h.choreRepo.GetSlotHistory(ctx, ids, now.Add(-time.Duration(slotLookback+2)*24*time.Hour), now.Add(time.Hour))
	if err != nil {
		return err
	}
	absences := map[int]map[int]map[string]bool{}
	for _, chore := range chores {
		loc := choreLocation(chore)
		today := startOfDay(now.In(loc))
		away, ok := absences[chore.FamilyID]
		if !ok {
			if away, err = h.choreRepo.AbsenceDays(ctx, chore.FamilyID, today.AddDate(0, 0, -slotLookback), now); err != nil {
				return err
			}
			absences[chore.FamilyID] = away
		}
		var missed []chRepo.MissedSlot
		for back := slotLookback; back >= 1; back-- {
			day := today.AddDate(0, 0, -back)
			key := day.Format("2006-01-02")
			windows := slotWindows(chore, day)
			known := map[string]bool{}
			for _, window := range windows {
				known[window.SlotID] = true
			}
			for _, window := range windows {
				if window.At.Before(chore.CreatedAt) || slotSettled(history[chore.ID], window.Index, window.SlotID, known, day) {
					continue
				}
				who := []int{}
				for _, id := range chRepo.MissedBy(chore) {
					if !away[id][key] {
						who = append(who, id)
					}
				}
				if len(who) == 0 {
					continue
				}
				missed = append(missed, chRepo.MissedSlot{Slot: window.Index, SlotID: window.SlotID, DueDate: window.At.UTC(), ClosedAt: window.ClosesAt.UTC(), Who: who})
			}
		}
		if err := h.choreRepo.RecordMissedSlots(ctx, chore, missed); err != nil {
			logging.FromContext(ctx).Errorw("Failed to write the slots missed", "error", err, "choreID", chore.ID)
			continue
		}
		if isOnceType(chore.FrequencyType) {
			h.finishOnce(ctx, chore, history[chore.ID], today, now)
		}
	}
	return nil
}

// slotSettled reports whether a slot of a day was done, waits for a parent
// or is already written missed.
func slotSettled(history []*chModel.ChoreHistory, index int, slotID string, known map[string]bool, day time.Time) bool {
	next := day.AddDate(0, 0, 1)
	for _, entry := range history {
		if entry.DueDate == nil || entry.DueDate.Before(day) || !entry.DueDate.Before(next) {
			continue
		}
		if !sameSlot(entry, index, slotID, known) {
			continue
		}
		switch entry.Status {
		case chModel.ChoreHistoryStatusCompleted, chModel.ChoreHistoryStatusPendingApproval, chModel.ChoreHistoryStatusMissed:
			return true
		}
	}
	return false
}

// RunDeadlines looks every minute for the tasks whose deadline is over and
// the slots missed, while the server runs.
func RunDeadlines(lc fx.Lifecycle, h *Handler) {
	ctx, cancel := context.WithCancel(context.Background())
	lc.Append(fx.Hook{
		OnStart: func(context.Context) error {
			go func() {
				ticker := time.NewTicker(time.Minute)
				defer ticker.Stop()
				for {
					now := time.Now().UTC()
					if err := h.SettleDeadlines(ctx, now); err != nil {
						logging.FromContext(ctx).Errorw("Failed to settle the deadlines", "error", err)
					}
					if err := h.SettleMissedSlots(ctx, now); err != nil {
						logging.FromContext(ctx).Errorw("Failed to settle the slots missed", "error", err)
					}
					select {
					case <-ctx.Done():
						return
					case <-ticker.C:
					}
				}
			}()
			return nil
		},
		OnStop: func(context.Context) error { cancel(); return nil },
	})
}

// finishOnce archives a one-time task with moments once its day is over, or
// all its moments are done, unless a moment still waits for a parent.
func (h *Handler) finishOnce(ctx context.Context, chore *chModel.Chore, history []*chModel.ChoreHistory, today, now time.Time) {
	day, ok := onceDay(chore)
	if !ok || day.After(today) {
		return
	}
	for _, entry := range history {
		if entry.Status == chModel.ChoreHistoryStatusPendingApproval {
			return
		}
	}
	if day.Equal(today) {
		for _, status := range slotStatuses(ctx, chore, history, now) {
			if status.State != chModel.SlotDone {
				return
			}
		}
	}
	version, err := h.choreRepo.FinishOnceChore(ctx, chore)
	if err != nil {
		logging.FromContext(ctx).Errorw("Failed to archive a task done", "error", err, "choreID", chore.ID)
		return
	}
	chore.NextDueDate, chore.SyncVersion, chore.IsActive = nil, version, false
	if h.realTimeService != nil {
		h.realTimeService.GetEventBroadcaster().BroadcastChoreUpdated(chore, nil,
			map[string]interface{}{"nextDueDate": nil, "isActive": false}, nil)
	}
}
