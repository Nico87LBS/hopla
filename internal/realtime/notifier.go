package realtime

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/nico87lbs/hopla/internal/auth"
)

// changeRoutes maps write routes without a detailed event to the change event
// that tells clients what to refresh.
var changeRoutes = []struct {
	prefix string
	event  EventType
}{
	{"/api/v1/rewards", EventTypeRewardsUpdated},
	{"/eapi/v1/rewards", EventTypeRewardsUpdated},
	{"/api/v1/families", EventTypeFamilyUpdated},
	{"/eapi/v1/family", EventTypeFamilyUpdated},
	{"/api/v1/points", EventTypeFamilyUpdated},
	{"/eapi/v1/points", EventTypeFamilyUpdated},
	{"/api/v1/games", EventTypeFamilyUpdated},
	{"/eapi/v1/games", EventTypeFamilyUpdated},
	{"/api/v1/users", EventTypeFamilyUpdated},
	// A learning game earns hops and can reach a quest or a challenge.
	{"/api/v1/learn/games", EventTypeFamilyUpdated},
	{"/api/v1/learn/play/games", EventTypeFamilyUpdated},
}

type changeBroadcaster interface {
	BroadcastChange(familyID int, recipients []int, eventType EventType, userID int)
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
			if b := broadcaster(); b != nil {
				b.BroadcastChange(user.FamilyID, nil, route.event, user.ID)
			}
			return
		}
	}
}
