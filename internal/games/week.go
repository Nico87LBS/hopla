package games

import (
	"time"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	ptModel "github.com/nico87lbs/hopla/internal/points"
	"github.com/nico87lbs/hopla/internal/zone"
	"gorm.io/gorm"
)

// WeekStats is what a member did this week, from Monday in the family's
// zone: the tasks done, the points earned from tasks, games and bonuses, and
// the games played.
type WeekStats struct {
	UserID     int `json:"userId"`
	Tasks      int `json:"tasks"`
	TaskPoints int `json:"taskPoints"`
	GamePoints int `json:"gamePoints"`
	// BonusPoints are the parents' bonuses less their penalties, and the
	// games' own bonuses (streaks, surprises, quests, challenges).
	BonusPoints int `json:"bonusPoints"`
	Games       int `json:"games"`
	// DaysAway are the days of the week the member was away at some point.
	DaysAway int `json:"daysAway"`
}

// Week returns this week's stats of the given members, in their order, and
// the Monday the week started on.
func Week(db *gorm.DB, familyID int, userIDs []int, now time.Time) ([]WeekStats, time.Time, error) {
	from := weekStart(now, zone.Of(familyID))
	to := from.AddDate(0, 0, 7)
	tasks, err := tasksDone(db, familyID, nil, from, to)
	if err != nil {
		return nil, from, err
	}
	taskPoints, err := taskPointsEarned(db, familyID, from, to)
	if err != nil {
		return nil, from, err
	}
	var bonusRows []struct {
		UserID int
		Action ptModel.PointsHistoryAction
		Points int
	}
	if err := db.Model(&ptModel.PointsHistory{}).Select("user_id, action, points").
		Where("family_id = ? AND action IN ? AND created_at >= ? AND created_at < ?", familyID,
			[]ptModel.PointsHistoryAction{ptModel.PointsHistoryActionBonus, ptModel.PointsHistoryActionPenalty, ptModel.PointsHistoryActionGame}, from, to).
		Scan(&bonusRows).Error; err != nil {
		return nil, from, err
	}
	bonus := map[int]int{}
	for _, row := range bonusRows {
		bonus[row.UserID] += ptModel.PointsHistory{Action: row.Action, Points: row.Points}.Delta()
	}
	// A game of Apprendre is written as a game row too, so it comes out of it.
	var gameRows []struct {
		UserID int
		Count  int
		Points int
	}
	if err := db.Table("learn_sessions").Select("user_id, COUNT(*) AS count, COALESCE(SUM(points), 0) AS points").
		Where("family_id = ? AND played_at >= ? AND played_at < ?", familyID, from, to).
		Group("user_id").Scan(&gameRows).Error; err != nil {
		return nil, from, err
	}
	played, gamePoints := map[int]int{}, map[int]int{}
	for _, row := range gameRows {
		played[row.UserID], gamePoints[row.UserID] = row.Count, row.Points
	}
	away, err := absenceDays(db, familyID, from, now)
	if err != nil {
		return nil, from, err
	}
	stats := make([]WeekStats, 0, len(userIDs))
	for _, id := range userIDs {
		stats = append(stats, WeekStats{UserID: id, Tasks: tasks[id], TaskPoints: taskPoints[id],
			GamePoints: gamePoints[id], BonusPoints: bonus[id] - gamePoints[id], Games: played[id], DaysAway: len(away[id])})
	}
	return stats, from, nil
}

// DayTally is what a member did today: tasks completed and the points the
// day brought, bonuses and penalties included, rewards bought left out.
type DayTally struct {
	Done   int `json:"done"`
	Earned int `json:"earned"`
}

// TodayTallies returns each member's tally of the family's day so far.
func TodayTallies(db *gorm.DB, familyID int, now time.Time) (map[int]DayTally, error) {
	start := endOfDay(now, zone.Of(familyID)).Add(-24*time.Hour + time.Second)
	tallies := map[int]DayTally{}
	var done []struct {
		CompletedBy int
		N           int
	}
	if err := db.Table("chore_histories AS h").Joins("JOIN chores AS c ON c.id = h.chore_id").
		Select("h.completed_by, COUNT(*) AS n").
		Where("c.family_id = ? AND h.status = ? AND h.performed_at >= ?", familyID, chModel.ChoreHistoryStatusCompleted, start).
		Group("h.completed_by").Scan(&done).Error; err != nil {
		return nil, err
	}
	for _, row := range done {
		tally := tallies[row.CompletedBy]
		tally.Done = row.N
		tallies[row.CompletedBy] = tally
	}
	var rows []ptModel.PointsHistory
	if err := db.Where("family_id = ? AND created_at >= ? AND action NOT IN ?", familyID, start,
		[]ptModel.PointsHistoryAction{ptModel.PointsHistoryActionRedeem, ptModel.PointsHistoryActionReset}).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	for _, row := range rows {
		tally := tallies[row.UserID]
		tally.Earned += row.Delta()
		tallies[row.UserID] = tally
	}
	return tallies, nil
}
