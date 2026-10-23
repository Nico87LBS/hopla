package realtime

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	uModel "github.com/nico87lbs/hopla/internal/user/model"
)

type recordedChange struct {
	circleID   int
	recipients []int
	event      EventType
	userID     int
}

type fakeChangeBroadcaster struct{ changes []recordedChange }

func (f *fakeChangeBroadcaster) BroadcastChange(circleID int, recipients []int, eventType EventType, userID int) {
	f.changes = append(f.changes, recordedChange{circleID, recipients, eventType, userID})
}

func newNotifierRouter(f *fakeChangeBroadcaster, status int) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(changeNotifier(func() changeBroadcaster { return f }))
	withUser := func(c *gin.Context) {
		c.Set("id", &uModel.UserDetails{User: uModel.User{ID: 7, CircleID: 3}})
		c.Status(status)
	}
	r.Any("/api/v1/rewards/*rest", withUser)
	r.Any("/api/v1/users/*rest", withUser)
	r.Any("/api/v1/chores/*rest", withUser)
	r.POST("/api/v1/rewardsx", withUser)
	return r
}

func TestChangeNotifierBroadcastsSuccessfulWrites(t *testing.T) {
	cases := []struct {
		method, path string
		want         *recordedChange
	}{
		{http.MethodPost, "/api/v1/rewards/1/redeem", &recordedChange{3, nil, EventTypeRewardsUpdated, 7}},
		{http.MethodPut, "/api/v1/users/profile", &recordedChange{3, nil, EventTypeCircleUpdated, 7}},
		{http.MethodGet, "/api/v1/rewards/", nil},
		{http.MethodPost, "/api/v1/chores/1/do", nil},
		{http.MethodPost, "/api/v1/rewardsx", nil},
	}
	for _, tc := range cases {
		f := &fakeChangeBroadcaster{}
		w := httptest.NewRecorder()
		newNotifierRouter(f, http.StatusOK).ServeHTTP(w, httptest.NewRequest(tc.method, tc.path, nil))
		if tc.want == nil {
			if len(f.changes) != 0 {
				t.Errorf("%s %s: unexpected change %+v", tc.method, tc.path, f.changes)
			}
			continue
		}
		if len(f.changes) != 1 {
			t.Fatalf("%s %s: got %d changes, want 1", tc.method, tc.path, len(f.changes))
		}
		got := f.changes[0]
		if got.circleID != tc.want.circleID || got.event != tc.want.event || got.userID != tc.want.userID ||
			len(got.recipients) != len(tc.want.recipients) {
			t.Errorf("%s %s: got %+v, want %+v", tc.method, tc.path, got, *tc.want)
		}
	}
}

func TestChangeNotifierIgnoresFailedWrites(t *testing.T) {
	f := &fakeChangeBroadcaster{}
	w := httptest.NewRecorder()
	newNotifierRouter(f, http.StatusForbidden).ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/rewards/1/redeem", nil))
	if len(f.changes) != 0 {
		t.Fatalf("failed write broadcast %+v", f.changes)
	}
}
