package games

import (
	"time"

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
func Week(db *gorm.DB, circleID int, userIDs []int, now time.Time) ([]WeekStats, time.Time, error) {
	from := weekStart(now, zone.Of(circleID))
	to := from.AddDate(0, 0, 7)
	tasks, err := tasksDone(db, circleID, nil, from, to)
	if err != nil {
		return nil, from, err
	}
	taskPoints, err := taskPointsEarned(db, circleID, from, to)
	if err != nil {
		return nil, from, err
	}
	var bonusRows []struct {
		UserID int
		Action ptModel.PointsHistoryAction
		Points int
	}
	if err := db.Model(&ptModel.PointsHistory{}).Select("user_id, action, points").
		Where("circle_id = ? AND action IN ? AND created_at >= ? AND created_at < ?", circleID,
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
		Where("circle_id = ? AND played_at >= ? AND played_at < ?", circleID, from, to).
		Group("user_id").Scan(&gameRows).Error; err != nil {
		return nil, from, err
	}
	played, gamePoints := map[int]int{}, map[int]int{}
	for _, row := range gameRows {
		played[row.UserID], gamePoints[row.UserID] = row.Count, row.Points
	}
	away, err := absenceDays(db, circleID, from, now)
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
