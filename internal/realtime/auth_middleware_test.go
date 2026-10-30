package realtime

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	uModel "github.com/nico87lbs/hopla/internal/user/model"
	uRepo "github.com/nico87lbs/hopla/internal/user/repo"
	"gorm.io/gorm"
)

func TestAuthenticateConnectionAcceptsAPIToken(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&uModel.User{}, &uModel.APIToken{}); err != nil {
		t.Fatal(err)
	}
	users := uRepo.NewUserRepository(db)
	ctx := context.Background()
	user := &uModel.User{Username: "ha", FamilyID: 4, CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC()}
	if _, err := users.CreateUser(ctx, user); err != nil {
		t.Fatal(err)
	}
	if _, err := users.StoreAPIToken(ctx, user.ID, "Home Assistant", "secretbody", uModel.APITokenPrefix); err != nil {
		t.Fatal(err)
	}
	am := &AuthMiddleware{userRepo: users}

	authenticate := func(key string) (*uModel.User, int, error) {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/realtime/sse", nil)
		c.Request.Header.Set("secretkey", key)
		return am.AuthenticateConnection(c)
	}

	got, familyID, err := authenticate(uModel.APITokenPrefix + "secretbody")
	if err != nil || got.ID != user.ID || familyID != 4 {
		t.Fatalf("valid token: user=%v family=%d err=%v", got, familyID, err)
	}
	if _, _, err := authenticate(uModel.APITokenPrefix + "wrong"); err != ErrInvalidToken {
		t.Fatalf("wrong token: err=%v", err)
	}
	// A token given before the prefix changed keeps working.
	if _, err := users.StoreAPIToken(ctx, user.ID, "Old", "oldbody1", "xx_"); err != nil {
		t.Fatal(err)
	}
	if got, _, err := authenticate("xx_oldbody1"); err != nil || got.ID != user.ID {
		t.Fatalf("older prefix: user=%v err=%v", got, err)
	}

	if err := db.Model(&uModel.User{}).Where("id = ?", user.ID).Update("disabled", true).Error; err != nil {
		t.Fatal(err)
	}
	if _, _, err := authenticate(uModel.APITokenPrefix + "secretbody"); err != ErrInvalidToken {
		t.Fatalf("disabled user: err=%v", err)
	}
}
