package learn

import (
	"encoding/json"
	"errors"
	"strings"
	"time"

	fModel "github.com/nico87lbs/hopla/internal/family/model"
	"gorm.io/gorm"
)

// A placement test finds where a person starts in a pack: the device asks
// two questions of each chapter, in order, level after level, and stops at
// the first chapter missed. What it passed opens at once, without hops and
// without counting in the reviews. The server keeps the result and turns on
// the levels it gives.

// Placement statuses: the test was done, or the person chose to start at
// the beginning.
const (
	PlacementDone    = "done"
	PlacementSkipped = "skipped"
)

// What a placement keeps on: every level up to the one reached (empty), or
// only that one.
const (
	KeepUpTo = ""
	KeepOnly = "only"
)

// Placement is the placement test of a person in a pack, a pack of levels or
// a pack of modules.
type Placement struct {
	FamilyID int    `json:"-" gorm:"primaryKey;autoIncrement:false"`
	UserID   int    `json:"userId" gorm:"primaryKey;autoIncrement:false"`
	PackKey  string `json:"pack" gorm:"column:pack_key;primaryKey;size:80"`
	Status   string `json:"status" gorm:"column:status;size:10;not null"`
	// Reached is the level the person starts at; the pack itself for a pack
	// of modules.
	Reached string `json:"reached" gorm:"column:reached;size:80"`
	Keep    string `json:"keep" gorm:"column:keep;size:10"`
	// Opened are the chapters the test opened, as "module/chapter".
	Opened    []string  `json:"opened" gorm:"column:opened;type:text;serializer:json"`
	DoneAt    time.Time `json:"doneAt" gorm:"column:done_at"`
	UpdatedAt time.Time `json:"updatedAt" gorm:"column:updated_at"`
}

func (Placement) TableName() string { return "learn_placements" }

// TestModule is a module of a placement test, whole, played or not.
type TestModule struct {
	ID       string          `json:"id"`
	Name     string          `json:"name"`
	Document json.RawMessage `json:"document"`
}

// TestLevel is a level of a placement test, its modules in order.
type TestLevel struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// Levels are the school levels it is for, such as CP.
	Levels  []string     `json:"levels"`
	Modules []TestModule `json:"modules"`
}

// PlacementTest is what a device needs to run a placement test.
type PlacementTest struct {
	Pack   Module      `json:"pack"`
	Levels []TestLevel `json:"levels"`
	// Placement is the last test of the person, if any.
	Placement *Placement `json:"placement"`
}

// testLevels are the levels of a pack, in order; a pack of modules is its
// own single level. Only a pack no other pack gathers has a test.
func testLevels(modules []Module, key string) (Module, []TestLevel, error) {
	byKey := map[string]Module{}
	for _, module := range modules {
		byKey[module.Key] = module
	}
	pack, ok := byKey[key]
	if !ok || !pack.IsPack() {
		return pack, nil, ErrNotFound
	}
	for _, module := range modules {
		for _, child := range module.Children {
			if child == key {
				return pack, nil, invalid("le test se fait sur le paquet du dessus")
			}
		}
	}
	level := func(m Module) TestLevel {
		out := TestLevel{ID: m.Key, Name: m.Name, Levels: m.Levels, Modules: []TestModule{}}
		for _, child := range m.Children {
			if module, ok := byKey[child]; ok && !module.IsPack() {
				out.Modules = append(out.Modules, TestModule{ID: module.Key, Name: module.Name,
					Document: json.RawMessage(module.Content)})
			}
		}
		return out
	}
	var levels []TestLevel
	for _, child := range pack.Children {
		if m, ok := byKey[child]; ok && m.IsPack() {
			levels = append(levels, level(m))
		}
	}
	if len(levels) == 0 {
		levels = []TestLevel{level(pack)}
	}
	return pack, levels, nil
}

// PlacementTestFor gathers a pack's test for a person.
func PlacementTestFor(db *gorm.DB, familyID, userID int, key string, now time.Time) (PlacementTest, error) {
	modules, err := Modules(db, familyID, now)
	if err != nil {
		return PlacementTest{}, err
	}
	pack, levels, err := testLevels(modules, key)
	if err != nil {
		return PlacementTest{}, err
	}
	pack.Content = ""
	test := PlacementTest{Pack: pack, Levels: levels}
	var placement Placement
	err = db.Where("family_id = ? AND user_id = ? AND pack_key = ?", familyID, userID, key).First(&placement).Error
	switch {
	case err == nil:
		test.Placement = &placement
	case !errors.Is(err, gorm.ErrRecordNotFound):
		return test, err
	}
	return test, nil
}

// Placements lists the placement tests of a family, or of one person.
func Placements(db *gorm.DB, familyID int, userID *int) ([]Placement, error) {
	rows := []Placement{}
	query := db.Where("family_id = ?", familyID)
	if userID != nil {
		query = query.Where("user_id = ?", *userID)
	}
	err := query.Order("user_id, pack_key").Find(&rows).Error
	return rows, err
}

// PlacementResult is what a device sends at the end of a test, or when the
// person skips it. Keep is nil to leave it as it was.
type PlacementResult struct {
	UserID  int      `json:"userId"`
	Pack    string   `json:"pack"`
	Status  string   `json:"status"`
	Reached string   `json:"reached"`
	Keep    *string  `json:"keep"`
	Opened  []string `json:"opened"`
}

// SavePlacement keeps a test and turns on the levels it gives.
func SavePlacement(db *gorm.DB, familyID int, result PlacementResult, now time.Time) (Placement, error) {
	var saved Placement
	if result.Status != PlacementDone && result.Status != PlacementSkipped {
		return saved, invalid("test fait ou passé")
	}
	if result.Keep != nil && *result.Keep != KeepUpTo && *result.Keep != KeepOnly {
		return saved, invalid("garder tous les niveaux ou seulement le niveau atteint")
	}
	modules, err := Modules(db, familyID, now)
	if err != nil {
		return saved, err
	}
	_, levels, err := testLevels(modules, result.Pack)
	if err != nil {
		return saved, err
	}
	in := map[string]bool{}
	reached := false
	for _, level := range levels {
		reached = reached || level.ID == result.Reached
		for _, module := range level.Modules {
			in[module.ID] = true
		}
	}
	if result.Status == PlacementDone && !reached {
		return saved, invalid("niveau atteint inconnu")
	}
	opened := []string{}
	if result.Status == PlacementDone {
		for _, chapter := range result.Opened {
			module, _, ok := strings.Cut(chapter, "/")
			if ok && in[module] && len(chapter) <= 200 {
				opened = append(opened, chapter)
			}
		}
	}
	err = db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("user_id = ? AND family_id = ?", result.UserID, familyID).First(&fModel.UserFamily{}).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return invalid("cette personne n'est pas de la famille")
			}
			return err
		}
		err := tx.Where("family_id = ? AND user_id = ? AND pack_key = ?", familyID, result.UserID, result.Pack).First(&saved).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		saved.FamilyID, saved.UserID, saved.PackKey = familyID, result.UserID, result.Pack
		saved.Status, saved.Opened, saved.DoneAt, saved.UpdatedAt = result.Status, opened, now, now
		saved.Reached = ""
		if result.Status == PlacementDone {
			saved.Reached = result.Reached
		}
		if result.Keep != nil {
			saved.Keep = *result.Keep
		}
		if err := tx.Save(&saved).Error; err != nil {
			return err
		}
		return applyPlacement(tx, familyID, saved, levels, now)
	})
	return saved, err
}

// SetPlacementKeep changes what a test keeps on, and turns the levels on or
// off again.
func SetPlacementKeep(db *gorm.DB, familyID, userID int, pack, keep string, now time.Time) (Placement, error) {
	var saved Placement
	if keep != KeepUpTo && keep != KeepOnly {
		return saved, invalid("garder tous les niveaux ou seulement le niveau atteint")
	}
	modules, err := Modules(db, familyID, now)
	if err != nil {
		return saved, err
	}
	_, levels, err := testLevels(modules, pack)
	if err != nil {
		return saved, err
	}
	err = db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("family_id = ? AND user_id = ? AND pack_key = ?", familyID, userID, pack).First(&saved).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound
			}
			return err
		}
		saved.Keep, saved.UpdatedAt = keep, now
		if err := tx.Save(&saved).Error; err != nil {
			return err
		}
		return applyPlacement(tx, familyID, saved, levels, now)
	})
	return saved, err
}

// applyPlacement turns on the levels a test gives, and off the others: the
// levels up to the one reached, or only that one. A pack of modules, or a
// test skipped, changes nothing.
func applyPlacement(tx *gorm.DB, familyID int, placement Placement, levels []TestLevel, now time.Time) error {
	if placement.Status != PlacementDone || len(levels) < 2 {
		return nil
	}
	at := -1
	for i, level := range levels {
		if level.ID == placement.Reached {
			at = i
		}
	}
	if at < 0 {
		return nil
	}
	for i, level := range levels {
		on := i == at || (placement.Keep == KeepUpTo && i < at)
		if err := SetActivation(tx, familyID, ActivationChange{UserID: placement.UserID,
			Modules: []string{level.ID}, Active: on}, now); err != nil {
			return err
		}
	}
	return nil
}

// placedChapters are the chapters each module has opened by a test.
func placedChapters(placements []Placement) map[string][]string {
	out := map[string][]string{}
	for _, placement := range placements {
		for _, chapter := range placement.Opened {
			if module, id, ok := strings.Cut(chapter, "/"); ok {
				out[module] = append(out[module], id)
			}
		}
	}
	return out
}
