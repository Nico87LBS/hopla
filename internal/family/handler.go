package family

import (
	"log"

	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/nico87lbs/hopla/config"
	"github.com/nico87lbs/hopla/internal/auth"
	"github.com/nico87lbs/hopla/internal/chore"
	chRepo "github.com/nico87lbs/hopla/internal/chore/repo"
	fModel "github.com/nico87lbs/hopla/internal/family/model"
	fRepo "github.com/nico87lbs/hopla/internal/family/repo"
	pRepo "github.com/nico87lbs/hopla/internal/points/repo"
	"github.com/nico87lbs/hopla/internal/storage"
	uModel "github.com/nico87lbs/hopla/internal/user/model"
	uRepo "github.com/nico87lbs/hopla/internal/user/repo"
	"github.com/nico87lbs/hopla/logging"
)

type Handler struct {
	familyRepo           *fRepo.FamilyRepository
	userRepo             *uRepo.UserRepository
	choreRepo            *chRepo.ChoreRepository
	pointRepo            *pRepo.PointsRepository
	signer               storage.URLSigner
	singleFamilyInstance bool
}

func NewHandler(cr *fRepo.FamilyRepository, ur *uRepo.UserRepository, c *chRepo.ChoreRepository, pr *pRepo.PointsRepository,
	signer storage.URLSigner, config *config.Config) *Handler {
	return &Handler{
		familyRepo:           cr,
		userRepo:             ur,
		choreRepo:            c,
		pointRepo:            pr,
		signer:               signer,
		singleFamilyInstance: config.SingleFamilyInstance,
	}
}

// GetFamilyMembers godoc
//
//	@Summary		Get family members
//	@Description	Retrieves all members of the current user's family
//	@Tags			families
//	@Accept			json
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Success		200	{object}	map[string][]fModel.UserFamilyDetail	"res: array of family members"
//	@Failure		500	{object}	map[string]string						"error: Error getting current user"
//	@Failure		500	{object}	map[string]string						"error: Error getting family members"
//	@Router			/families/members [get]
func (h *Handler) GetFamilyMembers(c *gin.Context) {
	// Get the family ID from the JWT
	log := logging.FromContext(c)
	currentUser, ok := auth.CurrentUser(c) // TODO we might want to change this from 500 to 401
	if !ok {
		log.Error("Error getting current user")
		c.JSON(500, gin.H{
			"error": "Error getting current user",
		})
		return
	}

	// Get all the members of the family
	members, err := h.familyRepo.GetFamilyUsers(c, currentUser.FamilyID)
	if err != nil {
		log.Error("Error getting family members:", err)
		c.JSON(500, gin.H{
			"error": "Error getting family members",
		})
		return
	}

	for i := range members {
		members[i].Image = h.signer.SignIfLocal(members[i].Image)
	}

	c.JSON(200, gin.H{
		"res": members,
	})
}

// JoinFamily godoc
//
//	@Summary		Request to join a family
//	@Description	Requests to join a family using an invite code
//	@Tags			families
//	@Accept			json
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Param			invite_code	query		string				true	"Invite code"
//	@Success		200			{object}	map[string]string	"res: User Requested to join family successfully"
//	@Failure		400			{object}	map[string]string	"error: Invalid request"
//	@Failure		401			{object}	map[string]string	"error: Authentication failed"
//	@Failure		409			{object}	map[string]string	"error: You are already a member of this family"
//	@Failure		500			{object}	map[string]string	"error: Error adding user to family"
//	@Router			/families/join [post]
func (h *Handler) JoinFamily(c *gin.Context) {
	// Get the family ID from the JWT
	log := logging.FromContext(c)
	log.Debug("handlder.go: JoinFamily")
	currentUser, ok := auth.CurrentUser(c)

	if !ok {
		c.JSON(500, gin.H{
			"error": "Error getting current user",
		})
		return
	}

	requestedFamilyID := c.Query("invite_code")
	if requestedFamilyID == "" {
		c.JSON(400, gin.H{
			"error": "Invalid request",
		})
		return
	}

	family, err := h.familyRepo.GetFamilyByInviteCode(c, requestedFamilyID)
	if err != nil {
		log.Error("Error getting family by invite code:", err)
		c.JSON(400, gin.H{
			"error": "Invalid request",
		})
		return
	}

	if family.ID == currentUser.FamilyID {
		c.JSON(409, gin.H{
			"error": "You are already a member of this family",
		})
		return
	}
	// Add the user to the family
	err = h.familyRepo.AddUserToFamily(c, &fModel.UserFamily{
		FamilyID: family.ID,
		UserID:   currentUser.ID,
		Role:     "member",
		IsActive: false,
	})

	if err != nil {
		log.Error("Error adding user to family:", err)
		c.JSON(500, gin.H{
			"error": "Error adding user to family",
		})
		return
	}

	c.JSON(200, gin.H{
		"res": "User Requested to join family successfully",
	})
}

// LeaveFamily godoc
//
//	@Summary		Leave a family
//	@Description	Removes the current user from a family and restores their original family
//	@Tags			families
//	@Accept			json
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Param			family_id	query		int					true	"Family ID"
//	@Success		200			{object}	map[string]string	"res: User left family successfully"
//	@Failure		400			{object}	map[string]string	"error: Invalid request"
//	@Failure		401			{object}	map[string]string	"error: Authentication failed"
//	@Failure		500			{object}	map[string]string	"error: Error leaving family"
//	@Router			/families/leave [delete]
func (h *Handler) LeaveFamily(c *gin.Context) {
	log := logging.FromContext(c)
	log.Debug("handler.go: LeaveFamily")
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(500, gin.H{
			"error": "Error getting current user",
		})
		return
	}
	rawFamilyID := c.Query("family_id")
	familyID, err := strconv.Atoi(rawFamilyID)
	if err != nil {
		c.JSON(400, gin.H{
			"error": "Invalid request",
		})
		return
	}

	if familyID != currentUser.FamilyID {
		c.JSON(400, gin.H{
			"error": "family_id must match your current family",
		})
		return
	}

	orginalFamilyID, err := h.familyRepo.GetUserOriginalFamily(c, currentUser.ID)
	if err != nil {
		log.Error("Error getting user original family:", err)
		c.JSON(500, gin.H{
			"error": "Error getting user original family",
		})
		return
	}

	// START : HANDLE USER LEAVING FAMILY
	// bulk update chores:
	if err := handleUserLeavingFamily(h, c, &currentUser.User, orginalFamilyID); err != nil {
		log.Error("Error handling user leaving family:", err)
		c.JSON(500, gin.H{
			"error": "Error handling user leaving family",
		})
		return
	}

	// END: HANDLE USER LEAVING FAMILY

	err = h.familyRepo.LeaveFamilyByUserID(c, familyID, currentUser.ID)
	if err != nil {
		log.Error("Error leaving family:", err)
		c.JSON(500, gin.H{
			"error": "Error leaving family",
		})
		return
	}

	if err := h.userRepo.UpdateUserFamily(c, currentUser.ID, orginalFamilyID); err != nil {
		log.Error("Error updating user family:", err)
		c.JSON(500, gin.H{
			"error": "Error updating user family",
		})
		return
	}
	c.JSON(200, gin.H{
		"res": "User left family successfully",
	})
}

// reassignChoresForLeavingUser moves the chores the user created in the family
// they are leaving to destinationFamilyID (keeping them assigned to the user),
// and hands the chores that were merely assigned to them back to the family.
func reassignChoresForLeavingUser(h *Handler, c *gin.Context, leavingUser *uModel.User, destinationFamilyID int) error {
	userAssignedFamilyChores, err := h.choreRepo.GetChores(c, leavingUser.FamilyID, leavingUser.ID, true, nil, false)
	if err != nil {
		return err
	}
	movedChoreIDs := make([]int, 0)
	for _, ch := range userAssignedFamilyChores {
		if ch.CreatedBy == leavingUser.ID && (ch.AssignedTo == nil || *ch.AssignedTo != leavingUser.ID) {
			ch.AssignedTo = &leavingUser.ID
			ch.UpdatedAt = time.Now().UTC()
			ch.UpdatedBy = leavingUser.ID
			ch.FamilyID = destinationFamilyID
			movedChoreIDs = append(movedChoreIDs, ch.ID)
		} else if ch.CreatedBy != leavingUser.ID && (ch.AssignedTo != nil && *ch.AssignedTo == leavingUser.ID) {
			chore.RemoveAssigneeAndReassign(ch, leavingUser.ID)
		}

	}

	h.choreRepo.UpdateChores(c, userAssignedFamilyChores)
	// The moved chores now live in another family; tell the remaining members'
	// devices to drop their copies.
	if err := h.choreRepo.TombstoneChoresLeavingFamily(c, leavingUser.FamilyID, movedChoreIDs); err != nil {
		logging.FromContext(c).Error("Error recording tombstones for moved chores", "error", err)
	}
	h.choreRepo.RemoveChoreAssigneeByFamilyID(c, leavingUser.ID, leavingUser.FamilyID)
	return nil
}

func handleUserLeavingFamily(h *Handler, c *gin.Context, leavingUser *uModel.User, orginalFamilyID int) error {
	if err := reassignChoresForLeavingUser(h, c, leavingUser, orginalFamilyID); err != nil {
		return err
	}
	h.familyRepo.AssignDefaultFamily(c, leavingUser.ID)
	return nil
}

// DeleteFamilyMember godoc
//
//	@Summary		Delete a family member
//	@Description	Removes a member from a family (admin only)
//	@Tags			families
//	@Accept			json
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Param			id			path		int					true	"Family ID"
//	@Param			member_id	query		int					true	"Member ID to delete"
//	@Success		200			{object}	map[string]string	"res: User deleted from family successfully"
//	@Failure		400			{object}	map[string]string	"error: Invalid request"
//	@Failure		401			{object}	map[string]string	"error: Authentication failed"
//	@Failure		403			{object}	map[string]string	"error: You are not an admin of this family"
//	@Failure		500			{object}	map[string]string	"error: Error deleting family member"
//	@Router			/families/{id}/members/delete [delete]
func (h *Handler) DeleteFamilyMember(c *gin.Context) {
	log := logging.FromContext(c)
	log.Debug("handler.go: DeleteFamilyMember")
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(500, gin.H{
			"error": "Error getting current user",
		})
		return
	}
	rawFamilyID := c.Param("id")
	familyID, err := strconv.Atoi(rawFamilyID)
	if err != nil {
		c.JSON(400, gin.H{
			"error": "Invalid request",
		})
		return
	}
	rawMemeberIDToDeleted := c.Query("member_id")
	memberIDToDeleted, err := strconv.Atoi(rawMemeberIDToDeleted)
	if err != nil {
		c.JSON(400, gin.H{
			"error": "Invalid request",
		})
		return
	}
	admins, err := h.familyRepo.GetFamilyAdmins(c, familyID)
	if err != nil {
		log.Error("Error getting family admins:", err)
		c.JSON(500, gin.H{
			"error": "Error getting family admins",
		})
		return
	}
	isAdmin := false
	for _, admin := range admins {
		if admin.UserID == currentUser.ID {
			isAdmin = true
			break
		}
	}
	if !isAdmin {
		c.JSON(403, gin.H{
			"error": "You are not an admin of this family",
		})
		return
	}
	orginalFamilyID, err := h.familyRepo.GetUserOriginalFamily(c, memberIDToDeleted)
	if handleUserLeavingFamily(h, c, &uModel.User{ID: memberIDToDeleted, FamilyID: familyID}, orginalFamilyID) != nil {
		log.Error("Error handling user leaving family:", err)
		c.JSON(500, gin.H{
			"error": "Error handling user leaving family",
		})
		return
	}

	err = h.familyRepo.DeleteMemberByID(c, familyID, memberIDToDeleted)
	if err != nil {
		log.Error("Error deleting family member:", err)
		c.JSON(500, gin.H{
			"error": "Error deleting family member",
		})
		return
	}
	c.JSON(200, gin.H{
		"res": "User deleted from family successfully",
	})
}

// GetUserFamilies godoc
//
//	@Summary		Get user families
//	@Description	Retrieves all families the current user belongs to
//	@Tags			families
//	@Accept			json
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Success		200	{object}	map[string][]fModel.Family	"res: array of families"
//	@Failure		401	{object}	map[string]string			"error: Authentication failed"
//	@Failure		500	{object}	map[string]string			"error: Error getting user families"
//	@Router			/families [get]
func (h *Handler) GetUserFamilies(c *gin.Context) {
	log := logging.FromContext(c)
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(500, gin.H{
			"error": "Error getting current user",
		})
		return
	}

	families, err := h.familyRepo.GetUserFamilies(c, currentUser.ID)
	if err != nil {
		log.Error("Error getting user families:", err)
		c.JSON(500, gin.H{
			"error": "Error getting user families",
		})
		return
	}

	c.JSON(200, gin.H{
		"res": families,
	})
}

// GetPendingFamilyMembers godoc
//
//	@Summary		Get pending join requests
//	@Description	Retrieves pending family join requests (admin only)
//	@Tags			families
//	@Accept			json
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Success		200	{object}	map[string][]fModel.UserFamilyDetail	"res: array of pending members"
//	@Failure		401	{object}	map[string]string						"error: Authentication failed"
//	@Failure		403	{object}	map[string]string						"error: You are not an admin of this family"
//	@Failure		500	{object}	map[string]string						"error: Error getting pending family members"
//	@Router			/families/members/requests [get]
func (h *Handler) GetPendingFamilyMembers(c *gin.Context) {
	log := logging.FromContext(c)
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(500, gin.H{
			"error": "Error getting current user",
		})
		return
	}

	currentMemebers, err := h.familyRepo.GetFamilyUsers(c, currentUser.FamilyID)
	if err != nil {
		log.Error("Error getting family members:", err)
		c.JSON(500, gin.H{
			"error": "Error getting family members",
		})
		return
	}

	// confirm that the current user is an admin:
	isAdmin := false
	for _, member := range currentMemebers {
		if member.UserID == currentUser.ID && member.Role == "admin" {
			isAdmin = true
			break
		}
	}
	if !isAdmin {
		c.JSON(403, gin.H{
			"error": "You are not an admin of this family",
		})
		return
	}

	members, err := h.familyRepo.GetPendingJoinRequests(c, currentUser.FamilyID)
	if err != nil {
		log.Error("Error getting pending family members:", err)
		c.JSON(500, gin.H{
			"error": "Error getting pending family members",
		})
		return
	}

	for i := range members {
		members[i].Image = h.signer.SignIfLocal(members[i].Image)
	}

	c.JSON(200, gin.H{
		"res": members,
	})
}

// requireFamilyAdmin writes an error response and returns false when userID is
// not an admin among the given family members.
func (h *Handler) requireFamilyAdmin(c *gin.Context, members []*fModel.UserFamilyDetail, userID int) bool {
	for _, member := range members {
		if member.UserID == userID && member.Role == fModel.UserRoleAdmin {
			return true
		}
	}
	c.JSON(403, gin.H{
		"error": "You are not an admin of this family",
	})
	return false
}

// findPendingRequest resolves requestID to one of the family's pending join
// requests, writing an error response and returning false when it is not.
func (h *Handler) findPendingRequest(c *gin.Context, familyID, requestID int) (*fModel.UserFamilyDetail, bool) {
	log := logging.FromContext(c)

	pendingRequests, err := h.familyRepo.GetPendingJoinRequests(c, familyID)
	if err != nil {
		log.Error("Error getting pending family members:", err)
		c.JSON(500, gin.H{
			"error": "Error getting pending family members",
		})
		return nil, false
	}

	for _, request := range pendingRequests {
		if request.ID == requestID {
			return request, true
		}
	}

	c.JSON(400, gin.H{
		"error": "Invalid request",
	})
	return nil, false
}

// AcceptJoinRequest godoc
//
//	@Summary		Accept a join request
//	@Description	Accepts a pending family join request (admin only)
//	@Tags			families
//	@Accept			json
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Param			requestId	query		int					true	"Request ID"
//	@Success		200			{object}	map[string]string	"res: Join request accepted successfully"
//	@Failure		400			{object}	map[string]string	"error: Invalid request / Family is full"
//	@Failure		401			{object}	map[string]string	"error: Authentication failed"
//	@Failure		403			{object}	map[string]string	"error: You are not an admin of this family"
//	@Failure		500			{object}	map[string]string	"error: Error accepting join request"
//	@Router			/families/members/requests/accept [put]
func (h *Handler) AcceptJoinRequest(c *gin.Context) {
	log := logging.FromContext(c)
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(500, gin.H{
			"error": "Error getting current user",
		})
		return
	}

	rawRequestID := c.Query("requestId")
	requestID, err := strconv.Atoi(rawRequestID)
	if err != nil {
		c.JSON(400, gin.H{
			"error": "Invalid request",
		})
		return
	}

	currentMembers, err := h.familyRepo.GetFamilyUsers(c, currentUser.FamilyID)
	// filter to the active members only:
	activeMembers := make([]*fModel.UserFamilyDetail, 0)
	for _, member := range currentMembers {
		if member.IsActive {
			activeMembers = append(activeMembers, member)
		}
	}
	if err != nil {
		log.Error("Error getting family members:", err)
		c.JSON(500, gin.H{
			"error": "Error getting family members",
		})
		return
	}
	if !h.requireFamilyAdmin(c, currentMembers, currentUser.ID) {
		return
	}

	requestedFamily, ok := h.findPendingRequest(c, currentUser.FamilyID, requestID)
	if !ok {
		return
	}

	// Capture the family the user is in before accepting: UpdateUserFamily
	// below repoints them, and the cleanup afterwards needs the old value.
	previousFamilyID := 0
	if requester, err := h.userRepo.GetUserByID(c, requestedFamily.UserID); err != nil {
		log.Error("Error getting requester, skipping previous membership cleanup:", err)
	} else {
		previousFamilyID = requester.FamilyID
	}

	err = h.familyRepo.AcceptJoinRequest(c, currentUser.FamilyID, requestID)
	if err != nil {
		log.Error("Error accepting join request:", err)
		c.JSON(500, gin.H{
			"error": "Error accepting join request",
		})
		return
	}

	if err := h.userRepo.UpdateUserFamily(c, requestedFamily.UserID, currentUser.FamilyID); err != nil {
		log.Error("Error updating user family:", err)
		c.JSON(500, gin.H{
			"error": "Error updating user family",
		})
		return
	}

	h.removeStaleMembership(c, requestedFamily.UserID, previousFamilyID, currentUser.FamilyID)

	c.JSON(200, gin.H{
		"res": "Join request accepted successfully",
	})

}

// removeStaleMembership drops the membership the accepted user held in the
// shared family they just moved out of. Without this the old membership stays
// is_active, so the user keeps a seat in its member list and stays in its chore
// viewer set (which is what offline sync uses to decide what reaches a device).
//
// Memberships the user administers are left alone: that is their own family,
// and LeaveFamily needs it to send them back. Failures are logged only, since
// the user has already been accepted into the new family by this point.
func (h *Handler) removeStaleMembership(c *gin.Context, userID, previousFamilyID, newFamilyID int) {
	log := logging.FromContext(c)

	if previousFamilyID == 0 || previousFamilyID == newFamilyID {
		return
	}

	previousRole, err := h.familyRepo.GetUserFamilyRole(c, previousFamilyID, userID)
	if err != nil {
		log.Error("Error getting previous family role:", err)
		return
	}
	if previousRole == fModel.RoleAdmin {
		// Their own family: keep the membership so they can return to it.
		return
	}
	if previousRole == "" {
		// No membership row there, nothing to clean up.
		return
	}

	// Chores the user created in the old family follow them out, but they are
	// parked in the family the user administers rather than the newly joined
	// one, so that a shared family's tasks never surface in another one.
	destinationFamilyID, err := h.familyRepo.GetUserOriginalFamily(c, userID)
	if err != nil || destinationFamilyID == 0 {
		log.Warnw("Skipping previous membership cleanup: no family to move the user's chores to",
			"userID", userID, "previousFamilyID", previousFamilyID, "error", err)
		return
	}

	leavingUser := &uModel.User{ID: userID, FamilyID: previousFamilyID}
	if err := reassignChoresForLeavingUser(h, c, leavingUser, destinationFamilyID); err != nil {
		log.Error("Error reassigning chores from previous family:", err)
		return
	}

	if err := h.familyRepo.LeaveFamilyByUserID(c, previousFamilyID, userID); err != nil {
		log.Error("Error removing previous family membership:", err)
		return
	}

	log.Infow("Removed previous family membership after join request acceptance",
		"userID", userID,
		"previousFamilyID", previousFamilyID,
		"newFamilyID", newFamilyID,
		"choresMovedTo", destinationFamilyID)
}

// DeclineJoinRequest godoc
//
//	@Summary		Decline a join request
//	@Description	Declines a pending family join request (admin only). The request is removed, so the user may request to join again later.
//	@Tags			families
//	@Accept			json
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Param			requestId	query		int					true	"Request ID"
//	@Success		200			{object}	map[string]string	"res: Join request declined successfully"
//	@Failure		400			{object}	map[string]string	"error: Invalid request"
//	@Failure		401			{object}	map[string]string	"error: Authentication failed"
//	@Failure		403			{object}	map[string]string	"error: You are not an admin of this family"
//	@Failure		500			{object}	map[string]string	"error: Error declining join request"
//	@Router			/families/members/requests/decline [delete]
func (h *Handler) DeclineJoinRequest(c *gin.Context) {
	log := logging.FromContext(c)
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(500, gin.H{
			"error": "Error getting current user",
		})
		return
	}

	requestID, err := strconv.Atoi(c.Query("requestId"))
	if err != nil {
		c.JSON(400, gin.H{
			"error": "Invalid request",
		})
		return
	}

	currentMembers, err := h.familyRepo.GetFamilyUsers(c, currentUser.FamilyID)
	if err != nil {
		log.Error("Error getting family members:", err)
		c.JSON(500, gin.H{
			"error": "Error getting family members",
		})
		return
	}

	if !h.requireFamilyAdmin(c, currentMembers, currentUser.ID) {
		return
	}

	_, ok = h.findPendingRequest(c, currentUser.FamilyID, requestID)
	if !ok {
		return
	}

	if err := h.familyRepo.DeclineJoinRequest(c, currentUser.FamilyID, requestID); err != nil {
		log.Error("Error declining join request:", err)
		c.JSON(500, gin.H{
			"error": "Error declining join request",
		})
		return
	}

	c.JSON(200, gin.H{
		"res": "Join request declined successfully",
	})
}

// RedeemPoints godoc
//
//	@Summary		Redeem member points
//	@Description	Redeems points for a family member (admin only)
//	@Tags			families
//	@Accept			json
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Param			id		path		int								true	"Family ID"
//	@Param			points	body		object{points=int,userId=int}	true	"Points redemption request"
//	@Success		200		{object}	map[string]string				"res: Points redeemed successfully"
//	@Failure		400		{object}	map[string]string				"error: Invalid request / User does not have enough points / User is not a member of this family"
//	@Failure		401		{object}	map[string]string				"error: Authentication failed"
//	@Failure		403		{object}	map[string]string				"error: You are not an admin of this family"
//	@Failure		500		{object}	map[string]string				"error: Error redeeming points"
//	@Router			/families/{id}/members/points/redeem [post]
func (h *Handler) RedeemPoints(c *gin.Context) {
	type RedeemPointsRequest struct {
		Points int `json:"points"`
		UserID int `json:"userId"`
	}

	log := logging.FromContext(c)
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(500, gin.H{
			"error": "Error getting current user",
		})
		return
	}
	// parse body:
	var redeemReq RedeemPointsRequest

	if err := c.ShouldBindJSON(&redeemReq); err != nil {
		c.JSON(400, gin.H{
			"error": "Invalid request",
		})
		return

	}

	if redeemReq.Points <= 0 {
		c.JSON(400, gin.H{
			"error": "Invalid request",
		})
		return
	}
	familyIdRaw := c.Param("id")

	familyID, err := strconv.Atoi(familyIdRaw)
	if err != nil {
		log.Error("Error redeeming points: invalid family id")
		c.JSON(400, gin.H{
			"error": "Invalid request: invalid family id",
		})
		return
	}
	if familyID != currentUser.FamilyID {
		log.Error("You are not a member of this family")
		c.JSON(400, gin.H{
			"error": "You are not a member of this family",
		})
		return
	}
	members, err := h.familyRepo.GetFamilyUsers(c, currentUser.FamilyID)
	if err != nil {
		log.Error("Error getting family admins:", err)
		c.JSON(500, gin.H{
			"error": "Error getting family admins",
		})
		return
	}
	isAdmin := false
	isValidMember := false
	var member *fModel.UserFamilyDetail
	for _, user := range members {
		if user.UserID == currentUser.ID && user.Role == "admin" {
			isAdmin = true
		}
		if user.UserID == redeemReq.UserID {
			isValidMember = true
			member = user
		}

	}

	if !isAdmin {
		log.Error("Error redeeming points: user is not an admin of this family")
		c.JSON(403, gin.H{
			"error": "You are not an admin of this family",
		})
		return
	}
	if !isValidMember {
		log.Error("Error redeeming points: user is not a member of this family")
		c.JSON(400, gin.H{
			"error": "User is not a member of this family",
		})
		return
	}
	if member.Points-redeemReq.Points < 0 {
		log.Error("Error redeeming points: user does not have enough points")
		c.JSON(400, gin.H{
			"error": "User does not have enough points",
		})
		return
	}

	err = h.familyRepo.RedeemPoints(c, currentUser.FamilyID, redeemReq.UserID, redeemReq.Points, currentUser.ID)
	if err != nil {
		log.Error("Error redeeming points:", err)
		c.JSON(500, gin.H{
			"error": "Error redeeming points",
		})
		return
	}

	c.JSON(200, gin.H{
		"res": "Points redeemed successfully",
	})
}

// ChangeMemberRole godoc
//
//	@Summary		Change member role
//	@Description	Changes the role of a family member (admin only)
//	@Tags			families
//	@Accept			json
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Param			role	body		object{memberId=int,role=fModel.Role}	true	"Role change request"
//	@Success		200		{object}	map[string]string						"res: Member role changed successfully"
//	@Failure		400		{object}	map[string]string						"error: Invalid request / Invalid role / User is not a member of this family"
//	@Failure		401		{object}	map[string]string						"error: Authentication failed"
//	@Failure		403		{object}	map[string]string						"error: You are not an admin of this family"
//	@Failure		500		{object}	map[string]string						"error: Error changing member role"
//	@Router			/families/members/role [put]
func (h *Handler) ChangeMemberRole(c *gin.Context) {
	log := logging.FromContext(c)
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(500, gin.H{
			"error": "Error getting current user",
		})
		return
	}
	type changeRoleRequest struct {
		MemberID int         `json:"memberId"`
		Role     fModel.Role `json:"role"`
	}
	var req changeRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Error("Error changing member role:", err)
		c.JSON(400, gin.H{
			"error": "Invalid request",
		})
		return
	}

	if !fModel.IsValidRole(req.Role) {
		log.Error("Error changing member role: invalid role")
		c.JSON(400, gin.H{
			"error": "Invalid role",
		})
		return
	}

	users, err := h.familyRepo.GetFamilyUsers(c, currentUser.FamilyID)
	if err != nil {
		log.Error("Error getting family admins:", err)
		c.JSON(500, gin.H{
			"error": "Error getting family admins",
		})
		return
	}
	isAdmin := false
	memberFound := false
	adminCount := 0
	for _, user := range users {
		if user.Role == "admin" {
			adminCount++
			if user.UserID == currentUser.ID {
				isAdmin = true
			}
		}
		if user.UserID == req.MemberID {
			memberFound = true
		}
	}
	if !isAdmin {
		c.JSON(403, gin.H{
			"error": "You are not an admin of this family",
		})
		return
	}
	if !memberFound {
		c.JSON(400, gin.H{
			"error": "User is not a member of this family",
		})
		return
	}

	err = h.familyRepo.ChangeUserRole(c, currentUser.FamilyID, req.MemberID, req.Role)
	if err != nil {
		log.Error("Error changing member role:", err)
		c.JSON(500, gin.H{
			"error": "Error changing member role",
		})
		return
	}

	c.JSON(200, gin.H{
		"res": "Member role changed successfully",
	})

}

// SetMemberAway godoc
//
//	@Summary		Mark a member away or back home
//	@Description	Pauses a member's tasks, streak and quests while they are away, such as a child at the other parent's home (admin/manager only). Coming back makes the tasks that fell due meanwhile due today.
//	@Tags			families
//	@Accept			json
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Param			away	body		object{memberId=int,away=bool}	true	"Who and where"
//	@Success		200		{object}	map[string]bool					"res: whether anything changed"
//	@Failure		400		{object}	map[string]string				"error: Invalid request / User is not a member of this family"
//	@Failure		403		{object}	map[string]string				"error: Only parents can do this"
//	@Failure		500		{object}	map[string]string				"error: Error changing the member's presence"
//	@Router			/families/members/away [put]
func (h *Handler) SetMemberAway(c *gin.Context) {
	var req struct {
		MemberID int   `json:"memberId"`
		Away     *bool `json:"away"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Away == nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}
	chore.SetMemberAway(c, h.familyRepo, h.choreRepo, req.MemberID, *req.Away)
}

// GetFamilyTimezone godoc
//
//	@Summary		Get the family's time zone
//	@Description	Every date of the family follows this zone, whatever the device's. It is the server's unless the family moved, such as on holiday.
//	@Tags			families
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Success		200	{object}	map[string]chore.FamilyTimezone	"res: the family's zone"
//	@Router			/families/timezone [get]
func (h *Handler) GetFamilyTimezone(c *gin.Context) {
	chore.GetFamilyTimezone(c)
}

// SetFamilyTimezone godoc
//
//	@Summary		Move the family to another time zone
//	@Description	Sets the zone every date of the family follows, such as on holiday (admin/manager only). Tasks keep their time of day. An empty zone, or the server's, brings the family back home.
//	@Tags			families
//	@Accept			json
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Param			timezone	body		object{timezone=string}			true	"IANA zone, such as Europe/Lisbon"
//	@Success		200			{object}	map[string]chore.FamilyTimezone	"res: the family's zone"
//	@Failure		400			{object}	map[string]string				"error: Invalid request / Invalid timezone"
//	@Failure		403			{object}	map[string]string				"error: Only parents can do this"
//	@Router			/families/timezone [put]
func (h *Handler) SetFamilyTimezone(c *gin.Context) {
	chore.SetFamilyTimezone(c, h.familyRepo, h.choreRepo)
}

func Routes(router *gin.Engine, h *Handler, multiAuthMiddleware *auth.MultiAuthMiddleware) {
	log.Println("Registering family routes")

	familyRoutes := router.Group("api/v1/families")
	familyRoutes.Use(multiAuthMiddleware.MiddlewareFunc())
	{
		familyRoutes.GET("/members", h.GetFamilyMembers)
		familyRoutes.GET("/members/requests", h.GetPendingFamilyMembers)
		familyRoutes.PUT("/members/role", h.ChangeMemberRole)
		familyRoutes.PUT("/members/away", h.SetMemberAway)
		familyRoutes.GET("/timezone", h.GetFamilyTimezone)
		familyRoutes.PUT("/timezone", h.SetFamilyTimezone)
		familyRoutes.GET("/currency", h.GetFamilyCurrency)
		familyRoutes.PUT("/currency", h.SetFamilyCurrency)
		familyRoutes.GET("/", h.GetUserFamilies)
		familyRoutes.POST("/:id/members/points/redeem", h.RedeemPoints)

		if !h.singleFamilyInstance {
			familyRoutes.PUT("/members/requests/accept", h.AcceptJoinRequest)
			familyRoutes.DELETE("/members/requests/decline", h.DeclineJoinRequest)
			familyRoutes.POST("/join", h.JoinFamily)
			familyRoutes.DELETE("/leave", h.LeaveFamily)
			familyRoutes.DELETE("/:id/members/delete", h.DeleteFamilyMember)
		}
	}
}
