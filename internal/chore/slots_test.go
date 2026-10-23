package chore

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"github.com/nico87lbs/hopla/config"
	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	chRepo "github.com/nico87lbs/hopla/internal/chore/repo"
	cModel "github.com/nico87lbs/hopla/internal/circle/model"
	cRepo "github.com/nico87lbs/hopla/internal/circle/repo"
	"github.com/nico87lbs/hopla/internal/database"
	uModel "github.com/nico87lbs/hopla/internal/user/model"
)

func teethChore(slots ...string) *chModel.Chore {
	metadata := &chModel.FrequencyMetadata{Timezone: "Europe/Brussels"}
	for _, at := range slots {
		metadata.Slots = append(metadata.Slots, chModel.Slot{Time: at})
	}
	return &chModel.Chore{ID: 1, FrequencyType: chModel.FrequencyTypeDaily, FrequencyMetadataV2: metadata, IsActive: true}
}

func brussels(t *testing.T, day, hour, minute int) time.Time {
	t.Helper()
	loc, err := time.LoadLocation("Europe/Brussels")
	require.NoError(t, err)
	return time.Date(2026, 10, day, hour, minute, 0, 0, loc)
}

func TestSlotWindows(t *testing.T) {
	chore := teethChore("07:30", "08:00", "19:30")
	windows := slotWindows(chore, brussels(t, 23, 0, 0))
	require.Len(t, windows, 3)
	// The first opens an hour before; the second halfway from the first, as
	// they are only half an hour apart; the last stays open until midnight.
	require.Equal(t, brussels(t, 23, 6, 30), windows[0].OpensAt)
	require.Equal(t, brussels(t, 23, 7, 45), windows[0].ClosesAt)
	require.Equal(t, brussels(t, 23, 7, 45), windows[1].OpensAt)
	require.Equal(t, brussels(t, 23, 18, 30), windows[1].ClosesAt)
	require.Equal(t, brussels(t, 23, 18, 30), windows[2].OpensAt)
	require.Equal(t, brussels(t, 24, 0, 0), windows[2].ClosesAt)

	early := teethChore("00:20")
	require.Equal(t, brussels(t, 23, 0, 0), slotWindows(early, brussels(t, 23, 0, 0))[0].OpensAt)

	weekdays := teethChore("07:30")
	weekdays.FrequencyType = chModel.FrequencyTypeDayOfTheWeek
	weekdays.FrequencyMetadataV2.Days = []*string{jsonPtr("monday")}
	require.Empty(t, slotWindows(weekdays, brussels(t, 23, 0, 0)), "Friday is a day off")
	require.Len(t, slotWindows(weekdays, brussels(t, 26, 0, 0)), 1)
}

func TestSlotStatuses(t *testing.T) {
	ctx := context.Background()
	chore := teethChore("07:30", "12:30", "19:30")
	now := brussels(t, 23, 20, 10)
	morning, noon := brussels(t, 23, 7, 30).UTC(), brussels(t, 23, 12, 30).UTC()
	yesterday := brussels(t, 22, 19, 30).UTC()
	slot := func(i int) *int { return &i }
	history := []*chModel.ChoreHistory{
		{ID: 1, Slot: slot(0), DueDate: &morning, Status: chModel.ChoreHistoryStatusRejected},
		{ID: 2, Slot: slot(1), DueDate: &noon, Status: chModel.ChoreHistoryStatusPendingApproval, CompletedBy: 2},
		{ID: 3, Slot: slot(2), DueDate: &yesterday, Status: chModel.ChoreHistoryStatusCompleted},
	}
	statuses := slotStatuses(ctx, chore, history, now)
	require.Equal(t, chModel.SlotMissed, statuses[0].State, "rejected and closed")
	require.Equal(t, chModel.SlotPending, statuses[1].State)
	require.Equal(t, 2, *statuses[1].HistoryID)
	require.Equal(t, chModel.SlotOpen, statuses[2].State, "yesterday's evening does not count today")

	next := nextSlotDue(ctx, chore, statuses, now)
	require.Equal(t, brussels(t, 23, 19, 30).UTC(), *next)
	statuses[2].State = chModel.SlotDone
	next = nextSlotDue(ctx, chore, statuses, now)
	require.Equal(t, brussels(t, 24, 7, 30).UTC(), *next, "then tomorrow morning")

	open, err := openSlot(statuses, now)
	require.ErrorIs(t, err, errSlotTaken)
	require.Nil(t, open)
	_, err = openSlot(slotStatuses(ctx, chore, nil, brussels(t, 23, 5, 0)), brussels(t, 23, 5, 0))
	require.ErrorIs(t, err, errNoOpenSlot)
}

func TestNormalizeSlots(t *testing.T) {
	metadata := &chModel.FrequencyMetadata{Slots: []chModel.Slot{{Name: " Soir ", Time: "19:30"}, {Name: "Matin", Time: "7:05"}}}
	require.NoError(t, normalizeSlots(chModel.FrequencyTypeDaily, metadata))
	require.Equal(t, []chModel.Slot{{Name: "Matin", Time: "07:05"}, {Name: "Soir", Time: "19:30"}}, metadata.Slots)

	require.Error(t, normalizeSlots(chModel.FrequencyTypeWeekly, metadata))
	require.Error(t, normalizeSlots(chModel.FrequencyTypeDaily, &chModel.FrequencyMetadata{Slots: []chModel.Slot{{Time: "25:00"}}}))
	require.Error(t, normalizeSlots(chModel.FrequencyTypeDaily, &chModel.FrequencyMetadata{Slots: []chModel.Slot{{Time: "08:00"}, {Time: "8:00"}}}))
}

func TestSkippingATaskWithSlotsSkipsTheRestOfTheDay(t *testing.T) {
	chore := teethChore("07:30", "19:30")
	next, err := scheduleNextDueDate(context.Background(), chore, brussels(t, 23, 7, 30))
	require.NoError(t, err)
	require.Equal(t, brussels(t, 24, 7, 30).UTC(), *next)
}

func TestHourlyIntervalMovesOn(t *testing.T) {
	unit := "hours"
	due := time.Date(2026, 10, 23, 7, 30, 0, 0, time.UTC)
	chore := &chModel.Chore{FrequencyType: chModel.FrequencyTypeInterval, Frequency: 12, NextDueDate: &due,
		FrequencyMetadataV2: &chModel.FrequencyMetadata{Unit: &unit, Time: due.Format(time.RFC3339)}}
	want := []time.Time{due.Add(12 * time.Hour), due.Add(24 * time.Hour), due.Add(36 * time.Hour)}
	for _, expected := range want {
		next, err := scheduleNextDueDate(context.Background(), chore, chore.NextDueDate.Add(time.Minute))
		require.NoError(t, err)
		require.Equal(t, expected, *next)
		chore.NextDueDate = next
	}
}

// middayZone returns a fixed timezone where it is about noon now, so that the
// slots around now fall on one day whenever the test runs.
func middayZone(now time.Time) string {
	offset := 12 - now.Hour()
	if offset > 0 {
		return fmt.Sprintf("Etc/GMT-%d", offset)
	}
	return fmt.Sprintf("Etc/GMT+%d", -offset)
}

func newSlotTestRouter(t *testing.T) (*gin.Engine, *gorm.DB, *chModel.Chore) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, database.Migration(db))
	require.NoError(t, db.Create(&cModel.UserCircle{UserID: 1, CircleID: 1, Role: cModel.UserRoleAdmin, IsActive: true}).Error)
	require.NoError(t, db.Create(&cModel.UserCircle{UserID: 2, CircleID: 1, Role: cModel.UserRoleMember, IsActive: true}).Error)

	now := time.Now().UTC()
	zone := middayZone(now)
	loc, err := time.LoadLocation(zone)
	require.NoError(t, err)
	local := now.In(loc)
	points, child := 3, 2
	chore := &chModel.Chore{
		Name: "Dents", FrequencyType: chModel.FrequencyTypeDaily, Frequency: 1, IsActive: true, CircleID: 1, CreatedBy: 1,
		Points: &points, RequireApproval: true, AssignedTo: &child,
		FrequencyMetadataV2: &chModel.FrequencyMetadata{Timezone: zone, Slots: []chModel.Slot{
			{Name: "Matin", Time: local.Add(-5 * time.Hour).Format("15:04")},
			{Name: "Midi", Time: local.Format("15:04")},
			{Name: "Soir", Time: local.Add(5 * time.Hour).Format("15:04")},
		}},
	}
	require.NoError(t, db.Create(chore).Error)
	require.NoError(t, db.Create(&chModel.ChoreAssignees{ChoreID: chore.ID, UserID: child}).Error)

	cfg := &config.Config{}
	cfg.Database.Type = "sqlite"
	h := &Handler{choreRepo: chRepo.NewChoreRepository(db, cfg), circleRepo: cRepo.NewCircleRepository(db)}
	router := gin.New()
	router.Use(func(c *gin.Context) {
		id, _ := strconv.Atoi(c.GetHeader("X-User"))
		c.Set("id", &uModel.UserDetails{User: uModel.User{ID: id, CircleID: 1}})
		c.Next()
	})
	router.GET("/chores/slots", h.GetSlotsToday)
	router.POST("/chores/:id/do", h.CompleteChore)
	router.POST("/chores/:id/approve", h.ApproveChore)
	router.POST("/chores/:id/slots/:slot/approve", h.ApproveSlot)
	router.POST("/chores/:id/slots/:slot/reject", h.RejectSlot)
	router.POST("/chores/:id/slots/:slot/catchup", h.CatchUpSlot)
	return router, db, chore
}

func slotCall(t *testing.T, router *gin.Engine, user int, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	payload, err := json.Marshal(body)
	require.NoError(t, err)
	method := http.MethodPost
	if body == nil {
		payload = nil
	}
	if path == "/chores/slots" {
		method = http.MethodGet
	}
	request := httptest.NewRequest(method, path, bytes.NewReader(payload))
	request.Header.Set("X-User", strconv.Itoa(user))
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)
	return recorder
}

func todayStates(t *testing.T, router *gin.Engine, choreID int) []chModel.SlotState {
	t.Helper()
	recorder := slotCall(t, router, 1, "/chores/slots", nil)
	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	var response struct {
		Res map[string][]chModel.SlotStatus `json:"res"`
	}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
	states := []chModel.SlotState{}
	for _, slot := range response.Res[strconv.Itoa(choreID)] {
		states = append(states, slot.State)
	}
	return states
}

func earned(t *testing.T, db *gorm.DB, user int) int {
	var member cModel.UserCircle
	require.NoError(t, db.Where("user_id = ? AND circle_id = 1", user).First(&member).Error)
	return member.Points
}

func TestSlotsDayWithApprovalAndCatchUp(t *testing.T) {
	router, db, chore := newSlotTestRouter(t)
	base := fmt.Sprintf("/chores/%d", chore.ID)
	require.Equal(t, []chModel.SlotState{chModel.SlotMissed, chModel.SlotOpen, chModel.SlotUpcoming}, todayStates(t, router, chore.ID))

	// The child ticks the open slot: it waits for a parent.
	recorder := slotCall(t, router, 2, base+"/do", map[string]any{})
	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	require.Equal(t, []chModel.SlotState{chModel.SlotMissed, chModel.SlotPending, chModel.SlotUpcoming}, todayStates(t, router, chore.ID))
	require.Equal(t, http.StatusBadRequest, slotCall(t, router, 2, base+"/do", map[string]any{}).Code, "only once per slot")

	// Only a parent approves, rejects or catches up.
	require.Equal(t, http.StatusForbidden, slotCall(t, router, 2, base+"/slots/1/approve", nil).Code)
	require.Equal(t, http.StatusOK, slotCall(t, router, 1, base+"/slots/1/reject", nil).Code)
	require.Equal(t, []chModel.SlotState{chModel.SlotMissed, chModel.SlotOpen, chModel.SlotUpcoming}, todayStates(t, router, chore.ID))
	require.Equal(t, 0, earned(t, db, 2))

	require.Equal(t, http.StatusOK, slotCall(t, router, 2, base+"/do", map[string]any{}).Code)
	recorder = slotCall(t, router, 1, base+"/slots/1/approve", nil)
	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	require.Equal(t, 3, earned(t, db, 2))

	// The missed morning is caught up by a parent; the evening is not open yet.
	recorder = slotCall(t, router, 1, base+"/slots/0/catchup", map[string]any{})
	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	require.Equal(t, 6, earned(t, db, 2))
	require.Equal(t, http.StatusBadRequest, slotCall(t, router, 1, base+"/slots/2/catchup", map[string]any{}).Code)
	require.Equal(t, []chModel.SlotState{chModel.SlotDone, chModel.SlotDone, chModel.SlotUpcoming}, todayStates(t, router, chore.ID))

	var stored chModel.Chore
	require.NoError(t, db.First(&stored, chore.ID).Error)
	require.Equal(t, chModel.ChoreStatusNoStatus, stored.Status)
	require.True(t, stored.NextDueDate.After(time.Now().UTC()), "due at the evening slot")
}

func TestApproveOnATaskWithSlotsApprovesTheDay(t *testing.T) {
	router, db, chore := newSlotTestRouter(t)
	base := fmt.Sprintf("/chores/%d", chore.ID)
	require.Equal(t, http.StatusOK, slotCall(t, router, 2, base+"/do", map[string]any{}).Code)
	recorder := slotCall(t, router, 1, base+"/approve", nil)
	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	require.Equal(t, 3, earned(t, db, 2))
	require.Equal(t, http.StatusBadRequest, slotCall(t, router, 1, base+"/approve", nil).Code, "nothing left to approve")
}
