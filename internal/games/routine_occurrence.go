package games

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"github.com/nico87lbs/hopla/internal/zone"
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
	RoutineName string `json:"routineName" gorm:"column:routine_name;size:120"`
	UserID int `json:"userId" gorm:"column:user_id;index;not null"`
	StartedAt time.Time `json:"startedAt" gorm:"column:started_at;not null"`
	ExpiresAt time.Time `json:"expiresAt" gorm:"column:expires_at;index;not null"`
	FinishedAt *time.Time `json:"finishedAt,omitempty" gorm:"column:finished_at"`
	Status RoutineOccurrenceStatus `json:"status" gorm:"column:status;size:16;not null;index"`
	BonusPaid bool `json:"bonusPaid" gorm:"column:bonus_paid;not null;default:false"`
	Items []RoutineOccurrenceItem `json:"items,omitempty" gorm:"foreignKey:OccurrenceID"`
	Dependencies []RoutineOccurrenceDependency `json:"-" gorm:"foreignKey:OccurrenceID"`
}

func (RoutineOccurrence) TableName() string { return "routine_occurrences" }


type RoutineOccurrenceDependency struct {
	ID int `json:"id" gorm:"primaryKey"`
	FamilyID int `json:"-" gorm:"column:family_id;index;not null"`
	OccurrenceID int `json:"occurrenceId" gorm:"column:occurrence_id;index;not null"`
	StepID int `json:"stepId" gorm:"column:step_id;not null"`
	DependsOnStepID int `json:"dependsOnStepId" gorm:"column:depends_on_step_id;not null"`
}

func (RoutineOccurrenceDependency) TableName() string { return "routine_occurrence_dependencies" }

// RoutineOccurrenceItem is a snapshot of a routine step at the time a run
// starts. Editing a routine later cannot silently rewrite a run in progress.
type RoutineOccurrenceItem struct {
	ID int `json:"id" gorm:"primaryKey"`
	FamilyID int `json:"-" gorm:"column:family_id;index;not null"`
	OccurrenceID int `json:"occurrenceId" gorm:"column:occurrence_id;index;not null"`
	StepID int `json:"stepId" gorm:"column:step_id;not null"`
	Position int `json:"position" gorm:"column:position;not null"`
	ChoreID int `json:"choreId" gorm:"column:chore_id;not null"`
	ChoreName string `json:"choreName" gorm:"column:chore_name;size:120"`
	SlotID string `json:"slotId,omitempty" gorm:"column:slot_id;size:32"`
	Required bool `json:"required" gorm:"column:required;not null;default:true"`
	Status RoutineOccurrenceItemStatus `json:"status" gorm:"column:status;size:20;not null;default:pending"`
	UpdatedAt time.Time `json:"updatedAt" gorm:"column:updated_at;not null"`
	Available bool `json:"available" gorm:"-"`
}

func (RoutineOccurrenceItem) TableName() string { return "routine_occurrence_items" }

// RoutineOverride is an append-only audit record for a manual or external
// decision applied to one item of one occurrence.
type RoutineOverride struct {
	ID int `json:"id" gorm:"primaryKey"`
	FamilyID int `json:"-" gorm:"column:family_id;index;not null"`
	OccurrenceID int `json:"occurrenceId" gorm:"column:occurrence_id;index;not null;uniqueIndex:idx_routine_override_idempotency,priority:1"`
	ItemID int `json:"itemId" gorm:"column:item_id;index;not null;uniqueIndex:idx_routine_override_idempotency,priority:2"`
	Action string `json:"action" gorm:"column:action;size:20;not null"`
	Source string `json:"source" gorm:"column:source;size:20;not null"`
	Reason string `json:"reason,omitempty" gorm:"column:reason;size:300"`
	ExternalReference string `json:"externalReference,omitempty" gorm:"column:external_reference;size:160"`
	IdempotencyKey *string `json:"-" gorm:"column:idempotency_key;uniqueIndex:idx_routine_override_idempotency,priority:3"`
	ExpiresAt *time.Time `json:"expiresAt,omitempty" gorm:"column:expires_at;index"`
	CreatedAt time.Time `json:"createdAt" gorm:"column:created_at;not null"`
	RevokedAt *time.Time `json:"revokedAt,omitempty" gorm:"column:revoked_at"`
}

func (RoutineOverride) TableName() string { return "routine_overrides" }

// StartRoutineOccurrence reuses a live run for the same member. An expired
// run is closed before a new snapshot is created.
func StartRoutineOccurrence(db *gorm.DB, familyID, routineID, userID int, now time.Time) (*RoutineOccurrence, error) {
	var occurrence *RoutineOccurrence
	err := db.Transaction(func(tx *gorm.DB) error {
		var routine Routine
		if err := tx.Clauses(clause.Locking{Strength:"UPDATE"}).Where("id = ? AND family_id = ?", routineID, familyID).First(&routine).Error; err != nil {
			return err
		}
		minutes := routine.ValidityMinutes
		if minutes == 0 { minutes = DefaultRoutineValidityMinutes }
		if minutes < 1 || minutes > MaxRoutineValidityMinutes { return ErrRoutineOccurrenceInvalid }
		var latest RoutineOccurrence
		err := tx.Where("routine_id = ? AND user_id = ? AND status IN ?", routineID, userID,
			[]RoutineOccurrenceStatus{RoutineOccurrenceActive, RoutineOccurrenceFinished}).
			Order("started_at DESC").First(&latest).Error
		if err == nil {
			if now.Before(latest.ExpiresAt) {
				if err := tx.Preload("Items", func(q *gorm.DB) *gorm.DB { return q.Order("position") }).First(&latest, latest.ID).Error; err != nil {
					return err
				}
				occurrence = &latest
				return applyRoutineOccurrenceAvailability(tx, occurrence)
			}
			if latest.Status == RoutineOccurrenceActive {
				if err := tx.Model(&latest).Update("status", RoutineOccurrenceExpired).Error; err != nil { return err }
			}
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		var dependencies []RoutineDependency
		if err := tx.Where("routine_id = ?", routineID).Find(&dependencies).Error; err != nil { return err }
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
		away, err := AwayMembers(tx, familyID)
		if err != nil { return err }
		runDependencies := make([]RoutineOccurrenceDependency, 0, len(dependencies))
		for _, dependency := range dependencies {
			runDependencies = append(runDependencies, RoutineOccurrenceDependency{FamilyID:familyID,OccurrenceID:run.ID,StepID:dependency.StepID,DependsOnStepID:dependency.DependsOnStepID})
		}
		if len(runDependencies) > 0 { if err := tx.Create(&runDependencies).Error; err != nil { return err } }
		items := make([]RoutineOccurrenceItem, 0, len(steps))
		for _, step := range steps {
			required := step.Required == nil || *step.Required
			status := RoutineOccurrenceItemPending
			ids, err := SameTaskIDs(tx, familyID, step.ChoreID)
			if err != nil { return err }
			var copies []*chModel.Chore
			if err := tx.Preload("Assignees").Where("id IN ? AND is_active = ?", ids, true).Find(&copies).Error; err != nil { return err }
			applicable := false
			memberChoreID := step.ChoreID
			memberChoreName := ""
			for _, chore := range copies {
				due := chore.NextDueDate != nil && !chore.NextDueDate.After(run.ExpiresAt)
				if step.SlotID != "" { due = routineSlotDue(chore, step.SlotID, now.In(zone.Of(familyID)), run.ExpiresAt.In(zone.Of(familyID))) }
				if due && slices.Contains(membersNow(chore), userID) && !Paused(chore, away) {
					applicable = true
					memberChoreID = chore.ID
					memberChoreName = chore.Name
					break
				}
			}
			if !applicable {
				status = RoutineOccurrenceItemNotApplicable
			} else {
				done, err := routineItemCompletedBeforeStart(tx, familyID, userID, step, run.StartedAt, run.ExpiresAt)
				if err != nil { return err }
				if done { status = RoutineOccurrenceItemCompleted }
			}
			items = append(items, RoutineOccurrenceItem{
				FamilyID: familyID, OccurrenceID: run.ID, StepID: step.ID, Position: step.Position,
				ChoreID: memberChoreID, SlotID: step.SlotID, Required: required,
				Status: status, UpdatedAt: now.UTC(),
			})
		}
		if err := tx.Create(&items).Error; err != nil { return err }
		run.Items = items
		run.Dependencies = runDependencies
		if err := applyRoutineOccurrenceAvailability(tx, &run); err != nil { return err }
		if err := settleRoutineOccurrence(tx, &run, now); err != nil { return err }
		if err := tx.Preload("Items", func(q *gorm.DB) *gorm.DB { return q.Order("position") }).Preload("Dependencies").First(&run, run.ID).Error; err != nil { return err }
		occurrence = &run
		return nil
	})
	return occurrence, err
}


func routineItemCompletedBeforeStart(tx *gorm.DB, familyID, userID int, step RoutineStep, startedAt, expiresAt time.Time) (bool, error) {
	ids, err := SameTaskIDs(tx, familyID, step.ChoreID)
	if err != nil { return false, err }
	loc := zone.Of(familyID)
	localStart := startedAt.In(loc)
	dayStart := time.Date(localStart.Year(), localStart.Month(), localStart.Day(), 0, 0, 0, 0, loc)
	var history []chModel.ChoreHistory
	if err := tx.Where("chore_id IN ? AND completed_by = ? AND status = ? AND performed_at >= ? AND performed_at <= ?",
		ids, userID, chModel.ChoreHistoryStatusCompleted, dayStart, startedAt).Find(&history).Error; err != nil {
		return false, err
	}
	for _, entry := range history {
		dueAt := entry.PerformedAt
		if entry.DueDate != nil { dueAt = entry.DueDate }
		if dueAt != nil && dueAt.After(expiresAt) { continue }
		if step.SlotID != "" {
			slotID := ""
			if entry.SlotID != nil { slotID = *entry.SlotID }
			if slotID == "" && entry.Slot != nil {
				var chore chModel.Chore
				if err := tx.Select("id", "frequency_meta_v2").First(&chore, entry.ChoreID).Error; err != nil { return false, err }
				if chore.FrequencyMetadataV2 != nil && *entry.Slot >= 0 && *entry.Slot < len(chore.FrequencyMetadataV2.Slots) {
					slotID = chore.FrequencyMetadataV2.Slots[*entry.Slot].ID
				}
			}
			if slotID != step.SlotID { continue }
		}
		return true, nil
	}
	return false, nil
}

// GetRoutineOccurrence checks family ownership and expires an overdue run.
func GetRoutineOccurrence(db *gorm.DB, familyID, occurrenceID int, now time.Time) (*RoutineOccurrence, error) {
	var run RoutineOccurrence
	err := db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("id = ? AND family_id = ?", occurrenceID, familyID).First(&run).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) { return ErrRoutineOccurrenceNotFound }
			return err
		}
		if err := tx.Preload("Dependencies").First(&run, run.ID).Error; err != nil { return err }
		if run.Status == RoutineOccurrenceActive && !now.Before(run.ExpiresAt) {
			if err := tx.Model(&run).Update("status", RoutineOccurrenceExpired).Error; err != nil { return err }
			run.Status = RoutineOccurrenceExpired
		}
		if err := expireRoutineOverrides(tx, &run, now); err != nil { return err }
		if err := tx.Preload("Items", func(q *gorm.DB) *gorm.DB { return q.Order("position") }).Preload("Dependencies").First(&run, run.ID).Error; err != nil { return err }
		return applyRoutineOccurrenceAvailability(tx, &run)
	})
	return &run, err
}

type RoutineOverrideInput struct {
	Action string
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
		(input.Source == "external" && (input.ExternalReference == "" || input.IdempotencyKey == "" || input.ExpiresAt == nil)) ||
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
		if err := tx.Preload("Dependencies").First(&run, run.ID).Error; err != nil { return err }
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
		if item.Status == RoutineOccurrenceItemSkipped {
			var latest RoutineOverride
			if err := tx.Where("occurrence_id = ? AND item_id = ?", occurrenceID, item.ID).Order("created_at DESC").First(&latest).Error; err == nil {
				if input.Source == "external" && latest.Source == "manual" { return ErrRoutineOccurrenceConflict }
			} else if !errors.Is(err, gorm.ErrRecordNotFound) { return err }
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
		if err := settleRoutineOccurrence(tx, &run, now); err != nil { return err }
		return tx.Preload("Items", func(q *gorm.DB) *gorm.DB { return q.Order("position") }).First(&run, run.ID).Error
	})
	if err != nil { return nil, err }
	return GetRoutineOccurrence(db, familyID, occurrenceID, now)
}


func RestoreRoutineOccurrenceItem(db *gorm.DB, familyID, occurrenceID int, input RoutineOverrideInput, now time.Time) (*RoutineOccurrence, error) {
	input.Source = strings.TrimSpace(input.Source)
	input.Reason = strings.TrimSpace(input.Reason)
	input.ExternalReference = strings.TrimSpace(input.ExternalReference)
	input.IdempotencyKey = strings.TrimSpace(input.IdempotencyKey)
	if input.ItemID <= 0 || input.Source != "external" || input.ExternalReference == "" ||
		input.IdempotencyKey == "" || len(input.Reason) > 300 || len(input.ExternalReference) > 160 ||
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
		if run.Status != RoutineOccurrenceActive || !now.Before(run.ExpiresAt) { return ErrRoutineOccurrenceExpired }
		if err := tx.Preload("Dependencies").First(&run, run.ID).Error; err != nil { return err }
		var item RoutineOccurrenceItem
		if err := tx.Clauses(clause.Locking{Strength:"UPDATE"}).
			Where("id = ? AND occurrence_id = ?", input.ItemID, occurrenceID).First(&item).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) { return ErrRoutineOccurrenceItemNotFound }
			return err
		}
		var existing RoutineOverride
		err := tx.Where("occurrence_id = ? AND item_id = ? AND idempotency_key = ?", occurrenceID, item.ID, input.IdempotencyKey).First(&existing).Error
		if err == nil {
			if existing.Action != "restore" || existing.Reason != input.Reason || existing.ExternalReference != input.ExternalReference {
				return ErrRoutineOccurrenceConflict
			}
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) { return err }
		if item.Status != RoutineOccurrenceItemSkipped { return ErrRoutineOccurrenceConflict }
		var latest RoutineOverride
		if err := tx.Where("occurrence_id = ? AND item_id = ?", occurrenceID, item.ID).Order("created_at DESC").First(&latest).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) { return ErrRoutineOccurrenceConflict }
			return err
		}
		if latest.Source != "external" || latest.Action != "skip" || latest.RevokedAt != nil {
			return ErrRoutineOccurrenceConflict
		}
		dependentSteps := []int{}
		for _, dependency := range run.Dependencies { if dependency.DependsOnStepID == item.StepID { dependentSteps = append(dependentSteps, dependency.StepID) } }
		var completed int64
		if len(dependentSteps) > 0 {
			if err := tx.Model(&RoutineOccurrenceItem{}).Where("occurrence_id = ? AND step_id IN ? AND status = ?",
				run.ID, dependentSteps, RoutineOccurrenceItemCompleted).Count(&completed).Error; err != nil { return err }
		}
		if completed > 0 { return ErrRoutineOccurrenceConflict }
		if err := tx.Model(&item).Updates(map[string]any{"status":RoutineOccurrenceItemPending,"updated_at":now.UTC()}).Error; err != nil { return err }
		if err := tx.Model(&RoutineOverride{}).Where("occurrence_id = ? AND item_id = ? AND source = ? AND action = ? AND revoked_at IS NULL", occurrenceID, item.ID, "external", "skip").Update("revoked_at", now.UTC()).Error; err != nil { return err }
		key := input.IdempotencyKey
		override := RoutineOverride{
			FamilyID:familyID, OccurrenceID:occurrenceID, ItemID:item.ID,
			Action:"restore", Source:"external", Reason:input.Reason,
			ExternalReference:input.ExternalReference, IdempotencyKey:&key,
			ExpiresAt:input.ExpiresAt, CreatedAt:now.UTC(),
		}
		if err := tx.Create(&override).Error; err != nil { return err }
		return settleRoutineOccurrence(tx, &run, now)
	})
	if err != nil { return nil, err }
	return GetRoutineOccurrence(db, familyID, occurrenceID, now)
}

// FinishRoutineOccurrence marks the run finished once every required item is
// completed or explicitly skipped. Optional items never block completion.
func FinishRoutineOccurrence(db *gorm.DB, occurrenceID int, now time.Time) error {
	var items []RoutineOccurrenceItem
	if err := db.Where("occurrence_id = ?", occurrenceID).Find(&items).Error; err != nil { return err }
	applicableRequired := 0
	for _, item := range items {
		if !item.Required || item.Status == RoutineOccurrenceItemNotApplicable { continue }
		applicableRequired++
		if item.Status != RoutineOccurrenceItemCompleted && item.Status != RoutineOccurrenceItemSkipped {
			return nil
		}
	}
	if applicableRequired == 0 { return nil }
	return db.Model(&RoutineOccurrence{}).Where("id = ? AND status = ?", occurrenceID, RoutineOccurrenceActive).
		Updates(map[string]any{"status":RoutineOccurrenceFinished,"finished_at":now.UTC()}).Error
}


func expireRoutineOverrides(tx *gorm.DB, run *RoutineOccurrence, now time.Time) error {
	var overrides []RoutineOverride
	if err := tx.Where("occurrence_id = ? AND source = ? AND action = ? AND expires_at IS NOT NULL AND expires_at <= ? AND revoked_at IS NULL",
		run.ID, "external", "skip", now.UTC()).Find(&overrides).Error; err != nil { return err }
	for _, override := range overrides {
		var item RoutineOccurrenceItem
		if err := tx.Where("id = ? AND occurrence_id = ?", override.ItemID, run.ID).First(&item).Error; err != nil { return err }
		dependentSteps := []int{}
		for _, dependency := range run.Dependencies { if dependency.DependsOnStepID == item.StepID { dependentSteps = append(dependentSteps, dependency.StepID) } }
		var completed int64
		if len(dependentSteps) > 0 {
			if err := tx.Model(&RoutineOccurrenceItem{}).Where("occurrence_id = ? AND step_id IN ? AND status = ?",
				run.ID, dependentSteps, RoutineOccurrenceItemCompleted).Count(&completed).Error; err != nil { return err }
		}
		var latest RoutineOverride
		latestErr := tx.Where("occurrence_id = ? AND item_id = ?", run.ID, item.ID).Order("created_at DESC").First(&latest).Error
		if latestErr != nil && !errors.Is(latestErr, gorm.ErrRecordNotFound) { return latestErr }
		if run.Status == RoutineOccurrenceActive && completed == 0 && item.Status == RoutineOccurrenceItemSkipped &&
			latestErr == nil && latest.ID == override.ID {
			if err := tx.Model(&item).Updates(map[string]any{"status":RoutineOccurrenceItemPending,"updated_at":now.UTC()}).Error; err != nil { return err }
		}
		if err := tx.Model(&override).Update("revoked_at", now.UTC()).Error; err != nil { return err }
	}
	return nil
}

func applyRoutineOccurrenceAvailability(tx *gorm.DB, run *RoutineOccurrence) error {
	dependencies := make([]RoutineDependency, 0, len(run.Dependencies))
	for _, dependency := range run.Dependencies { dependencies = append(dependencies, RoutineDependency{StepID:dependency.StepID,DependsOnStepID:dependency.DependsOnStepID}) }
	policies := make(map[int]RoutineItemPolicy, len(run.Items))
	states := make(map[int]RoutineItemState, len(run.Items))
	for _, item := range run.Items {
		policies[item.StepID] = RoutineItemPolicy{StepID:item.StepID, Required:item.Required}
		states[item.StepID] = RoutineItemState(item.Status)
	}
	for i := range run.Items {
		run.Items[i].Available = RoutineItemAvailable(run.Items[i].StepID, dependencies, policies, states)
	}
	return nil
}

// settleRoutineOccurrence closes a fully resolved run and pays its reward
// once, even when completion happens after midnight.
func settleRoutineOccurrence(tx *gorm.DB, run *RoutineOccurrence, now time.Time) error {
	if err := FinishRoutineOccurrence(tx, run.ID, now); err != nil { return err }
	if err := tx.First(run, run.ID).Error; err != nil { return err }
	if run.Status != RoutineOccurrenceFinished || run.BonusPaid { return nil }
	var routine Routine
	if err := tx.Where("id = ? AND family_id = ?", run.RoutineID, run.FamilyID).First(&routine).Error; err != nil { return err }
	result := tx.Model(&RoutineOccurrence{}).Where("id = ? AND bonus_paid = ?", run.ID, false).Update("bonus_paid", true)
	if result.Error != nil { return result.Error }
	if result.RowsAffected == 0 { return nil }
	run.BonusPaid = true
	if routine.Bonus > 0 {
		_, err := giveBonus(tx, run.FamilyID, run.UserID, routine.Bonus, "Routine : "+routine.Name)
		return err
	}
	return nil
}

// RoutineOccurrenceForMember prevents one family member from reading or
// changing another member's run through the member-facing API.

func ListActiveRoutineOccurrences(db *gorm.DB, familyID int, now time.Time) ([]RoutineOccurrence, error) {
	var active []RoutineOccurrence
	if err := db.Where("family_id = ? AND status = ?", familyID, RoutineOccurrenceActive).
		Order("started_at").Find(&active).Error; err != nil { return nil, err }
	for i := range active {
		run, err := GetRoutineOccurrence(db, familyID, active[i].ID, now)
		if err != nil { return nil, err }
		if run.Status == RoutineOccurrenceActive { active[i] = *run } else { active[i].ID = 0 }
	}
	filtered := active[:0]
	for _, run := range active { if run.ID != 0 { filtered = append(filtered, run) } }
	return filtered, nil
}

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
