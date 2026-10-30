package games_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	fModel "github.com/nico87lbs/hopla/internal/family/model"
	. "github.com/nico87lbs/hopla/internal/games"
	"github.com/nico87lbs/hopla/internal/learn"
	ptModel "github.com/nico87lbs/hopla/internal/points"
)

func earned(t *testing.T, db *gorm.DB, userID int) int {
	var member fModel.UserFamily
	require.NoError(t, db.Where("user_id = ? AND family_id = 1", userID).First(&member).Error)
	return member.Points
}

// credit records a task's points as the chore repository does.
func credit(t *testing.T, db *gorm.DB, choreID, userID, points int, at time.Time) {
	done(t, db, choreID, userID, at)
	require.NoError(t, db.Create(&ptModel.PointsHistory{Action: ptModel.PointsHistoryActionAdd, Points: points,
		UserID: userID, FamilyID: 1, CreatedAt: at}).Error)
	require.NoError(t, db.Model(&fModel.UserFamily{}).Where("user_id = ?", userID).
		Update("points", gorm.Expr("points + ?", points)).Error)
}

func TestRanks(t *testing.T) {
	db := setup(t)
	ranks, err := RanksFor(db, 1)
	require.NoError(t, err)
	require.Equal(t, "Lapineau", ranks[0].Name)
	require.Equal(t, "Grand chef de la tribu des Hopla", ranks[len(ranks)-1].Name)

	level := RankOf(ranks, 150)
	require.Equal(t, 2, level.Level)
	require.Equal(t, "Petit bondisseur", level.Rank.Name)
	require.Equal(t, "hopla-2", level.Rank.Image)
	require.Equal(t, 250, level.Next.MinPoints)
	require.Equal(t, 0, level.Stars)
	top := RankOf(ranks, 1800)
	require.Equal(t, len(ranks), top.Level)
	require.Nil(t, top.Next)
	require.Equal(t, 2000, top.StarAt, "the last rank lasts 500 points, like the one before")

	// Past the last rank, a star and a new round from the first rank.
	star := RankOf(ranks, 2000+150)
	require.Equal(t, 1, star.Stars)
	require.Equal(t, 150, star.Points)
	require.Equal(t, "Petit bondisseur", star.Rank.Name)
	require.Equal(t, 3, RankOf(ranks, 3*2000+5).Stars)
	require.Equal(t, 0, RankOf([]Rank{{Name: "Seul", MinPoints: 0}}, 5000).Stars, "one rank gives no star")

	saved, err := SaveRanks(db, 1, []Rank{{Name: "Héroïne", MinPoints: 50}, {Name: "Apprentie", MinPoints: 10}})
	require.NoError(t, err)
	require.Equal(t, "Apprentie", saved[0].Name)
	require.Equal(t, 0, saved[0].MinPoints, "the first rank starts at 0")
	ranks, err = RanksFor(db, 1)
	require.NoError(t, err)
	require.Len(t, ranks, 2)
	other, err := RanksFor(db, 2)
	require.NoError(t, err)
	require.Len(t, other, 7, "another family keeps the defaults")
}

func TestWeeklyQuestsAreDrawnOnceAndPaid(t *testing.T) {
	db := setup(t)
	require.NoError(t, db.Create(&fModel.UserFamily{UserID: 3, FamilyID: 1, Role: fModel.UserRoleMember, IsActive: true}).Error)
	require.NoError(t, db.Save(&Rules{FamilyID: 1, QuestsPerWeek: 2}).Error)
	now := time.Now()
	task := chore(t, db, "Table", 2, now, nil)
	for i, quest := range []Quest{
		{Name: "Mettre la table 2 fois", Kind: GoalTasks, ChoreID: &task.ID, Target: 2, Reward: 7},
		{Name: "Gagner 100 points", Kind: GoalPoints, Target: 100, Reward: 20},
		{Name: "Série de 30 jours", Kind: GoalStreak, Target: 30, Reward: 50},
		{Name: "Réservée à Anna", Kind: GoalTasks, Target: 1, Reward: 1, UserIDs: []int{3}},
	} {
		quest.FamilyID, quest.Period = 1, QuestWeek
		require.NoError(t, db.Create(&quest).Error, i)
	}
	require.NoError(t, db.Create(&Quest{FamilyID: 1, Name: "Du mois", Kind: GoalTasks, Target: 40, Reward: 30, Period: QuestMonth}).Error)

	quests, err := Quests(db, 1, []int{2, 3}, now)
	require.NoError(t, err)
	require.Len(t, quests[2], 3, "two weekly quests and the monthly one")
	for _, quest := range quests[2] {
		require.NotEqual(t, "Réservée à Anna", quest.Name)
	}
	again, err := Quests(db, 1, []int{2}, now)
	require.NoError(t, err)
	require.Equal(t, quests[2], again[2], "the draw stays for the week")
	require.NoError(t, db.Create(&Quest{FamilyID: 1, Name: "Nouvelle du mois", Kind: GoalPoints, Target: 50, Reward: 5, Period: QuestMonth}).Error)
	again, err = Quests(db, 1, []int{2}, now)
	require.NoError(t, err)
	require.Len(t, again[2], 4, "a quest added during the month is given too")
	require.Len(t, again[3], 0, "only the members asked for are drawn")

	// Make sure Elena has the table quest whatever the draw, then do it twice.
	require.NoError(t, db.Where("user_id = 2 AND period = ?", QuestWeek).Delete(&QuestDraw{}).Error)
	require.NoError(t, db.Create(&QuestDraw{FamilyID: 1, UserID: 2, PeriodKey: quests[2][0].PeriodKey, QuestID: 1,
		Period: QuestWeek, Name: "Mettre la table 2 fois", Kind: GoalTasks, ChoreID: &task.ID, Target: 2, Reward: 7}).Error)
	credit(t, db, task.ID, 2, 2, now)
	require.NoError(t, AfterTask(db, 1, 2, now, now))
	require.Equal(t, 2, earned(t, db, 2), "one table out of two")
	// A copy of the task with the same name, made for another child, counts too.
	copied := chore(t, db, " table ", 2, now, nil)
	credit(t, db, copied.ID, 2, 2, now)
	require.NoError(t, AfterTask(db, 1, 2, now, now))
	require.Equal(t, 4+7, earned(t, db, 2))
	credit(t, db, task.ID, 2, 2, now)
	require.NoError(t, AfterTask(db, 1, 2, now, now))
	require.Equal(t, 6+7, earned(t, db, 2), "a quest pays once")

	var bonus ptModel.PointsHistory
	require.NoError(t, db.Where("action = ?", ptModel.PointsHistoryActionGame).First(&bonus).Error)
	require.Equal(t, "Quête : Mettre la table 2 fois", *bonus.Reason)
}

func TestChallenges(t *testing.T) {
	db := setup(t)
	require.NoError(t, db.Create(&fModel.UserFamily{UserID: 3, FamilyID: 1, Role: fModel.UserRoleMember, IsActive: true}).Error)
	require.NoError(t, db.Save(&Rules{FamilyID: 1}).Error) // no streak bonus in the way
	now := time.Now()
	task := chore(t, db, "Chambre", 10, now, nil)
	require.NoError(t, db.Create(&Challenge{FamilyID: 1, Name: "Piscine", Kind: GoalPoints, Target: 25, Reward: 5,
		RewardText: "Sortie piscine", Shared: true, UserIDs: []int{2, 3}, StartsAt: now.Add(-time.Hour), EndsAt: now.Add(time.Hour)}).Error)
	require.NoError(t, db.Create(&Challenge{FamilyID: 1, Name: "Chambre 2 fois", Kind: GoalTasks, ChoreID: &task.ID,
		Target: 2, Reward: 3, StartsAt: now.Add(-time.Hour), EndsAt: now.Add(time.Hour)}).Error)

	credit(t, db, task.ID, 2, 10, now)
	require.NoError(t, AfterTask(db, 1, 2, now, now))
	credit(t, db, task.ID, 3, 10, now)
	require.NoError(t, AfterTask(db, 1, 3, now, now))
	views, err := Challenges(db, 1, []int{2, 3}, now, now)
	require.NoError(t, err)
	require.Equal(t, 20, views[0].Total)
	require.Nil(t, views[0].CompletedAt)
	require.Empty(t, views[1].Winners)

	credit(t, db, task.ID, 2, 10, now)
	require.NoError(t, AfterTask(db, 1, 2, now, now))
	views, err = Challenges(db, 1, []int{2, 3}, now, now)
	require.NoError(t, err)
	require.NotNil(t, views[0].CompletedAt, "30 points together")
	require.ElementsMatch(t, []int{2, 3}, views[0].Winners)
	require.Equal(t, []int{2}, views[1].Winners, "Elena did her room twice")
	require.Equal(t, 20+5+3, earned(t, db, 2))
	require.Equal(t, 10+5, earned(t, db, 3))

	credit(t, db, task.ID, 2, 10, now)
	require.NoError(t, AfterTask(db, 1, 2, now, now))
	require.Equal(t, 30+5+3, earned(t, db, 2), "a challenge pays once")
}

func TestLearnGoalsCountGamesAndStars(t *testing.T) {
	db := setup(t)
	require.NoError(t, db.Save(&Rules{FamilyID: 1}).Error)
	now := time.Now().UTC()
	require.NoError(t, db.Create(&learn.Module{FamilyID: 1, Key: "maths-ce2", Name: "Maths CE2",
		Children: []string{"tables-ce2", "divisions"}, Content: "{}"}).Error)
	play := func(module string, stars int) {
		require.NoError(t, db.Create(&learn.Session{FamilyID: 1, ClientID: module + time.Now().String(), UserID: 2,
			ModuleKey: module, Day: "2026-10-30", Total: 10, Stars: stars, PlayedAt: now}).Error)
	}
	require.NoError(t, db.Create(&Challenge{FamilyID: 1, Name: "3 parties", Kind: GoalGames, Target: 3, Reward: 4,
		StartsAt: now.Add(-time.Hour), EndsAt: now.Add(time.Hour)}).Error)
	require.NoError(t, db.Create(&Challenge{FamilyID: 1, Name: "5 étoiles en maths", Kind: GoalStars,
		Module: "maths-ce2", Target: 5, Reward: 6, StartsAt: now.Add(-time.Hour), EndsAt: now.Add(time.Hour)}).Error)

	play("tables-ce2", 3)
	play("anglais", 3)
	views, err := Challenges(db, 1, []int{2}, now, now)
	require.NoError(t, err)
	require.Equal(t, 2, views[0].Progress[2], "every game counts")
	require.Equal(t, 3, views[1].Progress[2], "only the pack's modules count their stars")

	play("divisions", 2)
	require.NoError(t, Settle(db, 1, []int{2}, now))
	views, err = Challenges(db, 1, []int{2}, now, now)
	require.NoError(t, err)
	require.Equal(t, []int{2}, views[0].Winners)
	require.Equal(t, []int{2}, views[1].Winners)
	require.Equal(t, 4+6, earned(t, db, 2))
}

func TestChallengeTargetLowerAfterAbsence(t *testing.T) {
	db := setup(t)
	require.NoError(t, db.Create(&fModel.UserFamily{UserID: 3, FamilyID: 1, Role: fModel.UserRoleMember, IsActive: true}).Error)
	require.NoError(t, db.Save(&Rules{FamilyID: 1}).Error)
	now := time.Now()
	start := time.Date(now.Year(), now.Month(), now.Day()-6, 0, 0, 0, 0, time.Local)
	task := chore(t, db, "Chambre", 10, now, nil)
	require.NoError(t, db.Create(&Challenge{FamilyID: 1, Name: "Chambre 5 fois", Kind: GoalTasks, ChoreID: &task.ID,
		Target: 5, Reward: 3, StartsAt: start, EndsAt: start.AddDate(0, 0, 7)}).Error)
	require.NoError(t, db.Create(&Challenge{FamilyID: 1, Name: "Ensemble", Kind: GoalTasks, ChoreID: &task.ID,
		Target: 5, Shared: true, StartsAt: start, EndsAt: start.AddDate(0, 0, 7)}).Error)
	back := start.AddDate(0, 0, 2).Add(12 * time.Hour)
	require.NoError(t, db.Create(&Absence{FamilyID: 1, UserID: 2, StartAt: start.AddDate(0, 0, 1).Add(12 * time.Hour), EndAt: &back}).Error)

	views, err := Challenges(db, 1, []int{2, 3}, now, now)
	require.NoError(t, err)
	require.Equal(t, 4, views[0].TargetOf(2), "2 days away out of 7: 5 × 5/7 rounded up")
	require.Equal(t, 2, views[0].DaysAway[2])
	require.Equal(t, 5, views[0].TargetOf(3), "Anna was there")
	require.Empty(t, views[1].Targets, "a shared challenge keeps its target")

	for range 4 {
		credit(t, db, task.ID, 2, 10, now)
		require.NoError(t, AfterTask(db, 1, 2, now, now))
	}
	views, err = Challenges(db, 1, []int{2, 3}, now, now)
	require.NoError(t, err)
	require.Equal(t, []int{2}, views[0].Winners, "Elena reached her lower target")
}
