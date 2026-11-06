package learn

import (
	"errors"
	"strings"
	"time"

	fModel "github.com/nico87lbs/hopla/internal/family/model"
	"gorm.io/gorm"
)

// A parent ticks the packs a person plays, not their levels: the levels open
// by themselves. Before a placement test only the first one is; the test
// opens up to the level reached; then each level opens once the one before
// is known. A parent can set aside a level or a module that is open, never
// open one that is not.

// PackPlayer is a person playing a pack, a pack no other pack gathers.
type PackPlayer struct {
	FamilyID int    `json:"-" gorm:"primaryKey;autoIncrement:false"`
	UserID   int    `json:"userId" gorm:"primaryKey;autoIncrement:false"`
	PackKey  string `json:"pack" gorm:"column:pack_key;primaryKey;size:80"`
	// OpenTo is the highest level open; empty, the first one.
	OpenTo string `json:"openTo" gorm:"column:open_to;size:80"`
	// Excluded are the levels and modules a parent set aside.
	Excluded  []string  `json:"excluded" gorm:"column:excluded;type:text;serializer:json"`
	CreatedAt time.Time `json:"createdAt" gorm:"column:created_at"`
	UpdatedAt time.Time `json:"updatedAt" gorm:"column:updated_at"`
}

func (PackPlayer) TableName() string { return "learn_pack_players" }

// PackPlayers lists who plays which pack in a family, or for one person.
func PackPlayers(db *gorm.DB, familyID int, userID *int) ([]PackPlayer, error) {
	rows := []PackPlayer{}
	query := db.Where("family_id = ?", familyID)
	if userID != nil {
		query = query.Where("user_id = ?", *userID)
	}
	return rows, query.Order("user_id, pack_key").Find(&rows).Error
}

func levelIndex(levels []TestLevel, key string) int {
	for i, level := range levels {
		if level.ID == key {
			return i
		}
	}
	return 0
}

// openLevels tells which levels are open: up to OpenTo, or only that one
// when the last test keeps only the level reached.
func openLevels(levels []TestLevel, player PackPlayer, placement *Placement) (from, to int) {
	to = levelIndex(levels, player.OpenTo)
	if placement != nil && placement.Status == PlacementDone && placement.Keep == KeepOnly {
		return to, to
	}
	return 0, to
}

func placementOf(tx *gorm.DB, familyID, userID int, pack string) (*Placement, error) {
	var placement Placement
	err := tx.Where("family_id = ? AND user_id = ? AND pack_key = ?", familyID, userID, pack).First(&placement).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &placement, err
}

// syncPack turns on the modules of the open levels not set aside, and off
// the others of the pack.
func syncPack(tx *gorm.DB, familyID int, player PackPlayer, levels []TestLevel, now time.Time) error {
	placement, err := placementOf(tx, familyID, player.UserID, player.PackKey)
	if err != nil {
		return err
	}
	from, to := openLevels(levels, player, placement)
	aside := map[string]bool{}
	forced := map[string]bool{}
	for _, key := range player.Excluded {
		switch {
		case strings.HasPrefix(key, "force-open:"):
			forced[strings.TrimPrefix(key, "force-open:")] = true
		case strings.HasPrefix(key, chapterOpen), strings.HasPrefix(key, chapterShut):
			// A chapter's access does not turn a module on or off.
		default:
			aside[key] = true
		}
	}
	var on, off []string
	for i, level := range levels {
		open := (i >= from && i <= to || forced[level.ID]) && !aside[level.ID]
		for _, module := range level.Modules {
			if open && !aside[module.ID] {
				on = append(on, module.ID)
			} else {
				off = append(off, module.ID)
			}
		}
	}
	for _, change := range []struct {
		keys   []string
		active bool
	}{{off, false}, {on, true}} {
		if len(change.keys) == 0 {
			continue
		}
		if err := SetActivation(tx, familyID, ActivationChange{UserID: player.UserID, Modules: change.keys,
			Active: change.active}, now); err != nil {
			return err
		}
	}
	return nil
}

// syncPacks applies again what each person's packs open, such as after an
// update brought new modules.
func syncPacks(tx *gorm.DB, familyID int, modules []Module, now time.Time) error {
	players, err := PackPlayers(tx, familyID, nil)
	if err != nil {
		return err
	}
	for _, player := range players {
		_, levels, err := testLevels(modules, player.PackKey)
		if err != nil {
			continue
		}
		if err := syncPack(tx, familyID, player, levels, now); err != nil {
			return err
		}
	}
	return nil
}

func isMember(tx *gorm.DB, familyID, userID int) error {
	err := tx.Where("user_id = ? AND family_id = ?", userID, familyID).First(&fModel.UserFamily{}).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return invalid("cette personne n'est pas de la famille")
	}
	return err
}

// SetPackPlayer ticks a pack for a person, or unticks it. Ticked, the
// levels open as the person's last test says, or the first one alone.
func SetPackPlayer(db *gorm.DB, familyID, userID int, pack string, on bool, now time.Time) error {
	modules, err := Modules(db, familyID, now)
	if err != nil {
		return err
	}
	_, levels, err := testLevels(modules, pack)
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		if err := isMember(tx, familyID, userID); err != nil {
			return err
		}
		where := tx.Where("family_id = ? AND user_id = ? AND pack_key = ?", familyID, userID, pack)
		if !on {
			if err := where.Delete(&PackPlayer{}).Error; err != nil {
				return err
			}
			return SetActivation(tx, familyID, ActivationChange{UserID: userID, Modules: []string{pack}}, now)
		}
		player := PackPlayer{FamilyID: familyID, UserID: userID, PackKey: pack, Excluded: []string{}, CreatedAt: now}
		if err := where.Attrs(player).FirstOrInit(&player).Error; err != nil {
			return err
		}
		if player.OpenTo == "" {
			placement, err := placementOf(tx, familyID, userID, pack)
			if err != nil {
				return err
			}
			if placement != nil && placement.Status == PlacementDone {
				player.OpenTo = placement.Reached
			}
		}
		player.UpdatedAt = now
		if err := tx.Save(&player).Error; err != nil {
			return err
		}
		return syncPack(tx, familyID, player, levels, now)
	})
}

// SetAside sets a level or a module of a pack aside for a person, or brings
// it back. Bringing back never opens a level not open yet.
func SetAside(db *gorm.DB, familyID, userID int, pack, key string, aside bool, now time.Time) error {
	modules, err := Modules(db, familyID, now)
	if err != nil {
		return err
	}
	_, levels, err := testLevels(modules, pack)
	if err != nil {
		return err
	}
	in := false
	for _, level := range levels {
		in = in || (level.ID == key && len(levels) > 1)
		for _, module := range level.Modules {
			in = in || module.ID == key
		}
	}
	if !in {
		return invalid("ce niveau ou ce module n'est pas dans le paquet")
	}
	return db.Transaction(func(tx *gorm.DB) error {
		var player PackPlayer
		if err := tx.Where("family_id = ? AND user_id = ? AND pack_key = ?", familyID, userID, pack).First(&player).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return invalid("cette personne ne joue pas à ce paquet")
			}
			return err
		}
		kept := []string{}
		for _, k := range player.Excluded {
			if k != key {
				kept = append(kept, k)
			}
		}
		if aside {
			kept = append(kept, key)
		}
		player.Excluded, player.UpdatedAt = kept, now
		if err := tx.Save(&player).Error; err != nil {
			return err
		}
		return syncPack(tx, familyID, player, levels, now)
	})
}

// What a parent chose for one chapter, kept with the levels and modules set
// aside as "chapitre-ouvert:module/chapitre" and "chapitre-ferme:module/chapitre".
const (
	chapterOpen = "chapitre-ouvert:"
	chapterShut = "chapitre-ferme:"
)

// ChapterAccess tells which chapters a parent opened or closed for a
// person, by module: the chapter ids.
func ChapterAccess(players []PackPlayer) (opened, shut map[string][]string) {
	opened, shut = map[string][]string{}, map[string][]string{}
	for _, player := range players {
		for _, key := range player.Excluded {
			target, prefix := opened, chapterOpen
			if strings.HasPrefix(key, chapterShut) {
				target, prefix = shut, chapterShut
			} else if !strings.HasPrefix(key, chapterOpen) {
				continue
			}
			if module, chapter, ok := strings.Cut(strings.TrimPrefix(key, prefix), "/"); ok {
				target[module] = append(target[module], chapter)
			}
		}
	}
	return opened, shut
}

// SetChapterAccess chooses how chapters open for a person, each given as
// "module/chapitre": auto follows the tests and the progression, open forces
// them on, locked keeps them off. A parent's choice stays after a test.
func SetChapterAccess(db *gorm.DB, familyID, userID int, pack string, chapters []string, mode string, now time.Time) error {
	if mode != "auto" && mode != "open" && mode != "locked" {
		return invalid("mode d'ouverture invalide")
	}
	if len(chapters) == 0 || len(chapters) > 500 {
		return invalid("de 1 à 500 chapitres")
	}
	modules, err := Modules(db, familyID, now)
	if err != nil {
		return err
	}
	_, levels, err := testLevels(modules, pack)
	if err != nil {
		return err
	}
	known := map[string]bool{}
	for _, level := range levels {
		for _, module := range level.Modules {
			doc, err := Parse(module.Document)
			if err != nil {
				continue
			}
			for _, chapter := range doc.Chapters {
				known[module.ID+"/"+chapter.ID] = true
			}
		}
	}
	changed := map[string]bool{}
	for _, chapter := range chapters {
		if !known[chapter] {
			return invalid("ce chapitre n'est pas dans le paquet")
		}
		changed[chapter] = true
	}
	return db.Transaction(func(tx *gorm.DB) error {
		var player PackPlayer
		if err := tx.Where("family_id = ? AND user_id = ? AND pack_key = ?", familyID, userID, pack).First(&player).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return invalid("cette personne ne joue pas à ce paquet")
			}
			return err
		}
		kept := make([]string, 0, len(player.Excluded)+len(changed))
		for _, item := range player.Excluded {
			chapter := strings.TrimPrefix(strings.TrimPrefix(item, chapterOpen), chapterShut)
			if chapter != item && changed[chapter] {
				continue
			}
			kept = append(kept, item)
		}
		for _, chapter := range chapters {
			switch mode {
			case "open":
				kept = append(kept, chapterOpen+chapter)
			case "locked":
				kept = append(kept, chapterShut+chapter)
			}
		}
		player.Excluded, player.UpdatedAt = kept, now
		return tx.Save(&player).Error
	})
}

// SetPackAccess chooses how a level is opened: auto follows the placement
// and mastery progression, open forces it on, and locked keeps it off.
func SetPackAccess(db *gorm.DB, familyID, userID int, pack, key, mode string, now time.Time) error {
	if mode != "auto" && mode != "open" && mode != "locked" {
		return invalid("mode d'ouverture invalide")
	}
	modules, err := Modules(db, familyID, now)
	if err != nil {
		return err
	}
	_, levels, err := testLevels(modules, pack)
	if err != nil {
		return err
	}
	found := false
	for _, level := range levels {
		found = found || level.ID == key
	}
	if !found {
		return invalid("ce niveau n'est pas dans le paquet")
	}
	return db.Transaction(func(tx *gorm.DB) error {
		var player PackPlayer
		if err := tx.Where("family_id = ? AND user_id = ? AND pack_key = ?", familyID, userID, pack).First(&player).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return invalid("cette personne ne joue pas à ce paquet")
			}
			return err
		}
		kept := make([]string, 0, len(player.Excluded)+1)
		for _, item := range player.Excluded {
			if item != key && item != "force-open:"+key {
				kept = append(kept, item)
			}
		}
		switch mode {
		case "open":
			kept = append(kept, "force-open:"+key)
		case "locked":
			kept = append(kept, key)
		}
		player.Excluded, player.UpdatedAt = kept, now
		if err := tx.Save(&player).Error; err != nil {
			return err
		}
		return syncPack(tx, familyID, player, levels, now)
	})
}

// OpenNextLevel opens the level after the highest one open, once the device
// found that one known. It does nothing past the last level.
func OpenNextLevel(db *gorm.DB, familyID, userID int, pack string, now time.Time) (PackPlayer, error) {
	var player PackPlayer
	modules, err := Modules(db, familyID, now)
	if err != nil {
		return player, err
	}
	_, levels, err := testLevels(modules, pack)
	if err != nil {
		return player, err
	}
	err = db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("family_id = ? AND user_id = ? AND pack_key = ?", familyID, userID, pack).First(&player).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return invalid("cette personne ne joue pas à ce paquet")
			}
			return err
		}
		at := levelIndex(levels, player.OpenTo)
		if at+1 >= len(levels) {
			return nil
		}
		player.OpenTo, player.UpdatedAt = levels[at+1].ID, now
		if err := tx.Save(&player).Error; err != nil {
			return err
		}
		return syncPack(tx, familyID, player, levels, now)
	})
	return player, err
}

// placePack opens a pack as a test reached, for a person who now plays it.
func placePack(tx *gorm.DB, familyID int, placement Placement, levels []TestLevel, now time.Time) error {
	player := PackPlayer{FamilyID: familyID, UserID: placement.UserID, PackKey: placement.PackKey,
		Excluded: []string{}, CreatedAt: now}
	if err := tx.Where("family_id = ? AND user_id = ? AND pack_key = ?", familyID, placement.UserID, placement.PackKey).
		Attrs(player).FirstOrInit(&player).Error; err != nil {
		return err
	}
	if placement.Status == PlacementDone {
		player.OpenTo = placement.Reached
	}
	player.UpdatedAt = now
	if err := tx.Save(&player).Error; err != nil {
		return err
	}
	return syncPack(tx, familyID, player, levels, now)
}

// MigratePackPlayers ticks, once, the packs people played module by module.
// A person who played every level starts again at the first one, as before
// a test; one who played only higher levels keeps them open, the levels
// below set aside.
func MigratePackPlayers(db *gorm.DB) error {
	type pair struct {
		FamilyID int
		UserID   int
	}
	var pairs []pair
	if err := db.Model(&Activation{}).Distinct("family_id", "user_id").Find(&pairs).Error; err != nil {
		return err
	}
	now := time.Now().UTC()
	for _, p := range pairs {
		err := db.Transaction(func(tx *gorm.DB) error {
			var modules []Module
			if err := tx.Where("family_id = ?", p.FamilyID).Find(&modules).Error; err != nil {
				return err
			}
			var keys []string
			if err := tx.Model(&Activation{}).Where("family_id = ? AND user_id = ?", p.FamilyID, p.UserID).
				Pluck("module_key", &keys).Error; err != nil {
				return err
			}
			active := map[string]bool{}
			for _, key := range keys {
				active[key] = true
			}
			var known []string
			if err := tx.Model(&PackPlayer{}).Where("family_id = ? AND user_id = ?", p.FamilyID, p.UserID).
				Pluck("pack_key", &known).Error; err != nil {
				return err
			}
			done := map[string]bool{}
			for _, key := range known {
				done[key] = true
			}
			for _, pack := range modules {
				if done[pack.Key] {
					continue
				}
				_, levels, err := testLevels(modules, pack.Key)
				if err != nil {
					continue
				}
				lowest := -1
				for i, level := range levels {
					for _, module := range level.Modules {
						if active[module.ID] && lowest < 0 {
							lowest = i
						}
					}
				}
				if lowest < 0 {
					continue
				}
				player := PackPlayer{FamilyID: p.FamilyID, UserID: p.UserID, PackKey: pack.Key,
					OpenTo: levels[lowest].ID, Excluded: []string{}, CreatedAt: now, UpdatedAt: now}
				placement, err := placementOf(tx, p.FamilyID, p.UserID, pack.Key)
				if err != nil {
					return err
				}
				if placement != nil && placement.Status == PlacementDone {
					player.OpenTo = placement.Reached
				}
				for _, level := range levels[:levelIndex(levels, player.OpenTo)+1] {
					any := false
					for _, module := range level.Modules {
						any = any || active[module.ID]
					}
					switch {
					case !any && len(levels) > 1:
						player.Excluded = append(player.Excluded, level.ID)
					default:
						for _, module := range level.Modules {
							if !active[module.ID] {
								player.Excluded = append(player.Excluded, module.ID)
							}
						}
					}
				}
				if err := tx.Create(&player).Error; err != nil {
					return err
				}
				if err := syncPack(tx, p.FamilyID, player, levels, now); err != nil {
					return err
				}
			}
			return nil
		})
		if err != nil {
			return err
		}
	}
	return nil
}
