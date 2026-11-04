package learn_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	. "github.com/nico87lbs/hopla/internal/learn"
)

// reviewsSetup turns two modules on for Anna and plays one game in each, so
// that their cards are due two days later.
func reviewsSetup(t *testing.T) (*gorm.DB, time.Time) {
	t.Helper()
	db := setup(t)
	now := time.Now().UTC()
	for _, module := range []string{"maths-ce2-multiplication", "maths-ce2-geometrie"} {
		require.NoError(t, Install(db, 1, module, now))
		require.NoError(t, SetActivation(db, 1, ActivationChange{UserID: anna, Modules: []string{module},
			Active: true}, now))
	}
	return db, now
}

func game(id, module string, keys ...string) Game {
	g := Game{ClientID: id, UserID: anna, Module: module}
	for _, key := range keys {
		g.Answers = append(g.Answers, Answer{Key: key, Correct: true})
	}
	return g
}

func TestNewQuestionsAndReviewsAreCountedByDay(t *testing.T) {
	db, now := reviewsSetup(t)
	module := "maths-ce2-multiplication"
	keys := []string{"mul:2x2", "mul:2x3", "mul:2x4", "mul:2x5", "mul:2x6"}
	_, err := Record(db, 1, anna, game("first-game-1", module, keys...), now)
	require.NoError(t, err)

	player, err := PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	require.Equal(t, 5, player.Modules[0].NewToday+player.Modules[1].NewToday)
	require.Zero(t, player.Reviews.Done, "nothing was due")
	require.Equal(t, DefaultReviewBonus, player.Reviews.Bonus)
	require.Equal(t, DefaultReviewMax, player.Reviews.Most)
	require.Equal(t, DefaultNewPerDay, player.Modules[0].Settings.NewPerDay)

	later := now.Add(10 * 24 * time.Hour)
	_, err = Record(db, 1, anna, game("second-game-1", module, keys...), later)
	require.NoError(t, err)
	player, err = PlayerFor(db, 1, anna, later)
	require.NoError(t, err)
	require.Equal(t, 5, player.Reviews.Done, "the cards were due")
	require.Zero(t, player.Modules[0].NewToday+player.Modules[1].NewToday)
}

func TestTheDayReviewsMixModulesAndPayTheBonusOnce(t *testing.T) {
	db, now := reviewsSetup(t)
	maths, geo := "maths-ce2-multiplication", "maths-ce2-geometrie"
	mulKeys := []string{"mul:2x2", "mul:2x3", "mul:2x4"}
	geoKeys := []string{"geo:a", "geo:b", "geo:c"}
	_, err := Record(db, 1, anna, game("learn-maths-1", maths, mulKeys...), now)
	require.NoError(t, err)
	_, err = Record(db, 1, anna, game("learn-geo-1", geo, geoKeys...), now)
	require.NoError(t, err)
	before := points(t, db)

	later := now.Add(10 * 24 * time.Hour)
	reviews := Game{ClientID: "reviews-game-1", UserID: anna, Module: ReviewsKey, Last: true}
	for _, key := range mulKeys {
		reviews.Answers = append(reviews.Answers, Answer{Key: key, Correct: true, Module: maths})
	}
	for _, key := range geoKeys {
		reviews.Answers = append(reviews.Answers, Answer{Key: key, Correct: true, Module: geo})
	}
	result, err := Record(db, 1, anna, reviews, later)
	require.NoError(t, err)
	require.Equal(t, 3, result.Session.Stars)
	require.Equal(t, DefaultReviewBonus, result.Session.Bonus)
	require.Equal(t, 3+DefaultReviewBonus, result.Session.Points)
	require.Equal(t, 3, result.EarnedToday, "the bonus stays out of the daily cap")
	require.Equal(t, before+3+DefaultReviewBonus, points(t, db))

	var card Card
	require.NoError(t, db.Where("user_id = ? AND card_key = ?", anna, "geo:a").First(&card).Error)
	require.Equal(t, geo, card.ModuleKey, "each card keeps the module that asked it")

	player, err := PlayerFor(db, 1, anna, later)
	require.NoError(t, err)
	require.True(t, player.Reviews.BonusPaid)
	require.Equal(t, 3, player.Reviews.EarnedToday)

	// Again the same day: nothing was due any more, no bonus.
	again := reviews
	again.ClientID = "reviews-game-2"
	result, err = Record(db, 1, anna, again, later.Add(time.Minute))
	require.NoError(t, err)
	require.Zero(t, result.Session.Bonus)

	// A module the person does not play is refused.
	wrong := Game{ClientID: "reviews-game-3", UserID: anna, Module: ReviewsKey,
		Answers: []Answer{{Key: "x", Correct: true, Module: "anglais-aero-radio"}}}
	_, err = Record(db, 1, anna, wrong, later)
	require.ErrorIs(t, err, ErrNotActive)
}

func TestTheBonusAndTheMostReviewsAreSettings(t *testing.T) {
	db, now := reviewsSetup(t)
	five, thirty := 5, 30
	require.NoError(t, SetPersonSetting(db, 1, SettingChange{Family: true, Scope: AllPacks, ReviewBonus: &five}, now))
	require.NoError(t, SetPersonSetting(db, 1, SettingChange{UserID: anna, Scope: AllPacks, ReviewMax: &thirty}, now))
	player, err := PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	require.Equal(t, 5, player.Reviews.Bonus)
	require.Equal(t, 30, player.Reviews.Most)

	tooMany, cap := 9999, 10
	require.Error(t, SetPersonSetting(db, 1, SettingChange{UserID: anna, Scope: AllPacks, ReviewMax: &tooMany}, now))
	require.Error(t, SetPersonSetting(db, 1, SettingChange{UserID: anna, Scope: "maths-ce2-multiplication",
		ReviewBonus: &five}, now))
	require.Error(t, SetPersonSetting(db, 1, SettingChange{Family: true, Scope: AllPacks, TotalCap: &cap}, now))

	twenty := 20
	require.NoError(t, SetPersonSetting(db, 1, SettingChange{Family: true, Scope: "maths-ce2-multiplication",
		GameSettings: GameSettings{NewPerDay: &twenty}}, now))
	player, err = PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	for _, m := range player.Modules {
		if m.Key == "maths-ce2-multiplication" {
			require.Equal(t, 20, m.Settings.NewPerDay)
		}
	}
	zero := 0
	require.Error(t, SetPersonSetting(db, 1, SettingChange{Family: true, Scope: "maths-ce2-multiplication",
		GameSettings: GameSettings{NewPerDay: &zero}}, now))
}

func TestNoModuleTakesTheIdOfTheReviews(t *testing.T) {
	doc := fmt.Sprintf(`{"format":"hopla-module/1","id":%q,"version":"1","nom":"R","chapitres":[]}`, ReviewsKey)
	_, err := Parse([]byte(doc))
	require.Error(t, err)
}

func TestAQuestionForgottenFiveTimesIsTough(t *testing.T) {
	db, now := reviewsSetup(t)
	module := "maths-ce2-multiplication"
	wrong := func(id string, at time.Time) {
		g := Game{ClientID: id, UserID: anna, Module: module, Answers: []Answer{{Key: "mul:7x8", Given: "54"}}}
		_, err := Record(db, 1, anna, g, at)
		require.NoError(t, err)
	}
	for i := range ToughForgot + 1 {
		wrong(fmt.Sprintf("tough-game-%d", i), now.Add(time.Duration(i)*time.Minute))
	}
	var card Card
	require.NoError(t, db.Where("user_id = ? AND card_key = ?", anna, "mul:7x8").First(&card).Error)
	require.Equal(t, ToughForgot, card.Forgot, "the first miss is not an oubli")
	require.Equal(t, ToughForgot+1, card.Wrong)
}

func TestATestKeepsItsDayAndChaptersAndItsGamesMoveNoCard(t *testing.T) {
	db, now := reviewsSetup(t)
	maths := "maths-ce2-multiplication"
	var module Module
	require.NoError(t, db.Where("module_key = ?", maths).First(&module).Error)
	doc, err := Parse([]byte(module.Content))
	require.NoError(t, err)
	chapter := doc.Chapters[0].ID
	day := now.Add(3 * 24 * time.Hour).Format(time.DateOnly)

	_, err = CreateTest(db, 1, anna, TestChange{UserID: anna, Name: " ", Day: day,
		Chapters: []TestChapter{{Module: maths, Chapter: chapter}}}, now)
	require.Error(t, err, "a name")
	_, err = CreateTest(db, 1, anna, TestChange{UserID: anna, Name: "Tables", Day: "2020-01-01",
		Chapters: []TestChapter{{Module: maths, Chapter: chapter}}}, now)
	require.Error(t, err, "a day to come")
	_, err = CreateTest(db, 1, anna, TestChange{UserID: anna, Name: "Tables", Day: day,
		Chapters: []TestChapter{{Module: maths, Chapter: "nope"}}}, now)
	require.ErrorIs(t, err, ErrNotFound)
	_, err = CreateTest(db, 1, anna, TestChange{UserID: anna, Name: "Tables", Day: day,
		Chapters: []TestChapter{{Module: "anglais-aero-radio", Chapter: "x"}}}, now)
	require.ErrorIs(t, err, ErrNotActive)

	test, err := CreateTest(db, 1, anna, TestChange{UserID: anna, Name: "Tables", Day: day,
		Chapters: []TestChapter{{Module: maths, Chapter: chapter}, {Module: maths, Chapter: chapter}}}, now)
	require.NoError(t, err)
	require.Len(t, test.Chapters, 1, "a chapter once")
	player, err := PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	require.Len(t, player.Tests, 1)
	past, err := PlayerFor(db, 1, anna, now.Add(5*24*time.Hour))
	require.NoError(t, err)
	require.Empty(t, past.Tests, "a test goes away once its day is past")

	game := Game{ClientID: "test-game-001", UserID: anna, Module: TestsKey}
	for _, key := range []string{"mul:2x2", "mul:2x3", "mul:2x4", "mul:2x5", "mul:2x6"} {
		game.Answers = append(game.Answers, Answer{Key: key, Correct: true, Module: maths})
	}
	result, err := Record(db, 1, anna, game, now)
	require.NoError(t, err)
	require.Equal(t, 3, result.Session.Stars)
	require.Equal(t, 3, result.Session.Points, "stars and hops as usual")
	require.Empty(t, result.Cards)
	var cards int64
	require.NoError(t, db.Model(&Card{}).Where("user_id = ?", anna).Count(&cards).Error)
	require.Zero(t, cards, "no card moved")

	require.NoError(t, DeleteTest(db, 1, test.ID))
	_, err = TestByID(db, 1, test.ID)
	require.ErrorIs(t, err, ErrNotFound)
}
