package circle

import (
	"github.com/gin-gonic/gin"
	"github.com/nico87lbs/hopla/internal/auth"
	cModel "github.com/nico87lbs/hopla/internal/circle/model"
	"github.com/nico87lbs/hopla/logging"
)

// GetFamilyCurrency answers with what the family earns, and the choices.
func (h *Handler) GetFamilyCurrency(c *gin.Context) {
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(401, gin.H{"error": "Authentication failed"})
		return
	}
	family, err := h.circleRepo.GetCircleByID(c, currentUser.CircleID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Error getting the family"})
		return
	}
	c.JSON(200, gin.H{"res": gin.H{"currency": cModel.CurrencyOf(family.Currency), "choices": cModel.Currencies}})
}

// SetFamilyCurrency renames what the family earns, for a parent.
func (h *Handler) SetFamilyCurrency(c *gin.Context) {
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(401, gin.H{"error": "Authentication failed"})
		return
	}
	var req struct {
		Currency string `json:"currency"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || cModel.CurrencyOf(req.Currency) != req.Currency {
		c.JSON(400, gin.H{"error": "Invalid currency"})
		return
	}
	members, err := h.circleRepo.GetCircleUsers(c, currentUser.CircleID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Error getting circle members"})
		return
	}
	if !currentUser.IsAdminOrManager(members) {
		c.JSON(403, gin.H{"error": "Only parents can do this"})
		return
	}
	if err := h.circleRepo.SetCurrency(c, currentUser.CircleID, req.Currency); err != nil {
		logging.FromContext(c).Errorw("Error changing the family's currency", "error", err)
		c.JSON(500, gin.H{"error": "Error changing the family's currency"})
		return
	}
	c.JSON(200, gin.H{"res": gin.H{"currency": req.Currency, "choices": cModel.Currencies}})
}
