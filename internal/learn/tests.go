package learn

import (
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"gorm.io/gorm"
)

// TestsKey is the module of the games that prepare a test, like ReviewsKey
// for the day's reviews: their answers ask questions of several modules, and
// move no card, so that the questions come back when they were due.
const TestsKey = "controle"

// Limits of a test.
const (
	maxTestName     = 60
	maxTestChapters = 40
	// A test is planned within a year.
	maxTestAhead = 366
)

// TestChapter is a chapter of a module that a test covers.
type TestChapter struct {
	Module  string `json:"module"`
	Chapter string `json:"chapter"`
}

// Test is a test a person prepares: a day, and the chapters it covers. It
// goes away by itself once its day is past.
type Test struct {
	ID        int           `json:"id" gorm:"primaryKey"`
	FamilyID  int           `json:"-" gorm:"column:family_id;not null;index"`
	UserID    int           `json:"userId" gorm:"column:user_id;not null;index"`
	Name      string        `json:"name" gorm:"column:name;size:120;not null"`
	Day       string        `json:"day" gorm:"column:test_day;size:10;not null"`
	Chapters  []TestChapter `json:"chapters" gorm:"column:chapters;type:text;serializer:json"`
	CreatedBy int           `json:"createdBy" gorm:"column:created_by"`
	CreatedAt time.Time     `json:"createdAt" gorm:"column:created_at"`
}

func (Test) TableName() string { return "learn_tests" }

// TestChange is a test to create.
type TestChange struct {
	UserID   int           `json:"userId"`
	Name     string        `json:"name"`
	Day      string        `json:"day"`
	Chapters []TestChapter `json:"chapters"`
}

// CreateTest keeps a test for a person, who must play every module it
// covers, and that has every chapter it names.
func CreateTest(db *gorm.DB, familyID, createdBy int, change TestChange, now time.Time) (Test, error) {
	name := strings.TrimSpace(change.Name)
	switch {
	case name == "" || utf8.RuneCountInString(name) > maxTestName:
		return Test{}, invalid("un nom de 1 à %d lettres", maxTestName)
	case len(change.Chapters) == 0 || len(change.Chapters) > maxTestChapters:
		return Test{}, invalid("de 1 à %d chapitres", maxTestChapters)
	}
	today := Day(familyID, now)
	day, err := time.Parse(time.DateOnly, change.Day)
	if err != nil {
		return Test{}, invalid("date invalide")
	}
	from, _ := time.Parse(time.DateOnly, today)
	switch {
	case day.Before(from):
		return Test{}, invalid("la date du contrôle est déjà passée")
	case day.After(from.AddDate(0, 0, maxTestAhead)):
		return Test{}, invalid("le contrôle est dans plus d'un an")
	}
	test := Test{FamilyID: familyID, UserID: change.UserID, Name: name, Day: change.Day,
		CreatedBy: createdBy, CreatedAt: now}
	seen := map[TestChapter]bool{}
	docs := map[string]Document{}
	for _, chapter := range change.Chapters {
		if seen[chapter] {
			continue
		}
		seen[chapter] = true
		doc, ok := docs[chapter.Module]
		if !ok {
			var active int64
			if err := db.Model(&Activation{}).Where("family_id = ? AND user_id = ? AND module_key = ?",
				familyID, change.UserID, chapter.Module).Count(&active).Error; err != nil {
				return Test{}, err
			}
			if active == 0 {
				return Test{}, ErrNotActive
			}
			var module Module
			if err := db.Where("family_id = ? AND module_key = ?", familyID, chapter.Module).
				First(&module).Error; err != nil {
				return Test{}, err
			}
			if doc, err = Parse([]byte(module.Content)); err != nil {
				return Test{}, err
			}
			docs[chapter.Module] = doc
		}
		found := false
		for _, c := range doc.Chapters {
			found = found || c.ID == chapter.Chapter
		}
		if !found {
			return Test{}, ErrNotFound
		}
		test.Chapters = append(test.Chapters, chapter)
	}
	return test, db.Create(&test).Error
}

// TestByID reads a test of the family.
func TestByID(db *gorm.DB, familyID, id int) (Test, error) {
	var test Test
	err := db.Where("family_id = ? AND id = ?", familyID, id).First(&test).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return test, ErrNotFound
	}
	return test, err
}

// DeleteTest removes a test.
func DeleteTest(db *gorm.DB, familyID, id int) error {
	return db.Where("family_id = ? AND id = ?", familyID, id).Delete(&Test{}).Error
}

// TestsFor lists the tests a person has still to come, the nearest first.
func TestsFor(db *gorm.DB, familyID, userID int, day string) ([]Test, error) {
	tests := []Test{}
	err := db.Where("family_id = ? AND user_id = ? AND test_day >= ?", familyID, userID, day).
		Order("test_day, id").Find(&tests).Error
	return tests, err
}
