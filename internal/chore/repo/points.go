package chore

import (
	"time"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	fModel "github.com/nico87lbs/hopla/internal/family/model"
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
		FamilyID:  chore.FamilyID,
		ChoreID:   &choreID,
		Reason:    &name,
	}
}

// awardTask credits a completed task to userID with what the games make it
// worth (bonus period, surprise, flash bonus), records it on the history row
// so an undo takes back the same amount, and writes the ledger row.
func awardTask(tx *gorm.DB, chore *chModel.Chore, entry *chModel.ChoreHistory, userID, byUserID int, performedAt time.Time) error {
	earning, err := games.TaskEarning(tx, chore, userID, performedAt)
	if err != nil {
		return err
	}
	flash, err := games.FlashBonus(tx, chore, userID, entry.DueDate, performedAt)
	if err != nil {
		return err
	}
	points := earning.Points + flash.Points
	if points <= 0 {
		return nil
	}
	entry.Points = &points
	entry.FlashID = flash.FlashID
	if err := tx.Model(&fModel.UserFamily{}).Where("user_id = ? AND family_id = ?", userID, chore.FamilyID).
		Update("points", gorm.Expr("points + ?", points)).Error; err != nil {
		return err
	}
	row := taskPoints(chore, userID, byUserID, points)
	reason := earning.Reason + flash.Reason
	row.Reason = &reason
	return ptRepo.Record(tx, row)
}
