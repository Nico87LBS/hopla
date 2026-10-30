package model

import (
	"testing"
	"time"

	fModel "github.com/nico87lbs/hopla/internal/family/model"
)

func familyUser(userID int, role fModel.UserRole, active bool) *fModel.UserFamilyDetail {
	return &fModel.UserFamilyDetail{UserFamily: fModel.UserFamily{UserID: userID, Role: role, IsActive: active}}
}

func TestCanDelegate(t *testing.T) {
	updatedAt := time.Now().UTC().Add(-time.Minute)
	chore := &Chore{CreatedBy: 1, UpdatedAt: updatedAt}
	familyUsers := []*fModel.UserFamilyDetail{
		familyUser(1, "admin", true),
		familyUser(2, "member", true),
		familyUser(3, "member", false),
	}
	now := time.Now().UTC()
	stale := updatedAt.Add(-time.Minute)
	future := now.Add(time.Hour)

	tests := []struct {
		name      string
		userID    int
		updatedAt *time.Time
		wantErr   bool
	}{
		{"admin", 1, &now, false},
		{"member who is neither creator nor admin", 2, &now, false},
		{"inactive member", 3, &now, true},
		{"not in family", 4, &now, true},
		{"stale updatedAt", 2, &stale, true},
		{"updatedAt in the future", 2, &future, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := chore.CanDelegate(tt.userID, familyUsers, tt.updatedAt)
			if (err != nil) != tt.wantErr {
				t.Errorf("CanDelegate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}
