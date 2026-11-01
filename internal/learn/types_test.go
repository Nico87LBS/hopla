package learn_test

import (
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	. "github.com/nico87lbs/hopla/internal/learn"
)

// moduleWith wraps cards in a module document of one chapter.
func moduleWith(t *testing.T, cards ...map[string]any) []byte {
	doc := map[string]any{
		"format": Format, "id": "essai", "version": "1", "nom": "Essai", "public": "enfant",
		"chapitres": []map[string]any{{"id": "c1", "nom": "Un"}},
		"fiches":    cards,
	}
	raw, err := json.Marshal(doc)
	require.NoError(t, err)
	return raw
}

func card(fields map[string]any) map[string]any {
	out := map[string]any{"id": "f1", "chapitre": "c1", "question": "Relie"}
	for k, v := range fields {
		out[k] = v
	}
	return out
}

func TestTheNewCardTypesAreReadWithWhatTheyNeed(t *testing.T) {
	ok := []map[string]any{
		card(map[string]any{"type": "associer", "paires": []any{
			[]any{"chat", map[string]any{"image": "cat"}},
			[]any{"chien", map[string]any{"texte": "dog", "image": "dog"}},
			[]any{"vache", "cow"},
		}}),
		card(map[string]any{"type": "ordre", "elements": []string{"lundi", "mardi", "mercredi"}}),
		card(map[string]any{"type": "classer",
			"boites":    []map[string]any{{"nom": "Vivant", "image": "cat"}, {"nom": "Non vivant"}},
			"a_classer": []map[string]any{{"texte": "Le chat", "boite": "Vivant"}, {"texte": "La pierre", "boite": "Non vivant"}}}),
		card(map[string]any{"type": "zones", "image": "carte-france", "question": "bretagne", "reponse": "Bretagne",
			"sens": []string{"toucher", "nommer"}}),
	}
	for _, c := range ok {
		_, err := Parse(moduleWith(t, c))
		require.NoError(t, err, c["type"])
	}

	bad := map[string]map[string]any{
		"two pairs":            card(map[string]any{"type": "associer", "paires": []any{[]any{"a", "b"}, []any{"c", "d"}}}),
		"a pair with one side": card(map[string]any{"type": "associer", "paires": []any{[]any{"a"}, []any{"c", "d"}, []any{"e", "f"}}}),
		"a side twice":         card(map[string]any{"type": "associer", "paires": []any{[]any{"a", "b"}, []any{"a", "d"}, []any{"e", "f"}}}),
		"two labels to order":  card(map[string]any{"type": "ordre", "elements": []string{"a", "b"}}),
		"a label twice":        card(map[string]any{"type": "ordre", "elements": []string{"a", "b", "a"}}),
		"an unknown box": card(map[string]any{"type": "classer", "boites": []map[string]any{{"nom": "A"}, {"nom": "B"}},
			"a_classer": []map[string]any{{"texte": "x", "boite": "A"}, {"texte": "y", "boite": "C"}}}),
		"one box": card(map[string]any{"type": "classer", "boites": []map[string]any{{"nom": "A"}},
			"a_classer": []map[string]any{{"texte": "x", "boite": "A"}, {"texte": "y", "boite": "A"}}}),
		"a key on a sort": card(map[string]any{"type": "classer", "cle": "fr:tri:x",
			"boites":    []map[string]any{{"nom": "A"}, {"nom": "B"}},
			"a_classer": []map[string]any{{"texte": "x", "boite": "A"}, {"texte": "y", "boite": "B"}}}),
		"zones without image":     card(map[string]any{"type": "zones", "question": "bretagne", "reponse": "Bretagne"}),
		"a zone not an id":        card(map[string]any{"type": "zones", "image": "carte-france", "question": "La Bretagne", "reponse": "Bretagne"}),
		"an unknown sense":        card(map[string]any{"type": "zones", "image": "carte-france", "question": "bretagne", "reponse": "Bretagne", "sens": []string{"inverse"}}),
		"a drawing not an id":     card(map[string]any{"type": "associer", "paires": []any{[]any{"a", map[string]any{"image": "../x"}}, []any{"c", "d"}, []any{"e", "f"}}}),
		"a choice without answer": card(map[string]any{"type": "choix"}),
	}
	for name, c := range bad {
		_, err := Parse(moduleWith(t, c))
		require.Error(t, err, name)
	}
}

func TestTheCountingGeneratorIsKnownAndItsKeysReserved(t *testing.T) {
	doc := map[string]any{
		"format": Format, "id": "essai", "version": "1", "nom": "Essai", "public": "enfant",
		"chapitres":   []map[string]any{{"id": "c1", "nom": "Un"}},
		"generateurs": []map[string]any{{"id": "g1", "chapitre": "c1", "operation": "compter", "a": []int{1, 10}}},
	}
	raw, err := json.Marshal(doc)
	require.NoError(t, err)
	_, err = Parse(raw)
	require.NoError(t, err)

	_, err = Parse(moduleWith(t, card(map[string]any{"type": "choix", "reponse": "3", "cle": "cnt:objets:3"})))
	require.Error(t, err, "cnt is the counting generator's")
	_, err = Parse(moduleWith(t, card(map[string]any{"type": "choix", "reponse": "3", "cle": "fr:mot:nommer"})))
	require.Error(t, err, "nommer ends the key of a zone named")
}

func TestReadingAloudIsOnUntilAParentTurnsItOff(t *testing.T) {
	db := setup(t)
	now := time.Now().UTC()
	player, err := PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	require.True(t, player.ReadAloud)

	off, on := false, true
	require.NoError(t, SetPersonSetting(db, 1, SettingChange{UserID: anna, Scope: AllPacks, ReadAloud: &off}, now))
	player, err = PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	require.False(t, player.ReadAloud)

	require.NoError(t, SetPersonSetting(db, 1, SettingChange{UserID: anna, Scope: AllPacks, ReadAloud: &on}, now))
	player, err = PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	require.True(t, player.ReadAloud)
	settings, err := PersonSettings(db, 1)
	require.NoError(t, err)
	require.Empty(t, settings, "on is the default, nothing to keep")

	require.Error(t, SetPersonSetting(db, 1, SettingChange{Family: true, Scope: AllPacks, ReadAloud: &off}, now))
	require.NoError(t, Install(db, 1, "maths-ce2", now))
	require.Error(t, SetPersonSetting(db, 1, SettingChange{UserID: anna, Scope: "maths-ce2", ReadAloud: &off}, now))
}

func TestAParentChoosesWhatTheDeviceSaysForEachPerson(t *testing.T) {
	db := setup(t)
	now := time.Now().UTC()
	player, err := PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	require.Equal(t, VoiceEverything, player.Voice)

	say := func(voice string) error {
		return SetPersonSetting(db, 1, SettingChange{UserID: anna, Scope: AllPacks, Voice: &voice}, now)
	}
	require.NoError(t, say(VoiceInstruction))
	player, err = PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	require.Equal(t, VoiceInstruction, player.Voice)
	require.True(t, player.ReadAloud, "the instructions are still said")

	require.NoError(t, say(VoiceNothing))
	player, err = PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	require.Equal(t, VoiceNothing, player.Voice)
	require.False(t, player.ReadAloud)

	require.Error(t, say("fort"))
	require.NoError(t, say(VoiceEverything))
	settings, err := PersonSettings(db, 1)
	require.NoError(t, err)
	require.Empty(t, settings, "everything is the default, nothing to keep")

	// The old switch still works, and an old "off" still means nothing.
	off := false
	require.NoError(t, SetPersonSetting(db, 1, SettingChange{UserID: anna, Scope: AllPacks, ReadAloud: &off}, now))
	player, err = PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	require.Equal(t, VoiceNothing, player.Voice)
	require.NoError(t, db.Model(&PersonSetting{}).Where("user_id = ?", anna).
		Updates(map[string]any{"voice": "", "read_aloud": false}).Error)
	player, err = PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	require.Equal(t, VoiceNothing, player.Voice)
}

func TestSlugNamesALabelToSort(t *testing.T) {
	require.Equal(t, "le-cheval-a-bascule", Slug("  Le cheval à bascule !"))
	require.Equal(t, "l-ete", Slug("L’été"))
	require.Equal(t, "oeuf", Slug("Œuf"))
}

func TestTheExampleOfTheNewGamesIsAValidModule(t *testing.T) {
	raw, err := os.ReadFile("../../docs/exemples/essai-nouveaux-jeux.json")
	require.NoError(t, err)
	doc, err := Parse(raw)
	require.NoError(t, err)
	require.Equal(t, ReadEverything, doc.ReadAloud)
}

func TestTheGamesCallAPersonByTheirFirstName(t *testing.T) {
	db := setup(t)
	now := time.Now().UTC()
	require.NoError(t, db.Exec("INSERT INTO users (id, username, display_name) VALUES (?, ?, ?)",
		anna, "anna", "Anna&#39;Lou Martin").Error)
	player, err := PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	require.Equal(t, "Anna'Lou", player.FirstName, "the first word of their name in Hopla")

	lou, blank, long := "  Lou ", "", "Abcdefghijklmnopqrstuvwxyz"
	require.NoError(t, SetPersonSetting(db, 1, SettingChange{UserID: anna, Scope: AllPacks, FirstName: &lou}, now))
	player, err = PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	require.Equal(t, "Lou", player.FirstName)

	require.Error(t, SetPersonSetting(db, 1, SettingChange{UserID: anna, Scope: AllPacks, FirstName: &long}, now))
	require.Error(t, SetPersonSetting(db, 1, SettingChange{Family: true, Scope: AllPacks, FirstName: &lou}, now))
	require.NoError(t, SetPersonSetting(db, 1, SettingChange{UserID: anna, Scope: AllPacks, FirstName: &blank}, now))
	settings, err := PersonSettings(db, 1)
	require.NoError(t, err)
	require.Empty(t, settings)
}

func TestAReadingModuleSaysOnlyItsInstructions(t *testing.T) {
	raw := func(voice string) []byte {
		return []byte(`{"format":"hopla-module/1","id":"essai","version":"1","nom":"Essai","public":"enfant",
			"lecture_voix_haute":` + voice + `,"chapitres":[{"id":"c1","nom":"Un"}],
			"fiches":[{"id":"f1","chapitre":"c1","type":"choix","question":"lune","reponse":"la lune",
			"consigne":"Lis le mot, puis touche son dessin.","pieges":["le lit","la lampe"]}]}`)
	}
	for voice, want := range map[string]ReadAloud{`"consigne"`: ReadInstructions, "true": ReadEverything, "false": ReadNothing} {
		doc, err := Parse(raw(voice))
		require.NoError(t, err, voice)
		require.Equal(t, want, doc.ReadAloud, voice)
	}
	_, err := Parse(raw(`"tout"`))
	require.Error(t, err)
}

func TestAModuleIsWrittenInPrintOrInCursive(t *testing.T) {
	for writing, ok := range map[string]bool{"": true, "imprimerie": true, "cursive": true, "cursive_question": true, "gothique": false} {
		raw := []byte(`{"format":"hopla-module/1","id":"essai","version":"1","nom":"Essai","public":"enfant",
			"ecriture":"` + writing + `","chapitres":[{"id":"c1","nom":"Un"}],
			"fiches":[{"id":"f1","chapitre":"c1","type":"choix","question":"m","reponse":"m","pieges":["n","u"]}]}`)
		doc, err := Parse(raw)
		if ok {
			require.NoError(t, err, writing)
			require.Equal(t, writing, doc.Writing)
		} else {
			require.Error(t, err, writing)
		}
	}
}
