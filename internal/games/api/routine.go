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
	Name     string `json:"name" binding:"required"`
	Bonus    int    `json:"bonus"`
	ChoreIDs []int  `json:"choreIds"`
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
	if req.Bonus < 0 || req.Bonus > maxBonus {
		c.JSON(400, gin.H{"error": "A routine bonus is 0 to 1000 points"})
		return req, false
	}
	return req, true
}

// answerRoutineError answers a routine that could not be saved.
func answerRoutineError(c *gin.Context, err error) {
	for _, known := range []error{games.ErrRoutineEmpty, games.ErrRoutineTooLong, games.ErrRoutineTaskTwice,
		games.ErrRoutineTaskTaken, games.ErrRoutineTask} {
		if errors.Is(err, known) {
			c.JSON(400, gin.H{"error": known.Error()})
			return
		}
	}
	c.JSON(500, gin.H{"error": "Error saving the routine"})
}

func (h *Handler) getRoutines(c *gin.Context) {
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(401, gin.H{"error": "Authentication failed"})
		return
	}
	routines, err := games.Routines(h.db.WithContext(c), currentUser.CircleID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Error getting the routines"})
		return
	}
	c.JSON(200, gin.H{"res": routines})
}

func (h *Handler) createRoutine(c *gin.Context) {
	parentID, circleID, ok := h.requireParent(c)
	if !ok {
		return
	}
	req, ok := h.bindRoutine(c)
	if !ok {
		return
	}
	now := time.Now().UTC()
	routine := games.Routine{CircleID: circleID, Name: req.Name, Bonus: req.Bonus, ChoreIDs: req.ChoreIDs,
		CreatedBy: parentID, CreatedAt: now, UpdatedAt: now}
	if err := games.SaveRoutine(h.db.WithContext(c), &routine); err != nil {
		answerRoutineError(c, err)
		return
	}
	c.JSON(200, gin.H{"res": routine})
}

func (h *Handler) updateRoutine(c *gin.Context) {
	_, circleID, ok := h.requireParent(c)
	if !ok {
		return
	}
	var routine games.Routine
	if err := h.findInCircle(c, circleID, &routine); err != nil {
		answerFindError(c, err, "Routine")
		return
	}
	req, ok := h.bindRoutine(c)
	if !ok {
		return
	}
	routine.Name, routine.Bonus, routine.ChoreIDs = req.Name, req.Bonus, req.ChoreIDs
	if err := games.SaveRoutine(h.db.WithContext(c), &routine); err != nil {
		answerRoutineError(c, err)
		return
	}
	c.JSON(200, gin.H{"res": routine})
}

func (h *Handler) deleteRoutine(c *gin.Context) {
	_, circleID, ok := h.requireParent(c)
	if !ok {
		return
	}
	id, err := idParam(c)
	if err == nil {
		err = games.DeleteRoutine(h.db.WithContext(c), circleID, id)
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
