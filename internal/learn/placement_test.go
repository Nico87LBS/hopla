package learn_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	. "github.com/nico87lbs/hopla/internal/learn"
)

func active(t *testing.T, player Player) map[string]bool {
	t.Helper()
	out := map[string]bool{}
	for _, module := range player.Modules {
		out[module.Key] = true
	}
	return out
}

func TestAPlacementTestGivesTheLevelsOfThePackAndItsModulesWhole(t *testing.T) {
	db := setup(t)
	now := time.Now().UTC()
	require.NoError(t, Install(db, 1, "anglais-ecole", now))

	test, err := PlacementTestFor(db, 1, anna, "anglais-ecole", now)
	require.NoError(t, err)
	require.Nil(t, test.Placement, "never tested")
	require.Len(t, test.Levels, 4)
	require.Equal(t, "anglais-gs", test.Levels[0].ID)
	require.Equal(t, "anglais-gs-couleurs-nombres", test.Levels[0].Modules[0].ID)
	require.NotEmpty(t, test.Levels[0].Modules[0].Document, "a module not played yet comes whole")

	_, err = PlacementTestFor(db, 1, anna, "anglais-cp", now)
	require.Error(t, err, "a level is tested within its pack")

	require.NoError(t, Install(db, 1, "anglais-aero", now))
	aero, err := PlacementTestFor(db, 1, anna, "anglais-aero", now)
	require.NoError(t, err)
	require.Len(t, aero.Levels, 1, "a pack of modules is its own single level")
	require.Equal(t, "anglais-aero", aero.Levels[0].ID)
}

func TestAPlacementOpensItsChaptersAndTurnsOnTheLevelsUpToTheOneReached(t *testing.T) {
	db := setup(t)
	now := time.Now().UTC()
	require.NoError(t, Install(db, 1, "anglais-ecole", now))
	require.NoError(t, SetActivation(db, 1, ActivationChange{UserID: anna, Modules: []string{"anglais-ecole"}, Active: true}, now))

	_, err := SavePlacement(db, 1, PlacementResult{UserID: anna, Pack: "anglais-ecole", Status: PlacementDone,
		Reached: "maths-ce2"}, now)
	require.Error(t, err, "the level reached is one of the pack")

	saved, err := SavePlacement(db, 1, PlacementResult{UserID: anna, Pack: "anglais-ecole", Status: PlacementDone,
		Reached: "anglais-cp", Opened: []string{"anglais-gs-couleurs-nombres/colours", "anglais-cp-se-presenter/greetings",
			"maths-ce2-tables/x2"}}, now)
	require.NoError(t, err)
	require.Equal(t, []string{"anglais-gs-couleurs-nombres/colours", "anglais-cp-se-presenter/greetings"}, saved.Opened,
		"only chapters of the pack open")

	player, err := PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	on := active(t, player)
	require.True(t, on["anglais-gs-ma-journee"], "the levels below stay on to review")
	require.True(t, on["anglais-cp-ecole"])
	require.False(t, on["anglais-ce1-jours-nombres"], "the levels above go off")
	require.False(t, on["anglais-ce2-phrases"])
	for _, module := range player.Modules {
		if module.Key == "anglais-gs-couleurs-nombres" {
			require.Equal(t, []string{"colours"}, module.Placed)
		}
	}
	require.Len(t, player.Placements, 1)

	only, err := SetPlacementKeep(db, 1, anna, "anglais-ecole", KeepOnly, now)
	require.NoError(t, err)
	require.Equal(t, KeepOnly, only.Keep)
	player, err = PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	on = active(t, player)
	require.False(t, on["anglais-gs-ma-journee"], "only the level reached")
	require.True(t, on["anglais-cp-ecole"])

	keep := KeepUpTo
	again, err := SavePlacement(db, 1, PlacementResult{UserID: anna, Pack: "anglais-ecole", Status: PlacementDone,
		Reached: "anglais-ce1", Keep: &keep}, now)
	require.NoError(t, err, "the test can be done again")
	require.Equal(t, KeepUpTo, again.Keep)
	require.Empty(t, again.Opened)
	player, err = PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	on = active(t, player)
	require.True(t, on["anglais-gs-ma-journee"])
	require.True(t, on["anglais-ce1-jours-nombres"])
	require.False(t, on["anglais-ce2-phrases"])
}

func TestASkippedPlacementStartsAtTheFirstLevelAndIsNotOfferedAgain(t *testing.T) {
	db := setup(t)
	now := time.Now().UTC()
	require.NoError(t, Install(db, 1, "anglais-ecole", now))
	require.NoError(t, SetActivation(db, 1, ActivationChange{UserID: anna, Modules: []string{"anglais-ecole"}, Active: true}, now))
	_, err := SavePlacement(db, 1, PlacementResult{UserID: anna, Pack: "anglais-ecole", Status: PlacementSkipped,
		Reached: "anglais-ce2"}, now)
	require.NoError(t, err)
	player, err := PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	require.Len(t, player.Modules, 3, "starting at the beginning keeps the first level only")
	require.Equal(t, PlacementSkipped, player.Placements[0].Status)
	require.Empty(t, player.Placements[0].Reached)

	_, err = SavePlacement(db, 1, PlacementResult{UserID: 99, Pack: "anglais-ecole", Status: PlacementSkipped}, now)
	require.Error(t, err, "only for the family")

	require.NoError(t, Remove(db, 1, "anglais-ecole", false))
	placements, err := Placements(db, 1, nil)
	require.NoError(t, err)
	require.Empty(t, placements, "a pack removed takes its tests away")
}
