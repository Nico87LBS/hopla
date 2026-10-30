package games

import (
	"errors"
	"fmt"
	"slices"
	"time"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	"github.com/nico87lbs/hopla/internal/zone"
	"gorm.io/gorm"
)

// A flash bonus gives extra points for a task done quickly. A task can carry
// its own (FlashPoints if done by FlashMinutes after its due time, on the due
// day), and a parent can launch one on the spot on any task.

// Flash is a flash bonus a parent launched on a task: Points more to whoever
// does it, or a copy of it with the same name, before EndsAt. Each member
// earns it once.
type Flash struct {
	ID        int       `json:"id" gorm:"primaryKey"`
	FamilyID  int       `json:"-" gorm:"column:family_id;index;not null"`
	ChoreID   int       `json:"choreId" gorm:"column:chore_id;not null"`
	Points    int       `json:"points" gorm:"column:points;not null"`
	StartsAt  time.Time `json:"startsAt" gorm:"column:starts_at;not null"`
	EndsAt    time.Time `json:"endsAt" gorm:"column:ends_at;not null"`
	CreatedBy int       `json:"createdBy" gorm:"column:created_by"`
	CreatedAt time.Time `json:"createdAt" gorm:"column:created_at"`
}

func (Flash) TableName() string { return "flashes" }

// TaskFlashEnd returns when the task's own flash bonus closes for a task due
// at dueAt, and whether it is open at the given time: from the start of the
// due day until FlashMinutes after the due time.
func TaskFlashEnd(chore *chModel.Chore, dueAt *time.Time, at time.Time) (time.Time, bool) {
	if dueAt == nil || chore.FlashPoints == nil || *chore.FlashPoints <= 0 || chore.FlashMinutes == nil || *chore.FlashMinutes <= 0 {
		return time.Time{}, false
	}
	loc := zone.Of(chore.FamilyID)
	local := dueAt.In(loc)
	opens := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, loc)
	ends := dueAt.Add(time.Duration(*chore.FlashMinutes) * time.Minute)
	return ends, !at.Before(opens) && at.Before(ends)
}

// runningFlashes returns the family's flashes running at the given time.
func runningFlashes(db *gorm.DB, familyID int, at time.Time) ([]Flash, error) {
	var flashes []Flash
	err := db.Where("family_id = ? AND starts_at <= ? AND ends_at > ?", familyID, at, at).Order("id").Find(&flashes).Error
	return flashes, err
}

// liveFlashOn returns the flash running at the given time on the task or a
// copy of it, or nil.
func liveFlashOn(db *gorm.DB, chore *chModel.Chore, at time.Time) (*Flash, error) {
	flashes, err := runningFlashes(db, chore.FamilyID, at)
	if err != nil || len(flashes) == 0 {
		return nil, err
	}
	same, err := SameTaskIDs(db, chore.FamilyID, chore.ID)
	if err != nil {
		return nil, err
	}
	for i := range flashes {
		for _, id := range same {
			if flashes[i].ChoreID == id {
				return &flashes[i], nil
			}
		}
	}
	return nil, nil
}

// FlashEarning is what the flash bonuses add to a task. FlashID is the flash
// a parent launched that it won.
type FlashEarning struct {
	Points  int
	Reason  string
	FlashID *int
}

// FlashBonus returns what the flash bonuses add to a task userID did at
// performedAt, when it was due at dueAt: the task's own flash bonus, and a
// flash a parent launched that they have not won yet. The time the child
// ticked the task counts, even when a parent approves it later.
func FlashBonus(tx *gorm.DB, chore *chModel.Chore, userID int, dueAt *time.Time, performedAt time.Time) (FlashEarning, error) {
	var earning FlashEarning
	if _, open := TaskFlashEnd(chore, dueAt, performedAt); open {
		earning.Points += *chore.FlashPoints
		earning.Reason += fmt.Sprintf(" (⏱️ chrono +%d)", *chore.FlashPoints)
	}
	flash, err := liveFlashOn(tx, chore, performedAt)
	if err != nil || flash == nil {
		return earning, err
	}
	var won int64
	if err := tx.Model(&chModel.ChoreHistory{}).
		Where("flash_id = ? AND completed_by = ? AND status = ?", flash.ID, userID, chModel.ChoreHistoryStatusCompleted).
		Count(&won).Error; err != nil {
		return earning, err
	}
	if won == 0 {
		earning.Points += flash.Points
		earning.Reason += fmt.Sprintf(" (⏱️ chrono +%d)", flash.Points)
		earning.FlashID = &flash.ID
	}
	return earning, nil
}

// FillFlashes sets on each task the flash bonus open now: one a parent
// launched, else the task's own after its due time.
func FillFlashes(db *gorm.DB, familyID int, chores []*chModel.Chore, now time.Time) error {
	flashes, err := runningFlashes(db, familyID, now)
	if err != nil {
		return err
	}
	live := map[int]*Flash{}
	for i := range flashes {
		same, err := SameTaskIDs(db, familyID, flashes[i].ChoreID)
		if err != nil {
			return err
		}
		// A copy done since the flash started has nothing left to win.
		var done []int
		if err := db.Model(&chModel.ChoreHistory{}).
			Where("chore_id IN ? AND status = ? AND performed_at >= ?", same, chModel.ChoreHistoryStatusCompleted, flashes[i].StartsAt).
			Distinct().Pluck("chore_id", &done).Error; err != nil {
			return err
		}
		for _, id := range same {
			if !slices.Contains(done, id) {
				live[id] = &flashes[i]
			}
		}
	}
	for _, chore := range chores {
		chore.Flash = nil
		if flash := live[chore.ID]; flash != nil {
			chore.Flash = &chModel.FlashWindow{Points: flash.Points, EndsAt: flash.EndsAt, LiveID: flash.ID}
		} else if ends, open := TaskFlashEnd(chore, chore.NextDueDate, now); open && chore.IsActive {
			chore.Flash = &chModel.FlashWindow{Points: *chore.FlashPoints, EndsAt: ends}
		}
	}
	return nil
}

// ErrNoTask is returned when launching a flash on a task outside the family.
var ErrNoTask = errors.New("task not found")

// LaunchFlash starts a flash on a task for the given minutes. It replaces a
// flash still running on the task or a copy of it.
func LaunchFlash(tx *gorm.DB, familyID, choreID, points, minutes, parentID int, now time.Time) (*Flash, error) {
	var chore chModel.Chore
	if err := tx.Select("id", "family_id").Where("id = ? AND family_id = ?", choreID, familyID).First(&chore).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNoTask
		}
		return nil, err
	}
	running, err := liveFlashOn(tx, &chore, now)
	if err != nil {
		return nil, err
	}
	if running != nil {
		if err := StopFlash(tx, running, now); err != nil {
			return nil, err
		}
	}
	flash := &Flash{FamilyID: familyID, ChoreID: choreID, Points: points, StartsAt: now,
		EndsAt: now.Add(time.Duration(minutes) * time.Minute), CreatedBy: parentID, CreatedAt: now}
	return flash, tx.Create(flash).Error
}

// StopFlash ends a running flash now. It stays recorded for the completions
// that won it.
func StopFlash(tx *gorm.DB, flash *Flash, now time.Time) error {
	if !flash.EndsAt.After(now) {
		return nil
	}
	flash.EndsAt = now
	return tx.Model(flash).Update("ends_at", now).Error
}
