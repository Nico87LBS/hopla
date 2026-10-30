package migrations

import (
	"context"
	"strings"

	"github.com/nico87lbs/hopla/logging"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ProjectsToLabels20261026 turns every project into a label of the same name
// and colour, put on the project's tasks, then removes the projects. The tasks
// of a project that was private or shared with some members become private
// tasks: their creator and assignees keep seeing them, nobody else does.
type ProjectsToLabels20261026 struct{}

func (m ProjectsToLabels20261026) ID() string {
	return "20261026_projects_to_labels"
}

func (m ProjectsToLabels20261026) Description() string {
	return `Turn projects into labels, make the tasks of restricted projects private, then drop projects and project_members.`
}

func (m ProjectsToLabels20261026) Down(ctx context.Context, db *gorm.DB) error {
	// No-op: projects are gone from the code.
	return nil
}

type oldProject struct {
	ID        int
	Name      string
	Color     *string
	FamilyID  int
	CreatedBy int
	IsPrivate bool
}

type projectLabel struct {
	ID        int    `gorm:"primary_key"`
	Name      string `gorm:"column:name"`
	Color     string `gorm:"column:color"`
	FamilyID  *int   `gorm:"column:family_id"`
	CreatedBy int    `gorm:"column:created_by"`
}

func (projectLabel) TableName() string { return "labels" }

type projectChoreLabel struct {
	ChoreID int `gorm:"primaryKey;autoIncrement:false"`
	LabelID int `gorm:"primaryKey;autoIncrement:false"`
	UserID  int `gorm:"primaryKey;autoIncrement:false"`
}

func (projectChoreLabel) TableName() string { return "chore_labels" }

func (m ProjectsToLabels20261026) Up(ctx context.Context, db *gorm.DB) error {
	db = db.WithContext(ctx)
	migrator := db.Migrator()
	if !migrator.HasTable("projects") {
		return nil
	}
	log := logging.FromContext(ctx)
	return db.Transaction(func(tx *gorm.DB) error {
		var projects []oldProject
		if err := tx.Table("projects").Select("id, name, color, family_id, created_by, is_private").
			Order("id").Scan(&projects).Error; err != nil {
			return err
		}
		hasColumn := tx.Migrator().HasColumn("chores", "project_id")
		for _, p := range projects {
			label, err := labelForProject(tx, p)
			if err != nil {
				return err
			}
			if !hasColumn {
				continue
			}
			var chores []struct {
				ID        int
				CreatedBy int
			}
			if err := tx.Table("chores").Select("id, created_by").Where("project_id = ?", p.ID).Scan(&chores).Error; err != nil {
				return err
			}
			for _, ch := range chores {
				// The label is the project owner's, as the project was.
				row := projectChoreLabel{ChoreID: ch.ID, LabelID: label.ID, UserID: label.CreatedBy}
				if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&row).Error; err != nil {
					return err
				}
			}
			if p.IsPrivate && len(chores) > 0 {
				if err := tx.Table("chores").Where("project_id = ?", p.ID).
					Updates(map[string]any{"is_private": true, "sync_version": gorm.Expr("sync_version + 1")}).Error; err != nil {
					return err
				}
			}
			log.Infow("Project turned into a label", "project", p.ID, "label", label.ID, "tasks", len(chores))
		}
		if hasColumn {
			if err := tx.Exec("UPDATE chores SET project_id = NULL WHERE project_id IS NOT NULL").Error; err != nil {
				return err
			}
			if err := tx.Exec("DROP INDEX IF EXISTS idx_chores_project_id").Error; err != nil {
				return err
			}
			// SQLite can't drop a column that a foreign key names; the emptied
			// column stays there, unused.
			if tx.Dialector.Name() != "sqlite" {
				if err := tx.Exec("ALTER TABLE chores DROP COLUMN project_id").Error; err != nil {
					return err
				}
			}
		}
		if tx.Migrator().HasTable("project_members") {
			if err := tx.Migrator().DropTable("project_members"); err != nil {
				return err
			}
		}
		return tx.Migrator().DropTable("projects")
	})
}

// labelForProject returns the label of the project's name the owner already
// has, or creates it with the project's colour. A private project's label
// stays the owner's own; the others are the family's.
func labelForProject(tx *gorm.DB, p oldProject) (*projectLabel, error) {
	q := tx.Where("LOWER(name) = ?", strings.ToLower(strings.TrimSpace(p.Name)))
	if p.IsPrivate {
		q = q.Where("created_by = ?", p.CreatedBy)
	} else {
		q = q.Where("family_id = ? OR created_by = ?", p.FamilyID, p.CreatedBy)
	}
	var found []projectLabel
	if err := q.Order("id").Limit(1).Find(&found).Error; err != nil {
		return nil, err
	}
	if len(found) > 0 {
		return &found[0], nil
	}
	label := projectLabel{Name: strings.TrimSpace(p.Name), Color: "#FFFFFF", CreatedBy: p.CreatedBy}
	if p.Color != nil && *p.Color != "" {
		label.Color = *p.Color
	}
	if !p.IsPrivate {
		familyID := p.FamilyID
		label.FamilyID = &familyID
	}
	if err := tx.Create(&label).Error; err != nil {
		return nil, err
	}
	return &label, nil
}

func init() {
	Register(ProjectsToLabels20261026{})
}
