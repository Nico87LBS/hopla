package chore

import (
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/nico87lbs/hopla/internal/auth"
	chRepo "github.com/nico87lbs/hopla/internal/chore/repo"
	cRepo "github.com/nico87lbs/hopla/internal/circle/repo"
	"github.com/nico87lbs/hopla/logging"
)

// SetMemberAway marks a member of the current user's circle away or back home, for
// a parent, and answers the request.
func SetMemberAway(c *gin.Context, circleRepo *cRepo.CircleRepository, choreRepo *chRepo.ChoreRepository, memberID int, away bool) {
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(401, gin.H{"error": "Authentication failed"})
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
	found := false
	for _, member := range members {
		if member.UserID == memberID && member.IsActive {
			found = true
		}
	}
	if !found {
		c.JSON(400, gin.H{"error": "User is not a member of this circle"})
		return
	}
	changed, err := choreRepo.SetMemberAway(c, currentUser.CircleID, memberID, away, time.Now().UTC())
	if err != nil {
		logging.FromContext(c).Errorw("Error changing the member's presence", "error", err, "memberID", memberID)
		c.JSON(500, gin.H{"error": "Error changing the member's presence"})
		return
	}
	c.JSON(200, gin.H{"res": changed})
}

// SetMemberAway marks a member away or back home through the API, with
// {"away": true} or {"away": false}.
func (h *API) SetMemberAway(c *gin.Context) {
	memberID, err := strconv.Atoi(c.Param("id"))
	var req struct {
		Away *bool `json:"away"`
	}
	if err != nil || c.ShouldBindJSON(&req) != nil || req.Away == nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}
	SetMemberAway(c, h.circleRepo, h.choreRepo, memberID, *req.Away)
}
