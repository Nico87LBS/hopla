package games

import (
	"errors"
	"fmt"
	"hash/fnv"
	"slices"
	"sort"
	"time"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	cModel "github.com/nico87lbs/hopla/internal/circle/model"
	ptModel "github.com/nico87lbs/hopla/internal/points"
	"github.com/nico87lbs/hopla/internal/zone"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// RanksFor returns a circle's ranks from the lowest, or the defaults when its
// parents did not set their own.
func RanksFor(db *gorm.DB, circleID int) ([]Rank, error) {
	var ranks []Rank
	if err := db.Where("circle_id = ?", circleID).Order("min_points").Find(&ranks).Error; err != nil {
		return nil, err
	}
	if len(ranks) == 0 {
		return DefaultRanks(), nil
	}
	return ranks, nil
}

// RankLevel is a member's rank: its level from 1, and the next rank to reach.
// Past the last rank, a member earns a prestige star and starts a new round
// from the first rank: Points are the points earned in the current round, and
// StarAt the round's points that give the next star.
type RankLevel struct {
	Level  int   `json:"level"`
	Rank   Rank  `json:"rank"`
	Next   *Rank `json:"next"`
	Stars  int   `json:"stars"`
	Points int   `json:"points"`
	StarAt int   `json:"starAt"`
}

// roundLength is the points of one round of ranks: the last rank is kept for
// as many points as it took to reach it from the rank before, then a star is
// given. It is 0 when the ranks give no star.
func roundLength(ranks []Rank) int {
	if len(ranks) < 2 {
		return 0
	}
	top := ranks[len(ranks)-1].MinPoints
	span := top - ranks[len(ranks)-2].MinPoints
	if top <= 0 || span <= 0 {
		return 0
	}
	return top + span
}

// RankOf returns the rank reached with the given points earned. The ranks
// must be sorted from the lowest.
func RankOf(ranks []Rank, earned int) RankLevel {
	level := RankLevel{Level: 1, Points: earned}
	if len(ranks) == 0 {
		return level
	}
	if round := roundLength(ranks); round > 0 {
		level.Stars, level.Points, level.StarAt = earned/round, earned%round, round
	}
	level.Rank = ranks[0]
	for i, rank := range ranks {
		if level.Points >= rank.MinPoints {
			level.Level, level.Rank = i+1, rank
		}
	}
	if level.Level < len(ranks) {
		next := ranks[level.Level]
		level.Next = &next
	}
	return level
}

// weekStart is the Monday starting the local week of t.
func weekStart(t time.Time, loc *time.Location) time.Time {
	local := t.In(loc)
	offset := (int(local.Weekday()) + 6) % 7
	return time.Date(local.Year(), local.Month(), local.Day()-offset, 0, 0, 0, 0, loc)
}

func monthStart(t time.Time, loc *time.Location) time.Time {
	local := t.In(loc)
	return time.Date(local.Year(), local.Month(), 1, 0, 0, 0, 0, loc)
}

// periodBounds returns the start, end and key of the week or month holding t.
func periodBounds(period string, t time.Time, loc *time.Location) (time.Time, time.Time, string) {
	if period == QuestMonth {
		start := monthStart(t, loc)
		return start, start.AddDate(0, 1, 0), start.Format("2006-01")
	}
	start := weekStart(t, loc)
	return start, start.AddDate(0, 0, 7), start.Format("2006-01-02")
}

func eligible(userIDs []int, userID int) bool {
	return len(userIDs) == 0 || slices.Contains(userIDs, userID)
}

// drawQuests gives a member this week's and this month's quests. The same
// member, period and quests always give the same draw.
func drawQuests(db *gorm.DB, circleID, userID int, now time.Time) error {
	loc := zone.Of(circleID)
	rules, err := RulesFor(db, circleID)
	if err != nil {
		return err
	}
	var quests []Quest
	if err := db.Where("circle_id = ?", circleID).Order("id").Find(&quests).Error; err != nil {
		return err
	}
	for _, period := range []string{QuestWeek, QuestMonth} {
		_, _, key := periodBounds(period, now, loc)
		var drawn []int
		if err := db.Model(&QuestDraw{}).Where("circle_id = ? AND user_id = ? AND period_key = ? AND period = ?",
			circleID, userID, key, period).Pluck("quest_id", &drawn).Error; err != nil {
			return err
		}
		// Quests added during the period top the draw up.
		var pool []Quest
		for _, quest := range quests {
			if quest.Period == period && eligible(quest.UserIDs, userID) && !slices.Contains(drawn, quest.ID) {
				pool = append(pool, quest)
			}
		}
		if period == QuestWeek {
			// Shuffle by a hash of the member, week and quest.
			score := func(quest Quest) uint32 {
				h := fnv.New32a()
				fmt.Fprintf(h, "%d:%d:%s:%d", circleID, userID, key, quest.ID)
				return h.Sum32()
			}
			sort.SliceStable(pool, func(i, j int) bool { return score(pool[i]) < score(pool[j]) })
			pool = pool[:min(len(pool), max(rules.QuestsPerWeek-len(drawn), 0))]
		}
		for _, quest := range pool {
			draw := QuestDraw{CircleID: circleID, UserID: userID, PeriodKey: key, QuestID: quest.ID, Period: period,
				Name: quest.Name, Kind: quest.Kind, ChoreID: quest.ChoreID, Target: quest.Target, Reward: quest.Reward}
			if err := db.Clauses(clause.OnConflict{DoNothing: true}).Create(&draw).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

// tasksDone counts, per member, the tasks completed between from and to, or
// only those of one task and its copies with the same name.
func tasksDone(db *gorm.DB, circleID int, choreID *int, from, to time.Time) (map[int]int, error) {
	var rows []struct {
		CompletedBy int
		Count       int
	}
	query := db.Table("chore_histories AS h").Select("h.completed_by, COUNT(*) AS count").
		Joins("JOIN chores AS c ON c.id = h.chore_id").
		Where("c.circle_id = ? AND h.status = ? AND h.performed_at >= ? AND h.performed_at < ?",
			circleID, chModel.ChoreHistoryStatusCompleted, from, to)
	if choreID != nil {
		query = query.Where("LOWER(TRIM(c.name)) = (SELECT LOWER(TRIM(name)) FROM chores WHERE id = ?)", *choreID)
	}
	if err := query.Group("h.completed_by").Scan(&rows).Error; err != nil {
		return nil, err
	}
	counts := map[int]int{}
	for _, row := range rows {
		counts[row.CompletedBy] = row.Count
	}
	return counts, nil
}

// taskPointsEarned sums, per member, the points of tasks credited between from
// and to, less the undone ones. Bonuses do not count, so a quest reward never
// helps reach another goal.
func taskPointsEarned(db *gorm.DB, circleID int, from, to time.Time) (map[int]int, error) {
	var rows []struct {
		UserID int
		Action ptModel.PointsHistoryAction
		Points int
	}
	if err := db.Model(&ptModel.PointsHistory{}).Select("user_id, action, points").
		Where("circle_id = ? AND action IN ? AND created_at >= ? AND created_at < ?", circleID,
			[]ptModel.PointsHistoryAction{ptModel.PointsHistoryActionAdd, ptModel.PointsHistoryActionRemove}, from, to).
		Scan(&rows).Error; err != nil {
		return nil, err
	}
	sums := map[int]int{}
	for _, row := range rows {
		sums[row.UserID] += ptModel.PointsHistory{Action: row.Action, Points: row.Points}.Delta()
	}
	return sums, nil
}

// goalProgress returns, per member, how far they are on a goal between from
// and to.
func goalProgress(db *gorm.DB, circleID int, kind string, choreID *int, from, to, now time.Time) (map[int]int, error) {
	loc := zone.Of(circleID)
	switch kind {
	case GoalTasks:
		return tasksDone(db, circleID, choreID, from, to)
	case GoalPoints:
		return taskPointsEarned(db, circleID, from, to)
	case GoalStreak:
		days, away, err := streakDays(db, circleID, now)
		if err != nil {
			return nil, err
		}
		streaks := map[int]int{}
		for userID, userDays := range days {
			streaks[userID] = streakOf(userID, userDays, away[userID], now, loc).Current
		}
		return streaks, nil
	}
	return map[int]int{}, nil
}

// scaledTarget lowers a quest's or a challenge's target in proportion to the
// days of the period the member was away, rounded up and never below 1.
func scaledTarget(target int, from, to time.Time, away map[string]bool, loc *time.Location) int {
	if len(away) == 0 || target <= 1 {
		return target
	}
	total, gone := periodDays(from, to, away, loc)
	if gone == 0 || total == 0 {
		return target
	}
	here := total - gone
	return max(1, (target*here+total-1)/total)
}

// periodDays counts the days of a period, and those the member was away.
func periodDays(from, to time.Time, away map[string]bool, loc *time.Location) (total, gone int) {
	for day := middayOf(from, loc); day.Before(to); day = day.AddDate(0, 0, 1) {
		total++
		if away[dayKey(day, loc)] {
			gone++
		}
	}
	return total, gone
}

// QuestView is a member's quest with how far they are.
type QuestView struct {
	QuestDraw
	Progress int       `json:"progress"`
	EndsAt   time.Time `json:"endsAt"`
}

// Quests returns the running quests of the given members, drawing them first
// when the week or month just started.
func Quests(db *gorm.DB, circleID int, userIDs []int, now time.Time) (map[int][]QuestView, error) {
	loc := zone.Of(circleID)
	awayNow, err := AwayMembers(db, circleID)
	if err != nil {
		return nil, err
	}
	views := map[int][]QuestView{}
	for _, userID := range userIDs {
		// A member away gets their quests when they come back.
		if !awayNow[userID] {
			if err := drawQuests(db, circleID, userID, now); err != nil {
				return nil, err
			}
		}
		views[userID] = []QuestView{}
	}
	monthFrom, _, _ := periodBounds(QuestMonth, now, loc)
	weekFrom, _, _ := periodBounds(QuestWeek, now, loc)
	since := monthFrom
	if weekFrom.Before(since) {
		since = weekFrom
	}
	away, err := absenceDays(db, circleID, since, now)
	if err != nil {
		return nil, err
	}
	_, _, weekKey := periodBounds(QuestWeek, now, loc)
	_, _, monthKey := periodBounds(QuestMonth, now, loc)
	var draws []QuestDraw
	if err := db.Where("circle_id = ? AND user_id IN ? AND ((period = ? AND period_key = ?) OR (period = ? AND period_key = ?))",
		circleID, userIDs, QuestWeek, weekKey, QuestMonth, monthKey).Order("period desc, id").Find(&draws).Error; err != nil {
		return nil, err
	}
	cache := map[string]map[int]int{}
	for _, draw := range draws {
		from, to, _ := periodBounds(draw.Period, now, loc)
		key := fmt.Sprintf("%s:%s:%v", draw.Period, draw.Kind, draw.ChoreID)
		if draw.ChoreID != nil {
			key = fmt.Sprintf("%s:%s:%d", draw.Period, draw.Kind, *draw.ChoreID)
		}
		progress, ok := cache[key]
		if !ok {
			var err error
			if progress, err = goalProgress(db, circleID, draw.Kind, draw.ChoreID, from, to, now); err != nil {
				return nil, err
			}
			cache[key] = progress
		}
		view := QuestView{QuestDraw: draw, EndsAt: to}
		view.Target = scaledTarget(draw.Target, from, to, away[draw.UserID], loc)
		view.Progress = min(progress[draw.UserID], view.Target)
		if draw.CompletedAt != nil {
			view.Progress = view.Target
		}
		views[draw.UserID] = append(views[draw.UserID], view)
	}
	return views, nil
}

// ChallengeView is a challenge with each member's progress, the total for a
// shared one, and who won. In a challenge that isn't shared, a member who was
// away has a lower target, and DaysAway says how many days they missed.
type ChallengeView struct {
	Challenge
	Members  []int       `json:"members"`
	Progress map[int]int `json:"progress"`
	Total    int         `json:"total"`
	Winners  []int       `json:"winners"`
	Targets  map[int]int `json:"targets"`
	DaysAway map[int]int `json:"daysAway"`
}

// TargetOf is what the member has to reach.
func (v ChallengeView) TargetOf(userID int) int {
	if target, ok := v.Targets[userID]; ok {
		return target
	}
	return v.Target
}

// Challenges returns the challenges running at now or ended since the given
// time, with their progress. members are the circle's active members, who
// take part in a challenge naming none.
func Challenges(db *gorm.DB, circleID int, members []int, endedSince, now time.Time) ([]ChallengeView, error) {
	var challenges []Challenge
	if err := db.Where("circle_id = ? AND starts_at <= ? AND ends_at > ?", circleID, now, endedSince).
		Order("ends_at, id").Find(&challenges).Error; err != nil {
		return nil, err
	}
	views := make([]ChallengeView, 0, len(challenges))
	for _, challenge := range challenges {
		view, err := challengeView(db, challenge, members, now)
		if err != nil {
			return nil, err
		}
		views = append(views, view)
	}
	return views, nil
}

func challengeView(db *gorm.DB, challenge Challenge, members []int, now time.Time) (ChallengeView, error) {
	view := ChallengeView{Challenge: challenge, Members: challenge.UserIDs, Progress: map[int]int{}, Winners: []int{},
		Targets: map[int]int{}, DaysAway: map[int]int{}}
	if len(view.Members) == 0 {
		view.Members = members
	}
	to := challenge.EndsAt
	if now.Before(to) {
		to = now.Add(time.Second)
	}
	progress, err := goalProgress(db, challenge.CircleID, challenge.Kind, challenge.ChoreID, challenge.StartsAt, to, now)
	if err != nil {
		return view, err
	}
	for _, userID := range view.Members {
		view.Progress[userID] = max(progress[userID], 0)
		view.Total += view.Progress[userID]
	}
	if !challenge.Shared {
		// Only the days already gone by count: an absence ahead is not known.
		away, err := absenceDays(db, challenge.CircleID, challenge.StartsAt, to)
		if err != nil {
			return view, err
		}
		loc := zone.Of(challenge.CircleID)
		for _, userID := range view.Members {
			_, days := periodDays(challenge.StartsAt, challenge.EndsAt, away[userID], loc)
			if days == 0 {
				continue
			}
			view.DaysAway[userID] = days
			view.Targets[userID] = scaledTarget(challenge.Target, challenge.StartsAt, challenge.EndsAt, away[userID], loc)
		}
	}
	if err := db.Model(&ChallengeWin{}).Where("challenge_id = ?", challenge.ID).Order("won_at").
		Pluck("user_id", &view.Winners).Error; err != nil {
		return view, err
	}
	return view, nil
}

// giveBonus credits points a game awards, as a game row in the ledger. Game
// bonuses are never multiplied.
func giveBonus(tx *gorm.DB, circleID, userID, points int, reason string) (*ptModel.PointsHistory, error) {
	if points <= 0 {
		return nil, nil
	}
	entry := ptModel.PointsHistory{Action: ptModel.PointsHistoryActionGame, Points: points, UserID: userID,
		CircleID: circleID, CreatedBy: userID, Reason: &reason, CreatedAt: time.Now().UTC()}
	if err := tx.Model(&cModel.UserCircle{}).Where("user_id = ? AND circle_id = ?", userID, circleID).
		Update("points", gorm.Expr("points + ?", points)).Error; err != nil {
		return nil, err
	}
	if err := tx.Create(&entry).Error; err != nil {
		return nil, err
	}
	return &entry, nil
}

// awardQuests completes the member's running quests that are now reached and
// pays their rewards.
func awardQuests(tx *gorm.DB, circleID, userID int, now time.Time) error {
	views, err := Quests(tx, circleID, []int{userID}, now)
	if err != nil {
		return err
	}
	for _, quest := range views[userID] {
		if quest.CompletedAt != nil || quest.Progress < quest.Target {
			continue
		}
		done := now
		result := tx.Model(&QuestDraw{}).Where("id = ? AND completed_at IS NULL", quest.ID).Update("completed_at", done)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			continue
		}
		if _, err := giveBonus(tx, circleID, userID, quest.Reward, "Quête : "+quest.Name); err != nil {
			return err
		}
	}
	return nil
}

// awardChallenges records the challenges the member just won, or the shared
// ones the family just reached, and pays their rewards.
func awardChallenges(tx *gorm.DB, circleID, userID int, now time.Time) error {
	var members []int
	if err := tx.Model(&cModel.UserCircle{}).Where("circle_id = ? AND is_active = ?", circleID, true).
		Pluck("user_id", &members).Error; err != nil {
		return err
	}
	var challenges []Challenge
	if err := tx.Where("circle_id = ? AND starts_at <= ? AND ends_at > ? AND completed_at IS NULL", circleID, now, now).
		Find(&challenges).Error; err != nil {
		return err
	}
	for _, challenge := range challenges {
		view, err := challengeView(tx, challenge, members, now)
		if err != nil {
			return err
		}
		if !slices.Contains(view.Members, userID) {
			continue
		}
		winners := []int{}
		if challenge.Shared {
			if view.Total < challenge.Target {
				continue
			}
			result := tx.Model(&Challenge{}).Where("id = ? AND completed_at IS NULL", challenge.ID).Update("completed_at", now)
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected == 0 {
				continue
			}
			winners = view.Members
		} else if view.Progress[userID] >= view.TargetOf(userID) && !slices.Contains(view.Winners, userID) {
			winners = []int{userID}
		}
		for _, winner := range winners {
			result := tx.Clauses(clause.OnConflict{DoNothing: true}).
				Create(&ChallengeWin{ChallengeID: challenge.ID, UserID: winner, WonAt: now})
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected == 0 {
				continue
			}
			if _, err := giveBonus(tx, circleID, winner, challenge.Reward, "Défi : "+challenge.Name); err != nil {
				return err
			}
		}
	}
	return nil
}

// AfterTask runs the games that follow a credited task: the streak bonus,
// then the quests and challenges it completes. Call it after the completion
// and its points are saved, in the same transaction.
func AfterTask(tx *gorm.DB, circleID, userID int, performedAt, now time.Time) error {
	if _, err := AwardStreakBonus(tx, circleID, userID, performedAt, now); err != nil {
		return err
	}
	if err := awardQuests(tx, circleID, userID, now); err != nil {
		return err
	}
	return awardChallenges(tx, circleID, userID, now)
}

// Settle pays the quests and challenges the given members reached without a
// task to trigger it, such as a quest drawn already reached, or a challenge
// created after the points were earned.
func Settle(db *gorm.DB, circleID int, userIDs []int, now time.Time) error {
	return db.Transaction(func(tx *gorm.DB) error {
		for _, userID := range userIDs {
			if err := awardQuests(tx, circleID, userID, now); err != nil {
				return err
			}
			if err := awardChallenges(tx, circleID, userID, now); err != nil {
				return err
			}
		}
		return nil
	})
}

var errNoRanks = errors.New("a circle needs at least one rank")

// SaveRanks replaces a circle's ranks. The first rank starts at 0 points.
func SaveRanks(db *gorm.DB, circleID int, ranks []Rank) ([]Rank, error) {
	if len(ranks) == 0 {
		return nil, errNoRanks
	}
	sort.SliceStable(ranks, func(i, j int) bool { return ranks[i].MinPoints < ranks[j].MinPoints })
	ranks[0].MinPoints = 0
	err := db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("circle_id = ?", circleID).Delete(&Rank{}).Error; err != nil {
			return err
		}
		for i := range ranks {
			ranks[i].ID = 0
			ranks[i].CircleID = circleID
		}
		return tx.Create(&ranks).Error
	})
	return ranks, err
}
