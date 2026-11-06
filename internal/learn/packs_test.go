package learn_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/nico87lbs/hopla/internal/database"
	. "github.com/nico87lbs/hopla/internal/learn"
)

func TestATickedPackOpensItsFirstLevelThenTheNextOnceKnown(t *testing.T) {
	db := setup(t)
	now := time.Now().UTC()
	require.NoError(t, Install(db, 1, "anglais-ecole", now))
	require.NoError(t, SetPackPlayer(db, 1, anna, "anglais-ecole", true, now))

	player, err := PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	on := active(t, player)
	require.Len(t, on, 3, "only the first level before a test")
	require.True(t, on["anglais-gs-ma-journee"])
	require.Len(t, player.PackPlayers, 1)

	require.NoError(t, SetAside(db, 1, anna, "anglais-ecole", "anglais-gs-ma-journee", true, now))
	require.Error(t, SetAside(db, 1, anna, "anglais-ecole", "maths-ce2", true, now), "only what the pack holds")
	require.NoError(t, SetAside(db, 1, anna, "anglais-ecole", "anglais-cp", false, now))
	player, err = PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	on = active(t, player)
	require.False(t, on["anglais-gs-ma-journee"], "set aside")
	require.False(t, on["anglais-cp-ecole"], "bringing back never opens a level")

	next, err := OpenNextLevel(db, 1, anna, "anglais-ecole", now)
	require.NoError(t, err)
	require.Equal(t, "anglais-cp", next.OpenTo)
	player, err = PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	on = active(t, player)
	require.True(t, on["anglais-cp-ecole"], "the next level opens")
	require.True(t, on["anglais-gs-couleurs-nombres"], "the levels below stay")
	require.False(t, on["anglais-gs-ma-journee"], "still set aside")

	require.NoError(t, SetPackPlayer(db, 1, anna, "anglais-ecole", false, now))
	player, err = PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	require.Empty(t, player.Modules, "unticked, nothing stays on")
}

func TestParentCanChooseAccessForSingleLevelPack(t *testing.T) {
	db := setup(t)
	now := time.Now().UTC()
	require.NoError(t, Install(db, 1, "anglais-aero", now))
	require.NoError(t, SetPackPlayer(db, 1, anna, "anglais-aero", true, now))

	// A single-level pack uses the pack key as its only level key.
	require.NoError(t, SetPackAccess(db, 1, anna, "anglais-aero", "anglais-aero", "locked", now))
	player, err := PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	on := active(t, player)
	require.False(t, on["anglais-aero-meteo"], "a locked single level stays off")
	require.False(t, on["anglais-aero-radio"], "every module of the locked level stays off")

	require.NoError(t, SetPackAccess(db, 1, anna, "anglais-aero", "anglais-aero", "open", now))
	player, err = PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	on = active(t, player)
	require.True(t, on["anglais-aero-meteo"], "a forced-open single level is playable")
	require.True(t, on["anglais-aero-radio"], "every module of the forced-open level is playable")

	require.NoError(t, SetPackAccess(db, 1, anna, "anglais-aero", "anglais-aero", "auto", now))
	player, err = PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	on = active(t, player)
	require.True(t, on["anglais-aero-meteo"], "automatic returns to the one-level progression")
	require.True(t, on["anglais-aero-radio"], "the whole level follows the progression")
}

func TestPeoplePlayingPacksModuleByModuleGetTheirPacksTicked(t *testing.T) {
	db := setup(t)
	now := time.Now().UTC()
	require.NoError(t, Install(db, 1, "anglais-ecole", now))
	require.NoError(t, Install(db, 1, "maths-ecole", now))
	require.NoError(t, SetActivation(db, 1, ActivationChange{UserID: anna, Modules: []string{"anglais-ecole", "maths-ce2"}, Active: true}, now))

	require.NoError(t, database.Migration(db), "the migration runs at each start")
	require.NoError(t, database.Migration(db), "and only once does anything")
	players, err := PackPlayers(db, 1, nil)
	require.NoError(t, err)
	require.Len(t, players, 2)

	player, err := PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	on := active(t, player)
	require.True(t, on["anglais-gs-ma-journee"], "every level played: back to the first one")
	require.False(t, on["anglais-cp-ecole"])
	require.True(t, on["maths-ce2-geometrie"], "higher levels played alone stay open")
	require.False(t, on["maths-gs-formes"], "the levels below them set aside")
	for _, p := range players {
		if p.PackKey == "maths-ecole" {
			require.Equal(t, "maths-ce2", p.OpenTo)
			require.Contains(t, p.Excluded, "maths-gs")
		}
	}
}

func TestParentCanChooseAutomaticOpenOrLockedPackLevel(t *testing.T) {
	db := setup(t)
	now := time.Now().UTC()
	require.NoError(t, Install(db, 1, "maths-ecole", now))
	require.NoError(t, SetPackPlayer(db, 1, anna, "maths-ecole", true, now))

	// CE2 is normally beyond the first open level.
	require.NoError(t, SetPackAccess(db, 1, anna, "maths-ecole", "maths-ce2", "open", now))
	player, err := PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	on := active(t, player)
	require.True(t, on["maths-ce2-multiplication"], "a forced-open level is playable")

	// Locking the same level wins over both automatic and forced opening.
	require.NoError(t, SetPackAccess(db, 1, anna, "maths-ecole", "maths-ce2", "locked", now))
	player, err = PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	on = active(t, player)
	require.False(t, on["maths-ce2-multiplication"], "a locked level stays off")

	// Returning to automatic removes the override, not the progression.
	require.NoError(t, SetPackAccess(db, 1, anna, "maths-ecole", "maths-ce2", "auto", now))
	player, err = PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	on = active(t, player)
	require.False(t, on["maths-ce2-multiplication"], "automatic follows the current progression")
}
