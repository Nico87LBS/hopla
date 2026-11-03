package learn

import (
	"errors"
	"slices"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/nico87lbs/hopla/internal/zone"
)

// La récré : toutes les X parties d'Apprendre réussies (au moins
// RecreMinStars étoiles), l'enfant a droit à une partie d'un petit jeu. Elle
// ne rapporte aucun hop ; chaque jeu garde les records de la famille.

// RecreGames are the little games, in the order the page shows them.
var RecreGames = []string{"train", "bulles", "panier", "terriers", "sequence"}

const (
	// RecreMinStars is what a game of Apprendre needs to count for the récré.
	RecreMinStars = 2
	// RecreEvery is how many such games open one récré, by default.
	RecreEvery = 3
	// RecreMaxEvery and RecreMaxMinutes bound what a parent sets.
	RecreMaxEvery   = 20
	RecreMaxMinutes = 15
)

// ErrNoRecre means the person has no récré to play now.
var ErrNoRecre = errors.New("pas de récré pour l'instant")

// RecreSetting is a person's récré, as a parent set it. Without a row, the
// récré is on, every RecreEvery games, with every game and no time limit.
type RecreSetting struct {
	FamilyID int  `json:"-" gorm:"primaryKey;autoIncrement:false"`
	UserID   int  `json:"userId" gorm:"primaryKey;autoIncrement:false"`
	Off      bool `json:"off" gorm:"column:off;not null;default:false"`
	Every    int  `json:"every" gorm:"column:every;not null;default:3"`
	// Minutes stops a game after that long; 0 lets it run to its end.
	Minutes int `json:"minutes" gorm:"column:minutes;not null;default:0"`
	// Games lists the games allowed, separated by commas; empty is all.
	Games     string    `json:"games" gorm:"column:games;size:200"`
	UpdatedAt time.Time `json:"updatedAt" gorm:"column:updated_at"`
}

func (RecreSetting) TableName() string { return "learn_recre_settings" }

// RecrePlay is one récré played, with its score.
type RecrePlay struct {
	ID       int       `json:"id" gorm:"primaryKey"`
	FamilyID int       `json:"-" gorm:"column:family_id;not null;uniqueIndex:idx_learn_recre_play;index:idx_learn_recre_user"`
	ClientID string    `json:"clientId" gorm:"column:client_id;size:64;not null;uniqueIndex:idx_learn_recre_play"`
	UserID   int       `json:"userId" gorm:"column:user_id;not null;index:idx_learn_recre_user"`
	Game     string    `json:"game" gorm:"column:game;size:20;not null"`
	Score    int       `json:"score" gorm:"column:score;not null"`
	PlayedAt time.Time `json:"playedAt" gorm:"column:played_at;not null"`
}

func (RecrePlay) TableName() string { return "learn_recre_plays" }

// RecreRecord is the best score of one person at one game.
type RecreRecord struct {
	Game        string `json:"game"`
	UserID      int    `json:"userId"`
	Score       int    `json:"score"`
	DisplayName string `json:"displayName"`
	Image       string `json:"image"`
}

// Recre is what a person's récré is now.
type Recre struct {
	On      bool     `json:"on"`
	Every   int      `json:"every"`
	Minutes int      `json:"minutes"`
	Games   []string `json:"games"`
	// Since counts the games of Apprendre with RecreMinStars stars or more
	// since the last récré (since the start of the day before the first).
	Since int `json:"since"`
	// Records are the best scores of everyone in the family, game by game.
	Records []RecreRecord `json:"records"`
}

// Ready tells whether a récré is waiting.
func (r Recre) Ready() bool { return r.On && r.Since >= r.Every }

func recreSetting(db *gorm.DB, familyID, userID int) (RecreSetting, error) {
	row := RecreSetting{FamilyID: familyID, UserID: userID, Every: RecreEvery}
	err := db.Where("family_id = ? AND user_id = ?", familyID, userID).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		err = nil
	}
	return row, err
}

func allowedGames(list string) []string {
	if strings.TrimSpace(list) == "" {
		return slices.Clone(RecreGames)
	}
	games := []string{}
	for _, g := range RecreGames {
		if slices.Contains(strings.Split(list, ","), g) {
			games = append(games, g)
		}
	}
	return games
}

// RecreFor tells a person's récré.
func RecreFor(db *gorm.DB, familyID, userID int, now time.Time) (Recre, error) {
	setting, err := recreSetting(db, familyID, userID)
	if err != nil {
		return Recre{}, err
	}
	r := Recre{On: !setting.Off, Every: setting.Every, Minutes: setting.Minutes,
		Games: allowedGames(setting.Games), Records: []RecreRecord{}}
	if r.Every < 1 {
		r.Every = RecreEvery
	}
	if len(r.Games) == 0 {
		r.On = false
	}
	from := zone.StartOfDay(now, zone.Of(familyID)).UTC()
	var last RecrePlay
	if err := db.Where("family_id = ? AND user_id = ?", familyID, userID).
		Order("played_at DESC").Limit(1).Find(&last).Error; err != nil {
		return r, err
	}
	if last.ID != 0 {
		from = last.PlayedAt
	}
	var since int64
	if err := db.Model(&Session{}).
		Where("family_id = ? AND user_id = ? AND stars >= ? AND created_at > ?", familyID, userID, RecreMinStars, from).
		Count(&since).Error; err != nil {
		return r, err
	}
	r.Since = int(since)
	err = db.Table("learn_recre_plays AS p").
		Select("p.game, p.user_id, MAX(p.score) AS score, u.display_name, u.image").
		Joins("LEFT JOIN users u ON u.id = p.user_id").
		Where("p.family_id = ?", familyID).Group("p.game, p.user_id, u.display_name, u.image").
		Order("p.game, score DESC").Scan(&r.Records).Error
	return r, err
}

// RecreChange is what a parent changes in a person's récré; nil leaves a
// setting as it is.
type RecreChange struct {
	UserID  int      `json:"userId"`
	On      *bool    `json:"on"`
	Every   *int     `json:"every"`
	Minutes *int     `json:"minutes"`
	Games   []string `json:"games"`
}

// SetRecre applies a parent's change.
func SetRecre(db *gorm.DB, familyID int, change RecreChange, now time.Time) error {
	if change.Every != nil && (*change.Every < 1 || *change.Every > RecreMaxEvery) {
		return invalid("une récré toutes les 1 à %d parties", RecreMaxEvery)
	}
	if change.Minutes != nil && (*change.Minutes < 0 || *change.Minutes > RecreMaxMinutes) {
		return invalid("un minuteur de 0 à %d minutes", RecreMaxMinutes)
	}
	for _, g := range change.Games {
		if !slices.Contains(RecreGames, g) {
			return invalid("jeu inconnu : %s", g)
		}
	}
	if change.Games != nil && len(change.Games) == 0 {
		return invalid("garde au moins un jeu, ou coupe la récré")
	}
	return db.Transaction(func(tx *gorm.DB) error {
		var n int64
		if err := tx.Table("user_families").Where("user_id = ? AND family_id = ?", change.UserID, familyID).
			Count(&n).Error; err != nil {
			return err
		}
		if n == 0 {
			return invalid("cette personne n'est pas de la famille")
		}
		row, err := recreSetting(tx, familyID, change.UserID)
		if err != nil {
			return err
		}
		if change.On != nil {
			row.Off = !*change.On
		}
		if change.Every != nil {
			row.Every = *change.Every
		}
		if change.Minutes != nil {
			row.Minutes = *change.Minutes
		}
		if change.Games != nil {
			if len(change.Games) == len(RecreGames) {
				row.Games = ""
			} else {
				row.Games = strings.Join(allowedGames(strings.Join(change.Games, ",")), ",")
			}
		}
		row.UpdatedAt = now
		return tx.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "family_id"}, {Name: "user_id"}},
			UpdateAll: true,
		}).Create(&row).Error
	})
}

// RecreGame is a récré played, as the device sends it.
type RecreGame struct {
	ClientID string `json:"clientId"`
	UserID   int    `json:"userId"`
	Game     string `json:"game"`
	Score    int    `json:"score"`
}

// RecordRecre keeps a récré played and answers with the récré after it. A
// récré sent twice counts once.
func RecordRecre(db *gorm.DB, familyID int, game RecreGame, now time.Time) (Recre, error) {
	if game.ClientID == "" || len(game.ClientID) > 64 || game.Score < 0 || game.Score > 1_000_000 {
		return Recre{}, invalid("partie de récré invalide")
	}
	var known int64
	if err := db.Model(&RecrePlay{}).Where("family_id = ? AND client_id = ?", familyID, game.ClientID).
		Count(&known).Error; err != nil {
		return Recre{}, err
	}
	if known > 0 {
		return RecreFor(db, familyID, game.UserID, now)
	}
	r, err := RecreFor(db, familyID, game.UserID, now)
	if err != nil {
		return r, err
	}
	if !r.Ready() {
		return r, ErrNoRecre
	}
	if !slices.Contains(r.Games, game.Game) {
		return r, invalid("ce jeu n'est pas permis")
	}
	play := RecrePlay{FamilyID: familyID, ClientID: game.ClientID, UserID: game.UserID,
		Game: game.Game, Score: game.Score, PlayedAt: now}
	if err := db.Create(&play).Error; err != nil {
		return r, err
	}
	return RecreFor(db, familyID, game.UserID, now)
}
