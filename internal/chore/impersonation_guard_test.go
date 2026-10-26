package chore

import (
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"github.com/nico87lbs/hopla/config"
	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	chRepo "github.com/nico87lbs/hopla/internal/chore/repo"
	cModel "github.com/nico87lbs/hopla/internal/circle/model"
	"github.com/nico87lbs/hopla/internal/database"
	uModel "github.com/nico87lbs/hopla/internal/user/model"
)

const guardTestCircleID = 1

func newGuardTestHandler(t *testing.T) (*Handler, *gorm.DB) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, database.Migration(db))
	cfg := &config.Config{}
	cfg.Database.Type = "sqlite"
	return &Handler{choreRepo: chRepo.NewChoreRepository(db, cfg)}, db
}

// A circle admin or manager may impersonate any member. That must not open a
// private task the admin cannot see: acting as the member on it is refused unless
// the member is the admin's own sub-account.
func TestImpersonationGuardKeepsPrivateTasksClosed(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h, db := newGuardTestHandler(t)
	const adminID, memberID, childID = 1, 2, 3
	for _, id := range []int{adminID, memberID, childID} {
		role := cModel.UserRoleMember
		if id == adminID {
			role = cModel.UserRoleAdmin
		}
		require.NoError(t, db.Create(&cModel.UserCircle{UserID: id, CircleID: guardTestCircleID, IsActive: true, Role: role}).Error)
	}
	memberChore := &chModel.Chore{Name: "secret", CircleID: guardTestCircleID, CreatedBy: memberID, IsPrivate: true, IsActive: true}
	require.NoError(t, db.Create(memberChore).Error)
	childChore := &chModel.Chore{Name: "homework", CircleID: guardTestCircleID, CreatedBy: childID, IsPrivate: true, IsActive: true}
	require.NoError(t, db.Create(childChore).Error)
	publicChore := &chModel.Chore{Name: "trash", CircleID: guardTestCircleID, CreatedBy: memberID, IsActive: true}
	require.NoError(t, db.Create(publicChore).Error)

	admin := &uModel.UserDetails{User: uModel.User{ID: adminID, CircleID: guardTestCircleID}}
	member := &uModel.UserDetails{User: uModel.User{ID: memberID, CircleID: guardTestCircleID}}
	parent := adminID
	child := &uModel.UserDetails{User: uModel.User{ID: childID, CircleID: guardTestCircleID, ParentUserID: &parent}}

	newCtx := func() *gin.Context {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest("POST", "/", nil)
		return c
	}
	loaded := func(id int, as int) *chModel.Chore {
		ch, err := h.choreRepo.GetChore(t.Context(), id, as, guardTestCircleID)
		require.NoError(t, err)
		return ch
	}

	c := newCtx()
	require.False(t, h.impersonationGuard(c, loaded(memberChore.ID, memberID), admin, member, true), "admin acting as member on the member's private task")
	require.Equal(t, 403, c.Writer.Status())

	require.True(t, h.impersonationGuard(newCtx(), loaded(childChore.ID, childID), admin, child, true), "parent acting for their own sub-account")
	require.True(t, h.impersonationGuard(newCtx(), loaded(publicChore.ID, memberID), admin, member, true), "public chore stays usable")
	require.True(t, h.impersonationGuard(newCtx(), loaded(memberChore.ID, memberID), admin, member, false), "no impersonation, no guard")
}
