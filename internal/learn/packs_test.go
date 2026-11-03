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
