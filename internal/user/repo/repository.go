package user

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	storageModel "github.com/nico87lbs/hopla/internal/storage/model"
	uModel "github.com/nico87lbs/hopla/internal/user/model"
	"github.com/nico87lbs/hopla/logging"
	"gorm.io/gorm"
)

type IUserRepository interface {
	GetUserByUsername(username string) (*uModel.UserDetails, error)
	GetUser(id int) (*uModel.User, error)
	GetAllUsers() ([]*uModel.User, error)
	CreateUser(user *uModel.User) error
	UpdateUser(user *uModel.User) error
	UpdateUserCircle(userID, circleID int) error
	FindByEmail(email string) (*uModel.User, error)
	// MFA-related methods
	EnableMFA(c context.Context, userID int, secret string, backupCodes []string) error
	DisableMFA(c context.Context, userID int) error
	UpdateMFARecoveryCodes(c context.Context, userID int, usedCodes string) error
	// MFA Session methods
	CreateMFASession(c context.Context, session *uModel.MFASession) error
	GetMFASession(c context.Context, sessionToken string) (*uModel.MFASession, error)
	UpdateMFASession(c context.Context, session *uModel.MFASession) error
	DeleteMFASession(c context.Context, sessionToken string) error
	CleanupExpiredMFASessions(c context.Context) error
	// UserSession methods for refresh token management
	CreateUserSession(c context.Context, session *uModel.UserSession) error
	GetUserSessionByTokenHash(c context.Context, tokenHash string) (*uModel.UserSession, error)
	MarkSessionUsed(c context.Context, sessionID string) error
	RevokeSession(c context.Context, sessionID string) error
	RevokeSessionFamily(c context.Context, familyID string) error
	RevokeAllUserSessions(c context.Context, userID int) error
	CleanupExpiredSessions(c context.Context) error
}

type UserRepository struct {
	db *gorm.DB
}

func NewUserRepository(db *gorm.DB) *UserRepository {
	return &UserRepository{db}
}

func (r *UserRepository) GetAllUsers(c context.Context, circleID int) ([]*uModel.User, error) {
	var users []*uModel.User
	if err := r.db.WithContext(c).Where("circle_id = ?", circleID).Find(&users).Error; err != nil {
		return nil, err
	}
	return users, nil
}

func (r *UserRepository) GetAllUsersForSystemOnly(c context.Context) ([]*uModel.User, error) {
	var users []*uModel.User
	if err := r.db.WithContext(c).Find(&users).Error; err != nil {
		return nil, err
	}
	return users, nil
}
func (r *UserRepository) CreateUser(c context.Context, user *uModel.User) (*uModel.User, error) {
	if err := r.db.WithContext(c).Create(user).Error; err != nil {
		return nil, err
	}
	return user, nil
}
func (r *UserRepository) GetUserByUsername(c context.Context, username string) (*uModel.UserDetails, error) {
	var user *uModel.UserDetails
	if err := r.db.WithContext(c).Table("users u").Select("u.*").Where("username = ?", username).First(&user).Error; err != nil {
		return nil, err
	}
	return user, nil
}

func (r *UserRepository) GetUserByID(c context.Context, userID int) (*uModel.User, error) {
	var user *uModel.User
	if err := r.db.WithContext(c).Table("users u").Select("u.*").Where("u.id = ?", userID).First(&user).Error; err != nil {
		return nil, err
	}
	return user, nil
}

func (r *UserRepository) GetChildUsersByParentID(c context.Context, parentID int) ([]*uModel.User, error) {
	var childUsers []*uModel.User
	if err := r.db.WithContext(c).Where("parent_user_id = ? AND user_type = ?", parentID, uModel.UserTypeChild).Find(&childUsers).Error; err != nil {
		return nil, err
	}
	return childUsers, nil
}

func (r *UserRepository) GetChildUserCount(c context.Context, parentID int) (int64, error) {
	var count int64
	if err := r.db.WithContext(c).Model(&uModel.User{}).Where("parent_user_id = ? AND user_type = ?", parentID, uModel.UserTypeChild).Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

func (r *UserRepository) UpdateUser(c context.Context, user *uModel.User) error {
	return r.db.WithContext(c).Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(user).Error; err != nil {
			return err
		}
		if user.CircleID != 0 {
			if err := tx.Model(&storageModel.StorageUsage{}).
				Where("user_id = ? AND circle_id = 0", user.ID).
				Update("circle_id", user.CircleID).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *UserRepository) UpdateUserCircle(c context.Context, userID, circleID int) error {
	return r.db.WithContext(c).Model(&uModel.User{}).Where("id = ?", userID).Update("circle_id", circleID).Error
}

func (r *UserRepository) FindByEmail(c context.Context, email string) (*uModel.UserDetails, error) {
	var user *uModel.UserDetails
	if err := r.db.WithContext(c).Table("users u").Select("u.*").Where("email = ?", email).First(&user).Error; err != nil {
		return nil, err
	}
	return user, nil
}

func (r *UserRepository) SetPasswordResetToken(c context.Context, email, token string) error {
	// confirm user exists with email:
	user, err := r.FindByEmail(c, email)
	if err != nil {
		return err
	}
	// save new token:
	if err := r.db.WithContext(c).Model(&uModel.UserPasswordReset{}).Save(&uModel.UserPasswordReset{
		UserID:         user.ID,
		Token:          token,
		Email:          email,
		ExpirationDate: time.Now().UTC().Add(time.Hour * 24),
	}).Error; err != nil {
		return err
	}
	return nil
}

func (r *UserRepository) UpdatePasswordByToken(ctx context.Context, email string, token string, password string) error {
	logger := logging.FromContext(ctx)

	logger.Debugw("account.db.UpdatePasswordByToken", "email", email)
	upr := &uModel.UserPasswordReset{
		Email: email,
		Token: token,
	}
	result := r.db.WithContext(ctx).Where("email = ?", email).Where("token = ?", token).Delete(upr)
	if result.RowsAffected <= 0 {
		return fmt.Errorf("invalid token")
	}
	// find account by email and update password:
	chain := r.db.WithContext(ctx).Model(&uModel.User{}).Where("email = ?", email).UpdateColumns(map[string]interface{}{"password": password})
	if chain.Error != nil {
		return chain.Error
	}
	if chain.RowsAffected == 0 {
		return fmt.Errorf("account not found")
	}

	return nil
}

func (r *UserRepository) StoreAPIToken(c context.Context, userID int, name string, tokenBody string, tokenPrefix string) (*uModel.APIToken, error) {
	fullToken := uModel.BuildFullToken(tokenPrefix, tokenBody)

	hashHex := hashAPIToken(fullToken)

	if len(tokenBody) < 4 {
		return nil, errors.New("token body too short to derive a suffix")
	}
	suffix := tokenBody[len(tokenBody)-4:]

	apiToken := &uModel.APIToken{
		UserID:    userID,
		Name:      name,
		Token:     hashHex,
		Prefix:    &tokenPrefix,
		Suffix:    &suffix,
		CreatedAt: time.Now().UTC(),
	}
	if err := r.db.WithContext(c).Model(&uModel.APIToken{}).Save(
		apiToken).Error; err != nil {
		return nil, err

	}
	return apiToken, nil
}

func (r *UserRepository) GetUserByToken(c context.Context, token string) (*uModel.UserDetails, error) {
	var user *uModel.UserDetails

	if strings.HasPrefix(token, uModel.APITokenPrefix) {
		token = hashAPIToken(token)
	}

	if err := r.db.WithContext(c).Table("users u").Select("u.*").Joins("left join api_tokens at on at.user_id = u.id").Where("at.token = ?", token).First(&user).Error; err != nil {
		return nil, err
	}

	return user, nil
}

// Hashes a full raw token for storage (on creation) and lookup comparison (on verification)
func hashAPIToken(rawToken string) string {
	hashBytes := sha256.Sum256([]byte(rawToken))
	return hex.EncodeToString(hashBytes[:])
}

func (r *UserRepository) GetAllUserTokens(c context.Context, userID int) ([]*uModel.APIToken, error) {
	var tokens []*uModel.APIToken
	if err := r.db.WithContext(c).Where("user_id = ?", userID).Find(&tokens).Error; err != nil {
		return nil, err
	}
	return tokens, nil
}

func (r *UserRepository) DeleteAPIToken(c context.Context, userID int, tokenID string) error {
	return r.db.WithContext(c).Where("id = ? AND user_id = ?", tokenID, userID).Delete(&uModel.APIToken{}).Error
}

func (r *UserRepository) UpdatePasswordByUserId(c context.Context, userID int, password string) error {
	return r.db.WithContext(c).Model(&uModel.User{}).Where("id = ?", userID).Update("password", password).Error
}
func (r *UserRepository) UpdateUserImage(c context.Context, userID int, image string) error {
	return r.db.WithContext(c).Model(&uModel.User{}).Where("id = ?", userID).Update("image", image).Error
}

// MFA-related methods

// EnableMFA enables MFA for a user with the provided secret and backup codes
func (r *UserRepository) EnableMFA(c context.Context, userID int, secret string, backupCodes []string) error {
	backupCodesJSON, err := json.Marshal(backupCodes)
	if err != nil {
		return err
	}

	return r.db.WithContext(c).Model(&uModel.User{}).Where("id = ?", userID).Updates(map[string]interface{}{
		"mfa_enabled":             true,
		"mfa_secret":              secret,
		"mfa_backup_codes":        string(backupCodesJSON),
		"mfa_recovery_codes_used": "[]",
	}).Error
}

// DisableMFA disables MFA for a user
func (r *UserRepository) DisableMFA(c context.Context, userID int) error {
	return r.db.WithContext(c).Model(&uModel.User{}).Where("id = ?", userID).Updates(map[string]interface{}{
		"mfa_enabled":             false,
		"mfa_secret":              "",
		"mfa_backup_codes":        "",
		"mfa_recovery_codes_used": "",
	}).Error
}

// UpdateMFARecoveryCodes updates the used recovery codes for a user
func (r *UserRepository) UpdateMFARecoveryCodes(c context.Context, userID int, usedCodes string) error {
	return r.db.WithContext(c).Model(&uModel.User{}).Where("id = ?", userID).Update("mfa_recovery_codes_used", usedCodes).Error
}

// MFA Session methods

// CreateMFASession creates a new MFA session
func (r *UserRepository) CreateMFASession(c context.Context, session *uModel.MFASession) error {
	return r.db.WithContext(c).Create(session).Error
}

// GetMFASession retrieves an MFA session by token
func (r *UserRepository) GetMFASession(c context.Context, sessionToken string) (*uModel.MFASession, error) {
	var session uModel.MFASession
	if err := r.db.WithContext(c).Where("session_token = ? AND expires_at > ?", sessionToken, time.Now().UTC()).First(&session).Error; err != nil {
		return nil, err
	}
	return &session, nil
}

// UpdateMFASession updates an MFA session
func (r *UserRepository) UpdateMFASession(c context.Context, session *uModel.MFASession) error {
	return r.db.WithContext(c).Save(session).Error
}

// DeleteMFASession deletes an MFA session
func (r *UserRepository) DeleteMFASession(c context.Context, sessionToken string) error {
	return r.db.WithContext(c).Where("session_token = ?", sessionToken).Delete(&uModel.MFASession{}).Error
}

// CleanupExpiredMFASessions removes expired MFA sessions
func (r *UserRepository) CleanupExpiredMFASessions(c context.Context) error {
	return r.db.WithContext(c).Where("expires_at < ?", time.Now().UTC()).Delete(&uModel.MFASession{}).Error
}

// UserSession methods for refresh token management

// CreateUserSession creates a new user session (refresh token)
func (r *UserRepository) CreateUserSession(c context.Context, session *uModel.UserSession) error {
	return r.db.WithContext(c).Create(session).Error
}

// GetUserSessionByTokenHash retrieves a user session by token hash
func (r *UserRepository) GetUserSessionByTokenHash(c context.Context, tokenHash string) (*uModel.UserSession, error) {
	var session uModel.UserSession
	if err := r.db.WithContext(c).Where("token_hash = ? AND expires_at > ? AND revoked_at IS NULL", tokenHash, time.Now().UTC()).First(&session).Error; err != nil {
		return nil, err
	}
	return &session, nil
}

// MarkSessionUsed marks a session as used (for token rotation detection)
func (r *UserRepository) MarkSessionUsed(c context.Context, sessionID string) error {
	now := time.Now().UTC()
	return r.db.WithContext(c).Model(&uModel.UserSession{}).Where("id = ?", sessionID).Update("used_at", now).Error
}

// RevokeSession revokes a specific session
func (r *UserRepository) RevokeSession(c context.Context, sessionID string) error {
	now := time.Now().UTC()
	return r.db.WithContext(c).Model(&uModel.UserSession{}).Where("id = ?", sessionID).Update("revoked_at", now).Error
}

// RevokeSessionFamily revokes all sessions in a token family (security measure)
func (r *UserRepository) RevokeSessionFamily(c context.Context, familyID string) error {
	now := time.Now().UTC()
	return r.db.WithContext(c).Model(&uModel.UserSession{}).Where("family_id = ? AND revoked_at IS NULL", familyID).Update("revoked_at", now).Error
}

// RevokeAllUserSessions revokes all sessions for a user (logout from all devices)
func (r *UserRepository) RevokeAllUserSessions(c context.Context, userID int) error {
	now := time.Now().UTC()
	return r.db.WithContext(c).Model(&uModel.UserSession{}).Where("user_id = ? AND revoked_at IS NULL", userID).Update("revoked_at", now).Error
}

// CleanupExpiredSessions removes expired and revoked sessions
func (r *UserRepository) CleanupExpiredSessions(c context.Context) error {
	now := time.Now().UTC()
	return r.db.WithContext(c).Where("expires_at < ? OR revoked_at IS NOT NULL", now).Delete(&uModel.UserSession{}).Error
}
