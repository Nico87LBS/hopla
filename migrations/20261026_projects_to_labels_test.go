package migrations

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// The tables as the last version with projects created them.
const projectsSchema = "CREATE TABLE `projects` (`id` integer PRIMARY KEY AUTOINCREMENT,`name` text NOT NULL,`description` text,`color` text,`icon` text,`circle_id` integer NOT NULL,`created_by` integer NOT NULL,`created_at` datetime,`updated_at` datetime,`is_default` numeric DEFAULT false,`is_private` numeric DEFAULT false,`shared_with_members` numeric NOT NULL DEFAULT false);" +
	"CREATE TABLE `project_members` (`id` integer PRIMARY KEY AUTOINCREMENT,`project_id` integer NOT NULL,`user_id` integer NOT NULL,`circle_id` integer NOT NULL,`added_by` integer NOT NULL,`created_at` datetime);" +
	"CREATE TABLE `chores` (`id` integer PRIMARY KEY AUTOINCREMENT,`name` text,`circle_id` integer,`created_by` integer,`is_private` numeric DEFAULT false,`project_id` integer,`sync_version` integer NOT NULL DEFAULT 0,CONSTRAINT `fk_chores_project` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`));" +
	"CREATE INDEX `idx_chores_project_id` ON `chores`(`project_id`);" +
	"CREATE TABLE `labels` (`id` integer PRIMARY KEY AUTOINCREMENT,`name` text,`color` text,`circle_id` integer,`created_by` integer);" +
	"CREATE TABLE `chore_labels` (`chore_id` integer NOT NULL,`label_id` integer NOT NULL,`user_id` integer NOT NULL,PRIMARY KEY (`chore_id`,`label_id`,`user_id`))"

func TestProjectsBecomeLabels(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "m.db")), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.Exec(projectsSchema).Error)
	require.NoError(t, db.Exec("INSERT INTO labels (id, name, color, circle_id, created_by) VALUES (1, 'Cuisine', '#26a69a', 1, 2)").Error)
	require.NoError(t, db.Exec(`INSERT INTO projects (id, name, color, circle_id, created_by, is_private, shared_with_members) VALUES
		(1, 'cuisine', '#ff7961', 1, 1, false, false),
		(2, 'Jardin', '#7e57c2', 1, 1, false, false),
		(3, 'Surprise', NULL, 1, 1, true, false),
		(4, 'Voyage', '#80d8ff', 1, 1, true, true)`).Error)
	require.NoError(t, db.Exec("INSERT INTO project_members (project_id, user_id, circle_id, added_by) VALUES (4, 2, 1, 1)").Error)
	require.NoError(t, db.Exec(`INSERT INTO chores (id, name, circle_id, created_by, is_private, project_id) VALUES
		(1, 'Vaisselle', 1, 2, false, 1),
		(2, 'Tondre', 1, 1, false, 2),
		(3, 'Cadeau', 1, 1, false, 3),
		(4, 'Valises', 1, 2, false, 4),
		(5, 'Poubelles', 1, 1, false, NULL)`).Error)

	require.NoError(t, ProjectsToLabels20261026{}.Up(context.Background(), db))

	require.False(t, db.Migrator().HasTable("projects"))
	require.False(t, db.Migrator().HasTable("project_members"))
	require.False(t, db.Migrator().HasIndex("chores", "idx_chores_project_id"))

	type label struct {
		ID        int
		Name      string
		Color     string
		CircleID  *int
		CreatedBy int
	}
	var labels []label
	require.NoError(t, db.Table("labels").Order("id").Scan(&labels).Error)
	require.Len(t, labels, 4, "the existing Cuisine label is reused")
	require.Equal(t, "Jardin", labels[1].Name)
	require.Equal(t, "#7e57c2", labels[1].Color)
	require.NotNil(t, labels[1].CircleID)
	require.Equal(t, "Surprise", labels[2].Name)
	require.Equal(t, "#FFFFFF", labels[2].Color, "a project without colour gets the default one")
	require.Nil(t, labels[2].CircleID, "a private project's label stays its owner's")
	require.Nil(t, labels[3].CircleID)

	labelOf := func(choreID int) []int {
		var ids []int
		require.NoError(t, db.Table("chore_labels").Where("chore_id = ?", choreID).Order("label_id").Pluck("label_id", &ids).Error)
		return ids
	}
	require.Equal(t, []int{1}, labelOf(1))
	require.Equal(t, []int{labels[1].ID}, labelOf(2))
	require.Equal(t, []int{labels[2].ID}, labelOf(3))
	require.Equal(t, []int{labels[3].ID}, labelOf(4))
	require.Empty(t, labelOf(5))

	type chore struct {
		ID        int
		IsPrivate bool
		ProjectID *int
	}
	var chores []chore
	require.NoError(t, db.Table("chores").Order("id").Scan(&chores).Error)
	want := []bool{false, false, true, true, false}
	for i, ch := range chores {
		require.Equal(t, want[i], ch.IsPrivate, "chore %d", ch.ID)
		require.Nil(t, ch.ProjectID)
	}

	// New tasks can still be written, and running again changes nothing.
	require.NoError(t, db.Exec("INSERT INTO chores (name, circle_id, created_by) VALUES ('Nouvelle', 1, 1)").Error)
	require.NoError(t, ProjectsToLabels20261026{}.Up(context.Background(), db))
}
