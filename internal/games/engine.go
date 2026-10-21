package games

import (
	"errors"
	"fmt"
	"hash/fnv"
	"slices"
	"sort"
	"time"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	ptModel "github.com/nico87lbs/hopla/internal/points"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Days follow the server's local time zone (TZ), like due dates shown to the
// family.
func dayKey(t time.Time) string { return t.In(time.Local).Format("2006-01-02") }

func endOfDay(t time.Time) time.Time {
	local := t.In(time.Local)
	return time.Date(local.Year(), local.Month(), local.Day(), 23, 59, 59, 0, time.Local)
}

// RulesFor returns a circle's rules, or the defaults when none were saved.
func RulesFor(db *gorm.DB, circleID int) (Rules, error) {
	var rules Rules
	err := db.Where("circle_id = ?", circleID).First(&rules).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return DefaultRules(circleID), nil
	}
	return rules, err
}

// ActivePeriod returns the bonus period running at the given time, the one
// with the highest multiplier when they overlap, or nil.
func ActivePeriod(db *gorm.DB, circleID int, at time.Time) (*BonusPeriod, error) {
	var period BonusPeriod
	err := db.Where("circle_id = ? AND starts_at <= ? AND ends_at > ?", circleID, at, at).
		Order("multiplier desc, id").First(&period).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &period, nil
}

// TodaySurprise returns today's surprise task, picking it on the first call of
// the day among the tasks due today or late that everyone can see. It returns
// nil when surprises are off or no task qualifies yet.
func TodaySurprise(db *gorm.DB, circleID int, now time.Time) (*Surprise, error) {
	rules, err := RulesFor(db, circleID)
	if err != nil || !rules.SurpriseEnabled || rules.SurpriseBonus <= 0 {
		return nil, err
	}
	day := dayKey(now)
	var surprise Surprise
	err = db.Where("circle_id = ? AND day = ?", circleID, day).First(&surprise).Error
	if err == nil {
		return &surprise, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	var ids []int
	err = db.Model(&chModel.Chore{}).
		Where("circle_id = ? AND is_active = ? AND points > 0 AND next_due_date IS NOT NULL AND next_due_date <= ?",
			circleID, true, endOfDay(now)).
		Where("is_private = ?", false).
		Where("project_id IS NULL OR project_id IN (SELECT id FROM projects WHERE is_private = ?)", false).
		Order("id").Pluck("id", &ids).Error
	if err != nil || len(ids) == 0 {
		return nil, err
	}
	// The same day always picks the same task, whichever request comes first.
	h := fnv.New32a()
	fmt.Fprintf(h, "%d:%s", circleID, day)
	surprise = Surprise{CircleID: circleID, Day: day, ChoreID: ids[int(h.Sum32()%uint32(len(ids)))], Points: rules.SurpriseBonus}
	if err := db.Clauses(clause.OnConflict{DoNothing: true}).Create(&surprise).Error; err != nil {
		return nil, err
	}
	err = db.Where("circle_id = ? AND day = ?", circleID, day).First(&surprise).Error
	return &surprise, err
}

// sameName matches the tasks named like a given one, ignoring case and
// spaces around the name.
const sameName = "LOWER(TRIM(name)) = (SELECT LOWER(TRIM(name)) FROM chores WHERE id = ?)"

// SameTaskIDs returns the circle's tasks with the same name as the given one.
// A task created once per child is one task for the games: it is the
// surprise, or counts for a quest, whichever child's copy is done.
func SameTaskIDs(db *gorm.DB, circleID, choreID int) ([]int, error) {
	var ids []int
	err := db.Model(&chModel.Chore{}).Where("circle_id = ?", circleID).Where(sameName, choreID).
		Order("id").Pluck("id", &ids).Error
	return ids, err
}

// Earning is what a completed task is worth once the games are counted.
type Earning struct {
	Points int
	Reason string
}

// TaskEarning returns the points a task earns when done at performedAt: its
// points, multiplied during a bonus period, plus the surprise bonus when it is
// that day's surprise task.
func TaskEarning(tx *gorm.DB, chore *chModel.Chore, performedAt time.Time) (Earning, error) {
	earning := Earning{Reason: chore.Name}
	if chore.Points == nil || *chore.Points <= 0 {
		return earning, nil
	}
	earning.Points = *chore.Points
	period, err := ActivePeriod(tx, chore.CircleID, performedAt)
	if err != nil {
		return earning, err
	}
	if period != nil && period.Multiplier > 1 {
		earning.Points *= period.Multiplier
		earning.Reason += fmt.Sprintf(" (×%d %s)", period.Multiplier, period.Name)
	}
	var surprise Surprise
	err = tx.Where("circle_id = ? AND day = ?", chore.CircleID, dayKey(performedAt)).First(&surprise).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return earning, nil
	}
	if err != nil {
		return earning, err
	}
	same, err := SameTaskIDs(tx, chore.CircleID, surprise.ChoreID)
	if err != nil {
		return earning, err
	}
	if surprise.ChoreID == chore.ID || slices.Contains(same, chore.ID) {
		earning.Points += surprise.Points
		earning.Reason += fmt.Sprintf(" (surprise +%d)", surprise.Points)
	}
	return earning, nil
}

// completionDays returns, per member, the local days on which they completed
// at least one task since the given time.
func completionDays(db *gorm.DB, circleID int, since time.Time) (map[int]map[string]bool, error) {
	var rows []struct {
		CompletedBy int
		PerformedAt time.Time
	}
	err := db.Table("chore_histories AS h").
		Select("h.completed_by, h.performed_at").
		Joins("JOIN chores AS c ON c.id = h.chore_id").
		Where("c.circle_id = ? AND h.status = ? AND h.performed_at >= ?", circleID, chModel.ChoreHistoryStatusCompleted, since).
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	days := map[int]map[string]bool{}
	for _, row := range rows {
		if days[row.CompletedBy] == nil {
			days[row.CompletedBy] = map[string]bool{}
		}
		days[row.CompletedBy][dayKey(row.PerformedAt)] = true
	}
	return days, nil
}

// streakOf counts a member's current and best runs of days.
func streakOf(userID int, days map[string]bool, now time.Time) Streak {
	streak := Streak{UserID: userID, DoneToday: days[dayKey(now)]}
	local := now.In(time.Local)
	day := time.Date(local.Year(), local.Month(), local.Day(), 12, 0, 0, 0, time.Local)
	if !streak.DoneToday {
		day = day.AddDate(0, 0, -1)
	}
	for days[dayKey(day)] {
		streak.Current++
		day = day.AddDate(0, 0, -1)
	}
	keys := make([]string, 0, len(days))
	for key := range days {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	run := 0
	var previous time.Time
	for _, key := range keys {
		current, _ := time.ParseInLocation("2006-01-02", key, time.Local)
		if run > 0 && dayKey(previous.Add(36*time.Hour)) == key {
			run++
		} else {
			run = 1
		}
		previous = current
		streak.Best = max(streak.Best, run)
	}
	return streak
}

// streakWindow is how far back streaks are counted.
const streakWindow = 400 * 24 * time.Hour

// Streaks returns the streak of every member of the circle who completed a
// task lately, and a zero streak for the other given members.
func Streaks(db *gorm.DB, circleID int, userIDs []int, now time.Time) ([]Streak, error) {
	days, err := completionDays(db, circleID, now.Add(-streakWindow))
	if err != nil {
		return nil, err
	}
	streaks := make([]Streak, 0, len(userIDs))
	for _, userID := range userIDs {
		streaks = append(streaks, streakOf(userID, days[userID], now))
	}
	return streaks, nil
}

// AwardStreakBonus gives the streak bonus when a member's first task of the
// day completes a run of StreakEvery days (then 2×, 3× …). Call it after the
// completion is saved, in the same transaction. It returns the ledger row, or
// nil when no bonus is due.
func AwardStreakBonus(tx *gorm.DB, circleID, userID int, performedAt, now time.Time) (*ptModel.PointsHistory, error) {
	if dayKey(performedAt) != dayKey(now) {
		return nil, nil // an approval of yesterday's task does not move today's streak
	}
	rules, err := RulesFor(tx, circleID)
	if err != nil || rules.StreakEvery <= 0 || rules.StreakBonus <= 0 {
		return nil, err
	}
	days, err := completionDays(tx, circleID, now.Add(-streakWindow))
	if err != nil {
		return nil, err
	}
	var today int64
	start := endOfDay(now).Add(-24*time.Hour + time.Second)
	if err := tx.Table("chore_histories AS h").Joins("JOIN chores AS c ON c.id = h.chore_id").
		Where("c.circle_id = ? AND h.completed_by = ? AND h.status = ? AND h.performed_at >= ?",
			circleID, userID, chModel.ChoreHistoryStatusCompleted, start).
		Count(&today).Error; err != nil {
		return nil, err
	}
	if today != 1 {
		return nil, nil
	}
	streak := streakOf(userID, days[userID], now)
	if streak.Current == 0 || streak.Current%rules.StreakEvery != 0 {
		return nil, nil
	}
	return giveBonus(tx, circleID, userID, rules.StreakBonus, fmt.Sprintf("Série de %d jours", streak.Current))
}
