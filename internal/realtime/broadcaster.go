package realtime

import (
	"crypto/rand"
	"encoding/hex"
	"time"

	"github.com/nico87lbs/hopla/config"
	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	uModel "github.com/nico87lbs/hopla/internal/user/model"
)

// EventBroadcaster handles broadcasting events to appropriate connections
type EventBroadcaster struct {
	service *RealTimeService
	config  *config.Config
}

// NewEventBroadcaster creates a new event broadcaster
func NewEventBroadcaster(service *RealTimeService, config *config.Config) *EventBroadcaster {
	return &EventBroadcaster{
		service: service,
		config:  config,
	}
}

// broadcastChoreEvent enforces the same visibility boundary as the API: private
// chores go only to their creator and assignees, public chores remain family-wide.
func (b *EventBroadcaster) broadcastChoreEvent(chore *chModel.Chore, event *Event) {
	if chore.IsPrivate {
		recipients := []int{chore.CreatedBy}
		if chore.AssignedTo != nil {
			recipients = append(recipients, *chore.AssignedTo)
		}
		for _, assignee := range chore.Assignees {
			recipients = append(recipients, assignee.UserID)
		}
		b.service.BroadcastToUsers(chore.FamilyID, recipients, event)
		return
	}
	b.service.BroadcastToFamily(chore.FamilyID, event)
}

// BroadcastChoreAccessRevoked tells users who just lost sight of a chore to drop it,
// using the regular deletion event so older clients handle it too. versions maps
// each user to the sync version of their tombstone.
func (b *EventBroadcaster) BroadcastChoreAccessRevoked(familyID, choreID int, choreName string, user *uModel.User, versions map[int]int64) {
	if !b.service.config.Enabled {
		return
	}
	for userID, version := range versions {
		event := NewChoreDeletedEvent(choreID, choreName, familyID, user)
		event.ID = b.generateEventID()
		event.SyncVersion = version
		b.service.BroadcastToUsers(familyID, []int{userID}, event)
	}
}

// BroadcastChoreCreated broadcasts a chore creation event
func (b *EventBroadcaster) BroadcastChoreCreated(chore *chModel.Chore, user *uModel.User) {
	if !b.service.config.Enabled {
		return
	}

	event := NewChoreCreatedEvent(chore, user)
	event.ID = b.generateEventID()
	event.SyncVersion = chore.SyncVersion

	b.broadcastChoreEvent(chore, event)
}

// BroadcastChoreUpdated broadcasts a chore update event
func (b *EventBroadcaster) BroadcastChoreUpdated(chore *chModel.Chore, user *uModel.User, changes map[string]interface{}, note *string) {
	if !b.service.config.Enabled {
		return
	}

	event := NewChoreUpdatedEvent(chore, user, changes, note)
	event.ID = b.generateEventID()
	event.SyncVersion = chore.SyncVersion

	b.broadcastChoreEvent(chore, event)
}

// BroadcastChoreDeleted broadcasts a chore deletion event
func (b *EventBroadcaster) BroadcastChoreDeleted(chore *chModel.Chore, user *uModel.User, syncVersion int64) {
	if !b.service.config.Enabled {
		return
	}

	event := NewChoreDeletedEvent(chore.ID, chore.Name, chore.FamilyID, user)
	event.ID = b.generateEventID()
	event.SyncVersion = syncVersion

	b.broadcastChoreEvent(chore, event)
}

// BroadcastChoreCompleted broadcasts a chore completion event
func (b *EventBroadcaster) BroadcastChoreCompleted(chore *chModel.Chore, user *uModel.User, history *chModel.ChoreHistory, note *string) {
	if !b.service.config.Enabled {
		return
	}

	event := NewChoreCompletedEvent(chore, user, history, note)
	event.ID = b.generateEventID()
	event.SyncVersion = chore.SyncVersion
	if history != nil && history.SyncVersion > event.SyncVersion {
		event.SyncVersion = history.SyncVersion
	}

	b.broadcastChoreEvent(chore, event)
}

// BroadcastChoreSkipped broadcasts a chore skip event
func (b *EventBroadcaster) BroadcastChoreSkipped(chore *chModel.Chore, user *uModel.User, history *chModel.ChoreHistory, note *string) {
	if !b.service.config.Enabled {
		return
	}

	event := NewChoreSkippedEvent(chore, user, history, note)
	event.ID = b.generateEventID()
	event.SyncVersion = chore.SyncVersion
	if history != nil && history.SyncVersion > event.SyncVersion {
		event.SyncVersion = history.SyncVersion
	}

	b.broadcastChoreEvent(chore, event)
}

// BroadcastSubtaskUpdated broadcasts a subtask update event
func (b *EventBroadcaster) BroadcastSubtaskUpdated(chore *chModel.Chore, subtaskID int, completedAt *time.Time, user *uModel.User, syncVersion int64) {
	if !b.service.config.Enabled {
		return
	}

	event := NewSubtaskUpdatedEvent(chore.ID, subtaskID, completedAt, user, chore.FamilyID)
	event.ID = b.generateEventID()
	event.SyncVersion = syncVersion

	b.broadcastChoreEvent(chore, event)
}

// BroadcastSubtaskCompleted broadcasts a subtask completion event
func (b *EventBroadcaster) BroadcastSubtaskCompleted(chore *chModel.Chore, subtaskID int, completedAt *time.Time, user *uModel.User, syncVersion int64) {
	if !b.service.config.Enabled {
		return
	}

	event := NewSubtaskCompletedEvent(chore.ID, subtaskID, completedAt, user, chore.FamilyID)
	event.ID = b.generateEventID()
	event.SyncVersion = syncVersion

	b.broadcastChoreEvent(chore, event)
}

// generateEventID generates a unique event ID
func (b *EventBroadcaster) generateEventID() string {
	bytes := make([]byte, 8)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

// BroadcastChange announces a change event. recipients nil means the whole family.
func (b *EventBroadcaster) BroadcastChange(familyID int, recipients []int, eventType EventType, userID int) {
	if !b.service.config.Enabled {
		return
	}
	event := NewEvent(eventType, familyID, &ChangeEventData{UserID: userID})
	event.ID = b.generateEventID()
	if recipients == nil {
		b.service.BroadcastToFamily(familyID, event)
		return
	}
	b.service.BroadcastToUsers(familyID, recipients, event)
}
