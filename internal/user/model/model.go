package user

import (
	"errors"
	"strings"
	"time"

	fModel "github.com/nico87lbs/hopla/internal/family/model"
)

type User struct {
	ID          int              `json:"id" gorm:"primary_key"`                                                      // Unique identifier
	DisplayName string           `json:"displayName" gorm:"column:display_name"`                                     // Display name
	Username    string           `json:"username" gorm:"column:username;unique"`                                     // Username (unique)
	Email       string           `json:"email" gorm:"column:email;uniqueIndex:idx_email_not_null,where:email != ''"` // Email (unique when not empty, allows empty for child users)
	Provider    AuthProviderType `json:"provider" gorm:"column:provider"`                                            // Provider
	Password    string           `json:"-" gorm:"column:password"`                                                   // Password
	FamilyID    int              `json:"familyID" gorm:"column:family_id"`                                           // Family ID
	Image       string           `json:"image" gorm:"column:image"`                                                  // Image
	Timezone    string           `json:"timezone" gorm:"column:timezone"`                                            // Timezone
	// Parent-Child relationship fields
	ParentUserID *int     `json:"parentUserId,omitempty" gorm:"column:parent_user_id;index"`
	UserType     UserType `json:"userType" gorm:"column:user_type;default:0"`
	// MFA fields
	MFAEnabled      bool      `json:"mfaEnabled" gorm:"column:mfa_enabled;default:false;not null"`    // MFA enabled status
	MFASecret       string    `json:"-" gorm:"column:mfa_secret;type:text"`                           // TOTP secret (hidden from JSON)
	MFABackupCodes  string    `json:"-" gorm:"column:mfa_backup_codes;type:text"`                     // JSON array of backup codes
	MFARecoveryUsed string    `json:"-" gorm:"column:mfa_recovery_codes_used;type:text;default:'[]'"` // JSON array of used recovery codes
	CreatedAt       time.Time `json:"created_at" gorm:"column:created_at"`                            // Created at
	UpdatedAt       time.Time `json:"updated_at" gorm:"column:updated_at"`                            // Updated at
	Disabled        bool      `json:"disabled" gorm:"column:disabled"`                                // Disabled
	// Email    string `json:"email" gorm:"column:email"`       // Email
}
type UserDetails struct {
	User
}

type UserPasswordReset struct {
	ID             int       `gorm:"column:id"`
	UserID         int       `gorm:"column:user_id"`
	Email          string    `gorm:"column:email"`
	Token          string    `gorm:"column:token"`
	ExpirationDate time.Time `gorm:"column:expiration_date"`
}

type APIToken struct {
	ID        int       `json:"id" gorm:"primary_key"`              // Unique identifier
	Name      string    `json:"name" gorm:"column:name"`            // Name (display only, not unique)
	UserID    int       `json:"userId" gorm:"column:user_id;index"` // Index on userID
	Token     string    `json:"token" gorm:"column:token;index"`    // Index on token
	Prefix    *string   `json:"prefix" gorm:"column:prefix"`        // Token format/type marker, e.g. "hp_"
	Suffix    *string   `json:"suffix" gorm:"column:suffix"`        // Last few chars of the token, for masked display
	CreatedAt time.Time `json:"createdAt" gorm:"column:created_at"`
}

const APITokenPrefix = "hp_"

func BuildFullToken(prefix, body string) string {
	return prefix + body
}

type AuthProviderType int

const (
	AuthProviderLocal AuthProviderType = iota
	AuthProviderOAuth2
	AuthProviderGoogle
	AuthProviderApple
)

type UserType int

const (
	UserTypeParent UserType = iota
	UserTypeChild
)

// MFASession represents a temporary session during MFA verification
type MFASession struct {
	ID           int       `json:"id" gorm:"primary_key;auto_increment"`
	SessionToken string    `json:"sessionToken" gorm:"column:session_token;type:varchar(255);unique;not null;index"`
	UserID       int       `json:"userId" gorm:"column:user_id;not null;index"`
	AuthMethod   string    `json:"authMethod" gorm:"column:auth_method;type:varchar(50);not null"` // 'local', 'google', 'oauth2'
	Verified     bool      `json:"verified" gorm:"column:verified;default:false;not null"`
	CreatedAt    time.Time `json:"createdAt" gorm:"column:created_at;not null"`
	ExpiresAt    time.Time `json:"expiresAt" gorm:"column:expires_at;not null;index"`
	UserData     string    `json:"-" gorm:"column:user_data;type:text"` // JSON data to complete auth after MFA
}

// UserSession represents refresh tokens for JWT authentication with rotation
type UserSession struct {
	ID          string     `json:"id" gorm:"primaryKey;type:varchar(36)"`                                // UUID primary key
	UserID      int        `json:"userId" gorm:"column:user_id;not null;index"`                          // User ID foreign key
	TokenHash   string     `json:"-" gorm:"column:token_hash;type:varchar(255);unique;not null;index"`   // Hashed refresh token
	TokenFamily string     `json:"-" gorm:"column:token_family;type:varchar(36);not null;index"`         // Token family for rotation tracking
	CreatedAt   time.Time  `json:"createdAt" gorm:"column:created_at;not null"`                          // Creation timestamp
	ExpiresAt   time.Time  `json:"expiresAt" gorm:"column:expires_at;not null;index"`                    // Expiration timestamp
	UsedAt      *time.Time `json:"-" gorm:"column:used_at"`                                              // When token was used (for reuse detection)
	RevokedAt   *time.Time `json:"-" gorm:"column:revoked_at"`                                           // When token was revoked
	User        User       `json:"-" gorm:"foreignKey:UserID;references:ID;constraint:OnDelete:CASCADE"` // User relationship
}

// MFASetupResponse represents the response when setting up MFA
type MFASetupResponse struct {
	Secret      string   `json:"secret"`
	QRCodeURL   string   `json:"qrCodeUrl"`
	BackupCodes []string `json:"backupCodes"`
}

// MFAVerifyRequest represents a request to verify MFA code
type MFAVerifyRequest struct {
	Code         string `json:"code" binding:"required"`
	SessionToken string `json:"sessionToken,omitempty"` // For login flow
}

func (u User) IsAdminOrManager(familyUsers []*fModel.UserFamilyDetail) bool {
	for _, cu := range familyUsers {
		if cu.UserID == u.ID {
			return cu.Role == fModel.UserRoleAdmin || cu.Role == fModel.UserRoleManager
		}
	}
	return false
}

// Parent-Child relationship helper methods

// IsParent returns true if the user is a parent user
func (u User) IsParent() bool {
	return u.UserType == UserTypeParent
}

// IsChild returns true if the user is a child user
func (u User) IsChild() bool {
	return u.UserType == UserTypeChild
}

// HasParent returns true if the user has a parent (is a child with valid parent ID)
func (u User) HasParent() bool {
	return u.UserType == UserTypeChild && u.ParentUserID != nil
}

// GetParentUserID returns the parent user ID if this is a child user
func (u User) GetParentUserID() *int {
	if u.UserType == UserTypeChild {
		return u.ParentUserID
	}
	return nil
}

// GenerateChildUsername creates a username for a child user based on parent username
func GenerateChildUsername(parentUsername, childName string) string {
	return parentUsername + "_" + childName
}

// IsValidChildUsername checks if a username follows the parent_child pattern
func IsValidChildUsername(username string) bool {
	parts := strings.Split(username, "_")
	return len(parts) >= 2
}

// ExtractParentUsernameFromChild extracts parent username from child username
func ExtractParentUsernameFromChild(childUsername string) string {
	parts := strings.Split(childUsername, "_")
	if len(parts) >= 2 {
		return strings.Join(parts[:len(parts)-1], "_")
	}
	return ""
}

// ValidateChildUser validates a child user before creation
func (u User) ValidateChildUser() error {
	if u.UserType != UserTypeChild {
		return nil // Not a child user, no validation needed
	}

	// Child user must have a parent
	if u.ParentUserID == nil {
		return errors.New("child user must have a parent user ID")
	}

	// Username should follow parent_child pattern
	if !IsValidChildUsername(u.Username) {
		return errors.New("child username must follow parent_child pattern")
	}

	// Email is optional for child users (can be empty)
	// Password is required for child users
	if u.Password == "" {
		return errors.New("child user must have a password")
	}

	return nil
}

// ValidateParentUser validates a parent user before creation
func (u User) ValidateParentUser() error {
	if u.UserType != UserTypeParent {
		return nil // Not a parent user, no validation needed
	}

	// Parent user should not have a parent
	if u.ParentUserID != nil {
		return errors.New("parent user cannot have a parent user ID")
	}

	// Parent user must have an email for authentication and subscription management
	if u.Email == "" {
		return errors.New("parent user must have an email")
	}

	return nil
}
