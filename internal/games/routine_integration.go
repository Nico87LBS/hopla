package games

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"
)

var ErrRoutineIntegrationTokenInvalid = errors.New("routine integration token is invalid or revoked")

type RoutineIntegrationToken struct {
	ID int `json:"id" gorm:"primaryKey"`
	FamilyID int `json:"-" gorm:"column:family_id;index;not null"`
	UserID int `json:"userId" gorm:"column:user_id;not null"`
	Name string `json:"name" gorm:"size:80;not null"`
	TokenHash string `json:"-" gorm:"column:token_hash;size:64;uniqueIndex;not null"`
	CreatedAt time.Time `json:"createdAt" gorm:"column:created_at;not null"`
	LastUsedAt *time.Time `json:"lastUsedAt,omitempty" gorm:"column:last_used_at"`
	RevokedAt *time.Time `json:"revokedAt,omitempty" gorm:"column:revoked_at;index"`
}

func (RoutineIntegrationToken) TableName() string { return "routine_integration_tokens" }

func CreateRoutineIntegrationToken(db *gorm.DB, familyID, userID int, name string, now time.Time) (*RoutineIntegrationToken, string, error) {
	name = strings.TrimSpace(name)
	if familyID <= 0 || userID <= 0 || name == "" || len(name) > 80 {
		return nil, "", ErrRoutineOccurrenceInvalid
	}
	var raw [32]byte
	if _, err := rand.Read(raw[:]); err != nil { return nil, "", err }
	secret := "hopla_routine_" + base64.RawURLEncoding.EncodeToString(raw[:])
	hash := sha256.Sum256([]byte(secret))
	token := &RoutineIntegrationToken{
		FamilyID:familyID, UserID:userID, Name:name,
		TokenHash:hex.EncodeToString(hash[:]), CreatedAt:now.UTC(),
	}
	if err := db.Create(token).Error; err != nil { return nil, "", err }
	return token, secret, nil
}

func AuthenticateRoutineIntegrationToken(db *gorm.DB, secret string, now time.Time) (*RoutineIntegrationToken, error) {
	secret = strings.TrimSpace(secret)
	if secret == "" { return nil, ErrRoutineIntegrationTokenInvalid }
	hash := sha256.Sum256([]byte(secret))
	var token RoutineIntegrationToken
	if err := db.Where("token_hash = ? AND revoked_at IS NULL", hex.EncodeToString(hash[:])).First(&token).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) { return nil, ErrRoutineIntegrationTokenInvalid }
		return nil, err
	}
	if err := db.Model(&token).Update("last_used_at", now.UTC()).Error; err != nil { return nil, err }
	used := now.UTC()
	token.LastUsedAt = &used
	return &token, nil
}

func ListRoutineIntegrationTokens(db *gorm.DB, familyID int) ([]RoutineIntegrationToken, error) {
	var tokens []RoutineIntegrationToken
	err := db.Where("family_id = ?", familyID).Order("created_at DESC").Find(&tokens).Error
	if err != nil { return nil, err }
	// Never return the stored token fingerprint to callers; it is only used
	// internally for authentication and uniqueness checks.
	for i := range tokens { tokens[i].TokenHash = "" }
	return tokens, nil
}

func RevokeRoutineIntegrationToken(db *gorm.DB, familyID, tokenID int, now time.Time) error {
	result := db.Model(&RoutineIntegrationToken{}).
		Where("id = ? AND family_id = ? AND revoked_at IS NULL", tokenID, familyID).
		Update("revoked_at", now.UTC())
	if result.Error != nil { return result.Error }
	if result.RowsAffected == 0 { return gorm.ErrRecordNotFound }
	return nil
}
