package chore

import (
	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	ptModel "github.com/nico87lbs/hopla/internal/points"
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
