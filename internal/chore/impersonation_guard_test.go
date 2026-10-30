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
	"github.com/nico87lbs/hopla/internal/database"
	fModel "github.com/nico87lbs/hopla/internal/family/model"
	uModel "github.com/nico87lbs/hopla/internal/user/model"
)

const guardTestFamilyID = 1

func newGuardTestHandler(t *testing.T) (*Handler, *gorm.DB) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, database.Migration(db))
	cfg := &config.Config{}
	cfg.Database.Type = "sqlite"
	return &Handler{choreRepo: chRepo.NewChoreRepository(db, cfg)}, db
}

// A family admin or manager may impersonate any member. That must not open a
// private task the admin cannot see: acting as the member on it is refused unless
// the member is the admin's own sub-account.
func TestImpersonationGuardKeepsPrivateTasksClosed(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h, db := newGuardTestHandler(t)
	const adminID, memberID, childID = 1, 2, 3
	for _, id := range []int{adminID, memberID, childID} {
		role := fModel.UserRoleMember
		if id == adminID {
			role = fModel.UserRoleAdmin
		}
		require.NoError(t, db.Create(&fModel.UserFamily{UserID: id, FamilyID: guardTestFamilyID, IsActive: true, Role: role}).Error)
	}
	memberChore := &chModel.Chore{Name: "secret", FamilyID: guardTestFamilyID, CreatedBy: memberID, IsPrivate: true, IsActive: true}
	require.NoError(t, db.Create(memberChore).Error)
	childChore := &chModel.Chore{Name: "homework", FamilyID: guardTestFamilyID, CreatedBy: childID, IsPrivate: true, IsActive: true}
	require.NoError(t, db.Create(childChore).Error)
	publicChore := &chModel.Chore{Name: "trash", FamilyID: guardTestFamilyID, CreatedBy: memberID, IsActive: true}
	require.NoError(t, db.Create(publicChore).Error)

	admin := &uModel.UserDetails{User: uModel.User{ID: adminID, FamilyID: guardTestFamilyID}}
	member := &uModel.UserDetails{User: uModel.User{ID: memberID, FamilyID: guardTestFamilyID}}
	parent := adminID
	child := &uModel.UserDetails{User: uModel.User{ID: childID, FamilyID: guardTestFamilyID, ParentUserID: &parent}}

	newCtx := func() *gin.Context {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest("POST", "/", nil)
		return c
	}
	loaded := func(id int, as int) *chModel.Chore {
		ch, err := h.choreRepo.GetChore(t.Context(), id, as, guardTestFamilyID)
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
