package family

import (
	"time"
)

type Family struct {
	ID         int       `json:"id" gorm:"primary_key"`                 // Unique identifier
	Name       string    `json:"name" gorm:"column:name"`               // Full name
	CreatedBy  int       `json:"created_by" gorm:"column:created_by"`   // Created by
	CreatedAt  time.Time `json:"created_at" gorm:"column:created_at"`   // Created at
	UpdatedAt  time.Time `json:"updated_at" gorm:"column:updated_at"`   // Updated at
	InviteCode string    `json:"invite_code" gorm:"column:invite_code"` // Invite code
	Disabled   bool      `json:"disabled" gorm:"column:disabled"`       // Disabled
	// Timezone is the family's IANA zone, empty for the server's (TZ). See
	// package zone.
	Timezone string `json:"timezone" gorm:"column:timezone"`
	// ParentsOnPodium puts the parents on the podium with the children.
	// Without children, the parents are always on it.
	ParentsOnPodium bool `json:"parentsOnPodium" gorm:"column:parents_on_podium;not null;default:false"`
	// Currency names what the family earns, one of Currencies.
	Currency string `json:"currency" gorm:"column:currency;not null;default:hops"`
}

// Currencies are the names a family can give to what it earns, the first
// being the default. The clients translate them.
var Currencies = []string{"hops", "points", "stars", "carrots", "coins", "tokens"}

// CurrencyOf is the family's currency, the default for an unknown one.
func CurrencyOf(name string) string {
	for _, c := range Currencies {
		if c == name {
			return c
		}
	}
	return Currencies[0]
}

type FamilyDetail struct {
	Family
	UserRole string `json:"userRole" gorm:"column:role"`
}

type UserFamily struct {
	ID             int       `json:"id" gorm:"primary_key"`                                        // Unique identifier
	UserID         int       `json:"userId" gorm:"column:user_id;uniqueIndex:idx_user_family"`     // User ID
	FamilyID       int       `json:"familyId" gorm:"column:family_id;uniqueIndex:idx_user_family"` // Family ID
	Role           UserRole  `json:"role" gorm:"column:role"`                                      // Role
	IsActive       bool      `json:"isActive" gorm:"column:is_active;default:false"`
	CreatedAt      time.Time `json:"createdAt" gorm:"column:created_at"`                              // Created at
	UpdatedAt      time.Time `json:"updatedAt" gorm:"column:updated_at"`                              // Updated at
	Points         int       `json:"points" gorm:"column:points;default:0;not null"`                  // Points
	PointsRedeemed int       `json:"pointsRedeemed" gorm:"column:points_redeemed;default:0;not null"` // Points Redeemed
	// StreakSince is the last points reset: tasks done before it no longer
	// count towards the member's streak.
	StreakSince *time.Time `json:"-" gorm:"column:streak_since"`
	// Away pauses the member's tasks and games, such as a child staying at
	// the other parent's home.
	Away bool `json:"away" gorm:"column:away;default:false;not null"`
}

type UserRole string

const (
	UserRoleAdmin   UserRole = "admin"
	UserRoleMember  UserRole = "member"
	UserRoleManager UserRole = "manager"
)

type UserFamilyDetail struct {
	UserFamily
	Username    string `json:"username" gorm:"column:username"`
	DisplayName string `json:"displayName" gorm:"column:display_name"`
	Image       string `json:"image" gorm:"column:image"` // Image
}

type Role string

const (
	RoleAdmin   Role = "admin"
	RoleMember  Role = "member"
	RoleManager Role = "manager"
)

// write isValidRole method for Role type:
func IsValidRole(r Role) bool {
	switch r {
	case RoleAdmin, RoleMember, RoleManager:
		return true
	default:
		return false
	}
}

func (ucd UserFamilyDetail) IsManagerOrAdmin() bool {
	return ucd.Role == UserRoleAdmin || ucd.Role == UserRoleManager
}
