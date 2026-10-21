package games_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	cModel "github.com/nico87lbs/hopla/internal/circle/model"
	. "github.com/nico87lbs/hopla/internal/games"
	ptModel "github.com/nico87lbs/hopla/internal/points"
)

func earned(t *testing.T, db *gorm.DB, userID int) int {
	var member cModel.UserCircle
	require.NoError(t, db.Where("user_id = ? AND circle_id = 1", userID).First(&member).Error)
	return member.Points
}

// credit records a task's points as the chore repository does.
func credit(t *testing.T, db *gorm.DB, choreID, userID, points int, at time.Time) {
	done(t, db, choreID, userID, at)
	require.NoError(t, db.Create(&ptModel.PointsHistory{Action: ptModel.PointsHistoryActionAdd, Points: points,
		UserID: userID, CircleID: 1, CreatedAt: at}).Error)
	require.NoError(t, db.Model(&cModel.UserCircle{}).Where("user_id = ?", userID).
		Update("points", gorm.Expr("points + ?", points)).Error)
}

func TestRanks(t *testing.T) {
	db := setup(t)
	ranks, err := RanksFor(db, 1)
	require.NoError(t, err)
	require.Equal(t, "Petit Hop", ranks[0].Name)
	require.Equal(t, "Grand Hopla", ranks[len(ranks)-1].Name)

	level := RankOf(ranks, 150)
	require.Equal(t, 2, level.Level)
	require.Equal(t, "Hop Hop", level.Rank.Name)
	require.Equal(t, 300, level.Next.MinPoints)
	top := RankOf(ranks, 5000)
	require.Equal(t, len(ranks), top.Level)
	require.Nil(t, top.Next)

	saved, err := SaveRanks(db, 1, []Rank{{Name: "Héroïne", MinPoints: 50}, {Name: "Apprentie", MinPoints: 10}})
	require.NoError(t, err)
	require.Equal(t, "Apprentie", saved[0].Name)
	require.Equal(t, 0, saved[0].MinPoints, "the first rank starts at 0")
	ranks, err = RanksFor(db, 1)
	require.NoError(t, err)
	require.Len(t, ranks, 2)
	other, err := RanksFor(db, 2)
	require.NoError(t, err)
	require.Len(t, other, 5, "another circle keeps the defaults")
}

func TestWeeklyQuestsAreDrawnOnceAndPaid(t *testing.T) {
	db := setup(t)
	require.NoError(t, db.Create(&cModel.UserCircle{UserID: 3, CircleID: 1, Role: cModel.UserRoleMember, IsActive: true}).Error)
	require.NoError(t, db.Save(&Rules{CircleID: 1, QuestsPerWeek: 2}).Error)
	now := time.Now()
	task := chore(t, db, "Table", 2, now, nil)
	for i, quest := range []Quest{
		{Name: "Mettre la table 2 fois", Kind: GoalTasks, ChoreID: &task.ID, Target: 2, Reward: 7},
		{Name: "Gagner 100 points", Kind: GoalPoints, Target: 100, Reward: 20},
		{Name: "Série de 30 jours", Kind: GoalStreak, Target: 30, Reward: 50},
		{Name: "Réservée à Anna", Kind: GoalTasks, Target: 1, Reward: 1, UserIDs: []int{3}},
	} {
		quest.CircleID, quest.Period = 1, QuestWeek
		require.NoError(t, db.Create(&quest).Error, i)
	}
	require.NoError(t, db.Create(&Quest{CircleID: 1, Name: "Du mois", Kind: GoalTasks, Target: 40, Reward: 30, Period: QuestMonth}).Error)

	quests, err := Quests(db, 1, []int{2, 3}, now)
	require.NoError(t, err)
	require.Len(t, quests[2], 3, "two weekly quests and the monthly one")
	for _, quest := range quests[2] {
		require.NotEqual(t, "Réservée à Anna", quest.Name)
	}
	again, err := Quests(db, 1, []int{2}, now)
	require.NoError(t, err)
	require.Equal(t, quests[2], again[2], "the draw stays for the week")
	require.NoError(t, db.Create(&Quest{CircleID: 1, Name: "Nouvelle du mois", Kind: GoalPoints, Target: 50, Reward: 5, Period: QuestMonth}).Error)
	again, err = Quests(db, 1, []int{2}, now)
	require.NoError(t, err)
	require.Len(t, again[2], 4, "a quest added during the month is given too")
	require.Len(t, again[3], 0, "only the members asked for are drawn")

	// Make sure Elena has the table quest whatever the draw, then do it twice.
	require.NoError(t, db.Where("user_id = 2 AND period = ?", QuestWeek).Delete(&QuestDraw{}).Error)
	require.NoError(t, db.Create(&QuestDraw{CircleID: 1, UserID: 2, PeriodKey: quests[2][0].PeriodKey, QuestID: 1,
		Period: QuestWeek, Name: "Mettre la table 2 fois", Kind: GoalTasks, ChoreID: &task.ID, Target: 2, Reward: 7}).Error)
	credit(t, db, task.ID, 2, 2, now)
	require.NoError(t, AfterTask(db, 1, 2, now, now))
	require.Equal(t, 2, earned(t, db, 2), "one table out of two")
	credit(t, db, task.ID, 2, 2, now)
	require.NoError(t, AfterTask(db, 1, 2, now, now))
	require.Equal(t, 4+7, earned(t, db, 2))
	credit(t, db, task.ID, 2, 2, now)
	require.NoError(t, AfterTask(db, 1, 2, now, now))
	require.Equal(t, 6+7, earned(t, db, 2), "a quest pays once")

	var bonus ptModel.PointsHistory
	require.NoError(t, db.Where("action = ?", ptModel.PointsHistoryActionBonus).First(&bonus).Error)
	require.Equal(t, "Quête : Mettre la table 2 fois", *bonus.Reason)
}

func TestChallenges(t *testing.T) {
	db := setup(t)
	require.NoError(t, db.Create(&cModel.UserCircle{UserID: 3, CircleID: 1, Role: cModel.UserRoleMember, IsActive: true}).Error)
	require.NoError(t, db.Save(&Rules{CircleID: 1}).Error) // no streak bonus in the way
	now := time.Now()
	task := chore(t, db, "Chambre", 10, now, nil)
	require.NoError(t, db.Create(&Challenge{CircleID: 1, Name: "Piscine", Kind: GoalPoints, Target: 25, Reward: 5,
		RewardText: "Sortie piscine", Shared: true, UserIDs: []int{2, 3}, StartsAt: now.Add(-time.Hour), EndsAt: now.Add(time.Hour)}).Error)
	require.NoError(t, db.Create(&Challenge{CircleID: 1, Name: "Chambre 2 fois", Kind: GoalTasks, ChoreID: &task.ID,
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
