package learn_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	. "github.com/nico87lbs/hopla/internal/learn"
)

func TestPlayLinkOpensOnePlaySession(t *testing.T) {
	db := setup(t)
	now := time.Now().UTC()
	code, expires, err := NewPlayLink(db, 1, 2, 1, now)
	require.NoError(t, err)
	require.Equal(t, now.Add(PlayLinkTTL), expires)

	_, err = PlaySession(db, code, now)
	require.ErrorIs(t, err, ErrPlayExpired, "a link is not a session")

	secret, session, err := StartPlay(db, code, now.Add(10*time.Second))
	require.NoError(t, err)
	require.Equal(t, 2, session.UserID)
	_, _, err = StartPlay(db, code, now.Add(11*time.Second))
	require.ErrorIs(t, err, ErrPlayExpired, "a link is good once")

	found, err := PlaySession(db, secret, now.Add(time.Hour))
	require.NoError(t, err)
	require.Equal(t, 1, found.FamilyID)
	_, err = PlaySession(db, secret, now.Add(PlaySessionTTL+time.Minute))
	require.ErrorIs(t, err, ErrPlayExpired, "a session ends")

	require.NoError(t, EndPlay(db, secret))
	_, err = PlaySession(db, secret, now)
	require.ErrorIs(t, err, ErrPlayExpired, "a closed session is gone")

	late, _, err := NewPlayLink(db, 1, 2, 1, now)
	require.NoError(t, err)
	_, _, err = StartPlay(db, late, now.Add(PlayLinkTTL+time.Second))
	require.ErrorIs(t, err, ErrPlayExpired, "a link lasts a minute")
}
