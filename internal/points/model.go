package model

import "time"

// PointsHistory is the points ledger: one row for every change to a member's
// points, so a family can see why a balance moved.
type PointsHistory struct {
	ID        int                 `json:"id" gorm:"primary_key"`                   // Unique identifier
	Action    PointsHistoryAction `json:"action" gorm:"column:action"`             // Action
	Points    int                 `json:"points" gorm:"column:points"`             // Points
	CreatedAt time.Time           `json:"created_at" gorm:"column:created_at"`     // Created at
	CreatedBy int                 `json:"created_by" gorm:"column:created_by"`     // Created by
	UserID    int                 `json:"user_id" gorm:"column:user_id;index"`     // User ID
	CircleID  int                 `json:"circle_id" gorm:"column:circle_id;index"` // Circle ID with index
	// Why the points moved: the task, the reward, or a parent's own words.
	Reason   *string `json:"reason,omitempty" gorm:"column:reason"`
	ChoreID  *int    `json:"chore_id,omitempty" gorm:"column:chore_id"`
	RewardID *int    `json:"reward_id,omitempty" gorm:"column:reward_id"`
}

type PointsHistoryAction int8

// Delta is the change to the balance left to spend: points are stored as a
// positive amount and the action gives the direction.
func (h PointsHistory) Delta() int {
	amount := h.Points
	if amount < 0 {
		amount = -amount
	}
	switch h.Action {
	case PointsHistoryActionRemove, PointsHistoryActionRedeem, PointsHistoryActionPenalty:
		return -amount
	}
	return amount
}

const (
	// PointsHistoryActionAdd is points earned for a task.
	PointsHistoryActionAdd PointsHistoryAction = iota
	// PointsHistoryActionRemove takes back the points of an undone task.
	PointsHistoryActionRemove
	// PointsHistoryActionRedeem is points spent on a reward.
	PointsHistoryActionRedeem
	// PointsHistoryActionBonus is points a parent gives. They count as earned.
	PointsHistoryActionBonus
	// PointsHistoryActionPenalty is points a parent takes from the balance.
	// Like spending, it leaves the points earned, and so the rank, untouched.
	PointsHistoryActionPenalty
)

// PointsPreset is a ready-made bonus or penalty, such as "+5 Helped without
// being asked" or "-3 Forgot the dishes", that parents pick with one tap.
type PointsPreset struct {
	ID        int       `json:"id" gorm:"primary_key"`
	CircleID  int       `json:"circleId" gorm:"column:circle_id;index"`
	Name      string    `json:"name" gorm:"column:name"`
	Points    int       `json:"points" gorm:"column:points"` // positive for a bonus, negative for a penalty
	CreatedAt time.Time `json:"createdAt" gorm:"column:created_at"`
	UpdatedAt time.Time `json:"updatedAt" gorm:"column:updated_at"`
}
