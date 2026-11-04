package learn_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	fModel "github.com/nico87lbs/hopla/internal/family/model"
	. "github.com/nico87lbs/hopla/internal/learn"
	uModel "github.com/nico87lbs/hopla/internal/user/model"
)

const parent = 3

func TestGradingFollowsTheAccountUntilAParentSetsIt(t *testing.T) {
	db := setup(t)
	now := time.Now().UTC()
	require.NoError(t, db.Create(&uModel.User{ID: anna, Username: "anna", DisplayName: "Anna",
		UserType: uModel.UserTypeChild}).Error)
	require.NoError(t, db.Create(&uModel.User{ID: parent, Username: "nico", DisplayName: "Nico"}).Error)
	require.NoError(t, db.Create(&fModel.UserFamily{UserID: parent, FamilyID: 1, Role: fModel.UserRoleMember,
		IsActive: true}).Error)

	child, err := PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	require.Equal(t, GradingAuto, child.Grading)
	grown, err := PlayerFor(db, 1, parent, now)
	require.NoError(t, err)
	require.Equal(t, GradingButtons, grown.Grading)

	buttons := GradingButtons
	require.NoError(t, SetPersonSetting(db, 1, SettingChange{UserID: anna, Scope: AllPacks, Grading: &buttons}, now))
	child, err = PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	require.Equal(t, GradingButtons, child.Grading)

	empty := ""
	require.NoError(t, SetPersonSetting(db, 1, SettingChange{UserID: anna, Scope: AllPacks, Grading: &empty}, now))
	child, err = PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	require.Equal(t, GradingAuto, child.Grading)

	wrong := "souris"
	require.Error(t, SetPersonSetting(db, 1, SettingChange{UserID: anna, Scope: AllPacks, Grading: &wrong}, now))
	require.Error(t, SetPersonSetting(db, 1, SettingChange{Family: true, Scope: AllPacks, Grading: &buttons}, now))
}

func TestAnswersAreKeptWithTheirTimeAndGiveTheUsualTime(t *testing.T) {
	db := setup(t)
	now := time.Now().UTC()
	module := "maths-ce2-multiplication"
	require.NoError(t, Install(db, 1, module, now))
	require.NoError(t, SetActivation(db, 1, ActivationChange{UserID: anna, Modules: []string{module}, Active: true}, now))
	for g := range 2 {
		game := Game{ClientID: fmt.Sprintf("timed-game-%d", g), UserID: anna, Module: module}
		for i := range 6 {
			game.Answers = append(game.Answers, Answer{Key: fmt.Sprintf("mul:%dx%d", g+2, i+2), Correct: true,
				Ms: 1000 * (i + 1), Grade: Easy})
		}
		_, err := Record(db, 1, anna, game, now.Add(time.Duration(g)*time.Minute))
		require.NoError(t, err)
	}
	var logs []ReviewLog
	require.NoError(t, db.Where("user_id = ?", anna).Find(&logs).Error)
	require.Len(t, logs, 12)
	require.Equal(t, Easy, logs[0].Grade)
	player, err := PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	require.Len(t, player.Modules, 1)
	require.Equal(t, 4000, player.Modules[0].UsualMs)
	var card Card
	require.NoError(t, db.Where("user_id = ? AND card_key = ?", anna, "mul:2x2").First(&card).Error)
	require.Equal(t, MasteredBox, card.Box, "easy at once waits 8 days")
	require.Positive(t, card.Stability)
}

func TestRetentionAndLongestWaitAreSettings(t *testing.T) {
	db := setup(t)
	now := time.Now().UTC()
	module := "maths-ce2-multiplication"
	require.NoError(t, Install(db, 1, module, now))
	require.NoError(t, SetActivation(db, 1, ActivationChange{UserID: anna, Modules: []string{module}, Active: true}, now))
	low, long := 60, 9999
	require.Error(t, SetPersonSetting(db, 1, SettingChange{Family: true, Scope: module,
		GameSettings: GameSettings{Retention: &low}}, now))
	require.Error(t, SetPersonSetting(db, 1, SettingChange{Family: true, Scope: module,
		GameSettings: GameSettings{MaxInterval: &long}}, now))
	retention, wait := 95, 30
	require.NoError(t, SetPersonSetting(db, 1, SettingChange{Family: true, Scope: module,
		GameSettings: GameSettings{Retention: &retention, MaxInterval: &wait}}, now))
	player, err := PlayerFor(db, 1, anna, now)
	require.NoError(t, err)
	require.Equal(t, 95, player.Modules[0].Settings.Retention)
	require.Equal(t, 30, player.Modules[0].Settings.MaxInterval)
	applied, err := AppliedSettings(db, 1, []int{anna})
	require.NoError(t, err)
	require.Equal(t, 95, *applied[anna][module].Retention.Value)
	require.Equal(t, "family", applied[anna][module].Retention.From)
}
