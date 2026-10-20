package reward

import (
	"strconv"
	"time"

	jwt "github.com/appleboy/gin-jwt/v2"
	"github.com/gin-gonic/gin"
	"github.com/nico87lbs/hopla/config"
	auth "github.com/nico87lbs/hopla/internal/auth"
	circle "github.com/nico87lbs/hopla/internal/circle/model"
	cRepo "github.com/nico87lbs/hopla/internal/circle/repo"
	rModel "github.com/nico87lbs/hopla/internal/reward/model"
	rRepo "github.com/nico87lbs/hopla/internal/reward/repo"
	uRepo "github.com/nico87lbs/hopla/internal/user/repo"
	"github.com/nico87lbs/hopla/internal/utils"
	"github.com/nico87lbs/hopla/logging"
	limiter "github.com/ulule/limiter/v3"
)

type RewardReq struct {
	Name        string `json:"name" binding:"required"`
	Description string `json:"description"`
	PointsCost  int    `json:"pointsCost" binding:"required,gt=0"`
	IsActive    *bool  `json:"isActive"`
	QuotaCount  int    `json:"quotaCount" binding:"gte=0"`
	QuotaPeriod string `json:"quotaPeriod"`
}

// quota returns the reward's quota fields from the request, or an error
// message when they are inconsistent.
func (req RewardReq) quota() (int, string, string) {
	if req.QuotaCount == 0 {
		return 0, "", ""
	}
	if !rModel.ValidQuotaPeriod(req.QuotaPeriod) {
		return 0, "", "quotaPeriod must be day, week or month"
	}
	return req.QuotaCount, req.QuotaPeriod, ""
}

func redemptionError(c *gin.Context, err error) bool {
	switch err {
	case rRepo.ErrInsufficientPoints:
		c.JSON(400, gin.H{"error": "Not enough points to redeem this reward"})
	case rRepo.ErrQuotaReached:
		c.JSON(400, gin.H{"error": "This reward has already been redeemed as many times as allowed for this period"})
	default:
		return false
	}
	return true
}

type RedeemReq struct {
	Note *string `json:"note"`
	// UserID lets an admin or manager redeem for another circle member, such
	// as a child without a login. That redemption is approved at once.
	UserID *int `json:"userId"`
}

type ResolveReq struct {
	Note *string `json:"note"`
}

type Handler struct {
	rRepo      *rRepo.RewardRepository
	circleRepo *cRepo.CircleRepository
}

func NewHandler(rRepo *rRepo.RewardRepository, circleRepo *cRepo.CircleRepository) *Handler {
	return &Handler{
		rRepo:      rRepo,
		circleRepo: circleRepo,
	}
}

func (h *Handler) isAdminOrManager(c *gin.Context, userID int, circleID int) (bool, error) {
	circleUsers, err := h.circleRepo.GetCircleUsers(c, circleID)
	if err != nil {
		return false, err
	}
	for _, u := range circleUsers {
		if u.UserID == userID && (u.Role == circle.UserRoleAdmin || u.Role == circle.UserRoleManager) {
			return true, nil
		}
	}
	return false, nil
}

func (h *Handler) getRewards(c *gin.Context) {
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(401, gin.H{"error": "Authentication failed"})
		return
	}
	rewards, err := h.rRepo.GetRewardsByCircle(c, currentUser.CircleID)
	if err == nil {
		err = h.rRepo.FillQuotaUsage(c, currentUser.CircleID, rewards, time.Now().UTC())
	}
	if err != nil {
		logging.FromContext(c).Error("Failed to fetch rewards", "error", err)
		c.JSON(500, gin.H{"error": "Error getting rewards"})
		return
	}
	c.JSON(200, rewards)
}

func (h *Handler) createReward(c *gin.Context) {
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(401, gin.H{"error": "Authentication failed"})
		return
	}

	isAdmin, err := h.isAdminOrManager(c, currentUser.ID, currentUser.CircleID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Error checking permissions"})
		return
	}
	if !isAdmin {
		c.JSON(403, gin.H{"error": "Only admins or managers can create rewards"})
		return
	}

	var req RewardReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request: " + err.Error()})
		return
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	quotaCount, quotaPeriod, quotaErr := req.quota()
	if quotaErr != "" {
		c.JSON(400, gin.H{"error": quotaErr})
		return
	}

	reward := &rModel.Reward{
		CircleID:      currentUser.CircleID,
		Name:          req.Name,
		Description:   req.Description,
		PointsCost:    req.PointsCost,
		IsActive:      isActive,
		CreatedBy:     currentUser.ID,
		QuotaCount:    quotaCount,
		QuotaPeriod:   quotaPeriod,
		QuotaTimezone: currentUser.Timezone,
	}
	if err := h.rRepo.CreateReward(c, reward); err != nil {
		c.JSON(500, gin.H{"error": "Error creating reward"})
		return
	}
	c.JSON(200, gin.H{"res": reward})
}

func (h *Handler) updateReward(c *gin.Context) {
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(401, gin.H{"error": "Authentication failed"})
		return
	}

	isAdmin, err := h.isAdminOrManager(c, currentUser.ID, currentUser.CircleID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Error checking permissions"})
		return
	}
	if !isAdmin {
		c.JSON(403, gin.H{"error": "Only admins or managers can update rewards"})
		return
	}

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(400, gin.H{"error": "Invalid reward ID"})
		return
	}

	var req RewardReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request: " + err.Error()})
		return
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	quotaCount, quotaPeriod, quotaErr := req.quota()
	if quotaErr != "" {
		c.JSON(400, gin.H{"error": quotaErr})
		return
	}

	reward := &rModel.Reward{
		ID:            id,
		CircleID:      currentUser.CircleID,
		Name:          req.Name,
		Description:   req.Description,
		PointsCost:    req.PointsCost,
		IsActive:      isActive,
		QuotaCount:    quotaCount,
		QuotaPeriod:   quotaPeriod,
		QuotaTimezone: currentUser.Timezone,
	}
	if err := h.rRepo.UpdateReward(c, reward); err != nil {
		c.JSON(500, gin.H{"error": "Error updating reward"})
		return
	}
	c.JSON(200, gin.H{"res": reward})
}

func (h *Handler) deleteReward(c *gin.Context) {
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(401, gin.H{"error": "Authentication failed"})
		return
	}

	isAdmin, err := h.isAdminOrManager(c, currentUser.ID, currentUser.CircleID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Error checking permissions"})
		return
	}
	if !isAdmin {
		c.JSON(403, gin.H{"error": "Only admins or managers can delete rewards"})
		return
	}

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(400, gin.H{"error": "Invalid reward ID"})
		return
	}

	if err := h.rRepo.DeleteReward(c, id, currentUser.CircleID); err != nil {
		c.JSON(500, gin.H{"error": "Error deleting reward"})
		return
	}
	c.JSON(200, gin.H{"res": "Reward deleted"})
}

func (h *Handler) redeemReward(c *gin.Context) {
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(401, gin.H{"error": "Authentication failed"})
		return
	}

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(400, gin.H{"error": "Invalid reward ID"})
		return
	}

	var req RedeemReq
	// body is optional (note is optional), so ignore binding errors on an empty body
	_ = c.ShouldBindJSON(&req)

	if req.UserID != nil && *req.UserID != currentUser.ID {
		h.redeemForMember(c, id, *req.UserID, currentUser.ID, currentUser.CircleID, req.Note)
		return
	}

	redemption, err := h.rRepo.RequestRedemption(c, id, currentUser.ID, currentUser.CircleID, req.Note)
	if err != nil {
		if redemptionError(c, err) {
			return
		}
		logging.FromContext(c).Error("Failed to request redemption", "error", err)
		c.JSON(500, gin.H{"error": "Error requesting redemption"})
		return
	}

	c.JSON(200, gin.H{"res": redemption})
}

// redeemForMember spends a member's points on their behalf. Only an admin or
// manager may do it, and since they would approve the request anyway, it is
// recorded and approved in one go.
func (h *Handler) redeemForMember(c *gin.Context, rewardID int, memberID int, adminID int, circleID int, note *string) {
	isAdmin, err := h.isAdminOrManager(c, adminID, circleID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Error checking permissions"})
		return
	}
	if !isAdmin {
		c.JSON(403, gin.H{"error": "Only admins or managers can redeem for another member"})
		return
	}

	redemption, err := h.rRepo.RequestRedemption(c, rewardID, memberID, circleID, note)
	if err != nil {
		if redemptionError(c, err) {
			return
		}
		logging.FromContext(c).Error("Failed to request redemption for member", "error", err)
		c.JSON(500, gin.H{"error": "Error requesting redemption"})
		return
	}

	if err := h.rRepo.ApproveRedemption(c, redemption.ID, circleID, adminID); err != nil {
		if err == rRepo.ErrInsufficientPoints {
			c.JSON(400, gin.H{"error": "Not enough points to redeem this reward"})
			return
		}
		logging.FromContext(c).Error("Failed to approve redemption for member", "error", err)
		c.JSON(500, gin.H{"error": "Error approving redemption"})
		return
	}
	now := time.Now().UTC()
	redemption.Status = rModel.RedemptionStatusApproved
	redemption.ResolvedAt = &now
	redemption.ResolvedBy = &adminID
	c.JSON(200, gin.H{"res": redemption})
}

func (h *Handler) getRedemptions(c *gin.Context) {
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(401, gin.H{"error": "Authentication failed"})
		return
	}

	isAdmin, err := h.isAdminOrManager(c, currentUser.ID, currentUser.CircleID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Error checking permissions"})
		return
	}

	// Non-admins only ever see their own redemption history.
	if !isAdmin {
		redemptions, err := h.rRepo.GetRedemptionsByUser(c, currentUser.ID, currentUser.CircleID)
		if err != nil {
			c.JSON(500, gin.H{"error": "Error getting redemptions"})
			return
		}
		c.JSON(200, redemptions)
		return
	}

	var status *rModel.RedemptionStatus
	switch c.Query("status") {
	case "pending":
		s := rModel.RedemptionStatusPending
		status = &s
	case "approved":
		s := rModel.RedemptionStatusApproved
		status = &s
	case "rejected":
		s := rModel.RedemptionStatusRejected
		status = &s
	}

	redemptions, err := h.rRepo.GetRedemptionsByCircle(c, currentUser.CircleID, status)
	if err != nil {
		c.JSON(500, gin.H{"error": "Error getting redemptions"})
		return
	}
	c.JSON(200, redemptions)
}

func (h *Handler) approveRedemption(c *gin.Context) {
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(401, gin.H{"error": "Authentication failed"})
		return
	}

	isAdmin, err := h.isAdminOrManager(c, currentUser.ID, currentUser.CircleID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Error checking permissions"})
		return
	}
	if !isAdmin {
		c.JSON(403, gin.H{"error": "Only admins or managers can approve redemptions"})
		return
	}

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(400, gin.H{"error": "Invalid redemption ID"})
		return
	}

	if err := h.rRepo.ApproveRedemption(c, id, currentUser.CircleID, currentUser.ID); err != nil {
		if err == rRepo.ErrInsufficientPoints {
			c.JSON(400, gin.H{"error": "User no longer has enough points for this redemption"})
			return
		}
		if err == rRepo.ErrRedemptionNotPending {
			c.JSON(400, gin.H{"error": "Redemption is not pending"})
			return
		}
		logging.FromContext(c).Error("Failed to approve redemption", "error", err)
		c.JSON(500, gin.H{"error": "Error approving redemption"})
		return
	}
	c.JSON(200, gin.H{"message": "Redemption approved"})
}

func (h *Handler) rejectRedemption(c *gin.Context) {
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(401, gin.H{"error": "Authentication failed"})
		return
	}

	isAdmin, err := h.isAdminOrManager(c, currentUser.ID, currentUser.CircleID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Error checking permissions"})
		return
	}
	if !isAdmin {
		c.JSON(403, gin.H{"error": "Only admins or managers can reject redemptions"})
		return
	}

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(400, gin.H{"error": "Invalid redemption ID"})
		return
	}

	var req ResolveReq
	_ = c.ShouldBindJSON(&req)

	if err := h.rRepo.RejectRedemption(c, id, currentUser.CircleID, currentUser.ID, req.Note); err != nil {
		if err == rRepo.ErrRedemptionNotPending {
			c.JSON(400, gin.H{"error": "Redemption is not pending"})
			return
		}
		logging.FromContext(c).Error("Failed to reject redemption", "error", err)
		c.JSON(500, gin.H{"error": "Error rejecting redemption"})
		return
	}
	c.JSON(200, gin.H{"message": "Redemption rejected"})
}

func Routes(r *gin.Engine, h *Handler, auth *jwt.GinJWTMiddleware) {
	rewardRoutes := r.Group("api/v1/rewards")
	rewardRoutes.Use(auth.MiddlewareFunc())
	{
		rewardRoutes.GET("", h.getRewards)
		rewardRoutes.POST("", h.createReward)
		rewardRoutes.PUT("/:id", h.updateReward)
		rewardRoutes.DELETE("/:id", h.deleteReward)
		rewardRoutes.POST("/:id/redeem", h.redeemReward)

		rewardRoutes.GET("/redemptions", h.getRedemptions)
		rewardRoutes.POST("/redemptions/:id/approve", h.approveRedemption)
		rewardRoutes.POST("/redemptions/:id/reject", h.rejectRedemption)
	}
}

// APIs exposes rewards on the external API, authenticated with an API token
// like the other eapi routes, so integrations such as Home Assistant can list
// rewards and resolve redemptions.
func APIs(cfg *config.Config, h *Handler, r *gin.Engine, limiter *limiter.Limiter, userRepo *uRepo.UserRepository) {
	rewardAPI := r.Group("eapi/v1/rewards")
	rewardAPI.Use(
		utils.TimeoutMiddleware(cfg.Server.WriteTimeout),
		utils.RateLimitMiddleware(limiter),
		auth.APITokenMiddleware(userRepo),
	)
	{
		rewardAPI.GET("", h.getRewards)
		rewardAPI.POST("/:id/redeem", h.redeemReward)

		rewardAPI.GET("/redemptions", h.getRedemptions)
		rewardAPI.POST("/redemptions/:id/approve", h.approveRedemption)
		rewardAPI.POST("/redemptions/:id/reject", h.rejectRedemption)
	}
}
