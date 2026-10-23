package chore

import (
	"time"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	cModel "github.com/nico87lbs/hopla/internal/circle/model"
	"github.com/nico87lbs/hopla/internal/games"
	ptModel "github.com/nico87lbs/hopla/internal/points"
	ptRepo "github.com/nico87lbs/hopla/internal/points/repo"
	"gorm.io/gorm"
)

// taskPoints is the ledger row for points earned (or taken back) on a task.
func taskPoints(chore *chModel.Chore, userID, byUserID, points int) ptModel.PointsHistory {
	choreID := chore.ID
	name := chore.Name
	return ptModel.PointsHistory{
		Action:    ptModel.PointsHistoryActionAdd,
		Points:    points,
		UserID:    userID,
		CreatedBy: byUserID,
		CircleID:  chore.CircleID,
		ChoreID:   &choreID,
		Reason:    &name,
	}
}

// awardTask credits a completed task to userID with what the games make it
// worth (bonus period, surprise), records it on the history row so an undo
// takes back the same amount, and writes the ledger row.
func awardTask(tx *gorm.DB, chore *chModel.Chore, historyPoints **int, userID, byUserID int, performedAt time.Time) error {
	earning, err := games.TaskEarning(tx, chore, userID, performedAt)
	if err != nil || earning.Points <= 0 {
		return err
	}
	points := earning.Points
	*historyPoints = &points
	if err := tx.Model(&cModel.UserCircle{}).Where("user_id = ? AND circle_id = ?", userID, chore.CircleID).
		Update("points", gorm.Expr("points + ?", points)).Error; err != nil {
		return err
	}
	row := taskPoints(chore, userID, byUserID, points)
	row.Reason = &earning.Reason
	return ptRepo.Record(tx, row)
}
