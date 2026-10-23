package chore

import (
	"context"
	"errors"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	auth "github.com/nico87lbs/hopla/internal/auth"
	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	chRepo "github.com/nico87lbs/hopla/internal/chore/repo"
	uModel "github.com/nico87lbs/hopla/internal/user/model"
	"github.com/nico87lbs/hopla/logging"
)

// slotHistoryFor returns the slot completions of the given tasks around now,
// enough to cover today in any timezone.
func (h *Handler) slotHistoryFor(ctx context.Context, chores []*chModel.Chore, now time.Time) (map[int][]*chModel.ChoreHistory, error) {
	ids := make([]int, 0, len(chores))
	for _, chore := range chores {
		if chore.HasSlots() {
			ids = append(ids, chore.ID)
		}
	}
	return h.choreRepo.GetSlotHistory(ctx, ids, now.Add(-36*time.Hour), now.Add(36*time.Hour))
}

// fillSlotsToday sets today's slots on the tasks done several times a day. A
// task whose due slot has closed meanwhile moves on to its next slot, so Home
// Assistant and the calendar show the right time.
func (h *Handler) fillSlotsToday(ctx context.Context, chores []*chModel.Chore) error {
	now := time.Now().UTC()
	history, err := h.slotHistoryFor(ctx, chores, now)
	if err != nil {
		return err
	}
	for _, chore := range chores {
		if !chore.HasSlots() {
			continue
		}
		chore.SlotsToday = slotStatuses(ctx, chore, history[chore.ID], now)
		next := nextSlotDue(ctx, chore, chore.SlotsToday, now)
		if chore.IsActive && next != nil && (chore.NextDueDate == nil || chore.NextDueDate.Before(now) && !chore.NextDueDate.Equal(*next)) {
			if err := h.choreRepo.SetSlotDueDate(ctx, chore, next); err != nil {
				logging.FromContext(ctx).Errorw("Failed to move a task to its next slot", "error", err, "choreID", chore.ID)
				continue
			}
			chore.NextDueDate = next
		}
	}
	return nil
}

// todaySlots returns today's slots of one task.
func (h *Handler) todaySlots(ctx context.Context, chore *chModel.Chore, now time.Time) ([]chModel.SlotStatus, error) {
	history, err := h.slotHistoryFor(ctx, []*chModel.Chore{chore}, now)
	if err != nil {
		return nil, err
	}
	return slotStatuses(ctx, chore, history[chore.ID], now), nil
}

// nextDueAfter returns the task's due date once a slot action is recorded.
func (h *Handler) nextDueAfter(ctx context.Context, chore *chModel.Chore, now time.Time) *time.Time {
	statuses, err := h.todaySlots(ctx, chore, now)
	if err != nil {
		return chore.NextDueDate
	}
	return nextSlotDue(ctx, chore, statuses, now)
}

// completeSlot ticks the slot open now for completedBy: done, or waiting for a
// parent when the task needs approval. It returns the updated task and the
// new history entry.
func (h *Handler) completeSlot(ctx context.Context, chore *chModel.Chore, completedBy int, note *string, now time.Time) (*chModel.ChoreHistory, error) {
	statuses, err := h.todaySlots(ctx, chore, now)
	if err != nil {
		return nil, err
	}
	slot, err := openSlot(statuses, now)
	if err != nil {
		return nil, err
	}
	at, index := slot.At.UTC(), slot.Index
	performedAt := now
	entry := &chModel.ChoreHistory{
		ChoreID:     chore.ID,
		PerformedAt: &performedAt,
		CompletedBy: completedBy,
		AssignedTo:  chore.AssignedTo,
		DueDate:     &at,
		Note:        note,
		Slot:        &index,
		Status:      chModel.ChoreHistoryStatusCompleted,
	}
	if chore.RequireApproval {
		entry.Status = chModel.ChoreHistoryStatusPendingApproval
	}
	// Count this slot as taken before picking the next due date.
	slot.State = chModel.SlotDone
	if err := h.choreRepo.RecordSlot(ctx, chore, entry, nextSlotDue(ctx, chore, statuses, now), completedBy); err != nil {
		return nil, err
	}
	return entry, nil
}

// slotError answers a slot action that cannot be done.
func slotError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, errNoOpenSlot):
		c.JSON(400, gin.H{"error": "No slot is open now"})
	case errors.Is(err, errSlotTaken):
		c.JSON(400, gin.H{"error": "This slot is already done or waiting for a parent"})
	case errors.Is(err, errSlotNotFound):
		c.JSON(404, gin.H{"error": "No such slot today"})
	case errors.Is(err, chRepo.ErrSlotNotPending):
		c.JSON(400, gin.H{"error": "This slot is not waiting for a parent"})
	default:
		logging.FromContext(c).Errorw("Slot action failed", "error", err)
		c.JSON(500, gin.H{"error": "Error recording the slot"})
	}
}

// broadcastSlot tells the apps and Home Assistant about a slot action.
func (h *Handler) broadcastSlot(c *gin.Context, chore *chModel.Chore, user *uModel.User, entry *chModel.ChoreHistory) {
	if h.realTimeService == nil {
		return
	}
	broadcaster := h.realTimeService.GetEventBroadcaster()
	if entry != nil && entry.Status == chModel.ChoreHistoryStatusCompleted {
		broadcaster.BroadcastChoreCompleted(chore, user, entry, entry.Note)
		return
	}
	broadcaster.BroadcastChoreUpdated(chore, user, map[string]interface{}{
		"updatedBy": user.ID,
		"updatedAt": time.Now().UTC(),
	}, nil)
}

// slotRequest reads the task and the slot of a parent's slot action, and
// checks the user is a parent of the circle.
func (h *Handler) slotRequest(c *gin.Context) (*uModel.UserDetails, *chModel.Chore, *chModel.SlotStatus, []chModel.SlotStatus, bool) {
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(401, gin.H{"error": "Authentication failed"})
		return nil, nil, nil, nil, false
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(400, gin.H{"error": "Invalid ID"})
		return nil, nil, nil, nil, false
	}
	index, err := strconv.Atoi(c.Param("slot"))
	if err != nil {
		c.JSON(400, gin.H{"error": "Invalid slot"})
		return nil, nil, nil, nil, false
	}
	chore, err := h.choreRepo.GetChore(c, id, currentUser.ID, currentUser.CircleID)
	if err != nil {
		c.JSON(404, gin.H{"error": "Task not found"})
		return nil, nil, nil, nil, false
	}
	circleUsers, err := h.circleRepo.GetCircleUsers(c, currentUser.CircleID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to retrieve circle users"})
		return nil, nil, nil, nil, false
	}
	if !currentUser.IsAdminOrManager(circleUsers) {
		c.JSON(403, gin.H{"error": "Only parents can do this"})
		return nil, nil, nil, nil, false
	}
	if !chore.HasSlots() {
		c.JSON(400, gin.H{"error": "This task has no slots"})
		return nil, nil, nil, nil, false
	}
	statuses, err := h.todaySlots(c, chore, time.Now().UTC())
	if err != nil {
		slotError(c, err)
		return nil, nil, nil, nil, false
	}
	slot, err := findSlot(statuses, index)
	if err != nil {
		slotError(c, err)
		return nil, nil, nil, nil, false
	}
	return currentUser, chore, slot, statuses, true
}

// respondSlot answers a slot action with the task and its slots of today.
func (h *Handler) respondSlot(c *gin.Context, user *uModel.UserDetails, choreID int, entry *chModel.ChoreHistory) {
	updated, err := h.choreRepo.GetChore(c, choreID, user.ID, user.CircleID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to retrieve chore"})
		return
	}
	if err := h.fillSlotsToday(c, []*chModel.Chore{updated}); err != nil {
		logging.FromContext(c).Errorw("Failed to read today's slots", "error", err, "choreID", choreID)
	}
	h.broadcastSlot(c, updated, &user.User, entry)
	c.JSON(200, gin.H{"res": updated})
}

// ApproveSlot godoc
//
//	@Summary		Approve a slot of the day
//	@Description	Approves a slot ticked by a child that waits for a parent (admin/manager only)
//	@Tags			chores
//	@Produce		json
//	@Param			id		path	int	true	"Chore ID"
//	@Param			slot	path	int	true	"Slot index"
//	@Router			/chores/{id}/slots/{slot}/approve [post]
func (h *Handler) ApproveSlot(c *gin.Context) {
	user, chore, slot, _, ok := h.slotRequest(c)
	if !ok {
		return
	}
	if slot.State != chModel.SlotPending || slot.HistoryID == nil {
		slotError(c, chRepo.ErrSlotNotPending)
		return
	}
	now := time.Now().UTC()
	if err := h.choreRepo.ApproveSlot(c, chore, *slot.HistoryID, user.ID, h.nextDueAfter(c, chore, now)); err != nil {
		slotError(c, err)
		return
	}
	entry, _ := h.choreRepo.GetChoreHistoryByID(c, chore.ID, *slot.HistoryID)
	h.respondSlot(c, user, chore.ID, entry)
}

// RejectSlot godoc
//
//	@Summary		Reject a slot of the day
//	@Description	Turns down a slot ticked by a child: it is to do again while open (admin/manager only)
//	@Tags			chores
//	@Produce		json
//	@Param			id		path	int	true	"Chore ID"
//	@Param			slot	path	int	true	"Slot index"
//	@Router			/chores/{id}/slots/{slot}/reject [post]
func (h *Handler) RejectSlot(c *gin.Context) {
	user, chore, slot, _, ok := h.slotRequest(c)
	if !ok {
		return
	}
	if slot.State != chModel.SlotPending || slot.HistoryID == nil {
		slotError(c, chRepo.ErrSlotNotPending)
		return
	}
	var req RejectChoreReq
	_ = bindOptionalActionReq(c, &req)
	note := req.Notes
	if note == nil {
		note = req.Note
	}
	now := time.Now().UTC()
	// The slot is free again once rejected, which may make it the next one due.
	if err := h.choreRepo.RejectSlot(c, chore, *slot.HistoryID, note, nil); err != nil {
		slotError(c, err)
		return
	}
	if err := h.choreRepo.SetSlotDueDate(c, chore, h.nextDueAfter(c, chore, now)); err != nil {
		logging.FromContext(c).Errorw("Failed to move the task to its next slot", "error", err, "choreID", chore.ID)
	}
	h.respondSlot(c, user, chore.ID, nil)
}

// CatchUpSlotReq names who did a slot a parent ticks for them.
type CatchUpSlotReq struct {
	CompletedBy *int `json:"completedBy"`
}

// CatchUpSlot godoc
//
//	@Summary		Tick a slot of the day as a parent
//	@Description	Marks an open or missed slot of today done for a child, without approval (admin/manager only)
//	@Tags			chores
//	@Accept			json
//	@Produce		json
//	@Param			id		path	int				true	"Chore ID"
//	@Param			slot	path	int				true	"Slot index"
//	@Param			body	body	CatchUpSlotReq	false	"Who did it"
//	@Router			/chores/{id}/slots/{slot}/catchup [post]
func (h *Handler) CatchUpSlot(c *gin.Context) {
	user, chore, slot, statuses, ok := h.slotRequest(c)
	if !ok {
		return
	}
	var req CatchUpSlotReq
	if err := bindOptionalActionReq(c, &req); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request body"})
		return
	}
	if slot.State != chModel.SlotOpen && slot.State != chModel.SlotMissed {
		if slot.State == chModel.SlotUpcoming {
			c.JSON(400, gin.H{"error": "This slot is not open yet"})
			return
		}
		slotError(c, errSlotTaken)
		return
	}
	completedBy := 0
	switch {
	case req.CompletedBy != nil:
		completedBy = *req.CompletedBy
	case chore.AssignedTo != nil:
		completedBy = *chore.AssignedTo
	case len(chore.Assignees) == 1:
		completedBy = chore.Assignees[0].UserID
	default:
		c.JSON(400, gin.H{"error": "Say who did it"})
		return
	}
	circleUsers, err := h.circleRepo.GetCircleUsers(c, user.CircleID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to retrieve circle users"})
		return
	}
	if !chore.CanComplete(completedBy, circleUsers) {
		c.JSON(400, gin.H{"error": "User is not assigned to chore"})
		return
	}
	now := time.Now().UTC()
	at, index := slot.At.UTC(), slot.Index
	entry := &chModel.ChoreHistory{
		ChoreID:     chore.ID,
		PerformedAt: &now,
		CompletedBy: completedBy,
		AssignedTo:  chore.AssignedTo,
		DueDate:     &at,
		Slot:        &index,
		Status:      chModel.ChoreHistoryStatusCompleted,
	}
	slot.State = chModel.SlotDone
	if err := h.choreRepo.RecordSlot(c, chore, entry, nextSlotDue(c, chore, statuses, now), user.ID); err != nil {
		slotError(c, err)
		return
	}
	h.respondSlot(c, user, chore.ID, entry)
}

// GetSlotsToday godoc
//
//	@Summary		Today's slots
//	@Description	Today's slots of every task done several times a day, by task
//	@Tags			chores
//	@Produce		json
//	@Router			/chores/slots [get]
func (h *Handler) GetSlotsToday(c *gin.Context) {
	user, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(401, gin.H{"error": "Authentication failed"})
		return
	}
	chores, err := h.choreRepo.GetChores(c, user.CircleID, user.ID, false, nil, false)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to retrieve chores"})
		return
	}
	if err := h.fillSlotsToday(c, chores); err != nil {
		c.JSON(500, gin.H{"error": "Failed to read today's slots"})
		return
	}
	slots := map[int][]chModel.SlotStatus{}
	for _, chore := range chores {
		if chore.HasSlots() {
			slots[chore.ID] = chore.SlotsToday
		}
	}
	c.JSON(200, gin.H{"res": slots})
}

// approveAllSlots approves every slot of today waiting for a parent, for the
// plain approve action on a task with slots.
func (h *Handler) approveAllSlots(c *gin.Context, user *uModel.UserDetails, chore *chModel.Chore) {
	now := time.Now().UTC()
	statuses, err := h.todaySlots(c, chore, now)
	if err != nil {
		slotError(c, err)
		return
	}
	approved := 0
	for _, slot := range statuses {
		if slot.State != chModel.SlotPending || slot.HistoryID == nil {
			continue
		}
		if err := h.choreRepo.ApproveSlot(c, chore, *slot.HistoryID, user.ID, h.nextDueAfter(c, chore, now)); err != nil {
			slotError(c, err)
			return
		}
		approved++
	}
	if approved == 0 {
		c.JSON(400, gin.H{"error": "Chore is not pending approval"})
		return
	}
	h.respondSlot(c, user, chore.ID, nil)
}

// rejectLatestSlot turns down the newest slot of today waiting for a parent,
// for the plain reject action on a task with slots.
func (h *Handler) rejectLatestSlot(c *gin.Context, user *uModel.UserDetails, chore *chModel.Chore, note *string) {
	now := time.Now().UTC()
	statuses, err := h.todaySlots(c, chore, now)
	if err != nil {
		slotError(c, err)
		return
	}
	for i := len(statuses) - 1; i >= 0; i-- {
		slot := statuses[i]
		if slot.State != chModel.SlotPending || slot.HistoryID == nil {
			continue
		}
		if err := h.choreRepo.RejectSlot(c, chore, *slot.HistoryID, note, nil); err != nil {
			slotError(c, err)
			return
		}
		if err := h.choreRepo.SetSlotDueDate(c, chore, h.nextDueAfter(c, chore, now)); err != nil {
			logging.FromContext(c).Errorw("Failed to move the task to its next slot", "error", err, "choreID", chore.ID)
		}
		h.respondSlot(c, user, chore.ID, nil)
		return
	}
	c.JSON(400, gin.H{"error": "Chore is not pending approval"})
}
