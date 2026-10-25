package database

import (
	"embed"
	"fmt"
	"os"

	migrate "github.com/rubenv/sql-migrate"
	"gorm.io/gorm"

	"github.com/nico87lbs/hopla/config"
	calModel "github.com/nico87lbs/hopla/internal/calendar/model"
	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	cModel "github.com/nico87lbs/hopla/internal/circle/model"
	filterModel "github.com/nico87lbs/hopla/internal/filter/model"
	"github.com/nico87lbs/hopla/internal/games"
	lModel "github.com/nico87lbs/hopla/internal/label/model"
	"github.com/nico87lbs/hopla/internal/learn"
	pModel "github.com/nico87lbs/hopla/internal/points"
	projModel "github.com/nico87lbs/hopla/internal/project/model"
	rwModel "github.com/nico87lbs/hopla/internal/reward/model"
	storageModel "github.com/nico87lbs/hopla/internal/storage/model"
	stModel "github.com/nico87lbs/hopla/internal/subtask/model"
	syncModel "github.com/nico87lbs/hopla/internal/sync/model"
	uModel "github.com/nico87lbs/hopla/internal/user/model" // Pure go SQLite driver, checkout https://github.com/glebarez/sqlite for details
	"github.com/nico87lbs/hopla/migrations"
)

//go:embed migrations/*.sql
var embeddedMigrations embed.FS

func Migration(db *gorm.DB) error {
	if err := db.AutoMigrate(uModel.User{}, chModel.Chore{},
		chModel.ChoreHistory{},
		cModel.Circle{},
		cModel.UserCircle{},
		chModel.ChoreAssignees{},
		uModel.UserPasswordReset{},
		uModel.MFASession{},
		uModel.UserSession{},
		uModel.APIToken{},
		lModel.Label{},
		chModel.ChoreLabels{},
		projModel.Project{},
		projModel.ProjectMember{},
		filterModel.Filter{},
		migrations.Migration{},
		pModel.PointsHistory{},
		pModel.PointsPreset{},
		games.Rules{},
		games.BonusPeriod{},
		games.Surprise{},
		games.Rank{},
		games.Quest{},
		games.QuestDraw{},
		games.Challenge{},
		games.ChallengeWin{},
		games.Absence{},
		games.Flash{},
		learn.Module{},
		learn.Activation{},
		learn.PersonSetting{},
		learn.Session{},
		learn.Card{},
		learn.CardEdit{},
		learn.Report{},
		stModel.SubTask{},
		storageModel.StorageFile{},
		storageModel.StorageUsage{},
		chModel.TimeSession{},
		syncModel.SyncCursor{},
		syncModel.Tombstone{},
		rwModel.Reward{},
		rwModel.RewardRedemption{},
		calModel.CalendarToken{},
	); err != nil {
		return err
	}

	return learn.FoldAllPacks(db)
}

func MigrationScripts(gormDB *gorm.DB, cfg *config.Config) error {
	migrations := &migrate.EmbedFileSystemMigrationSource{
		FileSystem: embeddedMigrations,
		Root:       "migrations",
	}

	var dialect string
	switch cfg.Database.Type {
	case "postgres":
		dialect = "postgres"
	case "sqlite":
		dialect = "sqlite3"
	default:
		return fmt.Errorf("unsupported database type: %s", cfg.Database.Type)
	}

	db, err := gormDB.DB()
	if err != nil {
		return err
	}
	var n int
	if cfg.Database.Type == "sqlite" {

		path := os.Getenv("HOPLA_SQLITE_PATH")
		if path == "" {
			path = "hopla.db"
		}
		n, err = migrate.Exec(db, "sqlite3", migrations, migrate.Up)
	} else if cfg.Database.Type == "postgres" {
		n, err = migrate.Exec(db, "postgres", migrations, migrate.Up)
	}

	n, err = migrate.Exec(db, dialect, migrations, migrate.Up)
	if err != nil {
		return err
	}
	fmt.Printf("Applied %d migrations!\n", n)
	return nil
}
