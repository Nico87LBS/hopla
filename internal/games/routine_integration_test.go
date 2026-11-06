package games_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	. "github.com/nico87lbs/hopla/internal/games"
)

func TestRoutineIntegrationTokensAreScopedAndRevocable(t *testing.T) {
	db := setup(t)
	now := noon(0)
	token, secret, err := CreateRoutineIntegrationToken(db, 1, 1, "Home Assistant", now)
	require.NoError(t, err)
	require.NotEmpty(t, secret)
	require.NotEqual(t, secret, token.TokenHash)
	require.Equal(t, "Home Assistant", token.Name)

	authenticated, err := AuthenticateRoutineIntegrationToken(db, secret, now.Add(time.Minute))
	require.NoError(t, err)
	require.Equal(t, 1, authenticated.FamilyID)
	require.Equal(t, token.ID, authenticated.ID)
	require.NotNil(t, authenticated.LastUsedAt)

	listed, err := ListRoutineIntegrationTokens(db, 1)
	require.NoError(t, err)
	require.Len(t, listed, 1)
	require.Empty(t, listed[0].TokenHash)

	require.ErrorIs(t, RevokeRoutineIntegrationToken(db, 2, token.ID, now.Add(2*time.Minute)), gorm.ErrRecordNotFound)
	require.NoError(t, RevokeRoutineIntegrationToken(db, 1, token.ID, now.Add(2*time.Minute)))
	_, err = AuthenticateRoutineIntegrationToken(db, secret, now.Add(3*time.Minute))
	require.ErrorIs(t, err, ErrRoutineIntegrationTokenInvalid)
}
