package repo

import (
	"context"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"github.com/nico87lbs/hopla/config"
	errorx "github.com/nico87lbs/hopla/internal/error"
	st "github.com/nico87lbs/hopla/internal/storage/model"
	uModel "github.com/nico87lbs/hopla/internal/user/model"
)

func newRepo(t *testing.T, room int) (*StorageRepository, *gorm.DB) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&st.StorageFile{}, &st.StorageUsage{}))
	cfg := &config.Config{Storage: config.StorageConfig{MaxUserStorage: room}}
	return NewStorageRepository(db, cfg), db
}

func member(id, family int) *uModel.UserDetails {
	return &uModel.UserDetails{User: uModel.User{ID: id, FamilyID: family}}
}

func TestAddMediaRecordGivesAUsageRowToAMemberWithoutOne(t *testing.T) {
	repo, db := newRepo(t, 1000)
	ctx := context.Background()

	require.NoError(t, repo.AddMediaRecord(ctx, &st.StorageFile{FilePath: "a.jpg", SizeBytes: 300, UserID: 7}, member(7, 2)))
	require.NoError(t, repo.AddMediaRecord(ctx, &st.StorageFile{FilePath: "b.jpg", SizeBytes: 200, UserID: 7}, member(7, 2)))

	var usage st.StorageUsage
	require.NoError(t, db.Where("user_id = ?", 7).First(&usage).Error)
	require.Equal(t, 500, usage.UsedBytes)
	require.Equal(t, 2, usage.FamilyID)
}

func TestAddMediaRecordStillRefusesWhenTheFamilyIsFull(t *testing.T) {
	repo, db := newRepo(t, 1000)
	ctx := context.Background()
	require.NoError(t, repo.CreateStorageUsage(ctx, 7, 2))
	require.NoError(t, repo.AddMediaRecord(ctx, &st.StorageFile{FilePath: "a.jpg", SizeBytes: 900, UserID: 7}, member(7, 2)))

	err := repo.AddMediaRecord(ctx, &st.StorageFile{FilePath: "b.jpg", SizeBytes: 200, UserID: 8}, member(8, 2))
	require.ErrorIs(t, err, errorx.ErrNotEnoughSpace)
	var count int64
	require.NoError(t, db.Model(&st.StorageFile{}).Count(&count).Error)
	require.EqualValues(t, 1, count)
}
