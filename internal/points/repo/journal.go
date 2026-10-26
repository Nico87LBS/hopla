package points

import (
	"context"
	"sort"
	"time"

	pModel "github.com/nico87lbs/hopla/internal/points"
)

// JournalKind narrows the journal to one kind of row.
type JournalKind string

const (
	JournalAll    JournalKind = ""
	JournalTasks  JournalKind = "task"
	JournalGames  JournalKind = "game"
	JournalBonus  JournalKind = "bonus"
	JournalReward JournalKind = "reward"
)

// JournalFilter narrows the journal to a member and a kind, and pages back
// in time from Before.
type JournalFilter struct {
	UserID *int
	Kind   JournalKind
	Before *time.Time
	Limit  int
}

// JournalRow is a ledger row, or a task done that earned nothing (ChoreName
// set, no ledger row).
type JournalRow struct {
	pModel.PointsHistory
	ChoreName *string
}

// The ledger actions of each kind.
var journalActions = map[JournalKind][]pModel.PointsHistoryAction{
	JournalTasks:  {pModel.PointsHistoryActionAdd, pModel.PointsHistoryActionRemove},
	JournalGames:  {pModel.PointsHistoryActionGame},
	JournalBonus:  {pModel.PointsHistoryActionBonus, pModel.PointsHistoryActionPenalty},
	JournalReward: {pModel.PointsHistoryActionRedeem},
}

// choreHistoryCompleted is chModel.ChoreHistoryStatusCompleted; the chore
// package depends on this one.
const choreHistoryCompleted = 1

// Journal returns what happened in a circle, newest first: every change to
// the points, and the tasks done that earned none. A private task only shows
// to its creator and to whoever did it. The second value tells whether older
// rows remain.
func (r *PointsRepository) Journal(c context.Context, circleID, viewerID int, filter JournalFilter) ([]JournalRow, bool, error) {
	limit := filter.Limit
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	db := r.db.WithContext(c)

	rows := []JournalRow{}
	if filter.Kind == JournalAll || journalActions[filter.Kind] != nil {
		ledger := db.Where("circle_id = ?", circleID)
		if filter.Kind != JournalAll {
			ledger = ledger.Where("action IN ?", journalActions[filter.Kind])
		}
		if filter.UserID != nil {
			ledger = ledger.Where("user_id = ?", *filter.UserID)
		}
		if filter.Before != nil {
			ledger = ledger.Where("created_at < ?", *filter.Before)
		}
		var entries []pModel.PointsHistory
		if err := ledger.Order("created_at desc, id desc").Limit(limit + 1).Find(&entries).Error; err != nil {
			return nil, false, err
		}
		for _, entry := range entries {
			rows = append(rows, JournalRow{PointsHistory: entry})
		}
	}

	if filter.Kind == JournalAll || filter.Kind == JournalTasks {
		tasks := db.Table("chore_histories AS h").
			Select("h.id, h.chore_id, h.completed_by, h.performed_at, c.name").
			Joins("JOIN chores AS c ON c.id = h.chore_id").
			Where("c.circle_id = ? AND h.status = ? AND h.performed_at IS NOT NULL", circleID, choreHistoryCompleted).
			Where("h.points IS NULL OR h.points = 0").
			Where("c.is_private = ? OR c.created_by = ? OR h.completed_by = ?", false, viewerID, viewerID)
		if filter.UserID != nil {
			tasks = tasks.Where("h.completed_by = ?", *filter.UserID)
		}
		if filter.Before != nil {
			tasks = tasks.Where("h.performed_at < ?", *filter.Before)
		}
		var done []struct {
			ID          int
			ChoreID     int
			CompletedBy int
			PerformedAt time.Time
			Name        string
		}
		if err := tasks.Order("h.performed_at desc, h.id desc").Limit(limit + 1).Scan(&done).Error; err != nil {
			return nil, false, err
		}
		for _, d := range done {
			choreID, name := d.ChoreID, d.Name
			rows = append(rows, JournalRow{ChoreName: &name, PointsHistory: pModel.PointsHistory{
				ID: d.ID, Action: pModel.PointsHistoryActionAdd, ChoreID: &choreID, UserID: d.CompletedBy,
				CreatedBy: d.CompletedBy, CircleID: circleID, CreatedAt: d.PerformedAt}})
		}
	}

	sort.SliceStable(rows, func(i, j int) bool { return rows[i].CreatedAt.After(rows[j].CreatedAt) })
	if len(rows) > limit {
		return rows[:limit], true, nil
	}
	return rows, false, nil
}
