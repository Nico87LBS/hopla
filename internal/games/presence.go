package games

import (
	"time"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	cModel "github.com/nico87lbs/hopla/internal/circle/model"
	"github.com/nico87lbs/hopla/internal/zone"
	"gorm.io/gorm"
)

// Absence is a stretch of time a member was away, such as a child at the
// other parent's home. It is still running while EndAt is nil.
type Absence struct {
	ID       int        `json:"id" gorm:"primaryKey"`
	CircleID int        `json:"-" gorm:"column:circle_id;not null;index:idx_absence_member"`
	UserID   int        `json:"userId" gorm:"column:user_id;not null;index:idx_absence_member"`
	StartAt  time.Time  `json:"startAt" gorm:"column:start_at;not null"`
	EndAt    *time.Time `json:"endAt" gorm:"column:end_at"`
}

func (Absence) TableName() string { return "absences" }

// AwayMembers returns the members of a circle who are away now.
func AwayMembers(db *gorm.DB, circleID int) (map[int]bool, error) {
	var ids []int
	if err := db.Model(&cModel.UserCircle{}).Where("circle_id = ? AND away = ?", circleID, true).
		Pluck("user_id", &ids).Error; err != nil {
		return nil, err
	}
	away := make(map[int]bool, len(ids))
	for _, id := range ids {
		away[id] = true
	}
	return away, nil
}

// Paused reports whether a task waits for its members to come back: its
// current assignee is away, or, for a task everyone has at once, all of its
// assignees are.
func Paused(chore *chModel.Chore, away map[int]bool) bool {
	if len(away) == 0 {
		return false
	}
	if chore.AssignStrategy == chModel.AssignmentStrategyTogether {
		if len(chore.Assignees) == 0 {
			return false
		}
		for _, assignee := range chore.Assignees {
			if !away[assignee.UserID] {
				return false
			}
		}
		return true
	}
	return chore.AssignedTo != nil && away[*chore.AssignedTo]
}

// middayOf is the middle of t's local day, safe to step day by day across a
// daylight saving change.
func middayOf(t time.Time, loc *time.Location) time.Time {
	local := t.In(loc)
	return time.Date(local.Year(), local.Month(), local.Day(), 12, 0, 0, 0, loc)
}

// absenceDays returns, per member, the local days they were away at some
// point since the given time. A day away neither breaks nor extends a streak,
// and is left out of the quests.
func absenceDays(db *gorm.DB, circleID int, since, now time.Time) (map[int]map[string]bool, error) {
	loc := zone.Of(circleID)
	var absences []Absence
	if err := db.Where("circle_id = ? AND (end_at IS NULL OR end_at >= ?)", circleID, since).
		Find(&absences).Error; err != nil {
		return nil, err
	}
	days := map[int]map[string]bool{}
	for _, absence := range absences {
		start, end := absence.StartAt, now
		if absence.EndAt != nil && absence.EndAt.Before(now) {
			end = *absence.EndAt
		}
		if start.Before(since) {
			start = since
		}
		if days[absence.UserID] == nil {
			days[absence.UserID] = map[string]bool{}
		}
		last := dayKey(end, loc)
		for day := middayOf(start, loc); ; day = day.AddDate(0, 0, 1) {
			key := dayKey(day, loc)
			if key > last {
				break
			}
			days[absence.UserID][key] = true
		}
	}
	return days, nil
}

// SetAway records that a member left or came back. It returns false when
// they already were in that state.
func SetAway(tx *gorm.DB, circleID, userID int, away bool, now time.Time) (bool, error) {
	result := tx.Model(&cModel.UserCircle{}).Where("circle_id = ? AND user_id = ? AND away = ?", circleID, userID, !away).
		Update("away", away)
	if result.Error != nil || result.RowsAffected == 0 {
		return false, result.Error
	}
	if away {
		return true, tx.Create(&Absence{CircleID: circleID, UserID: userID, StartAt: now}).Error
	}
	return true, tx.Model(&Absence{}).Where("circle_id = ? AND user_id = ? AND end_at IS NULL", circleID, userID).
		Update("end_at", now).Error
}

// ForgetSurprise drops today's surprise task when nobody has done it yet, so
// it is drawn again among the tasks of the members who are here.
func ForgetSurprise(tx *gorm.DB, circleID int, now time.Time) error {
	loc := zone.Of(circleID)
	var surprise Surprise
	err := tx.Where("circle_id = ? AND day = ?", circleID, dayKey(now, loc)).Limit(1).Find(&surprise).Error
	if err != nil || surprise.ChoreID == 0 {
		return err
	}
	same, err := SameTaskIDs(tx, circleID, surprise.ChoreID)
	if err != nil {
		return err
	}
	local := now.In(loc)
	dayStart := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, loc)
	var done int64
	if err := tx.Model(&chModel.ChoreHistory{}).
		Where("chore_id IN ? AND status IN ? AND performed_at >= ?", append(same, surprise.ChoreID),
			[]chModel.ChoreHistoryStatus{chModel.ChoreHistoryStatusCompleted, chModel.ChoreHistoryStatusPendingApproval},
			dayStart.UTC()).
		Count(&done).Error; err != nil || done > 0 {
		return err
	}
	return tx.Where("circle_id = ? AND day = ?", circleID, surprise.Day).Delete(&Surprise{}).Error
}
