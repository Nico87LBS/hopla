package learn

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"time"

	"gorm.io/gorm"
)

// A family screen, such as the tablet in the kitchen, opens the games of one
// child without signing in: it asks for a play link, good once and for
// PlayLinkTTL, and the page it opens trades it for a play session that can
// only play, for PlaySessionTTL.
const (
	PlayLinkTTL    = 60 * time.Second
	PlaySessionTTL = 2 * time.Hour

	playLink    = "link"
	playSession = "session"
)

// ErrPlayExpired is a play link or session unknown, used or past its time.
var ErrPlayExpired = errors.New("play link or session expired")

// PlayToken is a play link or a play session. Only the hash of its secret is
// kept.
type PlayToken struct {
	Hash      string    `gorm:"column:hash;primaryKey;size:64"`
	Kind      string    `gorm:"column:kind;size:10;not null"`
	FamilyID  int       `gorm:"column:family_id;not null"`
	UserID    int       `gorm:"column:user_id;not null"`
	CreatedBy int       `gorm:"column:created_by"`
	ExpiresAt time.Time `gorm:"column:expires_at;not null;index"`
	CreatedAt time.Time `gorm:"column:created_at"`
}

func (PlayToken) TableName() string { return "learn_play_tokens" }

func hashOf(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:])
}

func newSecret() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

func newToken(db *gorm.DB, kind string, familyID, userID, createdBy int, ttl time.Duration, now time.Time) (string, time.Time, error) {
	secret, err := newSecret()
	if err != nil {
		return "", time.Time{}, err
	}
	// Expired tokens go as new ones come.
	if err := db.Where("expires_at < ?", now).Delete(&PlayToken{}).Error; err != nil {
		return "", time.Time{}, err
	}
	token := PlayToken{Hash: hashOf(secret), Kind: kind, FamilyID: familyID, UserID: userID, CreatedBy: createdBy,
		ExpiresAt: now.Add(ttl), CreatedAt: now}
	return secret, token.ExpiresAt, db.Create(&token).Error
}

// NewPlayLink gives a link for userID to play, good once and for PlayLinkTTL.
func NewPlayLink(db *gorm.DB, familyID, userID, createdBy int, now time.Time) (string, time.Time, error) {
	return newToken(db, playLink, familyID, userID, createdBy, PlayLinkTTL, now)
}

// StartPlay trades a play link for a play session, and the link is gone.
func StartPlay(db *gorm.DB, code string, now time.Time) (string, PlayToken, error) {
	var link PlayToken
	err := db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("hash = ? AND kind = ? AND expires_at > ?", hashOf(code), playLink, now).
			First(&link).Error; err != nil {
			return ErrPlayExpired
		}
		result := tx.Where("hash = ?", link.Hash).Delete(&PlayToken{})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return ErrPlayExpired // used at the same time
		}
		return nil
	})
	if err != nil {
		return "", link, err
	}
	secret, expires, err := newToken(db, playSession, link.FamilyID, link.UserID, link.CreatedBy, PlaySessionTTL, now)
	link.Kind, link.ExpiresAt = playSession, expires
	return secret, link, err
}

// PlaySession finds the running play session of a secret.
func PlaySession(db *gorm.DB, secret string, now time.Time) (PlayToken, error) {
	var session PlayToken
	if secret == "" {
		return session, ErrPlayExpired
	}
	if err := db.Where("hash = ? AND kind = ? AND expires_at > ?", hashOf(secret), playSession, now).
		First(&session).Error; err != nil {
		return session, ErrPlayExpired
	}
	return session, nil
}

// EndPlay ends a play session, such as when the screen closes the games.
func EndPlay(db *gorm.DB, secret string) error {
	return db.Where("hash = ? AND kind = ?", hashOf(secret), playSession).Delete(&PlayToken{}).Error
}
