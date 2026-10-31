package learn

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	fModel "github.com/nico87lbs/hopla/internal/family/model"
	ptModel "github.com/nico87lbs/hopla/internal/points"
	"github.com/nico87lbs/hopla/internal/zone"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrNotFound    = errors.New("module not found")
	ErrNotActive   = errors.New("module not active for this person")
	ErrCatalogueID = errors.New("this id belongs to a catalogue module")
)

// InvalidError is a request the server refuses, with a reason in French for
// the person who sent it.
type InvalidError struct{ Reason string }

func (e InvalidError) Error() string { return e.Reason }

func invalid(format string, args ...any) error {
	return InvalidError{Reason: fmt.Sprintf(format, args...)}
}

func moduleFrom(familyID int, doc Document, raw []byte, builtin bool, now time.Time) Module {
	return Module{
		FamilyID: familyID, Key: doc.ID, Version: doc.Version, Name: doc.Name, Author: doc.Author, Subject: doc.Subject,
		Levels: doc.Levels, Audience: doc.Audience, Children: doc.Modules, Builtin: builtin,
		Content: string(raw), InstalledAt: now, UpdatedAt: now,
	}
}

// save inserts a module, or replaces the content of the one with its id while
// keeping its installation date.
func save(tx *gorm.DB, module Module) error {
	return tx.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "family_id"}, {Name: "module_key"}},
		DoUpdates: clause.AssignmentColumns([]string{"version", "name", "author", "subject", "levels", "audience",
			"children", "builtin", "content", "updated_at"}),
	}).Create(&module).Error
}

// Install adds a catalogue module to a family, with every module of a pack.
// Installing it again brings it up to date.
func Install(db *gorm.DB, familyID int, id string, now time.Time) error {
	entries, err := Catalogue()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		return install(tx, entries, familyID, id, now, map[string]bool{})
	})
}

func install(tx *gorm.DB, entries map[string]Entry, familyID int, id string, now time.Time, done map[string]bool) error {
	if done[id] {
		return nil
	}
	done[id] = true
	entry, ok := entries[id]
	if !ok {
		return ErrNotFound
	}
	for _, child := range entry.Doc.Modules {
		if err := install(tx, entries, familyID, child, now, done); err != nil {
			return err
		}
	}
	return save(tx, moduleFrom(familyID, entry.Doc, entry.Raw, true, now))
}

// Import adds or replaces a module written by the family. A pack may gather
// catalogue modules, which are installed with it, or modules already there.
func Import(db *gorm.DB, familyID int, raw []byte, now time.Time) (Module, error) {
	doc, err := Parse(raw)
	if err != nil {
		return Module{}, InvalidError{Reason: err.Error()}
	}
	entries, err := Catalogue()
	if err != nil {
		return Module{}, err
	}
	if _, ok := entries[doc.ID]; ok {
		return Module{}, ErrCatalogueID
	}
	module := moduleFrom(familyID, doc, raw, false, now)
	err = db.Transaction(func(tx *gorm.DB) error {
		if err := checkKeys(tx, familyID, doc, entries); err != nil {
			return err
		}
		for _, child := range doc.Modules {
			if _, ok := entries[child]; ok {
				if err := install(tx, entries, familyID, child, now, map[string]bool{}); err != nil {
					return err
				}
				continue
			}
			var count int64
			if err := tx.Model(&Module{}).Where("family_id = ? AND module_key = ?", familyID, child).
				Count(&count).Error; err != nil {
				return err
			}
			if count == 0 {
				return invalid("paquet %s : le module %s n'est pas installé", doc.ID, child)
			}
		}
		return save(tx, module)
	})
	return module, err
}

// checkKeys refuses a module whose shared keys clash with the catalogue's or
// with a module already in the family.
func checkKeys(tx *gorm.DB, familyID int, doc Document, entries map[string]Entry) error {
	if len(doc.SharedKeys()) == 0 {
		return nil
	}
	others := make([]Document, 0, len(entries))
	for _, entry := range entries {
		others = append(others, entry.Doc)
	}
	var installed []Module
	if err := tx.Where("family_id = ? AND builtin = ?", familyID, false).Find(&installed).Error; err != nil {
		return err
	}
	for _, module := range installed {
		if other, err := Parse([]byte(module.Content)); err == nil {
			others = append(others, other)
		}
	}
	if err := KeyConflict(doc, others); err != nil {
		return invalid("module %s : %v", doc.ID, err)
	}
	return nil
}

// Modules lists the modules of a family. Catalogue modules are brought up to
// date with the catalogue on the way: their ids do not change, so what each
// person knows stays.
func Modules(db *gorm.DB, familyID int, now time.Time) ([]Module, error) {
	modules, err := freshModules(db, familyID, now)
	if err != nil {
		return nil, err
	}
	return modules, withEdits(db, familyID, modules)
}

// freshModules lists the modules of a family as installed, up to date with
// the catalogue, without the family's corrections.
func freshModules(db *gorm.DB, familyID int, now time.Time) ([]Module, error) {
	var modules []Module
	if err := db.Where("family_id = ?", familyID).Order("name").Find(&modules).Error; err != nil {
		return nil, err
	}
	entries, err := Catalogue()
	if err != nil {
		return nil, err
	}
	have := map[string]bool{}
	for _, module := range modules {
		have[module.Key] = true
	}
	for i, module := range modules {
		entry, ok := entries[module.Key]
		if !module.Builtin || !ok || entry.Doc.Version == module.Version {
			continue
		}
		fresh := moduleFrom(familyID, entry.Doc, entry.Raw, true, now)
		if err := save(db, fresh); err != nil {
			return nil, err
		}
		fresh.ID, fresh.InstalledAt = module.ID, module.InstalledAt
		modules[i] = fresh
	}
	// A catalogue pack that gained modules in an update gets them installed,
	// turned on for nobody: the parents choose who plays them.
	var added bool
	for _, module := range modules {
		if !module.Builtin || !module.IsPack() {
			continue
		}
		for _, child := range module.Children {
			if have[child] {
				continue
			}
			if _, ok := entries[child]; !ok {
				continue
			}
			if err := db.Transaction(func(tx *gorm.DB) error {
				return install(tx, entries, familyID, child, now, map[string]bool{})
			}); err != nil {
				return nil, err
			}
			have[child], added = true, true
		}
	}
	if added {
		modules = nil
		if err := db.Where("family_id = ?", familyID).Order("name").Find(&modules).Error; err != nil {
			return nil, err
		}
	}
	return modules, nil
}

// Detail is a module, or a pack with its modules, as a family sees it:
// the version installed when it is, with the family's corrections, the
// catalogue's otherwise.
type Detail struct {
	Installed bool `json:"installed"`
	// Documents are the module, then for a pack each of its modules.
	Documents []json.RawMessage `json:"documents"`
	// Edits are the family's corrections, each with the card as the module
	// has it.
	Edits []EditDetail `json:"edits"`
	// Reports are the questions reported and not looked at yet.
	Reports []Report `json:"reports"`
}

// EditDetail is a correction and the card it changes.
type EditDetail struct {
	CardEdit
	Original json.RawMessage `json:"original"`
}

// ModuleDetail reads a module of the family or of the catalogue, and, for a
// pack, its modules.
func ModuleDetail(db *gorm.DB, familyID int, key string, now time.Time) (Detail, error) {
	modules, err := freshModules(db, familyID, now)
	if err != nil {
		return Detail{}, err
	}
	installed := map[string]string{}
	for _, module := range modules {
		installed[module.Key] = module.Content
	}
	entries, err := Catalogue()
	if err != nil {
		return Detail{}, err
	}
	edits, err := editsOf(db, familyID)
	if err != nil {
		return Detail{}, err
	}
	out := Detail{Documents: []json.RawMessage{}, Edits: []EditDetail{}}
	var keys []string
	// add reads a module into the detail, and tells its document.
	add := func(key string) (Document, bool) {
		raw, ok := installed[key]
		if !ok {
			entry, found := entries[key]
			if !found {
				return Document{}, false
			}
			out.Documents = append(out.Documents, entry.Raw)
			keys = append(keys, key)
			return entry.Doc, true
		}
		doc, err := Parse([]byte(raw))
		if err != nil {
			return doc, false
		}
		patched, err := applyEdits(raw, edits[key])
		if err != nil {
			return doc, false
		}
		out.Documents = append(out.Documents, json.RawMessage(patched))
		keys = append(keys, key)
		if list := edits[key]; len(list) > 0 {
			_, cards, err := cardsOf(raw)
			if err != nil {
				return doc, true
			}
			byID := map[string]any{}
			for _, card := range cards {
				if m, ok := card.(map[string]any); ok {
					id, _ := m["id"].(string)
					byID[id] = m
				}
			}
			for _, edit := range list {
				if card, ok := byID[edit.CardID]; ok {
					original, _ := json.Marshal(card)
					out.Edits = append(out.Edits, EditDetail{CardEdit: edit, Original: original})
				}
			}
		}
		return doc, true
	}
	doc, ok := add(key)
	if !ok {
		return Detail{}, ErrNotFound
	}
	_, out.Installed = installed[key]
	for _, child := range doc.Modules {
		add(child)
	}
	if out.Reports, err = OpenReports(db, familyID, keys); err != nil {
		return Detail{}, err
	}
	return out, nil
}

// Remove takes a module out of a family with its activations and settings.
// A pack goes with its modules, except those another pack still gathers.
// What people know and the games they played stay, should the module come
// back, unless forget is set: then they go too.
func Remove(db *gorm.DB, familyID int, key string, forget bool) error {
	return db.Transaction(func(tx *gorm.DB) error {
		var modules []Module
		if err := tx.Where("family_id = ?", familyID).Find(&modules).Error; err != nil {
			return err
		}
		byKey := map[string]Module{}
		for _, module := range modules {
			byKey[module.Key] = module
		}
		if _, ok := byKey[key]; !ok {
			return ErrNotFound
		}
		gone := map[string]bool{}
		var mark func(string)
		mark = func(k string) {
			if gone[k] {
				return
			}
			gone[k] = true
			for _, child := range byKey[k].Children {
				if _, ok := byKey[child]; ok && !keptBy(byKey, gone, child) {
					mark(child)
				}
			}
		}
		mark(key)
		keys := make([]string, 0, len(gone))
		for k := range gone {
			keys = append(keys, k)
		}
		scoped := tx.Where("family_id = ? AND module_key IN ?", familyID, keys)
		if err := scoped.Delete(&Module{}).Error; err != nil {
			return err
		}
		if err := tx.Where("family_id = ? AND module_key IN ?", familyID, keys).Delete(&Activation{}).Error; err != nil {
			return err
		}
		if err := tx.Where("family_id = ? AND scope IN ?", familyID, keys).Delete(&PersonSetting{}).Error; err != nil {
			return err
		}
		if !forget {
			return nil
		}
		if err := tx.Where("family_id = ? AND module_key IN ?", familyID, keys).Delete(&Session{}).Error; err != nil {
			return err
		}
		return tx.Where("family_id = ? AND module_key IN ?", familyID, keys).Delete(&Card{}).Error
	})
}

// keptBy tells whether a pack that stays still gathers a module.
func keptBy(modules map[string]Module, gone map[string]bool, key string) bool {
	for k, module := range modules {
		if gone[k] {
			continue
		}
		for _, child := range module.Children {
			if child == key {
				return true
			}
		}
	}
	return false
}

// Activations lists who plays which module in a family.
func Activations(db *gorm.DB, familyID int) ([]Activation, error) {
	var rows []Activation
	err := db.Where("family_id = ?", familyID).Order("user_id, module_key").Find(&rows).Error
	return rows, err
}

// ActivationChange turns modules on or off for a person. Settings left empty
// stay as they are; -1 gives the module's own back.
type ActivationChange struct {
	UserID        int      `json:"userId"`
	Modules       []string `json:"modules"`
	Active        bool     `json:"active"`
	DailyCap      *int     `json:"dailyCap"`
	UnlockPercent *int     `json:"unlockPercent"`
	GameSettings
}

// SetActivation applies a change. A pack is not played itself: turning it on
// turns on its modules.
func SetActivation(db *gorm.DB, familyID int, change ActivationChange, now time.Time) error {
	if change.DailyCap != nil && (*change.DailyCap < -1 || *change.DailyCap > 200) {
		return invalid("plafond entre 0 et 200 hops")
	}
	if change.UnlockPercent != nil && (*change.UnlockPercent < -1 || *change.UnlockPercent > 100) {
		return invalid("seuil d'ouverture entre 0 et 100 %%")
	}
	if err := change.GameSettings.check(); err != nil {
		return err
	}
	dailyCap, unlockPercent := ownSetting(change.DailyCap), ownSetting(change.UnlockPercent)
	var game GameSettings
	game.apply(change.GameSettings)
	return db.Transaction(func(tx *gorm.DB) error {
		var member fModel.UserFamily
		if err := tx.Where("user_id = ? AND family_id = ?", change.UserID, familyID).First(&member).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return invalid("cette personne n'est pas de la famille")
			}
			return err
		}
		keys, err := leaves(tx, familyID, change.Modules)
		if err != nil {
			return err
		}
		for _, key := range keys {
			where := tx.Where("family_id = ? AND user_id = ? AND module_key = ?", familyID, change.UserID, key)
			if !change.Active {
				if err := where.Delete(&Activation{}).Error; err != nil {
					return err
				}
				continue
			}
			row := Activation{FamilyID: familyID, UserID: change.UserID, ModuleKey: key,
				DailyCap: dailyCap, UnlockPercent: unlockPercent, GameSettings: game, CreatedAt: now}
			// Turning a module on again keeps the settings it had; only the
			// settings sent change.
			conflict := clause.OnConflict{
				Columns: []clause.Column{{Name: "family_id"}, {Name: "user_id"}, {Name: "module_key"}},
			}
			var columns []string
			if change.DailyCap != nil {
				columns = append(columns, "daily_cap")
			}
			if change.UnlockPercent != nil {
				columns = append(columns, "unlock_percent")
			}
			if change.Questions != nil {
				columns = append(columns, "questions")
			}
			if change.Threshold != nil {
				columns = append(columns, "threshold")
			}
			if change.HopsByStar != nil {
				columns = append(columns, "hops_by_star")
			}
			if len(columns) == 0 {
				conflict.DoNothing = true
			} else {
				conflict.DoUpdates = clause.AssignmentColumns(columns)
			}
			if err := tx.Clauses(conflict).Create(&row).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// check refuses game settings out of range; -1 clears one.
func (g GameSettings) check() error {
	if g.Questions != nil && *g.Questions != -1 && (*g.Questions < MinAnswersForHops || *g.Questions > MaxQuestions) {
		return invalid("questions par partie entre %d et %d", MinAnswersForHops, MaxQuestions)
	}
	if g.Threshold != nil && (*g.Threshold < -1 || *g.Threshold > 100) {
		return invalid("seuil de la première étoile entre 0 et 100 %%")
	}
	if g.HopsByStar != nil && (*g.HopsByStar < -1 || *g.HopsByStar > 20) {
		return invalid("hops par étoile entre 0 et 20")
	}
	return nil
}

// apply puts the settings sent over the kept ones.
func (g *GameSettings) apply(change GameSettings) {
	if change.Questions != nil {
		g.Questions = ownSetting(change.Questions)
	}
	if change.Threshold != nil {
		g.Threshold = ownSetting(change.Threshold)
	}
	if change.HopsByStar != nil {
		g.HopsByStar = ownSetting(change.HopsByStar)
	}
}

func (g GameSettings) empty() bool {
	return g.Questions == nil && g.Threshold == nil && g.HopsByStar == nil
}

// ownSetting is a person's setting as kept: nil for -1, the module's own.
func ownSetting(value *int) *int {
	if value != nil && *value < 0 {
		return nil
	}
	return value
}

// Members lists the active members of a family.
func Members(db *gorm.DB, familyID int) ([]int, error) {
	var ids []int
	err := db.Model(&fModel.UserFamily{}).Where("family_id = ? AND is_active = ?", familyID, true).
		Order("user_id").Pluck("user_id", &ids).Error
	return ids, err
}

// PersonSettings lists the settings of everyone in a family.
func PersonSettings(db *gorm.DB, familyID int) ([]PersonSetting, error) {
	var rows []PersonSetting
	err := db.Where("family_id = ?", familyID).Order("user_id, scope").Find(&rows).Error
	return rows, err
}

// SettingChange sets a person's settings for a pack, their total cap
// (scope AllPacks), or, with Family, everyone's settings for a pack or a
// module. As for a module, empty leaves a setting as it is and -1 clears it.
type SettingChange struct {
	UserID        int    `json:"userId"`
	Family        bool   `json:"family"`
	Scope         string `json:"scope"`
	DailyCap      *int   `json:"dailyCap"`
	UnlockPercent *int   `json:"unlockPercent"`
	TotalCap      *int   `json:"totalCap"`
	GameSettings
}

// SetPersonSetting applies a change of a person's or of the family's settings.
func SetPersonSetting(db *gorm.DB, familyID int, change SettingChange, now time.Time) error {
	if change.DailyCap != nil && (*change.DailyCap < -1 || *change.DailyCap > 200) {
		return invalid("plafond entre 0 et 200 hops")
	}
	if change.TotalCap != nil && (*change.TotalCap < -1 || *change.TotalCap > 1000) {
		return invalid("plafond total entre 0 et 1000 hops")
	}
	if change.UnlockPercent != nil && (*change.UnlockPercent < -1 || *change.UnlockPercent > 100) {
		return invalid("seuil d'ouverture entre 0 et 100 %%")
	}
	if err := change.GameSettings.check(); err != nil {
		return err
	}
	if change.Family {
		change.UserID = Family
	}
	switch {
	case change.Scope == AllPacks && (change.Family || change.DailyCap != nil || change.UnlockPercent != nil ||
		!change.GameSettings.empty()):
		return invalid("seul le plafond total se règle pour tous les jeux, personne par personne")
	case change.TotalCap != nil && change.Scope != AllPacks:
		return invalid("le plafond total se règle pour tous les jeux")
	}
	return db.Transaction(func(tx *gorm.DB) error {
		if !change.Family {
			var member fModel.UserFamily
			if err := tx.Where("user_id = ? AND family_id = ?", change.UserID, familyID).First(&member).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return invalid("cette personne n'est pas de la famille")
				}
				return err
			}
		}
		if change.Scope != AllPacks {
			var module Module
			if err := tx.Where("family_id = ? AND module_key = ?", familyID, change.Scope).First(&module).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return ErrNotFound
				}
				return err
			}
			if !change.Family && !module.IsPack() {
				return invalid("ce module n'est pas un paquet")
			}
		}
		row := PersonSetting{FamilyID: familyID, UserID: change.UserID, Scope: change.Scope}
		err := tx.Where("family_id = ? AND user_id = ? AND scope = ?", familyID, change.UserID, change.Scope).
			First(&row).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if change.DailyCap != nil {
			row.DailyCap = ownSetting(change.DailyCap)
		}
		if change.UnlockPercent != nil {
			row.UnlockPercent = ownSetting(change.UnlockPercent)
		}
		if change.TotalCap != nil {
			row.TotalCap = ownSetting(change.TotalCap)
		}
		row.GameSettings.apply(change.GameSettings)
		row.UpdatedAt = now
		if row.DailyCap == nil && row.UnlockPercent == nil && row.TotalCap == nil && row.GameSettings.empty() {
			return tx.Where("family_id = ? AND user_id = ? AND scope = ?", familyID, change.UserID, change.Scope).
				Delete(&PersonSetting{}).Error
		}
		// Not Save: the family's row has user id 0, which Save takes for a new
		// row and inserts a second time.
		return tx.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "family_id"}, {Name: "user_id"}, {Name: "scope"}},
			UpdateAll: true,
		}).Create(&row).Error
	})
}

// FoldAllPacks moves the game settings people once set for all packs onto
// each of their packs, and modules outside a pack, where nothing was set:
// what applies stays the same, and only the total cap remains for all.
func FoldAllPacks(db *gorm.DB) error {
	var rows []PersonSetting
	if err := db.Where("scope = ? AND (daily_cap IS NOT NULL OR unlock_percent IS NOT NULL OR "+
		"questions IS NOT NULL OR threshold IS NOT NULL OR hops_by_star IS NOT NULL)", AllPacks).
		Find(&rows).Error; err != nil {
		return err
	}
	for _, all := range rows {
		err := db.Transaction(func(tx *gorm.DB) error {
			var modules []Module
			if err := tx.Where("family_id = ?", all.FamilyID).Find(&modules).Error; err != nil {
				return err
			}
			inPack := map[string]bool{}
			for _, module := range modules {
				for _, child := range module.Children {
					inPack[child] = true
				}
			}
			fill := func(dailyCap, unlock **int, game *GameSettings) {
				for _, f := range []struct{ to, from **int }{
					{dailyCap, &all.DailyCap}, {unlock, &all.UnlockPercent}, {&game.Questions, &all.Questions},
					{&game.Threshold, &all.Threshold}, {&game.HopsByStar, &all.HopsByStar},
				} {
					if *f.to == nil {
						*f.to = *f.from
					}
				}
			}
			for _, module := range modules {
				switch {
				case module.IsPack():
					row := PersonSetting{FamilyID: all.FamilyID, UserID: all.UserID, Scope: module.Key}
					if err := tx.Where(&row).Attrs(PersonSetting{UpdatedAt: all.UpdatedAt}).FirstOrInit(&row).Error; err != nil {
						return err
					}
					fill(&row.DailyCap, &row.UnlockPercent, &row.GameSettings)
					if err := tx.Save(&row).Error; err != nil {
						return err
					}
				case !inPack[module.Key]:
					var activation Activation
					err := tx.Where("family_id = ? AND user_id = ? AND module_key = ?", all.FamilyID, all.UserID, module.Key).
						First(&activation).Error
					if errors.Is(err, gorm.ErrRecordNotFound) {
						continue
					}
					if err != nil {
						return err
					}
					fill(&activation.DailyCap, &activation.UnlockPercent, &activation.GameSettings)
					if err := tx.Save(&activation).Error; err != nil {
						return err
					}
				}
			}
			where := tx.Where("family_id = ? AND user_id = ? AND scope = ?", all.FamilyID, all.UserID, AllPacks)
			if all.TotalCap == nil {
				return where.Delete(&PersonSetting{}).Error
			}
			return where.Model(&PersonSetting{}).Updates(map[string]any{"daily_cap": nil, "unlock_percent": nil,
				"questions": nil, "threshold": nil, "hops_by_star": nil}).Error
		})
		if err != nil {
			return err
		}
	}
	return nil
}

// limits are the settings that apply to a person, module by module.
type limits struct {
	byScope map[string]PersonSetting
	family  map[string]PersonSetting
	// packsOf lists the packs a module belongs to, in their order.
	packsOf map[string][]string
}

// loadLimits reads a person's settings and the family's. For Family, only
// the family's apply.
func loadLimits(tx *gorm.DB, familyID, userID int, modules []Module) (limits, error) {
	l := limits{byScope: map[string]PersonSetting{}, family: map[string]PersonSetting{}, packsOf: map[string][]string{}}
	var rows []PersonSetting
	if err := tx.Where("family_id = ? AND user_id IN ?", familyID, []int{userID, Family}).Find(&rows).Error; err != nil {
		return l, err
	}
	for _, row := range rows {
		if row.UserID == Family {
			l.family[row.Scope] = row
		}
		if userID != Family && row.UserID == userID {
			l.byScope[row.Scope] = row
		}
	}
	for _, module := range modules {
		for _, child := range module.Children {
			l.packsOf[child] = append(l.packsOf[child], module.Key)
		}
	}
	return l, nil
}

// Where a setting comes from: the module itself, the family or the person.
const (
	FromModule = "module"
	FromFamily = "family"
	FromPerson = "person"
)

// pick returns the setting that applies and where it comes from: the
// person's for the module, then for its packs, then the family's for the
// module, then for its packs. Nil leaves the module's own.
func (l limits) pick(module string, own *int, field func(PersonSetting) *int) (*int, string) {
	if own != nil {
		return own, FromPerson
	}
	for _, pack := range l.packsOf[module] {
		if v := field(l.byScope[pack]); v != nil {
			return v, FromPerson
		}
	}
	if v := field(l.family[module]); v != nil {
		return v, FromFamily
	}
	for _, pack := range l.packsOf[module] {
		if v := field(l.family[pack]); v != nil {
			return v, FromFamily
		}
	}
	return nil, FromModule
}

func (l limits) dailyCap(module string, activation Activation, settings Settings) int {
	if v, _ := l.pick(module, activation.DailyCap, func(s PersonSetting) *int { return s.DailyCap }); v != nil {
		return *v
	}
	return settings.DailyCap
}

func (l limits) unlockPercent(module string, activation Activation) *int {
	v, _ := l.pick(module, activation.UnlockPercent, func(s PersonSetting) *int { return s.UnlockPercent })
	return v
}

// settings are a module's game settings for the person, what they set
// over the module's own.
func (l limits) settings(module string, activation Activation, own Settings) Settings {
	pick := func(mine *int, field func(PersonSetting) *int, value *int) {
		if v, _ := l.pick(module, mine, field); v != nil {
			*value = *v
		}
	}
	pick(activation.Questions, func(s PersonSetting) *int { return s.Questions }, &own.Questions)
	pick(activation.Threshold, func(s PersonSetting) *int { return s.Threshold }, &own.Threshold)
	pick(activation.HopsByStar, func(s PersonSetting) *int { return s.HopsByStar }, &own.HopsByStar)
	return own
}

func (l limits) totalCap() *int { return l.byScope[AllPacks].TotalCap }

// Value is a setting that applies and where it comes from.
type Value struct {
	Value *int   `json:"value"`
	From  string `json:"from"`
}

// Applied are the settings that apply to a module for someone.
type Applied struct {
	Questions     Value `json:"questions"`
	Threshold     Value `json:"threshold"`
	HopsByStar    Value `json:"hopsByStar"`
	DailyCap      Value `json:"dailyCap"`
	UnlockPercent Value `json:"unlockPercent"`
}

// AppliedSettings tells, for each person given (Family for the family alone)
// and each module, the settings that apply and where they come from.
func AppliedSettings(db *gorm.DB, familyID int, userIDs []int) (map[int]map[string]Applied, error) {
	var modules []Module
	if err := db.Where("family_id = ?", familyID).Find(&modules).Error; err != nil {
		return nil, err
	}
	var activations []Activation
	if err := db.Where("family_id = ?", familyID).Find(&activations).Error; err != nil {
		return nil, err
	}
	active := map[string]Activation{}
	for _, a := range activations {
		active[fmt.Sprintf("%d:%s", a.UserID, a.ModuleKey)] = a
	}
	own := map[string]Settings{}
	for _, module := range modules {
		if doc, err := Parse([]byte(module.Content)); err == nil && !module.IsPack() {
			own[module.Key] = doc.Settings.WithDefaults()
		}
	}
	out := map[int]map[string]Applied{}
	for _, userID := range userIDs {
		l, err := loadLimits(db, familyID, userID, modules)
		if err != nil {
			return nil, err
		}
		out[userID] = map[string]Applied{}
		for key, settings := range own {
			activation := active[fmt.Sprintf("%d:%s", userID, key)]
			if userID == Family {
				activation = Activation{}
			}
			value := func(mine *int, field func(PersonSetting) *int, fallback *int) Value {
				v, from := l.pick(key, mine, field)
				if v == nil {
					v = fallback
				}
				return Value{Value: v, From: from}
			}
			out[userID][key] = Applied{
				Questions:     value(activation.Questions, func(s PersonSetting) *int { return s.Questions }, &settings.Questions),
				Threshold:     value(activation.Threshold, func(s PersonSetting) *int { return s.Threshold }, &settings.Threshold),
				HopsByStar:    value(activation.HopsByStar, func(s PersonSetting) *int { return s.HopsByStar }, &settings.HopsByStar),
				DailyCap:      value(activation.DailyCap, func(s PersonSetting) *int { return s.DailyCap }, &settings.DailyCap),
				UnlockPercent: value(activation.UnlockPercent, func(s PersonSetting) *int { return s.UnlockPercent }, nil),
			}
		}
	}
	return out, nil
}

// earnedToday is what a person earned with the learning games on a day.
func earnedToday(tx *gorm.DB, familyID, userID int, day string) (int, error) {
	var earned int
	err := tx.Model(&Session{}).Select("COALESCE(SUM(points), 0)").
		Where("family_id = ? AND user_id = ? AND day = ?", familyID, userID, day).Scan(&earned).Error
	return earned, err
}

// leaves turns module ids into the playable modules they stand for, packs
// opened up.
func leaves(tx *gorm.DB, familyID int, keys []string) ([]string, error) {
	var modules []Module
	if err := tx.Where("family_id = ?", familyID).Find(&modules).Error; err != nil {
		return nil, err
	}
	byKey := map[string]Module{}
	for _, module := range modules {
		byKey[module.Key] = module
	}
	var out []string
	seen := map[string]bool{}
	var walk func(key string, depth int) error
	walk = func(key string, depth int) error {
		module, ok := byKey[key]
		if !ok || depth > 5 {
			return ErrNotFound
		}
		if !module.IsPack() {
			if !seen[key] {
				seen[key] = true
				out = append(out, key)
			}
			return nil
		}
		for _, child := range module.Children {
			if err := walk(child, depth+1); err != nil {
				return err
			}
		}
		return nil
	}
	for _, key := range keys {
		if err := walk(key, 0); err != nil {
			return nil, err
		}
	}
	return out, nil
}

// Day is the family's day of t, as the sessions and cards count them.
func Day(familyID int, t time.Time) string {
	return t.In(zone.Of(familyID)).Format(time.DateOnly)
}

func addDays(day string, days int) string {
	t, err := time.Parse(time.DateOnly, day)
	if err != nil {
		return day
	}
	return t.AddDate(0, 0, days).Format(time.DateOnly)
}

// PlayerModule is a module a person plays, with the settings that apply to
// them.
type PlayerModule struct {
	Module
	Document json.RawMessage `json:"document"`
	Settings Settings        `json:"settings"`
	DailyCap int             `json:"dailyCap"`
	// UnlockPercent replaces the chapters' own thresholds when a parent set
	// one for this person.
	UnlockPercent *int `json:"unlockPercent"`
	EarnedToday   int  `json:"earnedToday"`
	PlayedToday   int  `json:"playedToday"`
}

// Player is everything a device needs to let a person play, also offline:
// their modules, whole, and what they know.
type Player struct {
	UserID  int            `json:"userId"`
	Day     string         `json:"day"`
	Modules []PlayerModule `json:"modules"`
	// Packs are the installed packs, to show modules under their pack.
	Packs []Module `json:"packs"`
	Cards []Card   `json:"cards"`
	// TotalCap is the most hops of a day, all modules together; nil for
	// none. EarnedToday counts them.
	TotalCap    *int `json:"totalCap"`
	EarnedToday int  `json:"earnedToday"`
}

// PlayerFor gathers what a person plays.
func PlayerFor(db *gorm.DB, familyID, userID int, now time.Time) (Player, error) {
	player := Player{UserID: userID, Day: Day(familyID, now), Modules: []PlayerModule{}, Packs: []Module{}}
	modules, err := Modules(db, familyID, now)
	if err != nil {
		return player, err
	}
	var activations []Activation
	if err := db.Where("family_id = ? AND user_id = ?", familyID, userID).Find(&activations).Error; err != nil {
		return player, err
	}
	active := map[string]Activation{}
	for _, activation := range activations {
		active[activation.ModuleKey] = activation
	}
	type total struct {
		ModuleKey string
		Points    int
		Games     int
	}
	var totals []total
	if err := db.Model(&Session{}).Select("module_key, SUM(points) AS points, COUNT(*) AS games").
		Where("family_id = ? AND user_id = ? AND day = ?", familyID, userID, player.Day).
		Group("module_key").Scan(&totals).Error; err != nil {
		return player, err
	}
	earned := map[string]total{}
	for _, t := range totals {
		earned[t.ModuleKey] = t
		player.EarnedToday += t.Points
	}
	limits, err := loadLimits(db, familyID, userID, modules)
	if err != nil {
		return player, err
	}
	player.TotalCap = limits.totalCap()
	for _, module := range modules {
		if module.IsPack() {
			player.Packs = append(player.Packs, module)
			continue
		}
		activation, ok := active[module.Key]
		if !ok {
			continue
		}
		doc, err := Parse([]byte(module.Content))
		if err != nil {
			continue
		}
		pm := PlayerModule{Module: module, Document: json.RawMessage(module.Content),
			Settings:      limits.settings(module.Key, activation, doc.Settings.WithDefaults()),
			UnlockPercent: limits.unlockPercent(module.Key, activation),
			EarnedToday:   earned[module.Key].Points, PlayedToday: earned[module.Key].Games}
		pm.DailyCap = limits.dailyCap(module.Key, activation, pm.Settings)
		player.Modules = append(player.Modules, pm)
	}
	if err := db.Where("family_id = ? AND user_id = ?", familyID, userID).Find(&player.Cards).Error; err != nil {
		return player, err
	}
	return player, nil
}

// StatsDays is how far back the statistics of a module go.
const StatsDays = 90

// PersonStats is how one person does with a module: their cards, which the
// web app matches to the module's chapters, and their recent games of it.
type PersonStats struct {
	UserID        int       `json:"userId"`
	Active        bool      `json:"active"`
	DailyCap      int       `json:"dailyCap"`
	UnlockPercent *int      `json:"unlockPercent"`
	Cards         []Card    `json:"cards"`
	Sessions      []Session `json:"sessions"`
}

// ModuleStats is a module and how everyone of the family does with it.
type ModuleStats struct {
	Module   Module          `json:"module"`
	Document json.RawMessage `json:"document"`
	Day      string          `json:"day"`
	People   []PersonStats   `json:"people"`
}

// Stats gathers the statistics of a module, for every member who plays it
// or played it.
func Stats(db *gorm.DB, familyID int, key string, now time.Time) (ModuleStats, error) {
	stats := ModuleStats{Day: Day(familyID, now), People: []PersonStats{}}
	modules, err := Modules(db, familyID, now)
	if err != nil {
		return stats, err
	}
	found := false
	for _, module := range modules {
		if module.Key == key && !module.IsPack() {
			stats.Module, found = module, true
		}
	}
	if !found {
		return stats, ErrNotFound
	}
	stats.Document = json.RawMessage(stats.Module.Content)
	doc, err := Parse([]byte(stats.Module.Content))
	if err != nil {
		return stats, err
	}
	var members []fModel.UserFamily
	if err := db.Where("family_id = ? AND is_active = ?", familyID, true).Order("user_id").Find(&members).Error; err != nil {
		return stats, err
	}
	since := addDays(stats.Day, -StatsDays)
	for _, member := range members {
		person := PersonStats{UserID: member.UserID, Cards: []Card{}, Sessions: []Session{}}
		var activation Activation
		err := db.Where("family_id = ? AND user_id = ? AND module_key = ?", familyID, member.UserID, key).First(&activation).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return stats, err
		}
		person.Active = err == nil
		if err := db.Where("family_id = ? AND user_id = ? AND module_key = ? AND day >= ?", familyID, member.UserID, key, since).
			Order("played_at").Find(&person.Sessions).Error; err != nil {
			return stats, err
		}
		if !person.Active && len(person.Sessions) == 0 {
			continue
		}
		limits, err := loadLimits(db, familyID, member.UserID, modules)
		if err != nil {
			return stats, err
		}
		person.DailyCap = limits.dailyCap(key, activation, doc.Settings.WithDefaults())
		person.UnlockPercent = limits.unlockPercent(key, activation)
		if err := db.Where("family_id = ? AND user_id = ?", familyID, member.UserID).Find(&person.Cards).Error; err != nil {
			return stats, err
		}
		stats.People = append(stats.People, person)
	}
	return stats, nil
}

// Answer is one question of a game.
type Answer struct {
	Key     string `json:"key"`
	Correct bool   `json:"correct"`
	// Almost is "presque" on a card the player graded herself: it neither
	// counts as right nor sends the card back to the start.
	Almost bool   `json:"almost"`
	Given  string `json:"given"`
}

// Game is a game sent by a device once played.
type Game struct {
	ClientID    string    `json:"clientId"`
	UserID      int       `json:"userId"`
	Module      string    `json:"module"`
	PlayedAt    time.Time `json:"playedAt"`
	DurationSec int       `json:"durationSec"`
	Answers     []Answer  `json:"answers"`
}

// Result is what a game earned.
type Result struct {
	Session     Session `json:"session"`
	Cards       []Card  `json:"cards"`
	EarnedToday int     `json:"earnedToday"`
	DailyCap    int     `json:"dailyCap"`
	// TotalEarned is what the day's games earned, all modules together,
	// within TotalCap when a parent set one.
	TotalEarned int  `json:"totalEarned"`
	TotalCap    *int `json:"totalCap"`
	// Capped tells that the stars earned more than the day's cap left.
	Capped bool `json:"capped"`
}

// Limits of a game.
const (
	MinAnswersForHops = 5
	maxAnswers        = 60
	// MaxQuestions is the most questions a parent can ask for in a game.
	MaxQuestions = 40
	maxKey       = 160
	maxGiven     = 120
	// Games played offline are sent later, but not weeks later.
	maxGameAge = 14 * 24 * time.Hour
)

// Stars rates a game: one from the module's threshold, two from 90 %,
// three with no mistake.
func Stars(correct, total, threshold int) int {
	if total == 0 {
		return 0
	}
	percent := correct * 100 / total
	switch {
	case correct == total:
		return 3
	case percent >= 90:
		return 2
	case percent >= threshold:
		return 1
	}
	return 0
}

// Record keeps a game, moves the cards it asked and pays its hops within the
// day's cap. A game already received is answered again without counting
// twice.
func Record(db *gorm.DB, familyID, playedBy int, game Game, now time.Time) (Result, error) {
	var result Result
	game.ClientID = strings.TrimSpace(game.ClientID)
	if len(game.ClientID) < 8 || len(game.ClientID) > 64 {
		return result, invalid("identifiant de partie invalide")
	}
	if len(game.Answers) == 0 || len(game.Answers) > maxAnswers {
		return result, invalid("de 1 à %d réponses par partie", maxAnswers)
	}
	for _, answer := range game.Answers {
		if answer.Key == "" || len(answer.Key) > maxKey {
			return result, invalid("question sans clé")
		}
	}
	if game.PlayedAt.IsZero() || game.PlayedAt.After(now) {
		game.PlayedAt = now
	}
	if now.Sub(game.PlayedAt) > maxGameAge {
		return result, invalid("partie trop ancienne")
	}
	game.DurationSec = max(0, min(game.DurationSec, 4*3600))

	err := db.Transaction(func(tx *gorm.DB) error {
		var existing Session
		err := tx.Where("family_id = ? AND client_id = ?", familyID, game.ClientID).First(&existing).Error
		if err == nil {
			result.Session = existing
			return fillDay(tx, familyID, &result)
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		var activation Activation
		if err := tx.Where("family_id = ? AND user_id = ? AND module_key = ?", familyID, game.UserID, game.Module).
			First(&activation).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotActive
			}
			return err
		}
		var module Module
		if err := tx.Where("family_id = ? AND module_key = ?", familyID, game.Module).First(&module).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotActive
			}
			return err
		}
		doc, err := Parse([]byte(module.Content))
		if err != nil {
			return err
		}
		settings := doc.Settings.WithDefaults()
		var modules []Module
		if err := tx.Where("family_id = ?", familyID).Find(&modules).Error; err != nil {
			return err
		}
		limits, err := loadLimits(tx, familyID, game.UserID, modules)
		if err != nil {
			return err
		}
		result.DailyCap = limits.dailyCap(game.Module, activation, settings)
		result.TotalCap = limits.totalCap()
		settings = limits.settings(game.Module, activation, settings)

		day := Day(familyID, game.PlayedAt)
		session := Session{FamilyID: familyID, ClientID: game.ClientID, UserID: game.UserID, ModuleKey: game.Module,
			Day: day, Total: len(game.Answers), DurationSec: game.DurationSec, PlayedAt: game.PlayedAt.UTC(),
			PlayedBy: playedBy, CreatedAt: now}
		for _, answer := range game.Answers {
			if answer.Correct {
				session.Correct++
			}
		}
		session.Stars = Stars(session.Correct, session.Total, settings.Threshold)
		if session.Total < MinAnswersForHops {
			session.Stars = 0
		}

		var earned int
		if err := tx.Model(&Session{}).Select("COALESCE(SUM(points), 0)").
			Where("family_id = ? AND user_id = ? AND module_key = ? AND day = ?", familyID, game.UserID, game.Module, day).
			Scan(&earned).Error; err != nil {
			return err
		}
		total, err := earnedToday(tx, familyID, game.UserID, day)
		if err != nil {
			return err
		}
		wanted := session.Stars * settings.HopsByStar
		session.Points = max(0, min(wanted, result.DailyCap-earned))
		if result.TotalCap != nil {
			session.Points = max(0, min(session.Points, *result.TotalCap-total))
		}
		result.Capped = session.Points < wanted
		if err := tx.Create(&session).Error; err != nil {
			return err
		}
		if session.Points > 0 {
			reason := fmt.Sprintf("Apprendre : %s %s", module.Name, strings.Repeat("★", session.Stars)+strings.Repeat("☆", 3-session.Stars))
			if err := tx.Model(&fModel.UserFamily{}).Where("user_id = ? AND family_id = ?", game.UserID, familyID).
				Update("points", gorm.Expr("points + ?", session.Points)).Error; err != nil {
				return err
			}
			if err := tx.Create(&ptModel.PointsHistory{Action: ptModel.PointsHistoryActionGame, Points: session.Points,
				UserID: game.UserID, FamilyID: familyID, CreatedBy: playedBy, Reason: &reason, CreatedAt: now}).Error; err != nil {
				return err
			}
		}
		cards, err := moveCards(tx, familyID, game, day)
		if err != nil {
			return err
		}
		result.Session, result.Cards = session, cards
		result.EarnedToday = earned + session.Points
		result.TotalEarned = total + session.Points
		return nil
	})
	return result, err
}

// fillDay answers a game sent again with the day as it stands.
func fillDay(tx *gorm.DB, familyID int, result *Result) error {
	s := result.Session
	if err := tx.Model(&Session{}).Select("COALESCE(SUM(points), 0)").
		Where("family_id = ? AND user_id = ? AND module_key = ? AND day = ?", familyID, s.UserID, s.ModuleKey, s.Day).
		Scan(&result.EarnedToday).Error; err != nil {
		return err
	}
	total, err := earnedToday(tx, familyID, s.UserID, s.Day)
	result.TotalEarned = total
	return err
}

// moveCards applies the answers to the cards, in the order they were given.
func moveCards(tx *gorm.DB, familyID int, game Game, day string) ([]Card, error) {
	cards := map[string]*Card{}
	var order []string
	for _, answer := range game.Answers {
		card, ok := cards[answer.Key]
		if !ok {
			card = &Card{FamilyID: familyID, UserID: game.UserID, Key: answer.Key}
			err := tx.Where("family_id = ? AND user_id = ? AND card_key = ?", familyID, game.UserID, answer.Key).
				First(card).Error
			if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, err
			}
			cards[answer.Key] = card
			order = append(order, answer.Key)
		}
		Review(card, answer, day)
		card.ModuleKey = game.Module
		card.LastSeenAt = game.PlayedAt.UTC()
	}
	out := make([]Card, 0, len(order))
	for _, key := range order {
		if err := tx.Save(cards[key]).Error; err != nil {
			return nil, err
		}
		out = append(out, *cards[key])
	}
	return out, nil
}

// Review moves a card after one answer given on day. The web app applies the
// same rule to games played offline.
func Review(card *Card, answer Answer, day string) {
	card.Seen++
	switch {
	case answer.Correct:
		card.Right++
		card.Box = min(5, max(card.Box, 0)+1)
	case answer.Almost:
		card.Box = max(card.Box, 1)
	default:
		card.Wrong++
		card.Box = 1
		given := strings.TrimSpace(answer.Given)
		if len(given) > maxGiven {
			given = given[:maxGiven]
		}
		card.LastAnswer = given
	}
	card.Due = addDays(day, BoxDays[card.Box])
}
