package chore

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	fModel "github.com/nico87lbs/hopla/internal/family/model"
	"github.com/nico87lbs/hopla/internal/games"
)

func TestAFlashIsPaidWithTheTaskAndWonAgainAfterAnUndo(t *testing.T) {
	repo, db := newTestChoreRepo(t)
	ctx := context.Background()
	require.NoError(t, db.Create(&fModel.UserFamily{UserID: testOtherID, FamilyID: testFamilyID, IsActive: true}).Error)
	now := time.Now().UTC()
	due := now.Add(-5 * time.Minute)
	points, flashPoints, minutes := 3, 4, 15
	chore := &chModel.Chore{Name: "Ranger", FamilyID: testFamilyID, IsActive: true, FrequencyType: "daily",
		NextDueDate: &due, Points: &points, FlashPoints: &flashPoints, FlashMinutes: &minutes}
	require.NoError(t, db.Create(chore).Error)
	flash, err := games.LaunchFlash(db, testFamilyID, chore.ID, 10, 30, testOwnerID, now.Add(-time.Minute))
	require.NoError(t, err)

	earned := func() int {
		var member fModel.UserFamily
		require.NoError(t, db.Where("user_id = ? AND family_id = ?", testOtherID, testFamilyID).First(&member).Error)
		return member.Points
	}
	tomorrow := due.AddDate(0, 0, 1)
	require.NoError(t, repo.CompleteChore(ctx, chore, nil, testOtherID, &tomorrow, &now, nil, true))
	require.Equal(t, 3+4+10, earned())
	var history chModel.ChoreHistory
	require.NoError(t, db.Where("chore_id = ?", chore.ID).First(&history).Error)
	require.Equal(t, flash.ID, *history.FlashID)

	require.NoError(t, repo.UndoChoreAction(ctx, chore.ID, history.ID, testFamilyID, nil, &due))
	require.Equal(t, 0, earned())
	require.NoError(t, repo.CompleteChore(ctx, chore, nil, testOtherID, &tomorrow, &now, nil, true))
	require.Equal(t, 3+4+10, earned(), "the undone flash can be won again")
}
