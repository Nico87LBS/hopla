package learn_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	. "github.com/nico87lbs/hopla/internal/learn"
)

func multiplicationOf(t *testing.T, player Player) PlayerModule {
	t.Helper()
	for _, module := range player.Modules {
		if module.Key == "maths-ce2-multiplication" {
			return module
		}
	}
	t.Fatal("la multiplication CE2 n'est pas jouée")
	return PlayerModule{}
}

func TestAParentOpensAndClosesAChapterByHand(t *testing.T) {
	db := setup(t)
	now := time.Now().UTC()
	require.NoError(t, Install(db, 1, "maths-ecole", now))
	require.NoError(t, SetPackPlayer(db, 1, anna, "maths-ecole", true, now))
	require.NoError(t, SetPackAccess(db, 1, anna, "maths-ecole", "maths-ce2", "open", now))

	chapters := []string{"maths-ce2-multiplication/tables-6-7", "maths-ce2-multiplication/tables-8-9"}
	require.NoError(t, SetChapterAccess(db, 1, anna, "maths-ecole", chapters, "open", now))
	player, err := PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	require.Equal(t, []string{"tables-6-7", "tables-8-9"}, multiplicationOf(t, player).Forced)
	require.Empty(t, multiplicationOf(t, player).Shut)

	require.NoError(t, SetChapterAccess(db, 1, anna, "maths-ecole", chapters[:1], "locked", now))
	player, err = PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	require.Equal(t, []string{"tables-8-9"}, multiplicationOf(t, player).Forced, "closing replaces the opening")
	require.Equal(t, []string{"tables-6-7"}, multiplicationOf(t, player).Shut)

	require.NoError(t, SetChapterAccess(db, 1, anna, "maths-ecole", chapters, "auto", now))
	player, err = PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	require.Empty(t, multiplicationOf(t, player).Forced)
	require.Empty(t, multiplicationOf(t, player).Shut)

	require.Error(t, SetChapterAccess(db, 1, anna, "maths-ecole", []string{"maths-ce2-multiplication/inconnu"}, "open", now),
		"only the chapters of the pack")
	require.Error(t, SetChapterAccess(db, 1, anna, "maths-ecole", chapters, "ouvert", now))
	require.Error(t, SetChapterAccess(db, 1, 3, "maths-ecole", chapters, "open", now), "someone who does not play the pack")
}

func TestATestPassedKeepsWhatAParentChoseAndNeverLowersTheLevel(t *testing.T) {
	db := setup(t)
	now := time.Now().UTC()
	require.NoError(t, Install(db, 1, "maths-ecole", now))
	require.NoError(t, SetPackPlayer(db, 1, anna, "maths-ecole", true, now))

	saved, err := SavePlacement(db, 1, PlacementResult{UserID: anna, Pack: "maths-ecole", Status: PlacementDone,
		Reached: "maths-ce2", Merge: true, Opened: []string{"maths-ce2-multiplication/tables-2-5"}}, now)
	require.NoError(t, err)
	require.Equal(t, "maths-ce2", saved.Reached)

	require.NoError(t, SetChapterAccess(db, 1, anna, "maths-ecole", []string{"maths-ce2-multiplication/tables-8-9"}, "locked", now))
	saved, err = SavePlacement(db, 1, PlacementResult{UserID: anna, Pack: "maths-ecole", Status: PlacementDone,
		Reached: "maths-cp", Merge: true, Opened: []string{"maths-cp-nombres/lire"}}, now)
	require.NoError(t, err)
	require.Equal(t, "maths-ce2", saved.Reached, "a test of a lower level keeps the level reached")
	require.Contains(t, saved.Opened, "maths-ce2-multiplication/tables-2-5", "the chapters already opened stay")

	player, err := PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	require.Equal(t, []string{"tables-8-9"}, multiplicationOf(t, player).Shut, "a test never undoes a parent's choice")
}

func TestAPackOfTheFamilyIsAPackOfOneLevel(t *testing.T) {
	db := setup(t)
	now := time.Now().UTC()
	raw := `{"format":"hopla-module/1","id":"famille-dictee","version":"1.0.0","nom":"Dictée","public":"enfant","niveaux":[],"langue":"fr","chapitres":[{"id":"a","nom":"Semaine 1","niveau":"Automne","groupe":"Mots en -ette"},{"id":"b","nom":"Semaine 2","ouvert_apres":80,"niveau":"Automne","groupe":"Mots en -ette"}],"fiches":[{"type":"saisie","question":"1+1","reponse":"2","id":"x","chapitre":"a"},{"type":"saisie","question":"2+2","reponse":"4","id":"y","chapitre":"b"}]}`
	_, err := Import(db, 1, []byte(raw), now)
	require.NoError(t, err)

	test, err := PlacementTestFor(db, 1, anna, "famille-dictee", now)
	require.NoError(t, err)
	require.Len(t, test.Levels, 1)
	require.Len(t, test.Levels[0].Modules, 1)

	require.NoError(t, SetPackPlayer(db, 1, anna, "famille-dictee", true, now))
	player, err := PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	require.True(t, active(t, player)["famille-dictee"])
	require.NoError(t, SetChapterAccess(db, 1, anna, "famille-dictee", []string{"famille-dictee/b"}, "open", now))

	require.NoError(t, SetPackPlayer(db, 1, anna, "famille-dictee", false, now))
	player, err = PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	require.Empty(t, player.Modules)

	tooLong := `{"format":"hopla-module/1","id":"famille-long","version":"1.0.0","nom":"Long","public":"enfant","niveaux":[],"langue":"fr","chapitres":[{"id":"a","nom":"A","groupe":"` +
		"0123456789012345678901234567890123456789012345678901234567890123456789" + `"}],"fiches":[{"type":"saisie","question":"1+1","reponse":"2","id":"x","chapitre":"a"}]}`
	_, err = Import(db, 1, []byte(tooLong), now)
	require.Error(t, err, "a group of 60 letters at most")
}
