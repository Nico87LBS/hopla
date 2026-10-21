package api

import (
	"errors"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	auth "github.com/nico87lbs/hopla/internal/auth"
	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	circle "github.com/nico87lbs/hopla/internal/circle/model"
	"github.com/nico87lbs/hopla/internal/games"
	"gorm.io/gorm"
)

const (
	maxRanks            = 12
	maxQuestsPerWeek    = 5
	maxTarget           = 10000
	maxChallengeSpan    = 366 * 24 * time.Hour
	endedChallengesKept = 14 * 24 * time.Hour
)

var errNotFound = errors.New("not found")

func idParam(c *gin.Context) (int, error) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return 0, errNotFound
	}
	return id, nil
}

// findInCircle loads a row of the circle by the id in the path.
func (h *Handler) findInCircle(c *gin.Context, circleID int, row any) error {
	id, err := idParam(c)
	if err != nil {
		return err
	}
	err = h.db.WithContext(c).Where("id = ? AND circle_id = ?", id, circleID).First(row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return errNotFound
	}
	return err
}

func answerFindError(c *gin.Context, err error, what string) {
	if errors.Is(err, errNotFound) {
		c.JSON(404, gin.H{"error": what + " not found"})
		return
	}
	c.JSON(500, gin.H{"error": "Error getting the " + strings.ToLower(what)})
}

func (h *Handler) getRanks(c *gin.Context) {
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(401, gin.H{"error": "Authentication failed"})
		return
	}
	ranks, err := games.RanksFor(h.db.WithContext(c), currentUser.CircleID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Error getting the ranks"})
		return
	}
	c.JSON(200, gin.H{"res": ranks})
}

func (h *Handler) updateRanks(c *gin.Context) {
	_, circleID, ok := h.requireParent(c)
	if !ok {
		return
	}
	var ranks []games.Rank
	if err := c.ShouldBindJSON(&ranks); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}
	if len(ranks) == 0 || len(ranks) > maxRanks {
		c.JSON(400, gin.H{"error": "A circle has 1 to 12 ranks"})
		return
	}
	seen := map[int]bool{}
	for i := range ranks {
		ranks[i].Name = strings.TrimSpace(ranks[i].Name)
		ranks[i].Icon = strings.TrimSpace(ranks[i].Icon)
		if ranks[i].Image != "" && !slices.Contains(games.RankImages, ranks[i].Image) {
			c.JSON(400, gin.H{"error": "Unknown rank image"})
			return
		}
		if ranks[i].Name == "" || len(ranks[i].Name) > 60 || len(ranks[i].Icon) > 32 ||
			ranks[i].MinPoints < 0 || ranks[i].MinPoints > 1000000 || seen[ranks[i].MinPoints] {
			c.JSON(400, gin.H{"error": "Each rank needs a name and its own number of points"})
			return
		}
		seen[ranks[i].MinPoints] = true
	}
	saved, err := games.SaveRanks(h.db.WithContext(c), circleID, ranks)
	if err != nil {
		c.JSON(500, gin.H{"error": "Error saving the ranks"})
		return
	}
	c.JSON(200, gin.H{"res": saved})
}

// goalReq is what quests and challenges share.
type goalReq struct {
	Name    string `json:"name" binding:"required,max=80"`
	Kind    string `json:"kind" binding:"required"`
	ChoreID *int   `json:"choreId"`
	Target  int    `json:"target"`
	Reward  int    `json:"reward"`
	UserIDs []int  `json:"userIds"`
}

// valid checks the goal, and that its task and members are in the circle.
func (h *Handler) validGoal(c *gin.Context, circleID int, req *goalReq, kinds ...string) bool {
	req.Name = strings.TrimSpace(req.Name)
	switch {
	case req.Name == "":
		c.JSON(400, gin.H{"error": "A goal needs a name"})
		return false
	case !slices.Contains(kinds, req.Kind):
		c.JSON(400, gin.H{"error": "Unknown kind: " + req.Kind})
		return false
	case req.Target < 1 || req.Target > maxTarget:
		c.JSON(400, gin.H{"error": "The target must be 1 to 10000"})
		return false
	case req.Reward < 0 || req.Reward > maxBonus:
		c.JSON(400, gin.H{"error": "The reward must be 0 to 1000 points"})
		return false
	}
	if req.Kind != games.GoalTasks {
		req.ChoreID = nil
	}
	if req.ChoreID != nil {
		var count int64
		if err := h.db.WithContext(c).Model(&chModel.Chore{}).Where("id = ? AND circle_id = ?", *req.ChoreID, circleID).
			Count(&count).Error; err != nil || count == 0 {
			c.JSON(400, gin.H{"error": "Task not found"})
			return false
		}
	}
	if len(req.UserIDs) > 0 {
		members, err := h.circleRepo.GetCircleUsers(c, circleID)
		if err != nil {
			c.JSON(500, gin.H{"error": "Error getting the members"})
			return false
		}
		for _, userID := range req.UserIDs {
			if !slices.ContainsFunc(members, func(m *circle.UserCircleDetail) bool { return m.UserID == userID }) {
				c.JSON(400, gin.H{"error": "User is not a member of this circle"})
				return false
			}
		}
	}
	return true
}

type QuestReq struct {
	goalReq
	Period string `json:"period" binding:"required"`
}

func (h *Handler) bindQuest(c *gin.Context, circleID int) (QuestReq, bool) {
	var req QuestReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return req, false
	}
	if req.Period != games.QuestWeek && req.Period != games.QuestMonth {
		c.JSON(400, gin.H{"error": "A quest lasts a week or a month"})
		return req, false
	}
	return req, h.validGoal(c, circleID, &req.goalReq, games.GoalTasks, games.GoalPoints, games.GoalStreak)
}

func (req QuestReq) apply(quest *games.Quest) {
	quest.Name, quest.Kind, quest.ChoreID, quest.Target, quest.Reward, quest.Period, quest.UserIDs =
		req.Name, req.Kind, req.ChoreID, req.Target, req.Reward, req.Period, req.UserIDs
}

func (h *Handler) getQuests(c *gin.Context) {
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(401, gin.H{"error": "Authentication failed"})
		return
	}
	quests := []games.Quest{}
	if err := h.db.WithContext(c).Where("circle_id = ?", currentUser.CircleID).Order("period desc, id").
		Find(&quests).Error; err != nil {
		c.JSON(500, gin.H{"error": "Error getting the quests"})
		return
	}
	c.JSON(200, gin.H{"res": quests})
}

func (h *Handler) createQuest(c *gin.Context) {
	_, circleID, ok := h.requireParent(c)
	if !ok {
		return
	}
	req, ok := h.bindQuest(c, circleID)
	if !ok {
		return
	}
	quest := games.Quest{CircleID: circleID, CreatedAt: time.Now().UTC()}
	req.apply(&quest)
	if err := h.db.WithContext(c).Create(&quest).Error; err != nil {
		c.JSON(500, gin.H{"error": "Error creating the quest"})
		return
	}
	c.JSON(200, gin.H{"res": quest})
}

func (h *Handler) updateQuest(c *gin.Context) {
	_, circleID, ok := h.requireParent(c)
	if !ok {
		return
	}
	var quest games.Quest
	if err := h.findInCircle(c, circleID, &quest); err != nil {
		answerFindError(c, err, "Quest")
		return
	}
	req, ok := h.bindQuest(c, circleID)
	if !ok {
		return
	}
	req.apply(&quest)
	if err := h.db.WithContext(c).Save(&quest).Error; err != nil {
		c.JSON(500, gin.H{"error": "Error updating the quest"})
		return
	}
	c.JSON(200, gin.H{"res": quest})
}

func (h *Handler) deleteQuest(c *gin.Context) {
	_, circleID, ok := h.requireParent(c)
	if !ok {
		return
	}
	var quest games.Quest
	if err := h.findInCircle(c, circleID, &quest); err != nil {
		answerFindError(c, err, "Quest")
		return
	}
	// Quests already drawn keep running until the end of their week or month.
	if err := h.db.WithContext(c).Delete(&quest).Error; err != nil {
		c.JSON(500, gin.H{"error": "Error deleting the quest"})
		return
	}
	c.JSON(200, gin.H{"res": "Quest deleted"})
}

type ChallengeReq struct {
	goalReq
	RewardText string    `json:"rewardText" binding:"max=120"`
	Shared     bool      `json:"shared"`
	StartsAt   time.Time `json:"startsAt" binding:"required"`
	EndsAt     time.Time `json:"endsAt" binding:"required"`
}

func (h *Handler) bindChallenge(c *gin.Context, circleID int) (ChallengeReq, bool) {
	var req ChallengeReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return req, false
	}
	if !req.EndsAt.After(req.StartsAt) || req.EndsAt.Sub(req.StartsAt) > maxChallengeSpan {
		c.JSON(400, gin.H{"error": "A challenge ends after it starts, within a year"})
		return req, false
	}
	return req, h.validGoal(c, circleID, &req.goalReq, games.GoalTasks, games.GoalPoints)
}

func (req ChallengeReq) apply(challenge *games.Challenge) {
	challenge.Name, challenge.Kind, challenge.ChoreID, challenge.Target, challenge.Reward, challenge.UserIDs =
		req.Name, req.Kind, req.ChoreID, req.Target, req.Reward, req.UserIDs
	challenge.RewardText, challenge.Shared = strings.TrimSpace(req.RewardText), req.Shared
	challenge.StartsAt, challenge.EndsAt = req.StartsAt.UTC(), req.EndsAt.UTC()
}

// getChallenges lists the challenges to come, running or ended lately.
func (h *Handler) getChallenges(c *gin.Context) {
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(401, gin.H{"error": "Authentication failed"})
		return
	}
	challenges := []games.Challenge{}
	if err := h.db.WithContext(c).Where("circle_id = ? AND ends_at > ?", currentUser.CircleID,
		time.Now().UTC().Add(-endedChallengesKept)).Order("starts_at, id").Find(&challenges).Error; err != nil {
		c.JSON(500, gin.H{"error": "Error getting the challenges"})
		return
	}
	c.JSON(200, gin.H{"res": challenges})
}

func (h *Handler) createChallenge(c *gin.Context) {
	parentID, circleID, ok := h.requireParent(c)
	if !ok {
		return
	}
	req, ok := h.bindChallenge(c, circleID)
	if !ok {
		return
	}
	challenge := games.Challenge{CircleID: circleID, CreatedBy: parentID, CreatedAt: time.Now().UTC()}
	req.apply(&challenge)
	if err := h.db.WithContext(c).Create(&challenge).Error; err != nil {
		c.JSON(500, gin.H{"error": "Error creating the challenge"})
		return
	}
	c.JSON(200, gin.H{"res": challenge})
}

func (h *Handler) updateChallenge(c *gin.Context) {
	_, circleID, ok := h.requireParent(c)
	if !ok {
		return
	}
	var challenge games.Challenge
	if err := h.findInCircle(c, circleID, &challenge); err != nil {
		answerFindError(c, err, "Challenge")
		return
	}
	req, ok := h.bindChallenge(c, circleID)
	if !ok {
		return
	}
	req.apply(&challenge)
	if err := h.db.WithContext(c).Save(&challenge).Error; err != nil {
		c.JSON(500, gin.H{"error": "Error updating the challenge"})
		return
	}
	c.JSON(200, gin.H{"res": challenge})
}

func (h *Handler) deleteChallenge(c *gin.Context) {
	_, circleID, ok := h.requireParent(c)
	if !ok {
		return
	}
	var challenge games.Challenge
	if err := h.findInCircle(c, circleID, &challenge); err != nil {
		answerFindError(c, err, "Challenge")
		return
	}
	err := h.db.WithContext(c).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("challenge_id = ?", challenge.ID).Delete(&games.ChallengeWin{}).Error; err != nil {
			return err
		}
		return tx.Delete(&challenge).Error
	})
	if err != nil {
		c.JSON(500, gin.H{"error": "Error deleting the challenge"})
		return
	}
	c.JSON(200, gin.H{"res": "Challenge deleted"})
}
