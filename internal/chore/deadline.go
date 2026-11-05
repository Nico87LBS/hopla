package chore

import (
	"context"
	"time"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
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

// RunDeadlines looks every minute for the tasks whose deadline is over,
// while the server runs.
func RunDeadlines(lc fx.Lifecycle, h *Handler) {
	ctx, cancel := context.WithCancel(context.Background())
	lc.Append(fx.Hook{
		OnStart: func(context.Context) error {
			go func() {
				ticker := time.NewTicker(time.Minute)
				defer ticker.Stop()
				for {
					if err := h.SettleDeadlines(ctx, time.Now().UTC()); err != nil {
						logging.FromContext(ctx).Errorw("Failed to settle the deadlines", "error", err)
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
