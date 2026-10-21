// Package api serves the points ledger, bonuses and penalties, and the
// ready-made bonus and penalty presets.
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
	circle "github.com/nico87lbs/hopla/internal/circle/model"
	cRepo "github.com/nico87lbs/hopla/internal/circle/repo"
	pModel "github.com/nico87lbs/hopla/internal/points"
	pRepo "github.com/nico87lbs/hopla/internal/points/repo"
	uRepo "github.com/nico87lbs/hopla/internal/user/repo"
	"github.com/nico87lbs/hopla/internal/utils"
	"github.com/nico87lbs/hopla/logging"
	limiter "github.com/ulule/limiter/v3"
)

const maxAdjustment = 1000

type Handler struct {
	pRepo      *pRepo.PointsRepository
	circleRepo *cRepo.CircleRepository
}

func NewHandler(pRepo *pRepo.PointsRepository, circleRepo *cRepo.CircleRepository) *Handler {
	return &Handler{pRepo: pRepo, circleRepo: circleRepo}
}

var actionNames = map[pModel.PointsHistoryAction]string{
	pModel.PointsHistoryActionAdd:     "task",
	pModel.PointsHistoryActionRemove:  "undo",
	pModel.PointsHistoryActionRedeem:  "redeem",
	pModel.PointsHistoryActionBonus:   "bonus",
	pModel.PointsHistoryActionPenalty: "penalty",
}

// Entry is one ledger row as clients see it. Delta is the signed change to
// the balance left to spend.
type Entry struct {
	ID        int       `json:"id"`
	UserID    int       `json:"userId"`
	Action    string    `json:"action"`
	Points    int       `json:"points"`
	Delta     int       `json:"delta"`
	Reason    *string   `json:"reason,omitempty"`
	ChoreID   *int      `json:"choreId,omitempty"`
	RewardID  *int      `json:"rewardId,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
	CreatedBy int       `json:"createdBy"`
}

func toEntry(h pModel.PointsHistory) Entry {
	points := h.Points
	if points < 0 {
		points = -points
	}
	return Entry{ID: h.ID, UserID: h.UserID, Action: actionNames[h.Action], Points: points, Delta: h.Delta(),
		Reason: h.Reason, ChoreID: h.ChoreID, RewardID: h.RewardID, CreatedAt: h.CreatedAt, CreatedBy: h.CreatedBy}
}

func (h *Handler) isAdminOrManager(c *gin.Context, userID, circleID int) (bool, error) {
	members, err := h.circleRepo.GetCircleUsers(c, circleID)
	if err != nil {
		return false, err
	}
	for _, m := range members {
		if m.UserID == userID && (m.Role == circle.UserRoleAdmin || m.Role == circle.UserRoleManager) {
			return true, nil
		}
	}
	return false, nil
}

// requireParent answers 403 unless the current user is an admin or manager.
func (h *Handler) requireParent(c *gin.Context) (int, int, bool) {
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(401, gin.H{"error": "Authentication failed"})
		return 0, 0, false
	}
	isAdmin, err := h.isAdminOrManager(c, currentUser.ID, currentUser.CircleID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Error checking permissions"})
		return 0, 0, false
	}
	if !isAdmin {
		c.JSON(403, gin.H{"error": "Only admins or managers can change points"})
		return 0, 0, false
	}
	return currentUser.ID, currentUser.CircleID, true
}

func optionalInt(c *gin.Context, name string) (*int, bool) {
	raw := c.Query(name)
	if raw == "" {
		return nil, true
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		c.JSON(400, gin.H{"error": "Invalid " + name})
		return nil, false
	}
	return &value, true
}

func (h *Handler) getHistory(c *gin.Context) {
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(401, gin.H{"error": "Authentication failed"})
		return
	}
	userID, ok := optionalInt(c, "userId")
	if !ok {
		return
	}
	before, ok := optionalInt(c, "before")
	if !ok {
		return
	}
	limit, ok := optionalInt(c, "limit")
	if !ok {
		return
	}
	filter := pRepo.HistoryFilter{UserID: userID, BeforeID: before}
	if limit != nil {
		filter.Limit = *limit
	}
	rows, err := h.pRepo.History(c, currentUser.CircleID, filter)
	if err != nil {
		logging.FromContext(c).Error("Failed to get points history", "error", err)
		c.JSON(500, gin.H{"error": "Error getting points history"})
		return
	}
	entries := make([]Entry, 0, len(rows))
	for _, row := range rows {
		entries = append(entries, toEntry(row))
	}
	c.JSON(200, gin.H{"res": entries})
}

type AdjustReq struct {
	UserID   int     `json:"userId" binding:"required"`
	Points   int     `json:"points"`
	Reason   *string `json:"reason"`
	PresetID *int    `json:"presetId"`
}

func (h *Handler) adjust(c *gin.Context) {
	parentID, circleID, ok := h.requireParent(c)
	if !ok {
		return
	}
	var req AdjustReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}
	if req.PresetID != nil {
		presets, err := h.pRepo.Presets(c, circleID)
		if err != nil {
			c.JSON(500, gin.H{"error": "Error getting presets"})
			return
		}
		found := false
		for _, preset := range presets {
			if preset.ID == *req.PresetID {
				found = true
				req.Points = preset.Points
				if req.Reason == nil || strings.TrimSpace(*req.Reason) == "" {
					name := preset.Name
					req.Reason = &name
				}
			}
		}
		if !found {
			c.JSON(404, gin.H{"error": "Preset not found"})
			return
		}
	}
	if req.Points == 0 || req.Points > maxAdjustment || req.Points < -maxAdjustment {
		c.JSON(400, gin.H{"error": "points must be between -1000 and 1000 and not zero"})
		return
	}
	if req.Reason != nil {
		reason := strings.TrimSpace(*req.Reason)
		if reason == "" {
			req.Reason = nil
		} else {
			req.Reason = &reason
		}
	}
	entry, err := h.pRepo.Adjust(c, circleID, req.UserID, req.Points, parentID, req.Reason)
	if errors.Is(err, pRepo.ErrNotMember) {
		c.JSON(400, gin.H{"error": "User is not a member of this circle"})
		return
	}
	if err != nil {
		logging.FromContext(c).Error("Failed to adjust points", "error", err)
		c.JSON(500, gin.H{"error": "Error adjusting points"})
		return
	}
	c.JSON(200, gin.H{"res": toEntry(*entry)})
}

type PresetReq struct {
	Name   string `json:"name" binding:"required,max=60"`
	Points int    `json:"points"`
}

func (req PresetReq) valid(c *gin.Context) bool {
	if strings.TrimSpace(req.Name) == "" || req.Points == 0 || req.Points > maxAdjustment || req.Points < -maxAdjustment {
		c.JSON(400, gin.H{"error": "A preset needs a name and points between -1000 and 1000, not zero"})
		return false
	}
	return true
}

func (h *Handler) getPresets(c *gin.Context) {
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(401, gin.H{"error": "Authentication failed"})
		return
	}
	presets, err := h.pRepo.Presets(c, currentUser.CircleID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Error getting presets"})
		return
	}
	c.JSON(200, gin.H{"res": presets})
}

func (h *Handler) createPreset(c *gin.Context) {
	_, circleID, ok := h.requireParent(c)
	if !ok {
		return
	}
	var req PresetReq
	if err := c.ShouldBindJSON(&req); err != nil || !req.valid(c) {
		if err != nil {
			c.JSON(400, gin.H{"error": "Invalid request"})
		}
		return
	}
	preset := pModel.PointsPreset{CircleID: circleID, Name: strings.TrimSpace(req.Name), Points: req.Points}
	if err := h.pRepo.CreatePreset(c, &preset); err != nil {
		c.JSON(500, gin.H{"error": "Error creating preset"})
		return
	}
	c.JSON(200, gin.H{"res": preset})
}

func (h *Handler) updatePreset(c *gin.Context) {
	_, circleID, ok := h.requireParent(c)
	if !ok {
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(400, gin.H{"error": "Invalid preset ID"})
		return
	}
	var req PresetReq
	if err := c.ShouldBindJSON(&req); err != nil || !req.valid(c) {
		if err != nil {
			c.JSON(400, gin.H{"error": "Invalid request"})
		}
		return
	}
	preset := pModel.PointsPreset{ID: id, CircleID: circleID, Name: strings.TrimSpace(req.Name), Points: req.Points}
	if err := h.pRepo.UpdatePreset(c, circleID, &preset); err != nil {
		if errors.Is(err, pRepo.ErrPresetMissing) {
			c.JSON(404, gin.H{"error": "Preset not found"})
			return
		}
		c.JSON(500, gin.H{"error": "Error updating preset"})
		return
	}
	c.JSON(200, gin.H{"res": preset})
}

func (h *Handler) deletePreset(c *gin.Context) {
	_, circleID, ok := h.requireParent(c)
	if !ok {
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(400, gin.H{"error": "Invalid preset ID"})
		return
	}
	if err := h.pRepo.DeletePreset(c, circleID, id); err != nil {
		if errors.Is(err, pRepo.ErrPresetMissing) {
			c.JSON(404, gin.H{"error": "Preset not found"})
			return
		}
		c.JSON(500, gin.H{"error": "Error deleting preset"})
		return
	}
	c.JSON(200, gin.H{"res": "Preset deleted"})
}

func Routes(r *gin.Engine, h *Handler, auth *jwt.GinJWTMiddleware) {
	routes := r.Group("api/v1/points")
	routes.Use(auth.MiddlewareFunc())
	{
		routes.GET("/history", h.getHistory)
		routes.POST("/adjust", h.adjust)
		routes.GET("/presets", h.getPresets)
		routes.POST("/presets", h.createPreset)
		routes.PUT("/presets/:id", h.updatePreset)
		routes.DELETE("/presets/:id", h.deletePreset)
	}
}

// APIs gives integrations such as Home Assistant the ledger, bonuses and
// penalties, and the presets, with an API token.
func APIs(cfg *config.Config, h *Handler, r *gin.Engine, limiter *limiter.Limiter, userRepo *uRepo.UserRepository) {
	routes := r.Group("eapi/v1/points")
	routes.Use(
		utils.TimeoutMiddleware(cfg.Server.WriteTimeout),
		utils.RateLimitMiddleware(limiter),
		auth.APITokenMiddleware(userRepo),
	)
	{
		routes.GET("/history", h.getHistory)
		routes.POST("/adjust", h.adjust)
		routes.GET("/presets", h.getPresets)
	}
}
