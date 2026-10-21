package realtime

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/nico87lbs/hopla/internal/auth"
)

// changeRoutes maps write routes without a detailed event to the change event
// that tells clients what to refresh. Things belong to one user, so only that
// user hears about them.
var changeRoutes = []struct {
	prefix    string
	event     EventType
	ownerOnly bool
}{
	{"/api/v1/rewards", EventTypeRewardsUpdated, false},
	{"/eapi/v1/rewards", EventTypeRewardsUpdated, false},
	{"/api/v1/things", EventTypeThingsUpdated, true},
	{"/eapi/v1/things", EventTypeThingsUpdated, true},
	{"/api/v1/circles", EventTypeCircleUpdated, false},
	{"/api/v1/users", EventTypeCircleUpdated, false},
}

type changeBroadcaster interface {
	BroadcastChange(circleID int, recipients []int, eventType EventType, userID int)
}

// ChangeNotifier broadcasts a change event after each successful write to one
// of the changeRoutes.
func ChangeNotifier(rts *RealTimeService) gin.HandlerFunc {
	return changeNotifier(func() changeBroadcaster {
		if rts == nil || rts.GetEventBroadcaster() == nil {
			return nil
		}
		return rts.GetEventBroadcaster()
	})
}

func changeNotifier(broadcaster func() changeBroadcaster) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()

		switch c.Request.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			return
		}
		if c.Writer.Status() >= http.StatusMultipleChoices {
			return
		}
		user, ok := auth.CurrentUser(c)
		if !ok || user == nil {
			return
		}
		path := c.Request.URL.Path
		for _, route := range changeRoutes {
			if path != route.prefix && !strings.HasPrefix(path, route.prefix+"/") {
				continue
			}
			var recipients []int
			if route.ownerOnly {
				recipients = []int{user.ID}
			}
			if b := broadcaster(); b != nil {
				b.BroadcastChange(user.CircleID, recipients, route.event, user.ID)
			}
			return
		}
	}
}
