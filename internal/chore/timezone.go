package chore

import (
	"github.com/gin-gonic/gin"
	"github.com/nico87lbs/hopla/internal/auth"
	chRepo "github.com/nico87lbs/hopla/internal/chore/repo"
	cRepo "github.com/nico87lbs/hopla/internal/circle/repo"
	"github.com/nico87lbs/hopla/internal/utils"
	"github.com/nico87lbs/hopla/internal/zone"
	"github.com/nico87lbs/hopla/logging"
)

// FamilyTimezone is the family's time zone as the clients see it.
type FamilyTimezone struct {
	// Timezone is the zone every date of the family follows.
	Timezone string `json:"timezone"`
	// Server is the server's zone, the family's when it is at home.
	Server string `json:"server"`
	// Custom is true when the family is not in the server's zone.
	Custom bool `json:"custom"`
}

func familyTimezone(circleID int) FamilyTimezone {
	current, server := zone.Name(circleID), zone.NameOf(zone.Server())
	return FamilyTimezone{Timezone: current, Server: server, Custom: current != server}
}

// GetFamilyTimezone answers with the current user's family time zone.
func GetFamilyTimezone(c *gin.Context) {
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(401, gin.H{"error": "Authentication failed"})
		return
	}
	c.JSON(200, gin.H{"res": familyTimezone(currentUser.CircleID)})
}

// SetFamilyTimezone moves the current user's family to another time zone, for
// a parent, and answers the request. An empty zone, or the server's, brings
// the family back home.
func SetFamilyTimezone(c *gin.Context, circleRepo *cRepo.CircleRepository, choreRepo *chRepo.ChoreRepository) {
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(401, gin.H{"error": "Authentication failed"})
		return
	}
	var req struct {
		Timezone *string `json:"timezone"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Timezone == nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}
	name := *req.Timezone
	if name == zone.NameOf(zone.Server()) {
		name = ""
	}
	if name != "" && !utils.IsValidTimezone(name) {
		c.JSON(400, gin.H{"error": "Invalid timezone"})
		return
	}
	members, err := circleRepo.GetCircleUsers(c, currentUser.CircleID)
	if err != nil {
		logging.FromContext(c).Errorw("Error getting circle members", "error", err)
		c.JSON(500, gin.H{"error": "Error getting circle members"})
		return
	}
	if !currentUser.IsAdminOrManager(members) {
		c.JSON(403, gin.H{"error": "Only parents can do this"})
		return
	}
	if _, err := choreRepo.SetFamilyTimezone(c, currentUser.CircleID, name); err != nil {
		logging.FromContext(c).Errorw("Error changing the family's time zone", "error", err, "timezone", name)
		c.JSON(500, gin.H{"error": "Error changing the family's time zone"})
		return
	}
	c.JSON(200, gin.H{"res": familyTimezone(currentUser.CircleID)})
}

// GetFamilyTimezone answers with the family's time zone through the API.
func (h *API) GetFamilyTimezone(c *gin.Context) { GetFamilyTimezone(c) }

// SetFamilyTimezone moves the family to another time zone through the API,
// with {"timezone": "Europe/Lisbon"}, or "" to come back home.
func (h *API) SetFamilyTimezone(c *gin.Context) {
	SetFamilyTimezone(c, h.circleRepo, h.choreRepo)
}
