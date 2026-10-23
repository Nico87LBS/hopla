package games_test

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	cModel "github.com/nico87lbs/hopla/internal/circle/model"
	"github.com/nico87lbs/hopla/internal/database"
	. "github.com/nico87lbs/hopla/internal/games"
	ptModel "github.com/nico87lbs/hopla/internal/points"
)

func setup(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "games.db")), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, database.Migration(db))
	require.NoError(t, db.Create(&cModel.UserCircle{UserID: 2, CircleID: 1, Role: cModel.UserRoleMember, IsActive: true}).Error)
	return db
}

func chore(t *testing.T, db *gorm.DB, name string, points int, due time.Time, extra func(*chModel.Chore)) *chModel.Chore {
	c := &chModel.Chore{Name: name, CircleID: 1, IsActive: true, Points: &points, NextDueDate: &due, FrequencyType: "daily"}
	if extra != nil {
		extra(c)
	}
	require.NoError(t, db.Create(c).Error)
	return c
}

func done(t *testing.T, db *gorm.DB, choreID, userID int, at time.Time) {
	require.NoError(t, db.Create(&chModel.ChoreHistory{ChoreID: choreID, CompletedBy: userID, PerformedAt: &at,
		Status: chModel.ChoreHistoryStatusCompleted}).Error)
}

func noon(daysAgo int) time.Time {
	now := time.Now()
	return time.Date(now.Year(), now.Month(), now.Day(), 12, 0, 0, 0, time.Local).AddDate(0, 0, -daysAgo)
}

func TestBonusPeriodAndSurpriseRaiseTaskPoints(t *testing.T) {
	db := setup(t)
	// Noon, so that two hours later is still the same day and the same surprise.
	now := noon(0)
	task := chore(t, db, "Chambre", 3, now, nil)
	earning, err := TaskEarning(db, task, now)
	require.NoError(t, err)
	require.Equal(t, 3, earning.Points)

	require.NoError(t, db.Create(&BonusPeriod{CircleID: 1, Name: "Vacances", StartsAt: now.Add(-time.Hour),
		EndsAt: now.Add(time.Hour), Multiplier: 2}).Error)
	require.NoError(t, db.Create(&BonusPeriod{CircleID: 2, Name: "Other circle", StartsAt: now.Add(-time.Hour),
		EndsAt: now.Add(time.Hour), Multiplier: 5}).Error)
	surprise, err := TodaySurprise(db, 1, now)
	require.NoError(t, err)
	require.Equal(t, task.ID, surprise.ChoreID)
	earning, err = TaskEarning(db, task, now)
	require.NoError(t, err)
	require.Equal(t, 3*2+5, earning.Points)
	require.Equal(t, "Chambre (×2 Vacances) (surprise +5)", earning.Reason)

	earning, err = TaskEarning(db, task, now.Add(2*time.Hour))
	require.NoError(t, err)
	require.Equal(t, 3+5, earning.Points, "the period is over")
}

func TestTheSurpriseIsWorthItForEachChildsCopy(t *testing.T) {
	db := setup(t)
	now := time.Now()
	elena := chore(t, db, "Faire son lit", 3, now, nil)
	surprise, err := TodaySurprise(db, 1, now)
	require.NoError(t, err)
	require.Equal(t, elena.ID, surprise.ChoreID)
	anna := chore(t, db, "faire son lit ", 3, now, nil)
	other := chore(t, db, "Mettre la table", 3, now, nil)
	same, err := SameTaskIDs(db, 1, elena.ID)
	require.NoError(t, err)
	require.Equal(t, []int{elena.ID, anna.ID}, same)

	for _, task := range []*chModel.Chore{elena, anna} {
		earning, err := TaskEarning(db, task, now)
		require.NoError(t, err)
		require.Equal(t, 3+5, earning.Points, task.Name)
	}
	earning, err := TaskEarning(db, other, now)
	require.NoError(t, err)
	require.Equal(t, 3, earning.Points)
}

func TestSurpriseStaysPutAndSkipsHiddenTasks(t *testing.T) {
	db := setup(t)
	now := time.Now()
	chore(t, db, "Private", 3, now, func(c *chModel.Chore) { c.IsPrivate = true })
	chore(t, db, "Tomorrow", 3, now.AddDate(0, 0, 2), nil)
	chore(t, db, "No points", 0, now, nil)
	surprise, err := TodaySurprise(db, 1, now)
	require.NoError(t, err)
	require.Nil(t, surprise, "no task everyone can see is due today")

	a := chore(t, db, "A", 2, now, nil)
	b := chore(t, db, "B", 2, now, nil)
	first, err := TodaySurprise(db, 1, now)
	require.NoError(t, err)
	require.Contains(t, []int{a.ID, b.ID}, first.ChoreID)
	require.NoError(t, db.Model(&chModel.Chore{}).Where("id = ?", first.ChoreID).
		Update("next_due_date", now.AddDate(0, 0, 1)).Error)
	again, err := TodaySurprise(db, 1, now)
	require.NoError(t, err)
	require.Equal(t, first.ChoreID, again.ChoreID, "doing it does not move the surprise")

	require.NoError(t, db.Save(&Rules{CircleID: 1, SurpriseEnabled: false, SurpriseBonus: 5}).Error)
	off, err := TodaySurprise(db, 1, now)
	require.NoError(t, err)
	require.Nil(t, off)
}

func TestStreakBonusOnTheFirstTaskOfTheDay(t *testing.T) {
	db := setup(t)
	require.NoError(t, db.Save(&Rules{CircleID: 1, StreakEvery: 3, StreakBonus: 10}).Error)
	task := chore(t, db, "Lit", 1, time.Now(), nil)
	done(t, db, task.ID, 2, noon(2))
	done(t, db, task.ID, 2, noon(1))
	now := time.Now()
	done(t, db, task.ID, 2, now)
	entry, err := AwardStreakBonus(db, 1, 2, now, now)
	require.NoError(t, err)
	require.NotNil(t, entry)
	require.Equal(t, ptModel.PointsHistoryActionBonus, entry.Action)
	require.Equal(t, "Série de 3 jours", *entry.Reason)
	var member cModel.UserCircle
	require.NoError(t, db.Where("user_id = 2").First(&member).Error)
	require.Equal(t, 10, member.Points)

	done(t, db, task.ID, 2, now)
	entry, err = AwardStreakBonus(db, 1, 2, now, now)
	require.NoError(t, err)
	require.Nil(t, entry, "only once a day")

	entry, err = AwardStreakBonus(db, 1, 2, noon(1), now)
	require.NoError(t, err)
	require.Nil(t, entry, "an approval of an older task does not count")
}

func TestPointsResetRestartsTheStreak(t *testing.T) {
	db := setup(t)
	task := chore(t, db, "Chambre", 3, time.Now(), nil)
	for _, ago := range []int{0, 1, 2} {
		done(t, db, task.ID, 2, noon(ago))
	}
	streaks, err := Streaks(db, 1, []int{2}, noon(0))
	require.NoError(t, err)
	require.Equal(t, 3, streaks[0].Current)

	resetAt := noon(0).Add(time.Hour)
	require.NoError(t, db.Model(&cModel.UserCircle{}).Where("user_id = 2").Update("streak_since", resetAt).Error)
	streaks, err = Streaks(db, 1, []int{2}, resetAt)
	require.NoError(t, err)
	require.Equal(t, 0, streaks[0].Current, "tasks before the reset no longer count")
	require.Equal(t, 0, streaks[0].Best)

	done(t, db, task.ID, 2, resetAt.Add(time.Minute))
	streaks, err = Streaks(db, 1, []int{2}, resetAt.Add(time.Hour))
	require.NoError(t, err)
	require.Equal(t, 1, streaks[0].Current, "a new run starts after it")
}
