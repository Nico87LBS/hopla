package api

import (
	"errors"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/nico87lbs/hopla/config"
	auth "github.com/nico87lbs/hopla/internal/auth"
	familyModel "github.com/nico87lbs/hopla/internal/family/model"
	"github.com/nico87lbs/hopla/internal/learn"
	uModel "github.com/nico87lbs/hopla/internal/user/model"
	uRepo "github.com/nico87lbs/hopla/internal/user/repo"
	"github.com/nico87lbs/hopla/internal/utils"
	"github.com/nico87lbs/hopla/logging"
	limiter "github.com/ulule/limiter/v3"
)

// PlayHeader carries a play session's secret.
const PlayHeader = "X-Hopla-Play"

// newPlayLink gives a link for a member to play, such as from the family
// screen: the member themselves, or anyone of the family for a parent.
func (h *Handler) newPlayLink(c *gin.Context) {
	who, ok := h.caller(c)
	if !ok {
		return
	}
	var req struct {
		UserID int `json:"userId" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}
	if !mayPlayFor(who, req.UserID) {
		c.JSON(403, gin.H{"error": "You can only play as yourself"})
		return
	}
	members, err := h.familyRepo.GetFamilyUsers(c, who.familyID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Error checking the member"})
		return
	}
	member := false
	for _, m := range members {
		member = member || (m.UserID == req.UserID && m.IsActive)
	}
	if !member {
		c.JSON(404, gin.H{"error": "Member not found"})
		return
	}
	code, expires, err := learn.NewPlayLink(h.db.WithContext(c), who.familyID, req.UserID, who.userID, time.Now().UTC())
	if err != nil {
		answerError(c, err, "make the play link")
		return
	}
	c.JSON(200, gin.H{"res": gin.H{"code": code, "path": "/play/" + code, "expiresAt": expires}})
}

// startPlay trades a play link for a play session.
func (h *Handler) startPlay(c *gin.Context) {
	var req struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}
	secret, session, err := learn.StartPlay(h.db.WithContext(c), req.Code, time.Now().UTC())
	if errors.Is(err, learn.ErrPlayExpired) {
		c.JSON(410, gin.H{"error": "This link has expired"})
		return
	}
	if err != nil {
		answerError(c, err, "start playing")
		return
	}
	// Who plays, and the family's words for what they earn, since the games
	// open without the rest of the app.
	var member struct {
		DisplayName string
		Image       string
	}
	h.db.WithContext(c).Table("users").Select("display_name, image").Where("id = ?", session.UserID).Scan(&member)
	var family familyModel.Family
	h.db.WithContext(c).Select("currency").First(&family, session.FamilyID)
	c.JSON(200, gin.H{"res": gin.H{"token": secret, "expiresAt": session.ExpiresAt,
		"member":   gin.H{"userId": session.UserID, "displayName": member.DisplayName, "image": member.Image},
		"currency": familyModel.CurrencyOf(family.Currency)}})
}

// playAuth lets a play session in, as the child it is for, and nothing else.
func (h *Handler) playAuth(c *gin.Context) {
	session, err := learn.PlaySession(h.db.WithContext(c), c.GetHeader(PlayHeader), time.Now().UTC())
	if err != nil {
		c.AbortWithStatusJSON(401, gin.H{"error": "The games have closed, open them again"})
		return
	}
	var user uModel.UserDetails
	if err := h.db.WithContext(c).Table("users").Where("id = ?", session.UserID).First(&user).Error; err != nil ||
		user.FamilyID != session.FamilyID || user.Disabled {
		c.AbortWithStatusJSON(401, gin.H{"error": "The games have closed, open them again"})
		return
	}
	auth.SetCurrentUser(c, &user)
	c.Next()
}

// getPlaySelf answers with the player of the session.
func (h *Handler) getPlaySelf(c *gin.Context) {
	who, ok := h.caller(c)
	if !ok {
		return
	}
	player, err := learn.PlayerFor(h.db.WithContext(c), who.familyID, who.userID, time.Now().UTC())
	if err != nil {
		answerError(c, err, "get the player")
		return
	}
	c.JSON(200, gin.H{"res": player})
}

// endPlay closes the play session.
func (h *Handler) endPlay(c *gin.Context) {
	if err := learn.EndPlay(h.db.WithContext(c), c.GetHeader(PlayHeader)); err != nil {
		logging.FromContext(c).Error("Failed to end a play session", "error", err)
	}
	c.JSON(200, gin.H{"res": "ok"})
}

// PlayRoutes serve the family screen: play links with an API token, and the
// play sessions they open, which can only play.
func PlayRoutes(cfg *config.Config, h *Handler, r *gin.Engine, limiter *limiter.Limiter, userRepo *uRepo.UserRepository) {
	links := r.Group("eapi/v1/learn")
	links.Use(
		utils.TimeoutMiddleware(cfg.Server.WriteTimeout),
		utils.RateLimitMiddleware(limiter),
		auth.APITokenMiddleware(userRepo),
	)
	links.POST("/play-links", h.newPlayLink)

	r.POST("api/v1/learn/play/start", utils.RateLimitMiddleware(limiter), h.startPlay)
	play := r.Group("api/v1/learn/play")
	play.Use(utils.RateLimitMiddleware(limiter), h.playAuth)
	{
		play.GET("/player", h.getPlaySelf)
		play.POST("/games", h.recordGame)
		play.POST("/reports", h.addReport)
		play.DELETE("/session", h.endPlay)
	}
}
