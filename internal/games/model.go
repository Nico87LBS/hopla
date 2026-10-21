// Package games holds the family games built on points: streaks, bonus
// periods, the surprise task of the day, ranks, quests and challenges.
package games

import "time"

// Rules are a circle's game settings. A circle without a row plays with
// DefaultRules.
type Rules struct {
	CircleID int `json:"-" gorm:"primaryKey;autoIncrement:false"`
	// A member who completes at least one task every day for StreakEvery days
	// in a row gets StreakBonus points, then again every StreakEvery days.
	// 0 turns streak bonuses off; streaks are still counted.
	StreakEvery int `json:"streakEvery" gorm:"column:streak_every;not null;default:0"`
	StreakBonus int `json:"streakBonus" gorm:"column:streak_bonus;not null;default:0"`
	// Each day one task due that day becomes the surprise task, worth
	// SurpriseBonus extra points.
	SurpriseEnabled bool `json:"surpriseEnabled" gorm:"column:surprise_enabled;not null;default:false"`
	SurpriseBonus   int  `json:"surpriseBonus" gorm:"column:surprise_bonus;not null;default:0"`
	// How many weekly quests each member draws on Monday.
	QuestsPerWeek int       `json:"questsPerWeek" gorm:"column:quests_per_week;not null;default:0"`
	UpdatedAt     time.Time `json:"updatedAt" gorm:"column:updated_at"`
}

func (Rules) TableName() string { return "game_rules" }

// DefaultRules are what a circle plays with until a parent changes them.
func DefaultRules(circleID int) Rules {
	return Rules{CircleID: circleID, StreakEvery: 7, StreakBonus: 10, SurpriseEnabled: true, SurpriseBonus: 5, QuestsPerWeek: 3}
}

// BonusPeriod multiplies the points of every task completed between StartsAt
// and EndsAt, such as a double-points weekend.
type BonusPeriod struct {
	ID         int       `json:"id" gorm:"primaryKey"`
	CircleID   int       `json:"-" gorm:"column:circle_id;index;not null"`
	Name       string    `json:"name" gorm:"column:name;not null"`
	StartsAt   time.Time `json:"startsAt" gorm:"column:starts_at;not null"`
	EndsAt     time.Time `json:"endsAt" gorm:"column:ends_at;not null"`
	Multiplier int       `json:"multiplier" gorm:"column:multiplier;not null"`
	CreatedBy  int       `json:"createdBy" gorm:"column:created_by"`
	CreatedAt  time.Time `json:"createdAt" gorm:"column:created_at"`
}

func (BonusPeriod) TableName() string { return "bonus_periods" }

// Surprise is the task picked as a circle's surprise for one day. It is kept
// so the pick does not move as tasks are completed during the day.
type Surprise struct {
	CircleID int    `json:"-" gorm:"primaryKey;autoIncrement:false"`
	Day      string `json:"day" gorm:"primaryKey;size:10"`
	ChoreID  int    `json:"choreId" gorm:"column:chore_id;not null"`
	Points   int    `json:"points" gorm:"column:points;not null"`
}

func (Surprise) TableName() string { return "surprises" }

// Streak is how many days in a row a member completed at least one task.
type Streak struct {
	UserID  int `json:"userId"`
	Current int `json:"current"`
	Best    int `json:"best"`
	// DoneToday tells whether today already counts; a streak whose last day
	// is yesterday is still alive until the end of today.
	DoneToday bool `json:"doneToday"`
}

// Rank is a level reached with the points earned since joining. Spending or
// a penalty never takes a rank away.
type Rank struct {
	ID       int    `json:"-" gorm:"primaryKey"`
	CircleID int    `json:"-" gorm:"column:circle_id;index;not null"`
	Name     string `json:"name" gorm:"column:name;not null"`
	Icon     string `json:"icon" gorm:"column:icon"`
	// Image is one of the drawn rank badges, "hopla-1" to "hopla-7", shown
	// instead of the icon where pictures fit. Empty keeps the icon alone.
	Image     string `json:"image" gorm:"column:image"`
	MinPoints int    `json:"minPoints" gorm:"column:min_points;not null"`
}

func (Rank) TableName() string { return "game_ranks" }

// RankImages are the drawn rank badges a rank can show.
var RankImages = []string{"hopla-1", "hopla-2", "hopla-3", "hopla-4", "hopla-5", "hopla-6", "hopla-7"}

// DefaultRanks are the ranks of a circle whose parents did not set their own.
func DefaultRanks() []Rank {
	return []Rank{
		{Name: "Lapineau", Icon: "🐣", Image: "hopla-1", MinPoints: 0},
		{Name: "Petit bondisseur", Icon: "🌱", Image: "hopla-2", MinPoints: 100},
		{Name: "Cueilleur de carottes", Icon: "🥕", Image: "hopla-3", MinPoints: 250},
		{Name: "Sauteur des prés", Icon: "🌼", Image: "hopla-4", MinPoints: 450},
		{Name: "Gardien du terrier", Icon: "🛡️", Image: "hopla-5", MinPoints: 700},
		{Name: "Sage de la clairière", Icon: "🦉", Image: "hopla-6", MinPoints: 1000},
		{Name: "Grand chef de la tribu des Hopla", Icon: "👑", Image: "hopla-7", MinPoints: 1500},
	}
}

// Goal kinds, for quests and challenges.
const (
	GoalTasks  = "tasks"  // complete tasks, or one given task, Target times
	GoalPoints = "points" // earn Target points with tasks
	GoalStreak = "streak" // reach a streak of Target days (quests only)
)

// Quest periods.
const (
	QuestWeek  = "week"
	QuestMonth = "month"
)

// Quest is a goal parents prepare. Every Monday each member draws
// Rules.QuestsPerWeek of the weekly quests they can do; monthly quests are
// all given on the first of the month.
type Quest struct {
	ID       int    `json:"id" gorm:"primaryKey"`
	CircleID int    `json:"-" gorm:"column:circle_id;index;not null"`
	Name     string `json:"name" gorm:"column:name;not null"`
	Kind     string `json:"kind" gorm:"column:kind;not null"`
	ChoreID  *int   `json:"choreId" gorm:"column:chore_id"`
	Target   int    `json:"target" gorm:"column:target;not null"`
	Reward   int    `json:"reward" gorm:"column:reward;not null"`
	Period   string `json:"period" gorm:"column:period;not null"`
	// Members who can draw it, such as the younger child only. Empty means
	// every member.
	UserIDs   []int     `json:"userIds" gorm:"column:user_ids;type:text;serializer:json"`
	CreatedAt time.Time `json:"createdAt" gorm:"column:created_at"`
}

func (Quest) TableName() string { return "quests" }

// QuestDraw is a quest given to a member for one week or month. It copies the
// quest, so editing or deleting the quest does not change a running one.
type QuestDraw struct {
	ID          int        `json:"id" gorm:"primaryKey"`
	CircleID    int        `json:"-" gorm:"column:circle_id;not null;uniqueIndex:idx_quest_draw"`
	UserID      int        `json:"userId" gorm:"column:user_id;not null;uniqueIndex:idx_quest_draw"`
	PeriodKey   string     `json:"periodKey" gorm:"column:period_key;size:10;not null;uniqueIndex:idx_quest_draw"`
	QuestID     int        `json:"questId" gorm:"column:quest_id;not null;uniqueIndex:idx_quest_draw"`
	Period      string     `json:"period" gorm:"column:period;not null"`
	Name        string     `json:"name" gorm:"column:name;not null"`
	Kind        string     `json:"kind" gorm:"column:kind;not null"`
	ChoreID     *int       `json:"choreId" gorm:"column:chore_id"`
	Target      int        `json:"target" gorm:"column:target;not null"`
	Reward      int        `json:"reward" gorm:"column:reward;not null"`
	CompletedAt *time.Time `json:"completedAt" gorm:"column:completed_at"`
}

func (QuestDraw) TableName() string { return "quest_draws" }

// Challenge is a goal between two dates. A shared challenge adds up what all
// its members do, such as 200 points together before the holidays for a
// family outing; otherwise each member plays alone.
type Challenge struct {
	ID       int    `json:"id" gorm:"primaryKey"`
	CircleID int    `json:"-" gorm:"column:circle_id;index;not null"`
	Name     string `json:"name" gorm:"column:name;not null"`
	Kind     string `json:"kind" gorm:"column:kind;not null"`
	ChoreID  *int   `json:"choreId" gorm:"column:chore_id"`
	Target   int    `json:"target" gorm:"column:target;not null"`
	// Reward is the points each winner gets; RewardText is a reward outside
	// the game, such as "Sortie piscine".
	Reward     int    `json:"reward" gorm:"column:reward;not null;default:0"`
	RewardText string `json:"rewardText" gorm:"column:reward_text"`
	Shared     bool   `json:"shared" gorm:"column:shared;not null;default:false"`
	// Members taking part. Empty means every member.
	UserIDs     []int      `json:"userIds" gorm:"column:user_ids;type:text;serializer:json"`
	StartsAt    time.Time  `json:"startsAt" gorm:"column:starts_at;not null"`
	EndsAt      time.Time  `json:"endsAt" gorm:"column:ends_at;not null"`
	CompletedAt *time.Time `json:"completedAt" gorm:"column:completed_at"` // shared challenges only
	CreatedBy   int        `json:"createdBy" gorm:"column:created_by"`
	CreatedAt   time.Time  `json:"createdAt" gorm:"column:created_at"`
}

func (Challenge) TableName() string { return "challenges" }

// ChallengeWin records that a member won a challenge, or took part in a
// shared one that was reached.
type ChallengeWin struct {
	ChallengeID int       `json:"challengeId" gorm:"primaryKey;autoIncrement:false"`
	UserID      int       `json:"userId" gorm:"primaryKey;autoIncrement:false"`
	WonAt       time.Time `json:"wonAt" gorm:"column:won_at"`
}

func (ChallengeWin) TableName() string { return "challenge_wins" }
