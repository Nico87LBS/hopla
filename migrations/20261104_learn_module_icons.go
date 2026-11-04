package migrations

import (
	"context"
	"encoding/json"

	"github.com/nico87lbs/hopla/logging"
	"gorm.io/gorm"
)

// LearnModuleIcons20261104 gives the modules already installed the icon of
// their document, now kept apart for the lists.
type LearnModuleIcons20261104 struct{}

func (m LearnModuleIcons20261104) ID() string {
	return "20261104_learn_module_icons"
}

func (m LearnModuleIcons20261104) Description() string {
	return `Fill learn_modules.icon from the "icone" of each module document.`
}

func (m LearnModuleIcons20261104) Down(ctx context.Context, db *gorm.DB) error {
	return nil
}

func (m LearnModuleIcons20261104) Up(ctx context.Context, db *gorm.DB) error {
	log := logging.FromContext(ctx)
	db = db.WithContext(ctx)
	migrator := db.Migrator()
	if !migrator.HasTable("learn_modules") || !migrator.HasColumn("learn_modules", "icon") {
		return nil
	}
	var rows []struct {
		ID      int
		Content string
	}
	if err := db.Table("learn_modules").Select("id", "content").Find(&rows).Error; err != nil {
		return err
	}
	for _, row := range rows {
		var doc struct {
			Icon string `json:"icone"`
		}
		if json.Unmarshal([]byte(row.Content), &doc) != nil || doc.Icon == "" {
			continue
		}
		if err := db.Table("learn_modules").Where("id = ?", row.ID).Update("icon", doc.Icon).Error; err != nil {
			return err
		}
	}
	log.Infof("Module icons filled for %d modules", len(rows))
	return nil
}

func init() {
	Register(LearnModuleIcons20261104{})
}
