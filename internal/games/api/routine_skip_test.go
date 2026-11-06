package api

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	"github.com/nico87lbs/hopla/internal/database"
	fModel "github.com/nico87lbs/hopla/internal/family/model"
	fRepo "github.com/nico87lbs/hopla/internal/family/repo"
	"github.com/nico87lbs/hopla/internal/games"
	uModel "github.com/nico87lbs/hopla/internal/user/model"
)

// Skipping a step can pay the routine bonus: a child cannot do it on their own
// routine, only a parent can.
func TestOnlyAParentSkipsARoutineStep(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, database.Migration(db))
	require.NoError(t, db.Create(&fModel.UserFamily{UserID: 1, FamilyID: 1, Role: fModel.UserRoleAdmin, IsActive: true}).Error)
	require.NoError(t, db.Create(&fModel.UserFamily{UserID: 2, FamilyID: 1, Role: fModel.UserRoleMember, IsActive: true}).Error)

	now := time.Now().UTC()
	child := 2
	task := &chModel.Chore{Name: "Dents", FrequencyType: chModel.FrequencyTypeDaily, Frequency: 1, IsActive: true,
		FamilyID: 1, CreatedBy: 1, AssignedTo: &child, NextDueDate: &now}
	require.NoError(t, db.Create(task).Error)
	require.NoError(t, db.Create(&chModel.ChoreAssignees{ChoreID: task.ID, UserID: child}).Error)
	routine := games.Routine{FamilyID: 1, Name: "Matin", Bonus: 5, ValidityMinutes: 720, ChoreIDs: []int{task.ID}}
	require.NoError(t, games.SaveRoutine(db, &routine))
	run, err := games.StartRoutineOccurrence(db, 1, routine.ID, child, now)
	require.NoError(t, err)
	require.NotEmpty(t, run.Items)

	h := NewHandler(db, fRepo.NewFamilyRepository(db))
	router := gin.New()
	router.Use(func(c *gin.Context) {
		id, _ := strconv.Atoi(c.GetHeader("X-User"))
		c.Set("id", &uModel.UserDetails{User: uModel.User{ID: id, FamilyID: 1}})
	})
	router.POST("/routines/occurrences/:id/items/skip", h.skipRoutineOccurrenceItem)
	skip := func(user string) int {
		body := bytes.NewBufferString(`{"itemId":` + strconv.Itoa(run.Items[0].ID) + `}`)
		req := httptest.NewRequest(http.MethodPost, "/routines/occurrences/"+strconv.Itoa(run.ID)+"/items/skip", body)
		req.Header.Set("X-User", user)
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec.Code
	}
	require.Equal(t, http.StatusForbidden, skip("2"), "the child cannot skip their own step")
	require.Equal(t, http.StatusOK, skip("1"), "a parent can")
}
