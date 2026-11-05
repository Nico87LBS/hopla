package games

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	DefaultRoutineValidityMinutes = 12 * 60
	MaxRoutineValidityMinutes = 48 * 60
)

var (
	ErrRoutineOccurrenceNotFound = errors.New("routine occurrence not found")
	ErrRoutineOccurrenceExpired = errors.New("routine occurrence expired")
	ErrRoutineOccurrenceItemNotFound = errors.New("routine occurrence item not found")
	ErrRoutineOccurrenceConflict = errors.New("routine occurrence override conflicts with an existing action")
	ErrRoutineOccurrenceInvalid = errors.New("invalid routine occurrence request")
)

type RoutineOccurrenceStatus string

const (
	RoutineOccurrenceActive RoutineOccurrenceStatus = "active"
	RoutineOccurrenceFinished RoutineOccurrenceStatus = "finished"
	RoutineOccurrenceExpired RoutineOccurrenceStatus = "expired"
)

type RoutineOccurrenceItemStatus string

const (
	RoutineOccurrenceItemPending RoutineOccurrenceItemStatus = "pending"
	RoutineOccurrenceItemCompleted RoutineOccurrenceItemStatus = "completed"
	RoutineOccurrenceItemSkipped RoutineOccurrenceItemStatus = "skipped"
	RoutineOccurrenceItemNotApplicable RoutineOccurrenceItemStatus = "not_applicable"
)

// RoutineOccurrence is one execution of a routine for one member. It is
// deliberately independent from calendar days: a run may cross midnight,
// but its expiry is always bounded.
type RoutineOccurrence struct {
	ID int `json:"id" gorm:"primaryKey"`
	FamilyID int `json:"-" gorm:"column:family_id;index;not null"`
	RoutineID int `json:"routineId" gorm:"column:routine_id;index;not null"`
	UserID int `json:"userId" gorm:"column:user_id;index;not null"`
	StartedAt time.Time `json:"startedAt" gorm:"column:started_at;not null"`
	ExpiresAt time.Time `json:"expiresAt" gorm:"column:expires_at;index;not null"`
	FinishedAt *time.Time `json:"finishedAt,omitempty" gorm:"column:finished_at"`
	Status RoutineOccurrenceStatus `json:"status" gorm:"column:status;size:16;not null;index"`
	Items []RoutineOccurrenceItem `json:"items,omitempty" gorm:"foreignKey:OccurrenceID"`
}

func (RoutineOccurrence) TableName() string { return "routine_occurrences" }

// RoutineOccurrenceItem is a snapshot of a routine step at the time a run
// starts. Editing a routine later cannot silently rewrite a run in progress.
type RoutineOccurrenceItem struct {
	ID int `json:"id" gorm:"primaryKey"`
	OccurrenceID int `json:"occurrenceId" gorm:"column:occurrence_id;index;not null"`
	StepID int `json:"stepId" gorm:"column:step_id;not null"`
	Position int `json:"position" gorm:"column:position;not null"`
	ChoreID int `json:"choreId" gorm:"column:chore_id;not null"`
	Required bool `json:"required" gorm:"column:required;not null;default:true"`
	Status RoutineOccurrenceItemStatus `json:"status" gorm:"column:status;size:20;not null;default:pending"`
	UpdatedAt time.Time `json:"updatedAt" gorm:"column:updated_at;not null"`
}

func (RoutineOccurrenceItem) TableName() string { return "routine_occurrence_items" }

// RoutineOverride is an append-only audit record for a manual or external
// decision applied to one item of one occurrence.
type RoutineOverride struct {
	ID int `json:"id" gorm:"primaryKey"`
	FamilyID int `json:"-" gorm:"column:family_id;index;not null"`
	OccurrenceID int `json:"occurrenceId" gorm:"column:occurrence_id;index;not null"`
	ItemID int `json:"itemId" gorm:"column:item_id;index;not null"`
	Action string `json:"action" gorm:"column:action;size:20;not null"`
	Source string `json:"source" gorm:"column:source;size:20;not null"`
	Reason string `json:"reason,omitempty" gorm:"column:reason;size:300"`
	ExternalReference string `json:"externalReference,omitempty" gorm:"column:external_reference;size:160"`
	IdempotencyKey *string `json:"-" gorm:"column:idempotency_key;uniqueIndex:idx_routine_override_idempotency"`
	ExpiresAt *time.Time `json:"expiresAt,omitempty" gorm:"column:expires_at;index"`
	CreatedAt time.Time `json:"createdAt" gorm:"column:created_at;not null"`
}

func (RoutineOverride) TableName() string { return "routine_overrides" }

// StartRoutineOccurrence reuses a live run for the same member. An expired
// run is closed before a new snapshot is created.
func StartRoutineOccurrence(db *gorm.DB, familyID, routineID, userID int, now time.Time) (*RoutineOccurrence, error) {
	var occurrence *RoutineOccurrence
	err := db.Transaction(func(tx *gorm.DB) error {
		var routine Routine
		if err := tx.Where("id = ? AND family_id = ?", routineID, familyID).First(&routine).Error; err != nil {
			return err
		}
		minutes := routine.ValidityMinutes
		if minutes == 0 { minutes = DefaultRoutineValidityMinutes }
		if minutes < 1 || minutes > MaxRoutineValidityMinutes { return ErrRoutineOccurrenceInvalid }
		var active RoutineOccurrence
		err := tx.Where("routine_id = ? AND user_id = ? AND status = ?", routineID, userID, RoutineOccurrenceActive).
			Order("started_at DESC").First(&active).Error
		if err == nil {
			if now.Before(active.ExpiresAt) {
				if err := tx.Preload("Items", func(q *gorm.DB) *gorm.DB { return q.Order("position") }).First(&active, active.ID).Error; err != nil {
					return err
				}
				occurrence = &active
				return nil
			}
			if err := tx.Model(&active).Update("status", RoutineOccurrenceExpired).Error; err != nil {
				return err
			}
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		var steps []RoutineStep
		if err := tx.Where("routine_id = ?", routineID).Order("position").Find(&steps).Error; err != nil {
			return err
		}
		if len(steps) == 0 {
			return ErrRoutineEmpty
		}
		run := RoutineOccurrence{
			FamilyID: familyID, RoutineID: routineID, UserID: userID,
			StartedAt: now.UTC(), ExpiresAt: now.UTC().Add(time.Duration(minutes)*time.Minute),
			Status: RoutineOccurrenceActive,
		}
		if err := tx.Create(&run).Error; err != nil { return err }
		items := make([]RoutineOccurrenceItem, 0, len(steps))
		for _, step := range steps {
			required := step.Required == nil || *step.Required
			items = append(items, RoutineOccurrenceItem{
				OccurrenceID: run.ID, StepID: step.ID, Position: step.Position,
				ChoreID: step.ChoreID, Required: required,
				Status: RoutineOccurrenceItemPending, UpdatedAt: now.UTC(),
			})
		}
		if err := tx.Create(&items).Error; err != nil { return err }
		run.Items = items
		occurrence = &run
		return nil
	})
	return occurrence, err
}

// GetRoutineOccurrence checks family ownership and expires an overdue run.
func GetRoutineOccurrence(db *gorm.DB, familyID, occurrenceID int, now time.Time) (*RoutineOccurrence, error) {
	var run RoutineOccurrence
	err := db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("id = ? AND family_id = ?", occurrenceID, familyID).First(&run).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) { return ErrRoutineOccurrenceNotFound }
			return err
		}
		if run.Status == RoutineOccurrenceActive && !now.Before(run.ExpiresAt) {
			if err := tx.Model(&run).Update("status", RoutineOccurrenceExpired).Error; err != nil { return err }
			run.Status = RoutineOccurrenceExpired
		}
		return tx.Preload("Items", func(q *gorm.DB) *gorm.DB { return q.Order("position") }).First(&run, run.ID).Error
	})
	return &run, err
}

type RoutineOverrideInput struct {
	ItemID int
	Source string
	Reason string
	ExternalReference string
	IdempotencyKey string
	ExpiresAt *time.Time
}

// SkipRoutineOccurrenceItem records a manual or external skip. External calls
// must carry a stable reference and idempotency key, so retries are safe.
func SkipRoutineOccurrenceItem(db *gorm.DB, familyID, occurrenceID int, input RoutineOverrideInput, now time.Time) (*RoutineOccurrence, error) {
	input.Source = strings.TrimSpace(input.Source)
	input.Reason = strings.TrimSpace(input.Reason)
	input.ExternalReference = strings.TrimSpace(input.ExternalReference)
	input.IdempotencyKey = strings.TrimSpace(input.IdempotencyKey)
	if input.ItemID <= 0 || (input.Source != "manual" && input.Source != "external") ||
		len(input.Reason) > 300 || len(input.ExternalReference) > 160 ||
		(input.Source == "external" && (input.ExternalReference == "" || input.IdempotencyKey == "")) ||
		(input.ExpiresAt != nil && (!input.ExpiresAt.After(now) || input.ExpiresAt.After(now.Add(48*time.Hour)))) {
		return nil, ErrRoutineOccurrenceInvalid
	}
	var run RoutineOccurrence
	err := db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength:"UPDATE"}).
			Where("id = ? AND family_id = ?", occurrenceID, familyID).First(&run).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) { return ErrRoutineOccurrenceNotFound }
			return err
		}
		if run.Status != RoutineOccurrenceActive || !now.Before(run.ExpiresAt) {
			return ErrRoutineOccurrenceExpired
		}
		var item RoutineOccurrenceItem
		if err := tx.Clauses(clause.Locking{Strength:"UPDATE"}).
			Where("id = ? AND occurrence_id = ?", input.ItemID, occurrenceID).First(&item).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) { return ErrRoutineOccurrenceItemNotFound }
			return err
		}
		if input.Source == "external" {
			var existing RoutineOverride
			err := tx.Where("occurrence_id = ? AND item_id = ? AND idempotency_key = ?", occurrenceID, item.ID, input.IdempotencyKey).First(&existing).Error
			if err == nil {
				if existing.Action != "skip" || existing.Reason != input.Reason || existing.ExternalReference != input.ExternalReference {
					return ErrRoutineOccurrenceConflict
				}
				return nil
			}
			if !errors.Is(err, gorm.ErrRecordNotFound) { return err }
		}
		if item.Status == RoutineOccurrenceItemCompleted || item.Status == RoutineOccurrenceItemNotApplicable {
			return ErrRoutineOccurrenceConflict
		}
		if item.Status != RoutineOccurrenceItemSkipped {
			if err := tx.Model(&item).Updates(map[string]any{"status":RoutineOccurrenceItemSkipped,"updated_at":now.UTC()}).Error; err != nil { return err }
		}
		override := RoutineOverride{
			FamilyID: familyID, OccurrenceID: occurrenceID, ItemID: item.ID,
			Action:"skip", Source:input.Source, Reason:input.Reason,
			ExternalReference:input.ExternalReference, ExpiresAt:input.ExpiresAt, CreatedAt:now.UTC(),
		}
		if input.IdempotencyKey != "" { key := input.IdempotencyKey; override.IdempotencyKey = &key }
		if err := tx.Create(&override).Error; err != nil { return err }
		return tx.Preload("Items", func(q *gorm.DB) *gorm.DB { return q.Order("position") }).First(&run, run.ID).Error
	})
	if err != nil { return nil, err }
	if err := FinishRoutineOccurrence(db, occurrenceID, now); err != nil { return nil, err }
	return GetRoutineOccurrence(db, familyID, occurrenceID, now)
}

// FinishRoutineOccurrence marks the run finished once every required item is
// completed or explicitly skipped. Optional items never block completion.
func FinishRoutineOccurrence(db *gorm.DB, occurrenceID int, now time.Time) error {
	var items []RoutineOccurrenceItem
	if err := db.Where("occurrence_id = ?", occurrenceID).Find(&items).Error; err != nil { return err }
	for _, item := range items {
		if item.Required && item.Status != RoutineOccurrenceItemCompleted && item.Status != RoutineOccurrenceItemSkipped && item.Status != RoutineOccurrenceItemNotApplicable {
			return nil
		}
	}
	return db.Model(&RoutineOccurrence{}).Where("id = ? AND status = ?", occurrenceID, RoutineOccurrenceActive).
		Updates(map[string]any{"status":RoutineOccurrenceFinished,"finished_at":now.UTC()}).Error
}

// RoutineOccurrenceForMember prevents one family member from reading or
// changing another member's run through the member-facing API.
func RoutineOccurrenceForMember(db *gorm.DB, familyID, occurrenceID, userID int, now time.Time) (*RoutineOccurrence, error) {
	var run RoutineOccurrence
	err := db.Where("id = ? AND family_id = ? AND user_id = ?", occurrenceID, familyID, userID).First(&run).Error
	if errors.Is(err, gorm.ErrRecordNotFound) { return nil, ErrRoutineOccurrenceNotFound }
	if err != nil { return nil, err }
	return GetRoutineOccurrence(db, familyID, run.ID, now)
}

func RoutineOccurrenceErrorMessage(err error) string {
	switch {
	case errors.Is(err, ErrRoutineOccurrenceNotFound): return "Routine occurrence not found"
	case errors.Is(err, ErrRoutineOccurrenceExpired): return "Routine occurrence expired"
	case errors.Is(err, ErrRoutineOccurrenceItemNotFound): return "Routine item not found"
	case errors.Is(err, ErrRoutineOccurrenceConflict): return "Routine item cannot be skipped in its current state"
	case errors.Is(err, ErrRoutineOccurrenceInvalid): return "Invalid routine occurrence request"
	default: return fmt.Sprint(err)
	}
}
