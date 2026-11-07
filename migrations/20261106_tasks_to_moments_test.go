package migrations

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	syncModel "github.com/nico87lbs/hopla/internal/sync/model"
)

func TestTasksToMoments(t *testing.T) {
	paris, err := time.LoadLocation("Europe/Paris")
	require.NoError(t, err)
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "m.db")), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&chModel.Chore{}, &syncModel.SyncCursor{}))
	require.NoError(t, db.Exec(`CREATE TABLE families (id integer PRIMARY KEY, timezone text)`).Error)
	require.NoError(t, db.Exec(`INSERT INTO families (id, timezone) VALUES (1, 'Europe/Paris')`).Error)

	at := func(days, hour, minute int) *time.Time {
		d := time.Now().In(paris).AddDate(0, 0, days)
		utc := time.Date(d.Year(), d.Month(), d.Day(), hour, minute, 0, 0, paris).UTC()
		return &utc
	}
	ptr := func(n int) *int { return &n }
	tasks := []*chModel.Chore{
		{Name: "Brosser", FrequencyType: chModel.FrequencyTypeDaily, IsActive: true, FamilyID: 1, NextDueDate: at(1, 8, 0), DeadlineMinutes: ptr(120)},
		{Name: "Poubelles", FrequencyType: chModel.FrequencyTypeWeekly, IsActive: true, FamilyID: 1, NextDueDate: at(3, 18, 30)},
		{Name: "En retard", FrequencyType: chModel.FrequencyTypeMonthly, IsActive: true, FamilyID: 1, NextDueDate: at(-4, 9, 0), DeadlineMinutes: ptr(2000)},
		{Name: "Toujours", FrequencyType: chModel.FrequencyTypeAlways, IsActive: true, FamilyID: 1},
		{Name: "Heures", FrequencyType: chModel.FrequencyTypeInterval, IsActive: true, FamilyID: 1, NextDueDate: at(0, 9, 0),
			FrequencyMetadataV2: &chModel.FrequencyMetadata{Unit: func() *string { u := "hours"; return &u }()}},
		{Name: "Déjà", FrequencyType: chModel.FrequencyTypeDaily, IsActive: true, FamilyID: 1, NextDueDate: at(1, 7, 0),
			FrequencyMetadataV2: &chModel.FrequencyMetadata{Slots: []chModel.Slot{{ID: "x", Time: "07:00"}}}},
	}
	require.NoError(t, db.Create(&tasks).Error)

	require.NoError(t, TasksToMoments20261106{}.Up(context.Background(), db))

	get := func(id int) chModel.Chore {
		var c chModel.Chore
		require.NoError(t, db.First(&c, id).Error)
		return c
	}
	daily := get(tasks[0].ID)
	require.Len(t, daily.FrequencyMetadataV2.Slots, 1)
	slot := daily.FrequencyMetadataV2.Slots[0]
	require.Equal(t, "08:00", slot.Time)
	require.Equal(t, "10:00", slot.Until)
	require.Equal(t, 8*60, *slot.OpensBefore, "opens from midnight")
	require.NotEmpty(t, slot.ID)
	require.Empty(t, daily.FrequencyMetadataV2.Day, "a daily task has moments every day")
	require.Nil(t, daily.DeadlineMinutes)
	require.True(t, daily.NextDueDate.Equal(*tasks[0].NextDueDate))

	weekly := get(tasks[1].ID)
	require.Equal(t, "18:30", weekly.FrequencyMetadataV2.Slots[0].Time)
	require.Equal(t, tasks[1].NextDueDate.In(paris).Format("2006-01-02"), weekly.FrequencyMetadataV2.Day)
	require.Equal(t, 18*60+30, *weekly.FrequencyMetadataV2.Slots[0].OpensBefore, "no window: open from midnight")

	late := get(tasks[2].ID)
	require.Equal(t, time.Now().In(paris).Format("2006-01-02"), late.FrequencyMetadataV2.Day, "a gone day moves to today")
	require.Empty(t, late.FrequencyMetadataV2.Slots[0].Until, "a limit past midnight is dropped")

	for _, i := range []int{3, 4, 5} {
		other := get(tasks[i].ID)
		if i == 5 {
			require.Equal(t, "x", other.FrequencyMetadataV2.Slots[0].ID)
			continue
		}
		require.False(t, other.HasSlots())
	}

	var version int64
	require.NoError(t, db.Raw(`SELECT max_version FROM sync_cursors WHERE family_id = 1`).Scan(&version).Error)
	require.EqualValues(t, 3, version)

	// Down puts the old values back.
	require.NoError(t, TasksToMoments20261106{}.Down(context.Background(), db))
	back := get(tasks[0].ID)
	require.False(t, back.HasSlots())
	require.Equal(t, 120, *back.DeadlineMinutes)
	weeklyBack := get(tasks[1].ID)
	require.False(t, weeklyBack.HasSlots())
}
