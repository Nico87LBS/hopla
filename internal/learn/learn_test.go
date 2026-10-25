package learn_test

import (
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	cModel "github.com/nico87lbs/hopla/internal/circle/model"
	"github.com/nico87lbs/hopla/internal/database"
	. "github.com/nico87lbs/hopla/internal/learn"
	ptModel "github.com/nico87lbs/hopla/internal/points"
)

const anna = 2

func setup(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "learn.db")), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, database.Migration(db))
	require.NoError(t, db.Create(&cModel.UserCircle{UserID: anna, CircleID: 1, Role: cModel.UserRoleMember, IsActive: true}).Error)
	return db
}

func answers(right, wrong int) []Answer {
	out := []Answer{}
	for i := 0; i < right; i++ {
		out = append(out, Answer{Key: "mul:7x" + string(rune('a'+i)), Correct: true})
	}
	for i := 0; i < wrong; i++ {
		out = append(out, Answer{Key: "mul:8x" + string(rune('a'+i)), Given: "54"})
	}
	return out
}

func points(t *testing.T, db *gorm.DB) int {
	var member cModel.UserCircle
	require.NoError(t, db.Where("user_id = ?", anna).First(&member).Error)
	return member.Points
}

func TestTheCatalogueIsValidAndMathsCE2GathersItsModules(t *testing.T) {
	entries, err := Catalogue()
	require.NoError(t, err)
	pack, ok := entries["maths-ce2"]
	require.True(t, ok)
	require.True(t, pack.Doc.IsPack())
	require.Len(t, pack.Doc.Modules, 8)
	for _, child := range pack.Doc.Modules {
		require.False(t, entries[child].Doc.IsPack(), child)
		require.Equal(t, []string{"CE2"}, entries[child].Doc.Levels, child)
	}
}

func TestInstallingAPackInstallsItsModulesAndTurningItOnTurnsThemOn(t *testing.T) {
	db := setup(t)
	now := time.Now().UTC()
	require.NoError(t, Install(db, 1, "maths-ce2", now))
	require.NoError(t, Install(db, 1, "maths-ce2", now), "installing again only updates")
	modules, err := Modules(db, 1, now)
	require.NoError(t, err)
	require.Len(t, modules, 9)

	require.NoError(t, SetActivation(db, 1, ActivationChange{UserID: anna, Modules: []string{"maths-ce2"}, Active: true}, now))
	player, err := PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	require.Len(t, player.Modules, 8, "a pack is never played itself")
	require.Len(t, player.Packs, 1)

	cap := 4
	require.NoError(t, SetActivation(db, 1, ActivationChange{UserID: anna, Modules: []string{"maths-ce2-multiplication"},
		Active: true, DailyCap: &cap}, now))
	require.NoError(t, SetActivation(db, 1, ActivationChange{UserID: anna, Modules: []string{"maths-ce2"}, Active: true}, now))
	player, err = PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	for _, module := range player.Modules {
		if module.Key == "maths-ce2-multiplication" {
			require.Equal(t, 4, module.DailyCap, "turning the pack on again keeps a module's own cap")
		}
	}

	back := -1
	require.NoError(t, SetActivation(db, 1, ActivationChange{UserID: anna, Modules: []string{"maths-ce2-multiplication"},
		Active: true, DailyCap: &back}, now))
	player, err = PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	for _, module := range player.Modules {
		if module.Key == "maths-ce2-multiplication" {
			require.Equal(t, 10, module.DailyCap, "-1 gives the module's own cap back")
		}
	}

	require.NoError(t, SetActivation(db, 1, ActivationChange{UserID: anna, Modules: []string{"maths-ce2-geometrie"}}, now))
	player, err = PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	require.Len(t, player.Modules, 7)

	require.Error(t, SetActivation(db, 1, ActivationChange{UserID: 99, Modules: []string{"maths-ce2"}, Active: true}, now))
	require.ErrorIs(t, Install(db, 1, "nope", now), ErrNotFound)
}

func TestAGamePaysStarsWithinTheDailyCapOfItsModule(t *testing.T) {
	db := setup(t)
	now := time.Now().UTC()
	require.NoError(t, Install(db, 1, "maths-ce2-multiplication", now))
	cap := 5
	require.NoError(t, SetActivation(db, 1, ActivationChange{UserID: anna, Modules: []string{"maths-ce2-multiplication"},
		Active: true, DailyCap: &cap}, now))

	result, err := Record(db, 1, anna, Game{ClientID: "game-0001", UserID: anna, Module: "maths-ce2-multiplication",
		PlayedAt: now, Answers: answers(10, 0)}, now)
	require.NoError(t, err)
	require.Equal(t, 3, result.Session.Stars)
	require.Equal(t, 3, result.Session.Points)
	require.Equal(t, 3, points(t, db))

	result, err = Record(db, 1, anna, Game{ClientID: "game-0002", UserID: anna, Module: "maths-ce2-multiplication",
		PlayedAt: now, Answers: answers(9, 1)}, now)
	require.NoError(t, err)
	require.Equal(t, 2, result.Session.Stars)
	require.Equal(t, 2, result.Session.Points)
	require.Equal(t, 5, result.EarnedToday)

	result, err = Record(db, 1, anna, Game{ClientID: "game-0003", UserID: anna, Module: "maths-ce2-multiplication",
		PlayedAt: now, Answers: answers(10, 0)}, now)
	require.NoError(t, err)
	require.Zero(t, result.Session.Points, "the day's cap is reached")
	require.True(t, result.Capped)
	require.Equal(t, 5, points(t, db))

	var ledger []ptModel.PointsHistory
	require.NoError(t, db.Where("user_id = ?", anna).Find(&ledger).Error)
	require.Len(t, ledger, 2)
	require.Equal(t, "Apprendre : Multiplication CE2 ★★★", *ledger[0].Reason)
}

func TestAGameSentTwiceCountsOnce(t *testing.T) {
	db := setup(t)
	now := time.Now().UTC()
	require.NoError(t, Install(db, 1, "maths-ce2-multiplication", now))
	require.NoError(t, SetActivation(db, 1, ActivationChange{UserID: anna, Modules: []string{"maths-ce2-multiplication"}, Active: true}, now))
	game := Game{ClientID: "offline-123", UserID: anna, Module: "maths-ce2-multiplication", PlayedAt: now.Add(-time.Hour), Answers: answers(10, 0)}
	first, err := Record(db, 1, anna, game, now)
	require.NoError(t, err)
	again, err := Record(db, 1, anna, game, now)
	require.NoError(t, err)
	require.Equal(t, first.Session.ID, again.Session.ID)
	require.Equal(t, 3, points(t, db))
}

func TestAGameNeedsTheModuleOnAndFewAnswersEarnNothing(t *testing.T) {
	db := setup(t)
	now := time.Now().UTC()
	require.NoError(t, Install(db, 1, "maths-ce2-multiplication", now))
	_, err := Record(db, 1, anna, Game{ClientID: "game-0001", UserID: anna, Module: "maths-ce2-multiplication", Answers: answers(5, 0)}, now)
	require.ErrorIs(t, err, ErrNotActive)

	require.NoError(t, SetActivation(db, 1, ActivationChange{UserID: anna, Modules: []string{"maths-ce2-multiplication"}, Active: true}, now))
	result, err := Record(db, 1, anna, Game{ClientID: "game-0002", UserID: anna, Module: "maths-ce2-multiplication", Answers: answers(4, 0)}, now)
	require.NoError(t, err)
	require.Zero(t, result.Session.Points)

	_, err = Record(db, 1, anna, Game{ClientID: "old-game-1", UserID: anna, Module: "maths-ce2-multiplication",
		PlayedAt: now.AddDate(0, 0, -20), Answers: answers(5, 0)}, now)
	require.Error(t, err)
}

func TestCardsClimbTheBoxesAndAWrongAnswerSendsThemBack(t *testing.T) {
	card := &Card{}
	Review(card, Answer{Correct: true}, "2026-10-24")
	require.Equal(t, 1, card.Box)
	require.Equal(t, "2026-10-25", card.Due)
	for range 5 {
		Review(card, Answer{Correct: true}, "2026-10-24")
	}
	require.Equal(t, 5, card.Box)
	require.Equal(t, "2026-11-09", card.Due)
	Review(card, Answer{Almost: true}, "2026-10-24")
	require.Equal(t, 5, card.Box, "presque keeps the box")
	Review(card, Answer{Given: "54"}, "2026-10-24")
	require.Equal(t, 1, card.Box)
	require.Equal(t, "54", card.LastAnswer)
	require.Equal(t, 1, card.Wrong)
}

func TestTheSameKnowledgeIsOneCardWhicheverModuleAsksIt(t *testing.T) {
	db := setup(t)
	now := time.Now().UTC()
	require.NoError(t, Install(db, 1, "maths-ce2", now))
	require.NoError(t, SetActivation(db, 1, ActivationChange{UserID: anna, Modules: []string{"maths-ce2"}, Active: true}, now))
	for i, module := range []string{"maths-ce2-multiplication", "maths-ce2-calcul-mental"} {
		_, err := Record(db, 1, anna, Game{ClientID: "same-card-" + module, UserID: anna, Module: module,
			Answers: []Answer{{Key: "mul:7x10", Correct: true}}}, now.Add(time.Duration(i)*time.Second))
		require.NoError(t, err)
	}
	var cards []Card
	require.NoError(t, db.Where("user_id = ?", anna).Find(&cards).Error)
	require.Len(t, cards, 1)
	require.Equal(t, 2, cards[0].Box)
}

func TestTheCatalogueSharesEachKeyForOneAnswer(t *testing.T) {
	entries, err := Catalogue()
	require.NoError(t, err)
	docs := []Document{}
	for _, entry := range entries {
		docs = append(docs, entry.Doc)
	}
	for _, doc := range docs {
		require.NoError(t, KeyConflict(doc, docs), doc.ID)
	}
	pack, ok := entries["anglais-aero"]
	require.True(t, ok)
	for _, child := range pack.Doc.Modules {
		require.Equal(t, "adulte", entries[child].Doc.Audience, child)
		require.NotEmpty(t, entries[child].Doc.SharedKeys(), child)
	}
}

func TestSharedKeysFollowTheirFormAndOneAnswer(t *testing.T) {
	card := func(key, answer string) string {
		return `{"format":"hopla-module/1","id":"marie-anglais","version":"1","nom":"Anglais","auteur":"Marie","public":"enfant",
		"chapitres":[{"id":"c","nom":"C"}],"fiches":[{"id":"f","chapitre":"c","type":"choix","question":"q","reponse":"` +
			answer + `","cle":"` + key + `"}]}`
	}
	for key, reason := range map[string]string{
		"windshear":         "invalide",
		"en:Def:windshear":  "invalide",
		"mul:7x8":           "réservé aux calculs",
		"en:def:x:inverse":  "inverse",
		"en:def:wind shear": "invalide",
	} {
		_, err := Parse([]byte(card(key, "windshear")))
		require.ErrorContains(t, err, reason, key)
	}
	_, err := Parse([]byte(`{"format":"hopla-module/1","id":"mul","version":"1","nom":"X","public":"enfant","modules":["a-b"]}`))
	require.ErrorContains(t, err, "réservé")

	db := setup(t)
	now := time.Now().UTC()
	module, err := Import(db, 1, []byte(card("en:def:shear", "windshear")), now)
	require.NoError(t, err)
	require.Equal(t, "Marie", module.Author)
	_, err = Import(db, 1, []byte(card("en:def:shear", "Wind  shear")), now)
	require.NoError(t, err, "the same module comes back with another answer")

	other := strings.Replace(card("en:def:shear", "gust"), "marie-anglais", "paul-anglais", 1)
	_, err = Import(db, 1, []byte(other), now)
	var invalid InvalidError
	require.ErrorAs(t, err, &invalid)
	require.Contains(t, invalid.Reason, "marie-anglais")
	other = strings.Replace(card("en:def:shear", "WIND SHEAR"), "marie-anglais", "paul-anglais", 1)
	_, err = Import(db, 1, []byte(other), now)
	require.NoError(t, err, "the same answer, written another way")

	_, err = Import(db, 1, []byte(strings.Replace(card("en:def:aileron", "flap"), "marie-anglais", "paul-anglais", 1)), now)
	require.ErrorContains(t, err, "anglais-aero-systemes", "the catalogue's keys count too")
}

func TestImportChecksTheDocumentAndKeepsCatalogueIds(t *testing.T) {
	db := setup(t)
	now := time.Now().UTC()
	_, err := Import(db, 1, []byte(`{"format":"hopla-module/1","id":"mots","version":"1","nom":"Mots","public":"enfant",
		"chapitres":[{"id":"c","nom":"C"}],"fiches":[{"id":"f","chapitre":"x","type":"choix","question":"q","reponse":"r"}]}`), now)
	var invalid InvalidError
	require.ErrorAs(t, err, &invalid)
	require.Contains(t, invalid.Reason, "chapitre x inconnu")

	module, err := Import(db, 1, []byte(`{"format":"hopla-module/1","id":"mots","version":"1","nom":"Mots","public":"enfant",
		"chapitres":[{"id":"c","nom":"C"}],"fiches":[{"id":"f","chapitre":"c","type":"saisie","question":"le chat","reponse":"the cat"}]}`), now)
	require.NoError(t, err)
	require.Equal(t, "mots", module.Key)

	_, err = Import(db, 1, []byte(`{"format":"hopla-module/1","id":"maths-ce2","version":"9","nom":"X","public":"enfant","modules":["mots"]}`), now)
	require.ErrorIs(t, err, ErrCatalogueID)

	_, err = Import(db, 1, []byte(`{"format":"hopla-module/1","id":"mon-paquet","version":"1","nom":"Mon paquet","public":"tous",
		"modules":["mots","maths-ce2-geometrie"]}`), now)
	require.NoError(t, err, "a pack may gather a catalogue module, installed with it")
	modules, err := Modules(db, 1, now)
	require.NoError(t, err)
	require.Len(t, modules, 3)

	require.NoError(t, Remove(db, 1, "mon-paquet"))
	require.ErrorIs(t, Remove(db, 1, "mon-paquet"), ErrNotFound)
}

func TestStars(t *testing.T) {
	require.Equal(t, 3, Stars(10, 10, 70))
	require.Equal(t, 2, Stars(9, 10, 70))
	require.Equal(t, 1, Stars(7, 10, 70))
	require.Equal(t, 0, Stars(6, 10, 70))
	require.Equal(t, 0, Stars(0, 0, 70))
}

func capOf(t *testing.T, db *gorm.DB, now time.Time, key string) (int, *int) {
	player, err := PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	for _, module := range player.Modules {
		if module.Key == key {
			return module.DailyCap, module.UnlockPercent
		}
	}
	t.Fatalf("%s not played", key)
	return 0, nil
}

func TestSettingsComeFromThePersonThenTheFamilyThenTheModule(t *testing.T) {
	db := setup(t)
	now := time.Now().UTC()
	require.NoError(t, Install(db, 1, "maths-ce2", now))
	require.NoError(t, SetActivation(db, 1, ActivationChange{UserID: anna, Modules: []string{"maths-ce2"}, Active: true}, now))
	cap, unlock := capOf(t, db, now, "maths-ce2-geometrie")
	require.Equal(t, 10, cap, "the module's own")
	require.Nil(t, unlock)

	three, four, six, ninety, seventy := 3, 4, 6, 90, 70
	require.NoError(t, SetPersonSetting(db, 1, SettingChange{Family: true, Scope: "maths-ce2", DailyCap: &three,
		UnlockPercent: &seventy}, now))
	cap, unlock = capOf(t, db, now, "maths-ce2-geometrie")
	require.Equal(t, 3, cap, "the family's for the pack")
	require.Equal(t, 70, *unlock)

	require.NoError(t, SetPersonSetting(db, 1, SettingChange{Family: true, Scope: "maths-ce2-geometrie", DailyCap: &four}, now))
	cap, _ = capOf(t, db, now, "maths-ce2-geometrie")
	require.Equal(t, 4, cap, "the family's for the module before its pack")

	require.NoError(t, SetPersonSetting(db, 1, SettingChange{UserID: anna, Scope: "maths-ce2", DailyCap: &six}, now))
	cap, unlock = capOf(t, db, now, "maths-ce2-geometrie")
	require.Equal(t, 6, cap, "the person before the family")
	require.Equal(t, 70, *unlock, "a setting the person leaves empty comes from the family")

	require.NoError(t, SetActivation(db, 1, ActivationChange{UserID: anna, Modules: []string{"maths-ce2-geometrie"},
		Active: true, UnlockPercent: &ninety}, now))
	_, unlock = capOf(t, db, now, "maths-ce2-geometrie")
	require.Equal(t, 90, *unlock, "the person's module before their pack")

	applied, err := AppliedSettings(db, 1, []int{Family, anna})
	require.NoError(t, err)
	require.Equal(t, Value{Value: &six, From: FromPerson}, applied[anna]["maths-ce2-geometrie"].DailyCap)
	require.Equal(t, Value{Value: &four, From: FromFamily}, applied[Family]["maths-ce2-geometrie"].DailyCap)
	require.Equal(t, FromModule, applied[Family]["maths-ce2-geometrie"].Questions.From)
	require.Equal(t, 8, *applied[Family]["maths-ce2-geometrie"].Questions.Value)
	require.Equal(t, Value{Value: &seventy, From: FromFamily}, applied[anna]["maths-ce2-multiplication"].UnlockPercent)

	back := -1
	require.NoError(t, SetPersonSetting(db, 1, SettingChange{UserID: anna, Scope: "maths-ce2", DailyCap: &back}, now))
	cap, _ = capOf(t, db, now, "maths-ce2-geometrie")
	require.Equal(t, 4, cap)
	settings, err := PersonSettings(db, 1)
	require.NoError(t, err)
	require.Len(t, settings, 2, "a pack with nothing set is forgotten")

	require.Error(t, SetPersonSetting(db, 1, SettingChange{UserID: anna, Scope: "maths-ce2", TotalCap: &six}, now))
	require.Error(t, SetPersonSetting(db, 1, SettingChange{UserID: anna, Scope: AllPacks, DailyCap: &six}, now),
		"only the total cap is for all games")
	require.Error(t, SetPersonSetting(db, 1, SettingChange{Family: true, Scope: AllPacks, TotalCap: &six}, now))
	require.Error(t, SetPersonSetting(db, 1, SettingChange{UserID: anna, Scope: "maths-ce2-geometrie", DailyCap: &six}, now),
		"a person's module setting is on the module itself")
	require.ErrorIs(t, SetPersonSetting(db, 1, SettingChange{UserID: anna, Scope: "nope", DailyCap: &six}, now), ErrNotFound)
}

func TestSettingsOnceForAllPacksMoveOntoEachPack(t *testing.T) {
	db := setup(t)
	now := time.Now().UTC()
	require.NoError(t, Install(db, 1, "maths-ce2", now))
	require.NoError(t, SetActivation(db, 1, ActivationChange{UserID: anna, Modules: []string{"maths-ce2"}, Active: true}, now))
	three, five, twelve := 3, 5, 12
	require.NoError(t, SetPersonSetting(db, 1, SettingChange{UserID: anna, Scope: "maths-ce2", DailyCap: &five}, now))
	require.NoError(t, db.Create(&PersonSetting{CircleID: 1, UserID: anna, Scope: AllPacks, DailyCap: &three,
		TotalCap: &twelve, GameSettings: GameSettings{Questions: &twelve}, UpdatedAt: now}).Error)

	require.NoError(t, FoldAllPacks(db))
	require.NoError(t, FoldAllPacks(db), "twice changes nothing")
	var rows []PersonSetting
	require.NoError(t, db.Order("scope").Find(&rows).Error)
	require.Len(t, rows, 2)
	require.Equal(t, AllPacks, rows[0].Scope)
	require.Equal(t, 12, *rows[0].TotalCap)
	require.Nil(t, rows[0].DailyCap)
	require.Nil(t, rows[0].Questions)
	require.Equal(t, "maths-ce2", rows[1].Scope)
	require.Equal(t, 5, *rows[1].DailyCap, "what the pack had stays")
	require.Equal(t, 12, *rows[1].Questions, "what it lacked comes from all packs")
}

func TestTheTotalCapHoldsAllModulesTogether(t *testing.T) {
	db := setup(t)
	now := time.Now().UTC()
	require.NoError(t, Install(db, 1, "maths-ce2", now))
	require.NoError(t, SetActivation(db, 1, ActivationChange{UserID: anna, Modules: []string{"maths-ce2"}, Active: true}, now))
	four := 4
	require.NoError(t, SetPersonSetting(db, 1, SettingChange{UserID: anna, Scope: AllPacks, TotalCap: &four}, now))

	result, err := Record(db, 1, anna, Game{ClientID: "total-0001", UserID: anna, Module: "maths-ce2-multiplication",
		Answers: answers(10, 0)}, now)
	require.NoError(t, err)
	require.Equal(t, 3, result.Session.Points)
	result, err = Record(db, 1, anna, Game{ClientID: "total-0002", UserID: anna, Module: "maths-ce2-geometrie",
		Answers: answers(10, 0)}, now)
	require.NoError(t, err)
	require.Equal(t, 1, result.Session.Points, "only one hop left today")
	require.True(t, result.Capped)
	require.Equal(t, 4, result.TotalEarned)
	require.Equal(t, 4, points(t, db))

	player, err := PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	require.Equal(t, 4, *player.TotalCap)
	require.Equal(t, 4, player.EarnedToday)
}

func TestStatsShowWhoPlaysAModuleAndTheirGames(t *testing.T) {
	db := setup(t)
	now := time.Now().UTC()
	require.NoError(t, db.Create(&cModel.UserCircle{UserID: 3, CircleID: 1, Role: cModel.UserRoleMember, IsActive: true}).Error)
	require.NoError(t, Install(db, 1, "maths-ce2", now))
	require.NoError(t, SetActivation(db, 1, ActivationChange{UserID: anna, Modules: []string{"maths-ce2"}, Active: true}, now))
	_, err := Record(db, 1, anna, Game{ClientID: "stats-0001", UserID: anna, Module: "maths-ce2-multiplication",
		Answers: answers(9, 1)}, now)
	require.NoError(t, err)

	stats, err := Stats(db, 1, "maths-ce2-multiplication", now)
	require.NoError(t, err)
	require.Len(t, stats.People, 1, "only who plays the module")
	require.True(t, stats.People[0].Active)
	require.Len(t, stats.People[0].Sessions, 1)
	require.Len(t, stats.People[0].Cards, 10)
	require.NotEmpty(t, stats.Document)

	_, err = Stats(db, 1, "maths-ce2", now)
	require.ErrorIs(t, err, ErrNotFound, "a pack has no statistics of its own")
}

func TestGameSettingsComeFromAboveAndShapeTheStarsAndHops(t *testing.T) {
	db := setup(t)
	now := time.Now().UTC()
	require.NoError(t, Install(db, 1, "maths-ce2", now))
	require.NoError(t, SetActivation(db, 1, ActivationChange{UserID: anna, Modules: []string{"maths-ce2"}, Active: true}, now))

	settingsOf := func(key string) Settings {
		player, err := PlayerFor(db, 1, anna, now)
		require.NoError(t, err)
		for _, module := range player.Modules {
			if module.Key == key {
				return module.Settings
			}
		}
		t.Fatalf("%s not played", key)
		return Settings{}
	}
	require.Equal(t, 10, settingsOf("maths-ce2-multiplication").Questions)
	require.Equal(t, 8, settingsOf("maths-ce2-geometrie").Questions, "the module's own")

	twelve, eighty, two, five := 12, 80, 2, 5
	require.NoError(t, SetPersonSetting(db, 1, SettingChange{Family: true, Scope: "maths-ce2",
		GameSettings: GameSettings{Questions: &twelve, HopsByStar: &two}}, now))
	require.NoError(t, SetPersonSetting(db, 1, SettingChange{UserID: anna, Scope: "maths-ce2",
		GameSettings: GameSettings{Threshold: &eighty}}, now))
	require.NoError(t, SetActivation(db, 1, ActivationChange{UserID: anna, Modules: []string{"maths-ce2-geometrie"},
		Active: true, GameSettings: GameSettings{Questions: &five}}, now))

	s := settingsOf("maths-ce2-multiplication")
	require.Equal(t, 12, s.Questions, "the family")
	require.Equal(t, 80, s.Threshold, "the pack")
	require.Equal(t, 2, s.HopsByStar)
	require.Equal(t, 5, settingsOf("maths-ce2-geometrie").Questions, "the person's module before the family")

	// 7/10 is under the pack's 80 %: no star; 8/10 is one star, two hops.
	result, err := Record(db, 1, anna, Game{ClientID: "settings-01", UserID: anna, Module: "maths-ce2-multiplication",
		Answers: answers(7, 3)}, now)
	require.NoError(t, err)
	require.Zero(t, result.Session.Stars)
	result, err = Record(db, 1, anna, Game{ClientID: "settings-02", UserID: anna, Module: "maths-ce2-multiplication",
		Answers: answers(8, 2)}, now)
	require.NoError(t, err)
	require.Equal(t, 1, result.Session.Stars)
	require.Equal(t, 2, result.Session.Points)

	back, tooMany := -1, 50
	require.NoError(t, SetActivation(db, 1, ActivationChange{UserID: anna, Modules: []string{"maths-ce2-geometrie"},
		Active: true, GameSettings: GameSettings{Questions: &back}}, now))
	require.Equal(t, 12, settingsOf("maths-ce2-geometrie").Questions)
	require.Error(t, SetPersonSetting(db, 1, SettingChange{UserID: anna, Scope: "maths-ce2",
		GameSettings: GameSettings{Questions: &tooMany}}, now))
}

func TestTheDetailOfAPackShowsItsModulesInstalledOrNot(t *testing.T) {
	db := setup(t)
	now := time.Now().UTC()
	detail, err := ModuleDetail(db, 1, "anglais-aero", now)
	require.NoError(t, err)
	require.False(t, detail.Installed)
	require.Len(t, detail.Documents, 5, "the pack, then its four modules")

	require.NoError(t, Install(db, 1, "anglais-aero", now))
	detail, err = ModuleDetail(db, 1, "anglais-aero", now)
	require.NoError(t, err)
	require.True(t, detail.Installed)
	require.Len(t, detail.Documents, 5)

	_, err = ModuleDetail(db, 1, "nowhere", now)
	require.ErrorIs(t, err, ErrNotFound)
}
