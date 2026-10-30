package chore

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	fModel "github.com/nico87lbs/hopla/internal/family/model"
	"github.com/nico87lbs/hopla/internal/zone"
)

func TestMovingTheFamilyKeepsTheTimeOfDay(t *testing.T) {
	repo, db := newTestChoreRepo(t)
	ctx := context.Background()
	paris, _ := time.LoadLocation("Europe/Paris")
	saved := time.Local
	time.Local = paris
	t.Cleanup(func() { time.Local = saved; zone.Forget(testFamilyID) })
	require.NoError(t, db.Create(&fModel.Family{ID: testFamilyID, Name: "Maison"}).Error)

	due := time.Date(2026, 10, 24, 7, 0, 0, 0, paris)
	chore := &chModel.Chore{Name: "Dents", FamilyID: testFamilyID, IsActive: true, FrequencyType: "daily",
		NextDueDate: &due, FrequencyMetadataV2: &chModel.FrequencyMetadata{Timezone: "UTC"}}
	require.NoError(t, db.Create(chore).Error)
	dueIn := func(loc *time.Location) time.Time {
		var saved chModel.Chore
		require.NoError(t, db.First(&saved, chore.ID).Error)
		return saved.NextDueDate.In(loc)
	}

	changed, err := repo.SetFamilyTimezone(ctx, testFamilyID, "America/New_York")
	require.NoError(t, err)
	require.True(t, changed)
	newYork, _ := time.LoadLocation("America/New_York")
	require.Equal(t, newYork, zone.Of(testFamilyID))
	require.Equal(t, time.Date(2026, 10, 24, 7, 0, 0, 0, newYork), dueIn(newYork), "07:00 in New York")

	changed, err = repo.SetFamilyTimezone(ctx, testFamilyID, "America/New_York")
	require.NoError(t, err)
	require.False(t, changed, "already there")

	_, err = repo.SetFamilyTimezone(ctx, testFamilyID, "")
	require.NoError(t, err)
	require.Equal(t, time.Date(2026, 10, 24, 7, 0, 0, 0, paris), dueIn(paris), "back home at 07:00")
	require.Equal(t, "Europe/Paris", zone.Name(testFamilyID))

	_, err = repo.SetFamilyTimezone(ctx, testFamilyID, "Not/AZone")
	require.Error(t, err)
}
