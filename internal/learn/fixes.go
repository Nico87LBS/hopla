package learn

import (
	"bytes"
	"encoding/json"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// CardEdit is the family's correction of a written card, laid over the
// module as it is installed. It is kept apart from the module, so it stays
// when the catalogue brings a new version, and the card keeps its key, so
// what everyone learned of it stays too.
type CardEdit struct {
	CircleID  int    `json:"-" gorm:"primaryKey;autoIncrement:false"`
	ModuleKey string `json:"module" gorm:"column:module_key;primaryKey;size:80"`
	CardID    string `json:"card" gorm:"column:card_id;primaryKey;size:80"`
	// Fields are the card's fields the family changed, as the module
	// writes them.
	Fields    map[string]json.RawMessage `json:"fields" gorm:"column:fields;type:text;serializer:json"`
	UpdatedBy int                        `json:"updatedBy" gorm:"column:updated_by"`
	UpdatedAt time.Time                  `json:"updatedAt" gorm:"column:updated_at"`
}

func (CardEdit) TableName() string { return "learn_card_edits" }

// EditableFields are the fields of a card the family may change. Its id,
// chapter, type and key stay, to keep what everyone learned.
var EditableFields = []string{"question", "reponse", "explication", "sens", "pieges", "autres_reponses"}

// MaxReportComment is the longest comment of a report, in characters.
const MaxReportComment = 500

// ReportReasons are why a question is reported.
var ReportReasons = []string{"pas-claire", "reponse-fausse", "faute", "autre"}

// Report is a question someone found wrong during a game, for the parents
// to look at. ClientID is drawn by the device, so a report sent twice, such
// as after being offline, counts once.
type Report struct {
	ID        int    `json:"id" gorm:"primaryKey"`
	CircleID  int    `json:"-" gorm:"column:circle_id;not null;uniqueIndex:idx_learn_report"`
	ClientID  string `json:"clientId" gorm:"column:client_id;size:64;not null;uniqueIndex:idx_learn_report"`
	ModuleKey string `json:"module" gorm:"column:module_key;size:80;not null;index"`
	// Card is the written card or the generator that asked the question.
	Card string `json:"card" gorm:"column:card_id;size:80;not null"`
	// Key is the question's own key, Prompt and Expected what was shown.
	Key        string     `json:"key" gorm:"column:card_key;size:160"`
	Prompt     string     `json:"prompt" gorm:"column:prompt;size:500"`
	Expected   string     `json:"expected" gorm:"column:expected;size:300"`
	Given      string     `json:"given" gorm:"column:given;size:120"`
	Reason     string     `json:"reason" gorm:"column:reason;size:20;not null"`
	Comment    string     `json:"comment" gorm:"column:comment;size:2000"`
	UserID     int        `json:"userId" gorm:"column:user_id;not null"`
	ReportedBy int        `json:"reportedBy" gorm:"column:reported_by"`
	ReportedAt time.Time  `json:"reportedAt" gorm:"column:reported_at;not null"`
	ResolvedAt *time.Time `json:"resolvedAt" gorm:"column:resolved_at"`
	ResolvedBy int        `json:"resolvedBy,omitempty" gorm:"column:resolved_by"`
}

func (Report) TableName() string { return "learn_reports" }

// cardsOf reads the cards of a module's content as loose objects, keeping
// the fields Hopla does not know.
func cardsOf(content string) (map[string]any, []any, error) {
	decoder := json.NewDecoder(strings.NewReader(content))
	decoder.UseNumber()
	var doc map[string]any
	if err := decoder.Decode(&doc); err != nil {
		return nil, nil, err
	}
	cards, _ := doc["fiches"].([]any)
	return doc, cards, nil
}

// applyEdits lays the family's corrections over a module's content. An edit
// of a card the module no longer has is left aside.
func applyEdits(content string, edits []CardEdit) (string, error) {
	if len(edits) == 0 {
		return content, nil
	}
	doc, cards, err := cardsOf(content)
	if err != nil {
		return content, err
	}
	byCard := map[string]CardEdit{}
	for _, edit := range edits {
		byCard[edit.CardID] = edit
	}
	for _, raw := range cards {
		card, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		id, _ := card["id"].(string)
		edit, ok := byCard[id]
		if !ok {
			continue
		}
		for field, value := range edit.Fields {
			if !contains(EditableFields, field) {
				continue
			}
			if string(value) == "null" {
				delete(card, field)
				continue
			}
			var v any
			decoder := json.NewDecoder(bytes.NewReader(value))
			decoder.UseNumber()
			if decoder.Decode(&v) == nil {
				card[field] = v
			}
		}
	}
	out, err := json.Marshal(doc)
	return string(out), err
}

// editsOf reads a circle's card corrections, by module.
func editsOf(tx *gorm.DB, circleID int) (map[string][]CardEdit, error) {
	var rows []CardEdit
	if err := tx.Where("circle_id = ?", circleID).Order("module_key, card_id").Find(&rows).Error; err != nil {
		return nil, err
	}
	out := map[string][]CardEdit{}
	for _, row := range rows {
		out[row.ModuleKey] = append(out[row.ModuleKey], row)
	}
	return out, nil
}

// withEdits lays each module's corrections over its content.
func withEdits(tx *gorm.DB, circleID int, modules []Module) error {
	edits, err := editsOf(tx, circleID)
	if err != nil {
		return err
	}
	for i, module := range modules {
		if list := edits[module.Key]; len(list) > 0 {
			content, err := applyEdits(module.Content, list)
			if err != nil {
				return err
			}
			modules[i].Content = content
		}
	}
	return nil
}

// CardChange changes the family's correction of a card. Fields left out
// keep their edit; a field set to null gives the module's own back. Revert
// drops the whole correction.
type CardChange struct {
	Module string                     `json:"module"`
	Card   string                     `json:"card"`
	Fields map[string]json.RawMessage `json:"fields"`
	Revert bool                       `json:"revert"`
}

// SetCardEdit saves the family's correction of a card, once the module
// with it still holds together.
func SetCardEdit(db *gorm.DB, circleID, userID int, change CardChange, now time.Time) error {
	for field := range change.Fields {
		if !contains(EditableFields, field) {
			return invalid("le champ %s d'une fiche ne se modifie pas", field)
		}
	}
	return db.Transaction(func(tx *gorm.DB) error {
		modules, err := freshModules(tx, circleID, now)
		if err != nil {
			return err
		}
		var module *Module
		for i := range modules {
			if modules[i].Key == change.Module && !modules[i].IsPack() {
				module = &modules[i]
			}
		}
		if module == nil {
			return ErrNotFound
		}
		original, err := Parse([]byte(module.Content))
		if err != nil {
			return err
		}
		var card *CardDef
		for i := range original.Cards {
			if original.Cards[i].ID == change.Card {
				card = &original.Cards[i]
			}
		}
		if card == nil {
			return ErrNotFound
		}
		where := tx.Where("circle_id = ? AND module_key = ? AND card_id = ?", circleID, change.Module, change.Card)
		var edit CardEdit
		if err := where.First(&edit).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		fields := map[string]json.RawMessage{}
		if !change.Revert {
			for field, value := range edit.Fields {
				fields[field] = value
			}
		}
		for field, value := range change.Fields {
			if string(value) == "null" {
				delete(fields, field)
			} else {
				fields[field] = value
			}
		}
		if len(fields) == 0 {
			return tx.Where("circle_id = ? AND module_key = ? AND card_id = ?", circleID, change.Module, change.Card).
				Delete(&CardEdit{}).Error
		}
		edits, err := editsOf(tx, circleID)
		if err != nil {
			return err
		}
		next := CardEdit{CircleID: circleID, ModuleKey: change.Module, CardID: change.Card, Fields: fields,
			UpdatedBy: userID, UpdatedAt: now}
		list := []CardEdit{next}
		for _, other := range edits[change.Module] {
			if other.CardID != change.Card {
				list = append(list, other)
			}
		}
		content, err := applyEdits(module.Content, list)
		if err != nil {
			return err
		}
		doc, err := Parse([]byte(content))
		if err != nil {
			return invalid("%v", err)
		}
		entries, err := Catalogue()
		if err != nil {
			return err
		}
		if err := checkKeys(tx, circleID, doc, entries); err != nil {
			return err
		}
		return tx.Clauses(clause.OnConflict{UpdateAll: true}).Create(&next).Error
	})
}

// AddReport keeps a question reported during a game. The same report sent
// again is kept once.
func AddReport(db *gorm.DB, circleID, reportedBy int, report Report, now time.Time) error {
	report.Comment = strings.TrimSpace(report.Comment)
	switch {
	case report.ClientID == "" || len(report.ClientID) > 64:
		return invalid("signalement sans identifiant")
	case !contains(ReportReasons, report.Reason):
		return invalid("raison %q inconnue", report.Reason)
	case utf8.RuneCountInString(report.Comment) > MaxReportComment:
		return invalid("le commentaire dépasse %d caractères", MaxReportComment)
	case report.Card == "":
		return invalid("signalement sans fiche")
	}
	var module Module
	err := db.Where("circle_id = ? AND module_key = ?", circleID, report.ModuleKey).First(&module).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	report.ID, report.CircleID, report.ReportedBy, report.ResolvedAt, report.ResolvedBy = 0, circleID, reportedBy, nil, 0
	report.Prompt, report.Expected, report.Given = cut(report.Prompt, 500), cut(report.Expected, 300), cut(report.Given, 120)
	if report.ReportedAt.IsZero() || report.ReportedAt.After(now) {
		report.ReportedAt = now
	}
	return db.Clauses(clause.OnConflict{DoNothing: true}).Create(&report).Error
}

// cut keeps the first n characters of a text.
func cut(text string, n int) string {
	if utf8.RuneCountInString(text) <= n {
		return text
	}
	return string([]rune(text)[:n])
}

// ResolveReport marks a report as looked at.
func ResolveReport(db *gorm.DB, circleID, userID, id int, now time.Time) error {
	result := db.Model(&Report{}).Where("circle_id = ? AND id = ? AND resolved_at IS NULL", circleID, id).
		Updates(map[string]any{"resolved_at": now, "resolved_by": userID})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

// OpenReports lists the reports not looked at yet, for the modules given or
// all of them.
func OpenReports(db *gorm.DB, circleID int, modules []string) ([]Report, error) {
	query := db.Where("circle_id = ? AND resolved_at IS NULL", circleID)
	if modules != nil {
		query = query.Where("module_key IN ?", modules)
	}
	reports := []Report{}
	err := query.Order("reported_at").Find(&reports).Error
	return reports, err
}
