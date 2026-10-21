// Package games holds the family games built on points: streaks, bonus
// periods and the surprise task of the day.
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
	SurpriseEnabled bool      `json:"surpriseEnabled" gorm:"column:surprise_enabled;not null;default:false"`
	SurpriseBonus   int       `json:"surpriseBonus" gorm:"column:surprise_bonus;not null;default:0"`
	UpdatedAt       time.Time `json:"updatedAt" gorm:"column:updated_at"`
}

func (Rules) TableName() string { return "game_rules" }

// DefaultRules are what a circle plays with until a parent changes them.
func DefaultRules(circleID int) Rules {
	return Rules{CircleID: circleID, StreakEvery: 7, StreakBonus: 10, SurpriseEnabled: true, SurpriseBonus: 5}
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
