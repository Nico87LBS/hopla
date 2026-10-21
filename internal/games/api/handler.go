// Package api serves the family games: the game of the day (surprise task,
// bonus period, streaks, ranks, quests, challenges) and their settings.
package api

import (
	"errors"
	"strconv"
	"strings"
	"time"

	jwt "github.com/appleboy/gin-jwt/v2"
	"github.com/gin-gonic/gin"
	"github.com/nico87lbs/hopla/config"
	auth "github.com/nico87lbs/hopla/internal/auth"
	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	circle "github.com/nico87lbs/hopla/internal/circle/model"
	cRepo "github.com/nico87lbs/hopla/internal/circle/repo"
	"github.com/nico87lbs/hopla/internal/games"
	uRepo "github.com/nico87lbs/hopla/internal/user/repo"
	"github.com/nico87lbs/hopla/internal/utils"
	"github.com/nico87lbs/hopla/logging"
	limiter "github.com/ulule/limiter/v3"
	"gorm.io/gorm"
)

const (
	maxBonus        = 1000
	maxStreakEvery  = 60
	maxMultiplier   = 5
	maxPeriodLength = 31 * 24 * time.Hour
	// Ended periods stay listed this long, so parents see what just ran.
	endedPeriodsKept = 30 * 24 * time.Hour
)

type Handler struct {
	db         *gorm.DB
	circleRepo *cRepo.CircleRepository
}

func NewHandler(db *gorm.DB, circleRepo *cRepo.CircleRepository) *Handler {
	return &Handler{db: db, circleRepo: circleRepo}
}

// requireParent answers 403 unless the current user is an admin or manager.
func (h *Handler) requireParent(c *gin.Context) (int, int, bool) {
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(401, gin.H{"error": "Authentication failed"})
		return 0, 0, false
	}
	members, err := h.circleRepo.GetCircleUsers(c, currentUser.CircleID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Error checking permissions"})
		return 0, 0, false
	}
	for _, m := range members {
		if m.UserID == currentUser.ID && (m.Role == circle.UserRoleAdmin || m.Role == circle.UserRoleManager) {
			return currentUser.ID, currentUser.CircleID, true
		}
	}
	c.JSON(403, gin.H{"error": "Only admins or managers can change the games"})
	return 0, 0, false
}

// SurpriseInfo is today's surprise task with its name, and ChoreIDs the tasks
// with the same name, one per child, that are all worth the surprise.
type SurpriseInfo struct {
	games.Surprise
	Name     string `json:"name"`
	ChoreIDs []int  `json:"choreIds"`
}

// Today is everything the boards need to show the games of the day.
type Today struct {
	Rules    games.Rules        `json:"rules"`
	Surprise *SurpriseInfo      `json:"surprise"`
	Period   *games.BonusPeriod `json:"period"`
	Streaks  []games.Streak     `json:"streaks"`
	Ranks    []games.Rank       `json:"ranks"`
	// Members is each active member's rank and running quests.
	Members    []MemberProgress      `json:"members"`
	Challenges []games.ChallengeView `json:"challenges"`
}

// MemberProgress is a member's rank, from the points earned since joining,
// and their quests of the week and month.
type MemberProgress struct {
	UserID int `json:"userId"`
	Earned int `json:"earned"`
	games.RankLevel
	Quests []games.QuestView `json:"quests"`
}

func (h *Handler) getToday(c *gin.Context) {
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(401, gin.H{"error": "Authentication failed"})
		return
	}
	circleID := currentUser.CircleID
	now := time.Now().UTC()
	db := h.db.WithContext(c)
	fail := func(err error) {
		logging.FromContext(c).Error("Failed to get the games of the day", "error", err)
		c.JSON(500, gin.H{"error": "Error getting the games of the day"})
	}
	rules, err := games.RulesFor(db, circleID)
	if err != nil {
		fail(err)
		return
	}
	today := Today{Rules: rules}
	if today.Period, err = games.ActivePeriod(db, circleID, now); err != nil {
		fail(err)
		return
	}
	surprise, err := games.TodaySurprise(db, circleID, now)
	if err != nil {
		fail(err)
		return
	}
	if surprise != nil {
		var chore chModel.Chore
		if err := db.Select("id", "name").First(&chore, surprise.ChoreID).Error; err == nil {
			today.Surprise = &SurpriseInfo{Surprise: *surprise, Name: chore.Name}
			if today.Surprise.ChoreIDs, err = games.SameTaskIDs(db, circleID, surprise.ChoreID); err != nil {
				fail(err)
				return
			}
		}
	}
	members, err := h.circleRepo.GetCircleUsers(c, circleID)
	if err != nil {
		fail(err)
		return
	}
	userIDs := []int{}
	for _, m := range members {
		if m.IsActive {
			userIDs = append(userIDs, m.UserID)
		}
	}
	if today.Streaks, err = games.Streaks(db, circleID, userIDs, now); err != nil {
		fail(err)
		return
	}
	if err := games.Settle(db, circleID, userIDs, now); err != nil {
		fail(err)
		return
	}
	if members, err = h.circleRepo.GetCircleUsers(c, circleID); err != nil { // with the rewards just paid
		fail(err)
		return
	}
	if today.Ranks, err = games.RanksFor(db, circleID); err != nil {
		fail(err)
		return
	}
	quests, err := games.Quests(db, circleID, userIDs, now)
	if err != nil {
		fail(err)
		return
	}
	today.Members = []MemberProgress{}
	for _, m := range members {
		if m.IsActive {
			today.Members = append(today.Members, MemberProgress{UserID: m.UserID, Earned: m.Points,
				RankLevel: games.RankOf(today.Ranks, m.Points), Quests: quests[m.UserID]})
		}
	}
	if today.Challenges, err = games.Challenges(db, circleID, userIDs, now.Add(-endedChallengesKept), now); err != nil {
		fail(err)
		return
	}
	c.JSON(200, gin.H{"res": today})
}

func (h *Handler) getRules(c *gin.Context) {
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(401, gin.H{"error": "Authentication failed"})
		return
	}
	rules, err := games.RulesFor(h.db.WithContext(c), currentUser.CircleID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Error getting the rules"})
		return
	}
	c.JSON(200, gin.H{"res": rules})
}

func (h *Handler) updateRules(c *gin.Context) {
	_, circleID, ok := h.requireParent(c)
	if !ok {
		return
	}
	var rules games.Rules
	if err := c.ShouldBindJSON(&rules); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}
	if rules.StreakEvery < 0 || rules.StreakEvery > maxStreakEvery || rules.StreakBonus < 0 || rules.StreakBonus > maxBonus ||
		rules.SurpriseBonus < 0 || rules.SurpriseBonus > maxBonus || rules.QuestsPerWeek < 0 || rules.QuestsPerWeek > maxQuestsPerWeek {
		c.JSON(400, gin.H{"error": "streakEvery must be 0 to 60 days, questsPerWeek 0 to 5, and bonuses 0 to 1000 points"})
		return
	}
	rules.CircleID = circleID
	rules.UpdatedAt = time.Now().UTC()
	if err := h.db.WithContext(c).Save(&rules).Error; err != nil {
		c.JSON(500, gin.H{"error": "Error saving the rules"})
		return
	}
	c.JSON(200, gin.H{"res": rules})
}

func (h *Handler) getPeriods(c *gin.Context) {
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(401, gin.H{"error": "Authentication failed"})
		return
	}
	periods := []games.BonusPeriod{}
	if err := h.db.WithContext(c).Where("circle_id = ? AND ends_at > ?", currentUser.CircleID, time.Now().UTC().Add(-endedPeriodsKept)).
		Order("starts_at").Find(&periods).Error; err != nil {
		c.JSON(500, gin.H{"error": "Error getting bonus periods"})
		return
	}
	c.JSON(200, gin.H{"res": periods})
}

type PeriodReq struct {
	Name       string    `json:"name" binding:"required,max=60"`
	StartsAt   time.Time `json:"startsAt" binding:"required"`
	EndsAt     time.Time `json:"endsAt" binding:"required"`
	Multiplier int       `json:"multiplier"`
}

func (req PeriodReq) valid(c *gin.Context) bool {
	switch {
	case strings.TrimSpace(req.Name) == "":
		c.JSON(400, gin.H{"error": "A bonus period needs a name"})
	case !req.EndsAt.After(req.StartsAt):
		c.JSON(400, gin.H{"error": "A bonus period must end after it starts"})
	case req.EndsAt.Sub(req.StartsAt) > maxPeriodLength:
		c.JSON(400, gin.H{"error": "A bonus period lasts 31 days at most"})
	case req.Multiplier < 2 || req.Multiplier > maxMultiplier:
		c.JSON(400, gin.H{"error": "The multiplier must be 2 to 5"})
	default:
		return true
	}
	return false
}

func (h *Handler) bindPeriod(c *gin.Context) (PeriodReq, bool) {
	var req PeriodReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return req, false
	}
	return req, req.valid(c)
}

func (h *Handler) createPeriod(c *gin.Context) {
	parentID, circleID, ok := h.requireParent(c)
	if !ok {
		return
	}
	req, ok := h.bindPeriod(c)
	if !ok {
		return
	}
	period := games.BonusPeriod{CircleID: circleID, Name: strings.TrimSpace(req.Name), StartsAt: req.StartsAt.UTC(),
		EndsAt: req.EndsAt.UTC(), Multiplier: req.Multiplier, CreatedBy: parentID, CreatedAt: time.Now().UTC()}
	if err := h.db.WithContext(c).Create(&period).Error; err != nil {
		c.JSON(500, gin.H{"error": "Error creating the bonus period"})
		return
	}
	c.JSON(200, gin.H{"res": period})
}

var errPeriodMissing = errors.New("bonus period not found")

func (h *Handler) findPeriod(c *gin.Context, circleID int) (*games.BonusPeriod, error) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return nil, errPeriodMissing
	}
	var period games.BonusPeriod
	if err := h.db.WithContext(c).Where("id = ? AND circle_id = ?", id, circleID).First(&period).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errPeriodMissing
		}
		return nil, err
	}
	return &period, nil
}

func (h *Handler) updatePeriod(c *gin.Context) {
	_, circleID, ok := h.requireParent(c)
	if !ok {
		return
	}
	period, err := h.findPeriod(c, circleID)
	if errors.Is(err, errPeriodMissing) {
		c.JSON(404, gin.H{"error": "Bonus period not found"})
		return
	}
	if err != nil {
		c.JSON(500, gin.H{"error": "Error getting the bonus period"})
		return
	}
	req, ok := h.bindPeriod(c)
	if !ok {
		return
	}
	period.Name, period.StartsAt, period.EndsAt, period.Multiplier =
		strings.TrimSpace(req.Name), req.StartsAt.UTC(), req.EndsAt.UTC(), req.Multiplier
	if err := h.db.WithContext(c).Save(period).Error; err != nil {
		c.JSON(500, gin.H{"error": "Error updating the bonus period"})
		return
	}
	c.JSON(200, gin.H{"res": period})
}

func (h *Handler) deletePeriod(c *gin.Context) {
	_, circleID, ok := h.requireParent(c)
	if !ok {
		return
	}
	period, err := h.findPeriod(c, circleID)
	if errors.Is(err, errPeriodMissing) {
		c.JSON(404, gin.H{"error": "Bonus period not found"})
		return
	}
	if err != nil || h.db.WithContext(c).Delete(period).Error != nil {
		c.JSON(500, gin.H{"error": "Error deleting the bonus period"})
		return
	}
	c.JSON(200, gin.H{"res": "Bonus period deleted"})
}

func Routes(r *gin.Engine, h *Handler, auth *jwt.GinJWTMiddleware) {
	routes := r.Group("api/v1/games")
	routes.Use(auth.MiddlewareFunc())
	{
		routes.GET("/today", h.getToday)
		routes.GET("/rules", h.getRules)
		routes.PUT("/rules", h.updateRules)
		routes.GET("/periods", h.getPeriods)
		routes.POST("/periods", h.createPeriod)
		routes.PUT("/periods/:id", h.updatePeriod)
		routes.DELETE("/periods/:id", h.deletePeriod)
		routes.GET("/ranks", h.getRanks)
		routes.PUT("/ranks", h.updateRanks)
		routes.GET("/quests", h.getQuests)
		routes.POST("/quests", h.createQuest)
		routes.PUT("/quests/:id", h.updateQuest)
		routes.DELETE("/quests/:id", h.deleteQuest)
		routes.GET("/challenges", h.getChallenges)
		routes.POST("/challenges", h.createChallenge)
		routes.PUT("/challenges/:id", h.updateChallenge)
		routes.DELETE("/challenges/:id", h.deleteChallenge)
	}
}

// APIs gives integrations such as Home Assistant the games of the day and
// their settings, with an API token.
func APIs(cfg *config.Config, h *Handler, r *gin.Engine, limiter *limiter.Limiter, userRepo *uRepo.UserRepository) {
	routes := r.Group("eapi/v1/games")
	routes.Use(
		utils.TimeoutMiddleware(cfg.Server.WriteTimeout),
		utils.RateLimitMiddleware(limiter),
		auth.APITokenMiddleware(userRepo),
	)
	{
		routes.GET("/today", h.getToday)
		routes.GET("/periods", h.getPeriods)
		routes.GET("/ranks", h.getRanks)
		routes.GET("/quests", h.getQuests)
		routes.GET("/challenges", h.getChallenges)
	}
}
