package games

import (
	"context"
	"time"

	fModel "github.com/nico87lbs/hopla/internal/family/model"
	"github.com/nico87lbs/hopla/logging"
	"go.uber.org/fx"
	"gorm.io/gorm"
)

// liveRoutineOccurrence reads a running occurrence, without writing anything.
func liveRoutineOccurrence(db *gorm.DB, occurrenceID int) (*RoutineOccurrence, error) {
	var run RoutineOccurrence
	if err := db.Preload("Items", func(q *gorm.DB) *gorm.DB { return q.Order("position") }).
		Preload("Dependencies").First(&run, occurrenceID).Error; err != nil {
		return nil, err
	}
	return &run, applyRoutineOccurrenceAvailability(db, &run)
}

// OpenRoutineOccurrences starts the occurrences of the routines that have
// something to do for each member, and closes the ones that ran out. It is
// what lets a parent see and skip a step before it is done.
func OpenRoutineOccurrences(db *gorm.DB, now time.Time) error {
	var families []int
	if err := db.Model(&Routine{}).Distinct("family_id").Pluck("family_id", &families).Error; err != nil {
		return err
	}
	for _, familyID := range families {
		var members []fModel.UserFamily
		if err := db.Where("family_id = ? AND is_active = ?", familyID, true).Find(&members).Error; err != nil {
			return err
		}
		userIDs := make([]int, 0, len(members))
		for _, member := range members {
			userIDs = append(userIDs, member.UserID)
		}
		if _, err := routineViews(db, familyID, userIDs, now, true); err != nil {
			return err
		}
	}
	return nil
}

// RunRoutineOccurrences opens the routines' occurrences every minute while
// the server runs.
func RunRoutineOccurrences(lc fx.Lifecycle, db *gorm.DB) {
	ctx, cancel := context.WithCancel(context.Background())
	lc.Append(fx.Hook{
		OnStart: func(context.Context) error {
			go func() {
				ticker := time.NewTicker(time.Minute)
				defer ticker.Stop()
				for {
					if err := OpenRoutineOccurrences(db, time.Now().UTC()); err != nil {
						logging.FromContext(ctx).Errorw("Failed to open the routine occurrences", "error", err)
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
		OnStop: func(context.Context) error {
			cancel()
			return nil
		},
	})
}
