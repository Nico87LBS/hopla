package learn

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// A pack the family writes in the editor is one file: chapters that each
// name their level and their group. It is installed as the catalogue's packs
// are, so that it plays and shows exactly like them: a pack of levels, each
// a pack of modules, one module by group; without levels, a pack of modules.
// The file stays with the pack (Module.Source): the editor opens it and
// sharing the pack sends it.

// cutPart is one document of a pack cut from a file.
type cutPart struct {
	Raw []byte
	Doc Document
}

// familyTree is a file cut into documents, with where each card and each
// chapter went.
type familyTree struct {
	Root   cutPart
	Levels []cutPart
	Leaves []cutPart
	// CardOwner and ChapterOwner give the module of each card and chapter.
	CardOwner    map[string]string
	ChapterOwner map[string]string
}

// keys are the ids of the tree, the pack first.
func (t familyTree) keys() map[string]bool {
	out := map[string]bool{t.Root.Doc.ID: true}
	for _, parts := range [][]cutPart{t.Levels, t.Leaves} {
		for _, part := range parts {
			out[part.Doc.ID] = true
		}
	}
	return out
}

// levelIDs are the levels of the tree as a test reads them: the pack itself
// when it has none.
func (t familyTree) levelIDs() []string {
	if len(t.Levels) == 0 {
		return []string{t.Root.Doc.ID}
	}
	out := make([]string, 0, len(t.Levels))
	for _, level := range t.Levels {
		out = append(out, level.Doc.ID)
	}
	return out
}

// cuttable tells whether a module written by the family is cut into a pack:
// a module of written cards, not a pack nor one of generated questions.
func cuttable(doc Document) bool { return !doc.IsPack() && len(doc.Generators) == 0 }

// The header fields a pack and its levels keep; the modules keep every
// field but those.
var (
	packFields = []string{"format", "version", "icone", "description", "matiere", "public", "langue",
		"auteur", "sources"}
	notInModules = map[string]bool{"id": true, "nom": true, "niveaux": true, "chapitres": true, "fiches": true,
		"modules": true, "description": true, "sources": true, "prerequis": true}
)

// prereqTarget finds the module a prerequisite names once the packs of the
// family are cut: the module of its chapter, or the last module of a pack
// named as a whole. ok is false to leave it as it is.
type prereqTarget func(p Prereq) (module string, ok bool)

// cutFamilyFile cuts a file into its pack, levels and modules. Ids already
// taken are left aside; the ids of the modules follow the names of the
// levels and groups, so that saving again keeps them.
func cutFamilyFile(raw []byte, doc Document, taken map[string]bool, target prereqTarget) (familyTree, error) {
	tree := familyTree{CardOwner: map[string]string{}, ChapterOwner: map[string]string{}}
	var header map[string]json.RawMessage
	if err := json.Unmarshal(raw, &header); err != nil {
		return tree, err
	}
	var chapters, cards []map[string]json.RawMessage
	if err := json.Unmarshal(header["chapitres"], &chapters); err != nil {
		return tree, err
	}
	if err := json.Unmarshal(header["fiches"], &cards); err != nil {
		return tree, err
	}
	if len(chapters) != len(doc.Chapters) || len(cards) != len(doc.Cards) {
		return tree, fmt.Errorf("module %s : chapitres ou fiches illisibles", doc.ID)
	}

	// A chapter without a level is in the level of the one before; those
	// before the first level named are in that level.
	levelOf := make([]string, len(doc.Chapters))
	current := ""
	for _, chapter := range doc.Chapters {
		if name := strings.TrimSpace(chapter.Level); name != "" {
			current = name
			break
		}
	}
	type place struct{ level, group string }
	var levels []string
	groups := map[string][]place{}
	members := map[place][]int{}
	for i, chapter := range doc.Chapters {
		if name := strings.TrimSpace(chapter.Level); name != "" {
			current = name
		}
		levelOf[i] = current
		at := place{current, strings.TrimSpace(chapter.Group)}
		if _, ok := groups[at.level]; !ok {
			levels = append(levels, at.level)
		}
		if _, ok := members[at]; !ok {
			groups[at.level] = append(groups[at.level], at)
		}
		members[at] = append(members[at], i)
	}
	cardsOf := map[string][]int{}
	for i, card := range doc.Cards {
		cardsOf[card.Chapter] = append(cardsOf[card.Chapter], i)
	}

	assigned := map[string]bool{doc.ID: true}
	newID := func(parts ...string) string {
		base := doc.ID
		for _, part := range parts {
			if s := Slug(part); s != "" {
				base += "-" + s
			}
		}
		fit := func(id string, room int) string {
			if len(id) > room {
				id = strings.TrimRight(id[:room], "-")
			}
			return id
		}
		id := fit(base, 80)
		for n := 2; taken[id] || assigned[id]; n++ {
			suffix := fmt.Sprintf("-%d", n)
			id = fit(base, 80-len(suffix)) + suffix
		}
		assigned[id] = true
		return id
	}
	pick := func(fields []string) map[string]json.RawMessage {
		out := map[string]json.RawMessage{}
		for _, field := range fields {
			if value, ok := header[field]; ok {
				out[field] = value
			}
		}
		return out
	}
	quote := func(v any) json.RawMessage {
		out, _ := json.Marshal(v)
		return out
	}
	part := func(fields map[string]json.RawMessage) (cutPart, error) {
		out, err := json.Marshal(fields)
		if err != nil {
			return cutPart{}, err
		}
		parsed, err := Parse(out)
		if err != nil {
			return cutPart{}, err
		}
		return cutPart{Raw: out, Doc: parsed}, nil
	}

	named := len(levels) > 1 || levels[0] != ""
	var rootChildren []string
	type leafPlan struct {
		id       string
		name     string
		level    string
		chapters []int
	}
	var plans []leafPlan
	levelIDs := map[string]string{}
	for _, level := range levels {
		if named {
			levelIDs[level] = newID(level)
			rootChildren = append(rootChildren, levelIDs[level])
		}
		for _, at := range groups[level] {
			count := 0
			for _, i := range members[at] {
				count += len(cardsOf[doc.Chapters[i].ID])
			}
			if count == 0 {
				// A module asks at least one question: chapters without any
				// wait in the file.
				continue
			}
			name := at.group
			if name == "" {
				name = doc.Name
			}
			parts := []string{name}
			if named {
				parts = []string{level, name}
			}
			plan := leafPlan{id: newID(parts...), name: name, level: level, chapters: members[at]}
			plans = append(plans, plan)
			if !named {
				rootChildren = append(rootChildren, plan.id)
			}
		}
	}
	for _, plan := range plans {
		for _, i := range plan.chapters {
			tree.ChapterOwner[doc.Chapters[i].ID] = plan.id
			for _, c := range cardsOf[doc.Chapters[i].ID] {
				tree.CardOwner[doc.Cards[c].ID] = plan.id
			}
		}
	}

	// The prerequisites follow the modules they name; one on this pack
	// itself would keep it closed for ever.
	var prereqs []Prereq
	for _, p := range doc.Prerequisites {
		if p.Module == doc.ID {
			continue
		}
		if module, ok := target(p); ok {
			p.Module = module
		}
		prereqs = append(prereqs, p)
	}

	for _, plan := range plans {
		fields := map[string]json.RawMessage{}
		for field, value := range header {
			if !notInModules[field] {
				fields[field] = value
			}
		}
		fields["id"], fields["nom"] = quote(plan.id), quote(plan.name)
		if named {
			fields["niveaux"] = quote([]string{plan.level})
		} else if value, ok := header["niveaux"]; ok {
			fields["niveaux"] = value
		}
		var own, owned []map[string]json.RawMessage
		for n, i := range plan.chapters {
			chapter := map[string]json.RawMessage{}
			for field, value := range chapters[i] {
				chapter[field] = value
			}
			delete(chapter, "niveau")
			delete(chapter, "groupe")
			if n == 0 {
				// The first chapter of a module is open, as in every module.
				delete(chapter, "ouvert_apres")
			}
			own = append(own, chapter)
			for _, c := range cardsOf[doc.Chapters[i].ID] {
				owned = append(owned, cards[c])
			}
		}
		fields["chapitres"], fields["fiches"] = quote(own), quote(owned)
		if len(prereqs) > 0 {
			fields["prerequis"] = quote(prereqs)
		}
		leaf, err := part(fields)
		if err != nil {
			return tree, err
		}
		tree.Leaves = append(tree.Leaves, leaf)
	}
	if named {
		for _, level := range levels {
			var children []string
			for _, plan := range plans {
				if plan.level == level {
					children = append(children, plan.id)
				}
			}
			if len(children) == 0 {
				continue
			}
			fields := pick(packFields)
			fields["id"], fields["nom"] = quote(levelIDs[level]), quote(level)
			fields["niveaux"], fields["modules"] = quote([]string{level}), quote(children)
			lvl, err := part(fields)
			if err != nil {
				return tree, err
			}
			tree.Levels = append(tree.Levels, lvl)
		}
		rootChildren = rootChildren[:0]
		for _, level := range tree.Levels {
			rootChildren = append(rootChildren, level.Doc.ID)
		}
	}
	if len(rootChildren) == 0 {
		return tree, fmt.Errorf("module %s : aucune fiche", doc.ID)
	}
	fields := pick(append(packFields, "niveaux"))
	fields["id"], fields["nom"], fields["modules"] = quote(doc.ID), header["nom"], quote(rootChildren)
	root, err := part(fields)
	if err != nil {
		return tree, err
	}
	tree.Root = root
	return tree, nil
}

// treeOf gathers a module and, for a pack, every module under it, by key.
func treeOf(byKey map[string]Module, key string, out map[string]Module) {
	module, ok := byKey[key]
	if !ok || out[key].Key != "" {
		return
	}
	out[key] = module
	for _, child := range module.Children {
		if m, ok := byKey[child]; ok && !m.Builtin {
			treeOf(byKey, child, out)
		}
	}
}

// leavesOf are the modules with questions under a pack, in order.
func leavesOf(byKey map[string]Module, key string) []Module {
	module, ok := byKey[key]
	if !ok {
		return nil
	}
	if !module.IsPack() {
		return []Module{module}
	}
	var out []Module
	for _, child := range module.Children {
		out = append(out, leavesOf(byKey, child)...)
	}
	return out
}

// familyTargets finds the modules of the packs the family wrote, for the
// prerequisites that name one of them or one of its chapters.
func familyTargets(installed []Module, skip map[string]bool) prereqTarget {
	byKey := map[string]Module{}
	for _, module := range installed {
		byKey[module.Key] = module
	}
	return func(p Prereq) (string, bool) {
		pack, ok := byKey[p.Module]
		if !ok || skip[p.Module] || !pack.Editable || !pack.IsPack() {
			return "", false
		}
		leaves := leavesOf(byKey, p.Module)
		if len(leaves) == 0 {
			return "", false
		}
		if p.Chapter != "" {
			for _, leaf := range leaves {
				doc, err := Parse([]byte(leaf.Content))
				if err != nil {
					continue
				}
				for _, chapter := range doc.Chapters {
					if chapter.ID == p.Chapter {
						return leaf.Key, true
					}
				}
			}
		}
		return leaves[len(leaves)-1].Key, true
	}
}

// installFamilyFile installs a file of the family as a pack cut from it, in
// place of what it was before: the same file cut again, or a single module
// of old. What people know, play, set and reported follows the cards and
// the chapters to their modules.
func installFamilyFile(tx *gorm.DB, familyID int, raw []byte, doc Document, entries map[string]Entry, now time.Time) (Module, error) {
	var installed []Module
	if err := tx.Where("family_id = ?", familyID).Find(&installed).Error; err != nil {
		return Module{}, err
	}
	byKey := map[string]Module{}
	for _, module := range installed {
		byKey[module.Key] = module
	}
	old := map[string]Module{}
	if module, ok := byKey[doc.ID]; ok && !module.Builtin {
		treeOf(byKey, doc.ID, old)
	}
	taken := map[string]bool{}
	for key := range entries {
		taken[key] = true
	}
	for key := range byKey {
		if _, mine := old[key]; !mine {
			taken[key] = true
		}
	}
	skip := map[string]bool{doc.ID: true}
	for key := range old {
		skip[key] = true
	}
	tree, err := cutFamilyFile(raw, doc, taken, familyTargets(installed, skip))
	if err != nil {
		return Module{}, InvalidError{Reason: err.Error()}
	}
	if err := checkKeys(tx, familyID, doc, entries, skip); err != nil {
		return Module{}, err
	}
	for _, parts := range [][]cutPart{tree.Leaves, tree.Levels} {
		for _, part := range parts {
			if err := save(tx, moduleFrom(familyID, part.Doc, part.Raw, false, now)); err != nil {
				return Module{}, err
			}
		}
	}
	root := moduleFrom(familyID, tree.Root.Doc, tree.Root.Raw, false, now)
	root.Source, root.Editable = string(raw), true
	if err := save(tx, root); err != nil {
		return Module{}, err
	}
	if err := moveFamilyData(tx, familyID, doc.ID, old, tree, now); err != nil {
		return Module{}, err
	}
	var modules []Module
	if err := tx.Where("family_id = ?", familyID).Find(&modules).Error; err != nil {
		return Module{}, err
	}
	return root, syncPacks(tx, familyID, modules, now)
}

// moveFamilyData carries over what the modules of old held to the modules
// of the tree that took their cards and chapters, then removes the modules
// the tree no longer has.
func moveFamilyData(tx *gorm.DB, familyID int, root string, old map[string]Module, tree familyTree, now time.Time) error {
	kept := tree.keys()
	oldCards := map[string][]string{} // module → its cards
	for key, module := range old {
		if module.IsPack() {
			continue
		}
		doc, err := Parse([]byte(module.Content))
		if err != nil {
			continue
		}
		for _, card := range doc.Cards {
			oldCards[key] = append(oldCards[key], card.ID)
		}
	}
	firstLeaf := tree.Leaves[0].Doc.ID
	// heir is the module that took most of the cards of a module gone.
	heir := func(module string) string {
		count := map[string]int{}
		best, most := firstLeaf, 0
		for _, card := range oldCards[module] {
			if to := tree.CardOwner[card]; to != "" {
				count[to]++
				if count[to] > most {
					best, most = to, count[to]
				}
			}
		}
		return best
	}

	// What people know of a card is named after its module, as
	// module:card: it follows the card.
	for from, cards := range oldCards {
		moves := map[string]string{}
		for _, card := range cards {
			if to := tree.CardOwner[card]; to != "" && to != from {
				moves[card] = to
			}
		}
		if len(moves) == 0 {
			continue
		}
		prefix := from + ":"
		like := strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_").Replace(prefix) + "%"
		var keys []string
		for _, table := range []any{&Card{}, &ReviewLog{}, &Report{}} {
			var found []string
			if err := tx.Model(table).Where("family_id = ? AND card_key LIKE ? ESCAPE '\\'", familyID, like).
				Distinct().Pluck("card_key", &found).Error; err != nil {
				return err
			}
			keys = append(keys, found...)
		}
		renamed := map[string]string{}
		for _, key := range keys {
			rest := strings.TrimPrefix(key, prefix)
			best := ""
			for card := range moves {
				if (rest == card || strings.HasPrefix(rest, card+":")) && len(card) > len(best) {
					best = card
				}
			}
			if best != "" {
				renamed[key] = moves[best] + ":" + rest
			}
		}
		for oldKey, newKey := range renamed {
			module := strings.SplitN(newKey, ":", 2)[0]
			var users []int
			if err := tx.Model(&Card{}).Where("family_id = ? AND card_key = ?", familyID, oldKey).
				Pluck("user_id", &users).Error; err != nil {
				return err
			}
			for _, user := range users {
				var count int64
				if err := tx.Model(&Card{}).Where("family_id = ? AND user_id = ? AND card_key = ?", familyID, user, newKey).
					Count(&count).Error; err != nil {
					return err
				}
				if count > 0 {
					continue
				}
				if err := tx.Model(&Card{}).Where("family_id = ? AND user_id = ? AND card_key = ?", familyID, user, oldKey).
					Updates(map[string]any{"card_key": newKey, "module_key": module}).Error; err != nil {
					return err
				}
			}
			for _, table := range []any{&ReviewLog{}, &Report{}} {
				if err := tx.Model(table).Where("family_id = ? AND card_key = ?", familyID, oldKey).
					Update("card_key", newKey).Error; err != nil {
					return err
				}
			}
			if err := tx.Model(&ReviewLog{}).Where("family_id = ? AND card_key = ?", familyID, newKey).
				Update("module_key", module).Error; err != nil {
				return err
			}
		}
	}

	// The family's corrections and reports follow their cards.
	for from, cards := range oldCards {
		for _, card := range cards {
			to := tree.CardOwner[card]
			if to == "" || to == from {
				continue
			}
			var count int64
			if err := tx.Model(&CardEdit{}).Where("family_id = ? AND module_key = ? AND card_id = ?", familyID, to, card).
				Count(&count).Error; err != nil {
				return err
			}
			if count == 0 {
				if err := tx.Model(&CardEdit{}).Where("family_id = ? AND module_key = ? AND card_id = ?", familyID, from, card).
					Update("module_key", to).Error; err != nil {
					return err
				}
			}
			if err := tx.Model(&Report{}).Where("family_id = ? AND module_key = ? AND card_id = ?", familyID, from, card).
				Update("module_key", to).Error; err != nil {
				return err
			}
		}
	}

	var gone []string
	for key := range old {
		if !kept[key] {
			gone = append(gone, key)
		}
	}
	// The modules whose games and settings move: those gone, and the single
	// module of old now the pack.
	moving := append([]string{}, gone...)
	if module, ok := old[root]; ok && !module.IsPack() {
		moving = append(moving, root)
	}
	for _, key := range moving {
		if old[key].IsPack() {
			continue
		}
		to := heir(key)
		for _, table := range []any{&Session{}, &ReviewLog{}, &Card{}, &Report{}} {
			if err := tx.Model(table).Where("family_id = ? AND module_key = ?", familyID, key).
				Update("module_key", to).Error; err != nil {
				return err
			}
		}
	}

	if len(moving) > 0 {
		// Whoever played a module gone plays the pack, with the settings
		// they had on it.
		var activations []Activation
		if err := tx.Where("family_id = ? AND module_key IN ?", familyID, moving).Find(&activations).Error; err != nil {
			return err
		}
		for _, a := range activations {
			if err := mergeSettings(tx, familyID, a.UserID, root, a.DailyCap, a.UnlockPercent, a.GameSettings, now); err != nil {
				return err
			}
			if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&PackPlayer{FamilyID: familyID,
				UserID: a.UserID, PackKey: root, OpenTo: tree.levelIDs()[0], Excluded: []string{},
				CreatedAt: now, UpdatedAt: now}).Error; err != nil {
				return err
			}
		}
		if err := tx.Where("family_id = ? AND module_key IN ?", familyID, moving).Delete(&Activation{}).Error; err != nil {
			return err
		}
	}
	if len(gone) > 0 {
		var settings []PersonSetting
		if err := tx.Where("family_id = ? AND scope IN ?", familyID, gone).Find(&settings).Error; err != nil {
			return err
		}
		for _, s := range settings {
			if err := mergeSettings(tx, familyID, s.UserID, root, s.DailyCap, s.UnlockPercent, s.GameSettings, now); err != nil {
				return err
			}
		}
		for _, table := range []any{&Module{}, &CardEdit{}} {
			if err := tx.Where("family_id = ? AND module_key IN ?", familyID, gone).Delete(table).Error; err != nil {
				return err
			}
		}
		if err := tx.Where("family_id = ? AND scope IN ?", familyID, gone).Delete(&PersonSetting{}).Error; err != nil {
			return err
		}
	}

	// What a parent chose and a test opened follows the chapters; a level
	// gone leaves the first one.
	levels := tree.levelIDs()
	isLevel := map[string]bool{}
	for _, level := range levels {
		isLevel[level] = true
	}
	chapter := func(key string) (string, bool) {
		_, id, ok := strings.Cut(key, "/")
		if !ok {
			return "", false
		}
		owner := tree.ChapterOwner[id]
		return owner + "/" + id, owner != ""
	}
	var players []PackPlayer
	if err := tx.Where("family_id = ? AND pack_key = ?", familyID, root).Find(&players).Error; err != nil {
		return err
	}
	for _, player := range players {
		excluded := []string{}
		seen := map[string]bool{}
		add := func(item string) {
			if !seen[item] {
				seen[item] = true
				excluded = append(excluded, item)
			}
		}
		for _, item := range player.Excluded {
			switch {
			case strings.HasPrefix(item, chapterOpen), strings.HasPrefix(item, chapterShut):
				prefix := chapterOpen
				if strings.HasPrefix(item, chapterShut) {
					prefix = chapterShut
				}
				if key, ok := chapter(strings.TrimPrefix(item, prefix)); ok {
					add(prefix + key)
				}
			case strings.HasPrefix(item, "force-open:"):
				if isLevel[strings.TrimPrefix(item, "force-open:")] {
					add(item)
				}
			case item == root:
				// The single module of old set aside: all its modules now.
				for _, leaf := range tree.Leaves {
					add(leaf.Doc.ID)
				}
			case kept[item]:
				add(item)
			}
		}
		player.Excluded = excluded
		if player.OpenTo != "" && !isLevel[player.OpenTo] {
			player.OpenTo = levels[0]
		}
		player.UpdatedAt = now
		if err := tx.Save(&player).Error; err != nil {
			return err
		}
	}
	var placements []Placement
	if err := tx.Where("family_id = ? AND pack_key = ?", familyID, root).Find(&placements).Error; err != nil {
		return err
	}
	for _, placement := range placements {
		opened := []string{}
		for _, item := range placement.Opened {
			if key, ok := chapter(item); ok {
				opened = append(opened, key)
			}
		}
		placement.Opened = opened
		if placement.Reached != "" && !isLevel[placement.Reached] {
			placement.Reached = levels[0]
		}
		if err := tx.Save(&placement).Error; err != nil {
			return err
		}
	}
	return nil
}

// mergeSettings sets on a pack, for a person or the family, the settings it
// does not have yet.
func mergeSettings(tx *gorm.DB, familyID, userID int, scope string, dailyCap, unlock *int, game GameSettings, now time.Time) error {
	if dailyCap == nil && unlock == nil && game.empty() {
		return nil
	}
	row := PersonSetting{FamilyID: familyID, UserID: userID, Scope: scope}
	if err := tx.Where(&row).FirstOrInit(&row).Error; err != nil {
		return err
	}
	for _, f := range []struct{ to, from **int }{
		{&row.DailyCap, &dailyCap}, {&row.UnlockPercent, &unlock},
		{&row.Questions, &game.Questions}, {&row.Threshold, &game.Threshold}, {&row.HopsByStar, &game.HopsByStar},
		{&row.Retention, &game.Retention}, {&row.MaxInterval, &game.MaxInterval}, {&row.NewPerDay, &game.NewPerDay},
	} {
		if *f.to == nil {
			*f.to = *f.from
		}
	}
	row.UpdatedAt = now
	return tx.Save(&row).Error
}

// cutFamilyModules cuts the modules the family wrote before packs were cut
// from their file, each into its pack. A module another pack gathers stays
// as it is. Then the packs whose prerequisites named such a module are cut
// again, to name the module of the chapter.
func cutFamilyModules(db *gorm.DB, familyID int, modules []Module, entries map[string]Entry, now time.Time) (bool, error) {
	gathered := map[string]bool{}
	for _, module := range modules {
		for _, child := range module.Children {
			gathered[child] = true
		}
	}
	cut := false
	for _, module := range modules {
		if module.Builtin || module.IsPack() || gathered[module.Key] {
			continue
		}
		doc, err := Parse([]byte(module.Content))
		if err != nil || !cuttable(doc) {
			continue
		}
		if err := db.Transaction(func(tx *gorm.DB) error {
			_, err := installFamilyFile(tx, familyID, []byte(module.Content), doc, entries, now)
			return err
		}); err != nil {
			return cut, err
		}
		cut = true
	}
	if !cut {
		return false, nil
	}
	var packs []Module
	if err := db.Where("family_id = ? AND editable = ?", familyID, true).Find(&packs).Error; err != nil {
		return cut, err
	}
	for _, pack := range packs {
		doc, err := Parse([]byte(pack.Source))
		if err != nil || len(doc.Prerequisites) == 0 {
			continue
		}
		if err := db.Transaction(func(tx *gorm.DB) error {
			_, err := installFamilyFile(tx, familyID, []byte(pack.Source), doc, entries, now)
			return err
		}); err != nil {
			return cut, err
		}
	}
	return cut, nil
}
