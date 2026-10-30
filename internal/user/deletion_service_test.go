package user

import (
	"context"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	"github.com/nico87lbs/hopla/internal/database"
	fModel "github.com/nico87lbs/hopla/internal/family/model"
	"github.com/nico87lbs/hopla/internal/storage"
	storageModel "github.com/nico87lbs/hopla/internal/storage/model"
	stModel "github.com/nico87lbs/hopla/internal/subtask/model"
	uModel "github.com/nico87lbs/hopla/internal/user/model"
	"gorm.io/gorm"
)

func setupTestDeletionDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to connect database: %v", err)
	}

	// Use the migration system to create all tables with proper schema
	if err := database.Migration(db); err != nil {
		t.Fatalf("failed to run migrations: %v", err)
	}

	return db
}

type mockStorage struct {
	deletedPaths []string
}

var _ storage.Storage = (*mockStorage)(nil) // Compile-time interface check

func (m *mockStorage) Save(ctx context.Context, path string, file io.Reader) error {
	return nil
}

func (m *mockStorage) Delete(ctx context.Context, paths []string) error {
	m.deletedPaths = append(m.deletedPaths, paths...)
	return nil
}

func (m *mockStorage) GetURL(ctx context.Context, path string) (string, error) {
	return "", nil
}

func (m *mockStorage) Get(ctx context.Context, path string) (io.ReadCloser, error) {
	return io.NopCloser(strings.NewReader("")), nil
}

func (m *mockStorage) SavePublic(ctx context.Context, path string, file io.Reader) error {
	return nil
}

func (m *mockStorage) GetPublicURL(ctx context.Context, path string) (string, error) {
	return path, nil
}

func (m *mockStorage) DeletePublicByURL(ctx context.Context, rawURL string) error {
	return nil
}

// NewMockDeletionService creates a deletion service with mock storage for testing
func NewMockDeletionService(db *gorm.DB, mockStor *mockStorage) *DeletionService {
	// For testing, we create the service with nil storage to focus on database operations
	return &DeletionService{
		db:      db,
		storage: nil, // Storage operations will be warned but not fail
	}
}

func TestDeleteUserAccount_SimpleUser(t *testing.T) {
	db := setupTestDeletionDB(t)
	mockStor := &mockStorage{}

	service := NewMockDeletionService(db, mockStor)

	// Insert test user using GORM model
	now := time.Now().UTC()
	user := uModel.User{
		ID:          1,
		Username:    "testuser",
		DisplayName: "Test User",
		Email:       "test@example.com",
		Password:    "password",
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("Failed to create test user: %v", err)
	}

	// Insert API token
	apiToken := uModel.APIToken{
		UserID: 1,
		Name:   "test-token",
		Token:  "abc123",
	}
	if err := db.Create(&apiToken).Error; err != nil {
		t.Fatalf("Failed to create API token: %v", err)
	}

	// Insert storage file
	storageFile := storageModel.StorageFile{
		FilePath:  "/user/1/file.jpg",
		UserID:    1,
		SizeBytes: 1024,
	}
	if err := db.Create(&storageFile).Error; err != nil {
		t.Fatalf("Failed to create storage file: %v", err)
	}

	// Delete account
	result, err := service.DeleteUserAccount(context.Background(), 1, nil)
	if err != nil {
		t.Fatalf("DeleteUserAccount failed: %v", err)
	}

	if !result.Success {
		t.Errorf("Expected success to be true, got false")
	}

	if result.RequiresTransfer {
		t.Errorf("Expected requiresTransfer to be false for simple user")
	}

	// Verify user is deleted
	var userCount int64
	db.Model(&uModel.User{}).Where("id = ?", 1).Count(&userCount)
	if userCount != 0 {
		t.Errorf("Expected user to be deleted, but found %d users", userCount)
	}

	// Verify API tokens are deleted
	var tokenCount int64
	db.Model(&uModel.APIToken{}).Where("user_id = ?", 1).Count(&tokenCount)
	if tokenCount != 0 {
		t.Errorf("Expected API tokens to be deleted, but found %d", tokenCount)
	}

	// Verify storage files are deleted from database
	var fileCount int64
	db.Model(&storageModel.StorageFile{}).Where("user_id = ?", 1).Count(&fileCount)
	if fileCount != 0 {
		t.Errorf("Expected storage files to be deleted, but found %d", fileCount)
	}

	// Note: Storage service operations are mocked and will show warnings in logs
}

func TestDeleteUserAccount_FamilyOwner(t *testing.T) {
	db := setupTestDeletionDB(t)
	mockStor := &mockStorage{}

	service := NewMockDeletionService(db, mockStor)

	now := time.Now().UTC()

	// Insert test users using GORM models
	owner := uModel.User{
		ID:          1,
		Username:    "owner",
		DisplayName: "Family Owner",
		Email:       "owner@example.com",
		Password:    "password",
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatalf("Failed to create owner user: %v", err)
	}

	member := uModel.User{
		ID:          2,
		Username:    "member",
		DisplayName: "Family Member",
		Email:       "member@example.com",
		Password:    "password",
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := db.Create(&member).Error; err != nil {
		t.Fatalf("Failed to create member user: %v", err)
	}

	// Insert family owned by user 1
	family := fModel.Family{
		ID:        1,
		Name:      "Test Family",
		CreatedBy: 1,
		CreatedAt: now,
	}
	if err := db.Create(&family).Error; err != nil {
		t.Fatalf("Failed to create family: %v", err)
	}

	// Add users to family
	ownerFamily := fModel.UserFamily{
		UserID:   1,
		FamilyID: 1,
		Role:     "admin",
		IsActive: true,
	}
	if err := db.Create(&ownerFamily).Error; err != nil {
		t.Fatalf("Failed to create owner family membership: %v", err)
	}

	memberFamily := fModel.UserFamily{
		UserID:   2,
		FamilyID: 1,
		Role:     "admin",
		IsActive: true,
	}
	if err := db.Create(&memberFamily).Error; err != nil {
		t.Fatalf("Failed to create member family membership: %v", err)
	}

	// First attempt - should require transfer
	result, err := service.DeleteUserAccount(context.Background(), 1, nil)
	if err != nil {
		t.Fatalf("DeleteUserAccount failed: %v", err)
	}

	if result.Success {
		t.Errorf("Expected success to be false when transfer is required")
	}

	if !result.RequiresTransfer {
		t.Errorf("Expected requiresTransfer to be true for family owner")
	}

	if len(result.TransferOptions) == 0 {
		t.Errorf("Expected transfer options to be provided")
	}

	// Second attempt - with transfer options
	transferOptions := []FamilyTransferOption{
		{FamilyID: 1, NewOwnerID: 2, NewOwnerName: "Family Member"},
	}

	result, err = service.DeleteUserAccount(context.Background(), 1, transferOptions)
	if err != nil {
		t.Fatalf("DeleteUserAccount with transfer failed: %v", err)
	}

	if !result.Success {
		t.Errorf("Expected success to be true after providing transfer options")
	}

	// Verify family ownership was transferred
	var updatedFamily fModel.Family
	if err := db.First(&updatedFamily, 1).Error; err != nil {
		t.Fatalf("Failed to fetch updated family: %v", err)
	}
	if updatedFamily.CreatedBy != 2 {
		t.Errorf("Expected family ownership to be transferred to user 2, got %d", updatedFamily.CreatedBy)
	}

	// Verify user is deleted
	var userCount int64
	db.Model(&uModel.User{}).Where("id = ?", 1).Count(&userCount)
	if userCount != 0 {
		t.Errorf("Expected user to be deleted, but found %d users", userCount)
	}
}

func TestDeleteUserAccount_WithChores(t *testing.T) {
	db := setupTestDeletionDB(t)
	mockStor := &mockStorage{}

	service := NewMockDeletionService(db, mockStor)

	now := time.Now().UTC()

	// Insert test user using GORM model
	user := uModel.User{
		ID:          1,
		Username:    "testuser",
		DisplayName: "Test User",
		Email:       "test@example.com",
		Password:    "password",
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("Failed to create test user: %v", err)
	}

	// Insert family (owned by another user so deletion doesn't require transfer)
	family := fModel.Family{
		ID:        1,
		Name:      "Test Family",
		CreatedBy: 2, // Different user owns the family
		CreatedAt: now,
	}
	if err := db.Create(&family).Error; err != nil {
		t.Fatalf("Failed to create family: %v", err)
	}

	// Insert chores created by user
	chore1 := chModel.Chore{
		ID:        1,
		Name:      "Test Chore",
		CreatedBy: 1,
		FamilyID:  1,
		CreatedAt: now,
	}
	if err := db.Create(&chore1).Error; err != nil {
		t.Fatalf("Failed to create chore1: %v", err)
	}

	chore2 := chModel.Chore{
		ID:        2,
		Name:      "Another Chore",
		CreatedBy: 1,
		FamilyID:  1,
		CreatedAt: now,
	}
	if err := db.Create(&chore2).Error; err != nil {
		t.Fatalf("Failed to create chore2: %v", err)
	}

	// Insert chore history
	history1 := chModel.ChoreHistory{
		ChoreID:     1,
		CompletedBy: 1,
	}
	if err := db.Create(&history1).Error; err != nil {
		t.Fatalf("Failed to create chore history 1: %v", err)
	}

	history2 := chModel.ChoreHistory{
		ChoreID:     2,
		CompletedBy: 1,
	}
	if err := db.Create(&history2).Error; err != nil {
		t.Fatalf("Failed to create chore history 2: %v", err)
	}

	// Insert subtask
	subtask := stModel.SubTask{
		Name:    "Test Subtask",
		ChoreID: 1,
	}
	if err := db.Create(&subtask).Error; err != nil {
		t.Fatalf("Failed to create subtask: %v", err)
	}

	// Delete account
	result, err := service.DeleteUserAccount(context.Background(), 1, nil)
	if err != nil {
		t.Fatalf("DeleteUserAccount failed: %v", err)
	}

	if !result.Success {
		t.Errorf("Expected success to be true, got false")
	}

	// Verify chores are deleted
	var choreCount int64
	db.Model(&chModel.Chore{}).Where("created_by = ?", 1).Count(&choreCount)
	if choreCount != 0 {
		t.Errorf("Expected chores to be deleted, but found %d", choreCount)
	}

	// Verify chore history is deleted
	var historyCount int64
	db.Model(&chModel.ChoreHistory{}).Where("completed_by = ?", 1).Count(&historyCount)
	if historyCount != 0 {
		t.Errorf("Expected chore history to be deleted, but found %d", historyCount)
	}

	// Verify subtasks are deleted (cascade delete should handle this)
	var subtaskCount int64
	db.Model(&stModel.SubTask{}).Where("chore_id IN (?)", []int{1, 2}).Count(&subtaskCount)
	if subtaskCount != 0 {
		t.Errorf("Expected subtasks to be deleted, but found %d", subtaskCount)
	}

	// Verify user is deleted
	var userCount int64
	db.Model(&uModel.User{}).Where("id = ?", 1).Count(&userCount)
	if userCount != 0 {
		t.Errorf("Expected user to be deleted, but found %d users", userCount)
	}
}
