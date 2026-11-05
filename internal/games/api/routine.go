package api

import (
	"errors"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	auth "github.com/nico87lbs/hopla/internal/auth"
	"github.com/nico87lbs/hopla/internal/games"
	"gorm.io/gorm"
)

const maxRoutineName = 60

type RoutineReq struct {
	Name string `json:"name" binding:"required"`
	Bonus int `json:"bonus"`
	ValidityMinutes int `json:"validityMinutes"`
	ChoreIDs []int `json:"choreIds"`
	SlotIDs []string `json:"slotIds"`
	OptionalChoreIDs []int `json:"optionalChoreIds"`
	// Dependencies use 1-based positions in choreIds. Omitted means legacy sequence;
	// an explicit empty array means all steps may start independently.
	Dependencies *[]games.RoutineDependency `json:"dependencies"`
}

func (h *Handler) bindRoutine(c *gin.Context) (RoutineReq, bool) {
	var req RoutineReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return req, false
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || len([]rune(req.Name)) > maxRoutineName {
		c.JSON(400, gin.H{"error": "A routine needs a name of 60 characters at most"})
		return req, false
	}
	if req.ValidityMinutes == 0 { req.ValidityMinutes = games.DefaultRoutineValidityMinutes }
	if req.ValidityMinutes < 1 || req.ValidityMinutes > games.MaxRoutineValidityMinutes {
		c.JSON(400, gin.H{"error": "A routine validity is 1 to 2880 minutes"})
		return req, false
	}
	if req.Bonus < 0 || req.Bonus > maxBonus {
		c.JSON(400, gin.H{"error": "A routine bonus is 0 to 1000 points"})
		return req, false
	}
	return req, true
}

// answerRoutineError answers a routine that could not be saved.
func answerRoutineError(c *gin.Context, err error) {
	for _, known := range []error{games.ErrRoutineEmpty, games.ErrRoutineTooLong, games.ErrRoutineTaskTwice,
		games.ErrRoutineTaskTaken, games.ErrRoutineTask, games.ErrRoutineSlot, games.ErrRoutineGraphStep, games.ErrRoutineGraphCycle, games.ErrRoutineGraphDuplicate} {
		if errors.Is(err, known) {
			c.JSON(400, gin.H{"error": known.Error()})
			return
		}
	}
	c.JSON(500, gin.H{"error": "Error saving the routine"})
}

// getRoutines godoc
//
//	@Summary		Lister les routines
//	@Description	Même traitement pour : GET /eapi/v1/games/routines
//	@Tags			Jeux
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/games/routines [get]
//	@Router			/eapi/v1/games/routines [get]
func (h *Handler) getRoutines(c *gin.Context) {
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(401, gin.H{"error": "Authentication failed"})
		return
	}
	routines, err := games.Routines(h.db.WithContext(c), currentUser.FamilyID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Error getting the routines"})
		return
	}
	c.JSON(200, gin.H{"res": routines})
}

// createRoutine godoc
//
//	@Summary		Créer une routine
//	@Tags			Jeux
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/games/routines [post]
func (h *Handler) createRoutine(c *gin.Context) {
	parentID, familyID, ok := h.requireParent(c)
	if !ok {
		return
	}
	req, ok := h.bindRoutine(c)
	if !ok {
		return
	}
	now := time.Now().UTC()
	routine := games.Routine{FamilyID: familyID, Name: req.Name, Bonus: req.Bonus, ValidityMinutes: req.ValidityMinutes, ChoreIDs: req.ChoreIDs, SlotIDs: req.SlotIDs,
		GraphEnabled: req.Dependencies != nil, OptionalChoreIDs: req.OptionalChoreIDs, CreatedBy: parentID, CreatedAt: now, UpdatedAt: now}
	if req.Dependencies != nil { routine.Dependencies = *req.Dependencies }
	if err := games.SaveRoutine(h.db.WithContext(c), &routine); err != nil {
		answerRoutineError(c, err)
		return
	}
	c.JSON(200, gin.H{"res": routine})
}

// updateRoutine godoc
//
//	@Summary		Modifier une routine
//	@Tags			Jeux
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Param			id	path	integer	true	"Identifiant"
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/games/routines/{id} [put]
func (h *Handler) updateRoutine(c *gin.Context) {
	_, familyID, ok := h.requireParent(c)
	if !ok {
		return
	}
	var routine games.Routine
	if err := h.findInFamily(c, familyID, &routine); err != nil {
		answerFindError(c, err, "Routine")
		return
	}
	req, ok := h.bindRoutine(c)
	if !ok {
		return
	}
	routine.Name, routine.Bonus, routine.ValidityMinutes, routine.ChoreIDs, routine.SlotIDs = req.Name, req.Bonus, req.ValidityMinutes, req.ChoreIDs, req.SlotIDs
	routine.OptionalChoreIDs = req.OptionalChoreIDs
	routine.GraphEnabled = req.Dependencies != nil
	if req.Dependencies != nil { routine.Dependencies = *req.Dependencies } else { routine.Dependencies = nil }
	if err := games.SaveRoutine(h.db.WithContext(c), &routine); err != nil {
		answerRoutineError(c, err)
		return
	}
	c.JSON(200, gin.H{"res": routine})
}


type startRoutineOccurrenceReq struct {
	UserID int `json:"userId"`
}

func (h *Handler) startRoutineOccurrence(c *gin.Context) {
	currentUser, ok := auth.CurrentUser(c)
	if !ok { c.JSON(401, gin.H{"error":"Authentication failed"}); return }
	id, err := idParam(c)
	if err != nil { c.JSON(400, gin.H{"error":"Invalid routine ID"}); return }
	userID := currentUser.ID
	var req startRoutineOccurrenceReq
	if c.Request.ContentLength > 0 {
		if err := c.ShouldBindJSON(&req); err != nil { c.JSON(400, gin.H{"error":"Invalid request"}); return }
		if req.UserID != 0 && req.UserID != currentUser.ID {
			_, familyID, parent := h.requireParent(c)
			if !parent { return }
			if familyID != currentUser.FamilyID { c.JSON(403, gin.H{"error":"Forbidden"}); return }
			members, err := h.familyRepo.GetFamilyUsers(c, familyID)
			if err != nil { c.JSON(500, gin.H{"error":"Could not verify family member"}); return }
			found := false
			for _, member := range members { if member.UserID == req.UserID && member.IsActive { found = true; break } }
			if !found { c.JSON(404, gin.H{"error":"Family member not found"}); return }
			userID = req.UserID
		}
	}
	run, err := games.StartRoutineOccurrence(h.db.WithContext(c), currentUser.FamilyID, id, userID, time.Now().UTC())
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) || errors.Is(err, games.ErrRoutineEmpty) { c.JSON(404, gin.H{"error":"Routine not found or empty"}); return }
		if errors.Is(err, games.ErrRoutineOccurrenceInvalid) { c.JSON(400, gin.H{"error":games.RoutineOccurrenceErrorMessage(err)}); return }
		c.JSON(500, gin.H{"error":"Could not start routine"}); return
	}
	c.JSON(200, gin.H{"res":run})
}

type skipRoutineOccurrenceReq struct {
	ItemID int `json:"itemId" binding:"required"`
	Reason string `json:"reason"`
}

func (h *Handler) skipRoutineOccurrenceItem(c *gin.Context) {
	currentUser, ok := auth.CurrentUser(c)
	if !ok { c.JSON(401, gin.H{"error":"Authentication failed"}); return }
	occurrenceID, err := idParam(c)
	if err != nil { c.JSON(400, gin.H{"error":"Invalid occurrence ID"}); return }
	var req skipRoutineOccurrenceReq
	if err := c.ShouldBindJSON(&req); err != nil { c.JSON(400, gin.H{"error":"Invalid request"}); return }
	run, err := games.GetRoutineOccurrence(h.db.WithContext(c), currentUser.FamilyID, occurrenceID, time.Now().UTC())
	if err == nil && run.UserID != currentUser.ID {
		_, familyID, parent := h.requireParent(c)
		if !parent || familyID != currentUser.FamilyID { return }
	}
	if err != nil {
		status := 500
		if errors.Is(err, games.ErrRoutineOccurrenceNotFound) { status = 404 }
		c.JSON(status, gin.H{"error":games.RoutineOccurrenceErrorMessage(err)}); return
	}
	updated, err := games.SkipRoutineOccurrenceItem(h.db.WithContext(c), currentUser.FamilyID, run.ID,
		games.RoutineOverrideInput{ItemID:req.ItemID, Source:"manual", Reason:req.Reason}, time.Now().UTC())
	if err != nil {
		status := 500
		if errors.Is(err, games.ErrRoutineOccurrenceExpired) { status = 410 }
		if errors.Is(err, games.ErrRoutineOccurrenceItemNotFound) { status = 404 }
		if errors.Is(err, games.ErrRoutineOccurrenceConflict) || errors.Is(err, games.ErrRoutineOccurrenceInvalid) { status = 400 }
		c.JSON(status, gin.H{"error":games.RoutineOccurrenceErrorMessage(err)}); return
	}
	c.JSON(200, gin.H{"res":updated})
}


type routineIntegrationTokenReq struct {
	Name string `json:"name" binding:"required"`
}

func (h *Handler) createRoutineIntegrationToken(c *gin.Context) {
	user, familyID, parent := h.requireParent(c)
	if !parent { return }
	var req routineIntegrationTokenReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error":"A token name is required"}); return
	}
	token, secret, err := games.CreateRoutineIntegrationToken(h.db.WithContext(c), familyID, user.ID, req.Name, time.Now().UTC())
	if err != nil {
		c.JSON(400, gin.H{"error":"Could not create routine integration token"}); return
	}
	c.JSON(201, gin.H{"integration":token,"token":secret})
}

func (h *Handler) listRoutineIntegrationTokens(c *gin.Context) {
	_, familyID, parent := h.requireParent(c)
	if !parent { return }
	tokens, err := games.ListRoutineIntegrationTokens(h.db.WithContext(c), familyID)
	if err != nil { c.JSON(500, gin.H{"error":"Could not load routine integration tokens"}); return }
	c.JSON(200, tokens)
}

func (h *Handler) revokeRoutineIntegrationToken(c *gin.Context) {
	_, familyID, parent := h.requireParent(c)
	if !parent { return }
	id, err := idParam(c)
	if err != nil { c.JSON(400, gin.H{"error":"Invalid token ID"}); return }
	if err := games.RevokeRoutineIntegrationToken(h.db.WithContext(c), familyID, id, time.Now().UTC()); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) { c.JSON(404, gin.H{"error":"Token not found"}); return }
		c.JSON(500, gin.H{"error":"Could not revoke routine integration token"}); return
	}
	c.Status(204)
}

type externalRoutineOverrideReq struct {
	ItemID int `json:"itemId" binding:"required"`
	Action string `json:"action" binding:"required"`
	Reason string `json:"reason"`
	ExternalReference string `json:"externalReference" binding:"required"`
	IdempotencyKey string `json:"idempotencyKey" binding:"required"`
	ExpiresAt *time.Time `json:"expiresAt"`
}

// externalRoutineOverride is the generic integration endpoint used by
// Home Assistant and other trusted API-token clients. It never changes the
// routine definition, only one live occurrence.

func (h *Handler) listIntegrationRoutineOccurrences(c *gin.Context) {
	secret := c.GetHeader("X-Hopla-Routine-Token")
	token, err := games.AuthenticateRoutineIntegrationToken(h.db.WithContext(c), secret, time.Now().UTC())
	if err != nil { c.JSON(401, gin.H{"error":"Invalid routine integration token"}); return }
	occurrences, err := games.ListActiveRoutineOccurrences(h.db.WithContext(c), token.FamilyID, time.Now().UTC())
	if err != nil { c.JSON(500, gin.H{"error":"Could not load active routine occurrences"}); return }
	c.JSON(200, occurrences)
}

func (h *Handler) externalRoutineOverride(c *gin.Context) {
	_, familyID, ok := h.requireParent(c)
	if !ok { return }
	occurrenceID, err := idParam(c)
	if err != nil { c.JSON(400, gin.H{"error":"Invalid occurrence ID"}); return }
	var req externalRoutineOverrideReq
	if err := c.ShouldBindJSON(&req); err != nil || (req.Action != "skip" && req.Action != "restore") {
		c.JSON(400, gin.H{"error":"Only skip and restore actions are supported"}); return
	}
	input := games.RoutineOverrideInput{Action:req.Action, ItemID:req.ItemID, Source:"external", Reason:req.Reason,
		ExternalReference:req.ExternalReference, IdempotencyKey:req.IdempotencyKey, ExpiresAt:req.ExpiresAt}
	var run *games.RoutineOccurrence
	if req.Action == "restore" {
		run, err = games.RestoreRoutineOccurrenceItem(h.db.WithContext(c), familyID, occurrenceID, input, time.Now().UTC())
	} else {
		run, err = games.SkipRoutineOccurrenceItem(h.db.WithContext(c), familyID, occurrenceID, input, time.Now().UTC())
	}
	if err != nil {
		status := 500
		if errors.Is(err, games.ErrRoutineOccurrenceNotFound) || errors.Is(err, games.ErrRoutineOccurrenceItemNotFound) { status = 404 }
		if errors.Is(err, games.ErrRoutineOccurrenceExpired) { status = 410 }
		if errors.Is(err, games.ErrRoutineOccurrenceInvalid) || errors.Is(err, games.ErrRoutineOccurrenceConflict) { status = 400 }
		c.JSON(status, gin.H{"error":games.RoutineOccurrenceErrorMessage(err)}); return
	}
	c.JSON(200, gin.H{"res":run})
}

// deleteRoutine godoc
//
//	@Summary		Supprimer une routine
//	@Tags			Jeux
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Param			id	path	integer	true	"Identifiant"
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/games/routines/{id} [delete]
func (h *Handler) deleteRoutine(c *gin.Context) {
	_, familyID, ok := h.requireParent(c)
	if !ok {
		return
	}
	id, err := idParam(c)
	if err == nil {
		err = games.DeleteRoutine(h.db.WithContext(c), familyID, id)
	}
	if errors.Is(err, errNotFound) || errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(404, gin.H{"error": "Routine not found"})
		return
	}
	if err != nil {
		c.JSON(500, gin.H{"error": "Error deleting the routine"})
		return
	}
	c.JSON(200, gin.H{"res": "Routine deleted"})
}
