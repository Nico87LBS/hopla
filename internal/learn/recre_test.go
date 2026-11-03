package learn_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	. "github.com/nico87lbs/hopla/internal/learn"
)

func TestRecreComesEveryThreeGoodGames(t *testing.T) {
	db := setup(t)
	now := time.Date(2026, 11, 3, 15, 0, 0, 0, time.UTC)
	played := func(stars int, at time.Time) {
		require.NoError(t, db.Create(&Session{FamilyID: 1, ClientID: at.String() + string(rune('a'+stars)), UserID: anna,
			ModuleKey: "m", Day: "2026-11-03", Stars: stars, PlayedAt: at, CreatedAt: at}).Error)
	}

	r, err := RecreFor(db, 1, anna, now)
	require.NoError(t, err)
	require.True(t, r.On)
	require.Equal(t, RecreEvery, r.Every)
	require.Len(t, r.Games, len(RecreGames))
	require.False(t, r.Ready())

	// Yesterday's games do not count, nor a game with one star.
	played(3, now.Add(-24*time.Hour))
	played(1, now.Add(-3*time.Hour))
	played(2, now.Add(-2*time.Hour))
	played(3, now.Add(-90*time.Minute))
	r, _ = RecreFor(db, 1, anna, now)
	require.Equal(t, 2, r.Since)
	_, err = RecordRecre(db, 1, RecreGame{ClientID: "x1", UserID: anna, Game: "train", Score: 12}, now)
	require.ErrorIs(t, err, ErrNoRecre)

	played(2, now.Add(-time.Hour))
	r, err = RecordRecre(db, 1, RecreGame{ClientID: "x1", UserID: anna, Game: "train", Score: 12}, now)
	require.NoError(t, err)
	require.Equal(t, 0, r.Since, "the récré played starts the count again")
	require.Len(t, r.Records, 1)
	require.Equal(t, RecreRecord{Game: "train", UserID: anna, Score: 12}, r.Records[0])

	// Sent twice (offline), it counts once.
	r, err = RecordRecre(db, 1, RecreGame{ClientID: "x1", UserID: anna, Game: "train", Score: 12}, now)
	require.NoError(t, err)
	var plays int64
	db.Model(&RecrePlay{}).Count(&plays)
	require.EqualValues(t, 1, plays)
}

func TestRecreSettings(t *testing.T) {
	db := setup(t)
	now := time.Date(2026, 11, 3, 15, 0, 0, 0, time.UTC)
	off, every, minutes := false, 5, 2
	require.NoError(t, SetRecre(db, 1, RecreChange{UserID: anna, Every: &every, Minutes: &minutes,
		Games: []string{"bulles", "train"}}, now))
	r, err := RecreFor(db, 1, anna, now)
	require.NoError(t, err)
	require.Equal(t, 5, r.Every)
	require.Equal(t, 2, r.Minutes)
	require.Equal(t, []string{"train", "bulles"}, r.Games)

	require.NoError(t, SetRecre(db, 1, RecreChange{UserID: anna, On: &off}, now))
	r, _ = RecreFor(db, 1, anna, now)
	require.False(t, r.On)
	require.Equal(t, 5, r.Every, "turning it off keeps the rest")

	bad := 0
	require.Error(t, SetRecre(db, 1, RecreChange{UserID: anna, Every: &bad}, now))
	require.Error(t, SetRecre(db, 1, RecreChange{UserID: anna, Games: []string{"echecs"}}, now))
	require.Error(t, SetRecre(db, 1, RecreChange{UserID: 999, On: &off}, now))
}
