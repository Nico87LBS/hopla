package learn_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	. "github.com/nico87lbs/hopla/internal/learn"
)

// dictation is a pack of the family as the editor writes it: two levels,
// the first with two groups, the second without any.
const dictation = `{"format":"hopla-module/1","id":"famille-dictee","version":"1.0.0","nom":"Dictée","icone":"✏️",
"public":"enfant","niveaux":["CE1"],"langue":"fr","lecture_voix_haute":true,"reglages":{"plafond_jour":4},
"chapitres":[
 {"id":"a","nom":"Semaine 1","niveau":"Automne","groupe":"Mots en -ette"},
 {"id":"b","nom":"Semaine 2","ouvert_apres":80,"niveau":"Automne","groupe":"Mots en -ette"},
 {"id":"c","nom":"Semaine 3","ouvert_apres":80,"niveau":"Automne","groupe":"Les sons"},
 {"id":"d","nom":"Semaine 4","ouvert_apres":80,"niveau":"Hiver"}],
"fiches":[
 {"type":"saisie","question":"chaussette","reponse":"chaussette","id":"x","chapitre":"a"},
 {"type":"saisie","question":"fillette","reponse":"fillette","sens":["direct","inverse"],"id":"y","chapitre":"b"},
 {"type":"saisie","question":"ou","reponse":"ou","id":"z","chapitre":"c"},
 {"type":"saisie","question":"neige","reponse":"neige","id":"w","chapitre":"d"}]}`

func moduleByKey(t *testing.T, db *gorm.DB, key string) Module {
	t.Helper()
	modules, err := Modules(db, 1, time.Now().UTC())
	require.NoError(t, err)
	for _, module := range modules {
		if module.Key == key {
			return module
		}
	}
	t.Fatalf("%s n'est pas installé", key)
	return Module{}
}

func chaptersOf(t *testing.T, module Module) []map[string]any {
	t.Helper()
	var doc struct {
		Chapters []map[string]any `json:"chapitres"`
	}
	require.NoError(t, json.Unmarshal([]byte(module.Content), &doc))
	return doc.Chapters
}

func TestAPackOfTheFamilyIsCutIntoLevelsAndModulesLikeTheCatalogues(t *testing.T) {
	db := setup(t)
	now := time.Now().UTC()
	root, err := Import(db, 1, []byte(dictation), now)
	require.NoError(t, err)
	require.Equal(t, "famille-dictee", root.Key)
	require.True(t, root.Editable)

	pack := moduleByKey(t, db, "famille-dictee")
	require.Equal(t, []string{"famille-dictee-automne", "famille-dictee-hiver"}, pack.Children)
	require.Equal(t, []string{"CE1"}, pack.Levels, "the pack keeps its tags")
	autumn := moduleByKey(t, db, "famille-dictee-automne")
	require.Equal(t, "Automne", autumn.Name)
	require.Equal(t, []string{"famille-dictee-automne-mots-en-ette", "famille-dictee-automne-les-sons"}, autumn.Children)
	require.Equal(t, []string{"famille-dictee-hiver-dictee"}, moduleByKey(t, db, "famille-dictee-hiver").Children,
		"chapters without a group make a module named after the pack")

	sounds := moduleByKey(t, db, "famille-dictee-automne-les-sons")
	require.Equal(t, "Les sons", sounds.Name)
	require.Equal(t, "✏️", sounds.Icon)
	chapters := chaptersOf(t, sounds)
	require.Len(t, chapters, 1)
	require.NotContains(t, chapters[0], "ouvert_apres", "the first chapter of a module is open")
	require.NotContains(t, chapters[0], "groupe")
	words := chaptersOf(t, moduleByKey(t, db, "famille-dictee-automne-mots-en-ette"))
	require.Len(t, words, 2)
	require.EqualValues(t, 80, words[1]["ouvert_apres"])
	require.Contains(t, moduleByKey(t, db, "famille-dictee-automne-les-sons").Content, `"plafond_jour":4`)

	file, err := ModuleFile(db, 1, "famille-dictee")
	require.NoError(t, err)
	require.JSONEq(t, dictation, file, "the editor opens the file as written")

	test, err := PlacementTestFor(db, 1, anna, "famille-dictee", now)
	require.NoError(t, err)
	require.Len(t, test.Levels, 2)
	require.Len(t, test.Levels[0].Modules, 2)

	require.NoError(t, SetPackPlayer(db, 1, anna, "famille-dictee", true, now))
	player, err := PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	require.Equal(t, map[string]bool{"famille-dictee-automne-mots-en-ette": true, "famille-dictee-automne-les-sons": true},
		active(t, player), "the first level opens, as in every pack")

	require.NoError(t, Remove(db, 1, "famille-dictee", false))
	modules, err := Modules(db, 1, now)
	require.NoError(t, err)
	require.Empty(t, modules, "removing the pack removes its levels and modules")
}

func TestAModuleOfTheFamilyFromBeforeIsCutKeepingWhatPeopleKnowAndSet(t *testing.T) {
	db := setup(t)
	now := time.Now().UTC()
	// A pack saved before packs were cut: one module, played by Anna.
	require.NoError(t, db.Create(&Module{FamilyID: 1, Key: "famille-dictee", Version: "1.0.0", Name: "Dictée",
		Audience: "enfant", Content: dictation, InstalledAt: now, UpdatedAt: now}).Error)
	cap := 3
	require.NoError(t, db.Create(&Activation{FamilyID: 1, UserID: anna, ModuleKey: "famille-dictee", DailyCap: &cap,
		CreatedAt: now}).Error)
	require.NoError(t, db.Create(&PackPlayer{FamilyID: 1, UserID: anna, PackKey: "famille-dictee", OpenTo: "famille-dictee",
		Excluded: []string{"chapitre-ouvert:famille-dictee/d"}, CreatedAt: now, UpdatedAt: now}).Error)
	require.NoError(t, db.Create(&Placement{FamilyID: 1, UserID: anna, PackKey: "famille-dictee", Status: PlacementDone,
		Reached: "famille-dictee", Opened: []string{"famille-dictee/c"}, DoneAt: now, UpdatedAt: now}).Error)
	for _, key := range []string{"famille-dictee:x", "famille-dictee:y", "famille-dictee:y:inverse", "famille-dictee:w"} {
		require.NoError(t, db.Create(&Card{FamilyID: 1, UserID: anna, Key: key, Box: 4, Due: "2026-12-01",
			ModuleKey: "famille-dictee"}).Error)
		require.NoError(t, db.Create(&ReviewLog{FamilyID: 1, UserID: anna, ModuleKey: "famille-dictee", CardKey: key,
			Day: "2026-11-01", Grade: 3}).Error)
	}
	require.NoError(t, db.Create(&CardEdit{FamilyID: 1, ModuleKey: "famille-dictee", CardID: "z",
		Fields: map[string]json.RawMessage{"reponse": json.RawMessage(`"où"`)}, UpdatedAt: now}).Error)
	require.NoError(t, db.Create(&Session{FamilyID: 1, ClientID: "s1", UserID: anna, ModuleKey: "famille-dictee",
		Day: "2026-11-01", Correct: 3, Total: 4, PlayedAt: now}).Error)

	pack := moduleByKey(t, db, "famille-dictee")
	require.True(t, pack.Editable, "the module is cut on the way")
	require.Len(t, pack.Children, 2)

	var keys []string
	require.NoError(t, db.Model(&Card{}).Where("user_id = ?", anna).Order("card_key").Pluck("card_key", &keys).Error)
	require.Equal(t, []string{"famille-dictee-automne-mots-en-ette:x", "famille-dictee-automne-mots-en-ette:y",
		"famille-dictee-automne-mots-en-ette:y:inverse", "famille-dictee-hiver-dictee:w"}, keys,
		"what Anna knows follows each card")
	var logged int64
	require.NoError(t, db.Model(&ReviewLog{}).Where("card_key = ? AND module_key = ?", "famille-dictee-hiver-dictee:w",
		"famille-dictee-hiver-dictee").Count(&logged).Error)
	require.EqualValues(t, 1, logged)

	var edit CardEdit
	require.NoError(t, db.Where("card_id = ?", "z").First(&edit).Error)
	require.Equal(t, "famille-dictee-automne-les-sons", edit.ModuleKey, "the family's correction follows its card")

	var session Session
	require.NoError(t, db.Where("client_id = ?", "s1").First(&session).Error)
	require.Equal(t, "famille-dictee-automne-mots-en-ette", session.ModuleKey, "the games go to the module with most cards")

	var player PackPlayer
	require.NoError(t, db.Where("user_id = ? AND pack_key = ?", anna, "famille-dictee").First(&player).Error)
	require.Equal(t, []string{"chapitre-ouvert:famille-dictee-hiver-dictee/d"}, player.Excluded)
	require.Equal(t, "famille-dictee-automne", player.OpenTo)
	var placement Placement
	require.NoError(t, db.Where("user_id = ? AND pack_key = ?", anna, "famille-dictee").First(&placement).Error)
	require.Equal(t, []string{"famille-dictee-automne-les-sons/c"}, placement.Opened)
	require.Equal(t, "famille-dictee-automne", placement.Reached)

	var setting PersonSetting
	require.NoError(t, db.Where("user_id = ? AND scope = ?", anna, "famille-dictee").First(&setting).Error)
	require.Equal(t, 3, *setting.DailyCap, "the settings Anna had on the module go onto the pack")

	player2, err := PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	on := active(t, player2)
	require.True(t, on["famille-dictee-automne-mots-en-ette"])
	require.True(t, on["famille-dictee-automne-les-sons"])
	require.False(t, on["famille-dictee"], "the old module is a pack now")
}

func TestSavingAgainMovesWhatPeopleKnowWithTheChapters(t *testing.T) {
	db := setup(t)
	now := time.Now().UTC()
	_, err := Import(db, 1, []byte(dictation), now)
	require.NoError(t, err)
	require.NoError(t, SetPackPlayer(db, 1, anna, "famille-dictee", true, now))
	require.NoError(t, db.Create(&Card{FamilyID: 1, UserID: anna, Key: "famille-dictee-automne-les-sons:z", Box: 3,
		Due: "2026-12-01", ModuleKey: "famille-dictee-automne-les-sons"}).Error)

	// The group "Les sons" is renamed "Sons" and its chapter moves to Hiver.
	moved := `{"format":"hopla-module/1","id":"famille-dictee","version":"1.0.1","nom":"Dictée","public":"enfant","langue":"fr",
"chapitres":[
 {"id":"a","nom":"Semaine 1","niveau":"Automne","groupe":"Mots en -ette"},
 {"id":"b","nom":"Semaine 2","ouvert_apres":80,"niveau":"Automne","groupe":"Mots en -ette"},
 {"id":"d","nom":"Semaine 4","niveau":"Hiver"},
 {"id":"c","nom":"Semaine 3","ouvert_apres":80,"niveau":"Hiver","groupe":"Sons"}],
"fiches":[
 {"type":"saisie","question":"chaussette","reponse":"chaussette","id":"x","chapitre":"a"},
 {"type":"saisie","question":"fillette","reponse":"fillette","id":"y","chapitre":"b"},
 {"type":"saisie","question":"ou","reponse":"ou","id":"z","chapitre":"c"},
 {"type":"saisie","question":"neige","reponse":"neige","id":"w","chapitre":"d"}]}`
	_, err = Import(db, 1, []byte(moved), now)
	require.NoError(t, err)

	var card Card
	require.NoError(t, db.Where("user_id = ?", anna).First(&card).Error)
	require.Equal(t, "famille-dictee-hiver-sons:z", card.Key)
	require.Equal(t, []string{"famille-dictee-hiver-dictee", "famille-dictee-hiver-sons"},
		moduleByKey(t, db, "famille-dictee-hiver").Children)
	var count int64
	require.NoError(t, db.Model(&Module{}).Where("module_key = ?", "famille-dictee-automne-les-sons").Count(&count).Error)
	require.Zero(t, count, "the module gone is removed")
	require.NoError(t, db.Model(&Activation{}).Where("module_key = ?", "famille-dictee-automne-les-sons").Count(&count).Error)
	require.Zero(t, count)
}
