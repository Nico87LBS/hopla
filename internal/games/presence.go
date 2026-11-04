package games

import (
	"time"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	fModel "github.com/nico87lbs/hopla/internal/family/model"
	"github.com/nico87lbs/hopla/internal/zone"
	"gorm.io/gorm"
)

// Absence is a stretch of time a member was away, such as a child at the
// other parent's home. It is still running while EndAt is nil.
type Absence struct {
	ID       int        `json:"id" gorm:"primaryKey"`
	FamilyID int        `json:"-" gorm:"column:family_id;not null;index:idx_absence_member"`
	UserID   int        `json:"userId" gorm:"column:user_id;not null;index:idx_absence_member"`
	StartAt  time.Time  `json:"startAt" gorm:"column:start_at;not null"`
	EndAt    *time.Time `json:"endAt" gorm:"column:end_at"`
}

func (Absence) TableName() string { return "absences" }

// AwayMembers returns the members of a family who are away now.
func AwayMembers(db *gorm.DB, familyID int) (map[int]bool, error) {
	var ids []int
	if err := db.Model(&fModel.UserFamily{}).Where("family_id = ? AND away = ?", familyID, true).
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
func absenceDays(db *gorm.DB, familyID int, since, now time.Time) (map[int]map[string]bool, error) {
	loc := zone.Of(familyID)
	var absences []Absence
	if err := db.Where("family_id = ? AND (end_at IS NULL OR end_at >= ?)", familyID, since).
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

// MistakeAbsence is how short an absence has to be to count as a mistake: a
// member put away and back home within it was never away.
const MistakeAbsence = 15 * time.Minute

// SetAway records that a member left or came back. It returns false when
// they already were in that state. Coming back within MistakeAbsence erases
// the absence, so that it counts for nothing (quests, challenges, streaks).
func SetAway(tx *gorm.DB, familyID, userID int, away bool, now time.Time) (bool, error) {
	result := tx.Model(&fModel.UserFamily{}).Where("family_id = ? AND user_id = ? AND away = ?", familyID, userID, !away).
		Update("away", away)
	if result.Error != nil || result.RowsAffected == 0 {
		return false, result.Error
	}
	if away {
		return true, tx.Create(&Absence{FamilyID: familyID, UserID: userID, StartAt: now}).Error
	}
	open := tx.Model(&Absence{}).Where("family_id = ? AND user_id = ? AND end_at IS NULL", familyID, userID)
	if err := tx.Where("family_id = ? AND user_id = ? AND end_at IS NULL AND start_at > ?", familyID, userID,
		now.Add(-MistakeAbsence)).Delete(&Absence{}).Error; err != nil {
		return true, err
	}
	return true, open.Update("end_at", now).Error
}

// AbsenceStarts returns, per member away now, when their absence started.
func AbsenceStarts(db *gorm.DB, familyID int) (map[int]time.Time, error) {
	var absences []Absence
	if err := db.Where("family_id = ? AND end_at IS NULL", familyID).Find(&absences).Error; err != nil {
		return nil, err
	}
	starts := make(map[int]time.Time, len(absences))
	for _, absence := range absences {
		if start, ok := starts[absence.UserID]; !ok || absence.StartAt.Before(start) {
			starts[absence.UserID] = absence.StartAt
		}
	}
	return starts, nil
}

// PausedSince returns when a paused task started to wait: when its assignee
// left, or, for a task everyone has at once, when the last of them left. ok
// is false when the task is not paused or the time is not known.
func PausedSince(chore *chModel.Chore, away map[int]bool, starts map[int]time.Time) (since time.Time, ok bool) {
	if !Paused(chore, away) {
		return since, false
	}
	if chore.AssignStrategy == chModel.AssignmentStrategyTogether {
		for _, assignee := range chore.Assignees {
			start, known := starts[assignee.UserID]
			if !known {
				return since, false
			}
			if start.After(since) {
				since = start
			}
		}
		return since, true
	}
	since, ok = starts[*chore.AssignedTo]
	return since, ok
}

// ForgetSurprise drops today's surprise task when nobody has done it yet and
// every copy of it waits for a member away, so that it is drawn again among
// the tasks of the members who are here. A surprise someone here can still
// do stays put.
func ForgetSurprise(tx *gorm.DB, familyID int, now time.Time) error {
	loc := zone.Of(familyID)
	var surprise Surprise
	err := tx.Where("family_id = ? AND day = ?", familyID, dayKey(now, loc)).Limit(1).Find(&surprise).Error
	if err != nil || surprise.ChoreID == 0 {
		return err
	}
	same, err := SameTaskIDs(tx, familyID, surprise.ChoreID)
	if err != nil {
		return err
	}
	ids := append(same, surprise.ChoreID)
	away, err := AwayMembers(tx, familyID)
	if err != nil {
		return err
	}
	var copies []*chModel.Chore
	if err := tx.Select("id", "assigned_to", "assign_strategy").Preload("Assignees").
		Where("id IN ? AND is_active = ?", ids, true).Find(&copies).Error; err != nil {
		return err
	}
	for _, chore := range copies {
		if !Paused(chore, away) {
			return nil
		}
	}
	local := now.In(loc)
	dayStart := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, loc)
	var done int64
	if err := tx.Model(&chModel.ChoreHistory{}).
		Where("chore_id IN ? AND status IN ? AND performed_at >= ?", ids,
			[]chModel.ChoreHistoryStatus{chModel.ChoreHistoryStatusCompleted, chModel.ChoreHistoryStatusPendingApproval},
			dayStart.UTC()).
		Count(&done).Error; err != nil || done > 0 {
		return err
	}
	return tx.Where("family_id = ? AND day = ?", familyID, surprise.Day).Delete(&Surprise{}).Error
}
