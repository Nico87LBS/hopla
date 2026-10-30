package repo

import (
	"context"
	"time"

	"github.com/nico87lbs/hopla/config"
	errorx "github.com/nico87lbs/hopla/internal/error"

	st "github.com/nico87lbs/hopla/internal/storage/model"
	uModel "github.com/nico87lbs/hopla/internal/user/model"
	"gorm.io/gorm"
)

type StorageRepository struct {
	db             *gorm.DB
	maxUserStorage int
}

func NewStorageRepository(db *gorm.DB, config *config.Config) *StorageRepository {
	return &StorageRepository{db: db, maxUserStorage: config.Storage.MaxUserStorage}
}

func (r *StorageRepository) AddMediaRecord(ctx context.Context, media *st.StorageFile, user *uModel.UserDetails) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Check total family-wide usage against quota (all members share the same pool).
		var familyUsed int64
		if err := tx.Model(&st.StorageUsage{}).
			Select("COALESCE(SUM(used_bytes), 0)").
			Where("family_id = ?", user.FamilyID).
			Scan(&familyUsed).Error; err != nil {
			return err
		}
		if int(familyUsed)+media.SizeBytes > r.maxUserStorage {
			return errorx.ErrNotEnoughSpace
		}

		// Increment only this user's own row.
		res := tx.Model(&st.StorageUsage{}).
			Where("user_id = ?", user.ID).
			Updates(map[string]interface{}{"used_bytes": gorm.Expr("used_bytes + ?", media.SizeBytes)})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return errorx.ErrNotEnoughSpace
		}

		if err := tx.Model(&st.StorageFile{}).Create(&media).Error; err != nil {
			return err
		}
		return nil
	})
}

func (r *StorageRepository) RemoveFileRecords(ctx context.Context, files []*st.StorageFile, userID int) error {
	// create transaction and increment the storage then save the file:
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {

		ids := make([]string, len(files))
		filesSize := 0
		for i, file := range files {
			ids[i] = file.FilePath
			filesSize += file.SizeBytes
		}

		// delete the files:
		if err := tx.Model(&st.StorageFile{}).Where("file_path in (?) and user_id = ?", ids, userID).Delete(&st.StorageFile{}).Error; err != nil {
			return err
		}

		// decrement the storage:
		if err := tx.Model(&st.StorageUsage{}).Where("user_id = ? ", userID).Updates(map[string]interface{}{"used_bytes": gorm.Expr("used_bytes - ?", filesSize)}).Error; err != nil {
			return err
		}

		return nil
	})
}

func (r *StorageRepository) GetAllFilesByOwnerType(ctx context.Context, entityType st.EntityType, entityID int) ([]*st.StorageFile, error) {
	var files []*st.StorageFile
	if err := r.db.WithContext(ctx).Where("entity_type = ? and entity_id = ?", entityType, entityID).Find(&files).Error; err != nil {
		return nil, err
	}
	return files, nil
}

func (r *StorageRepository) GetFilesByUser(ctx context.Context, userID int, entityType st.EntityType, entityID int) ([]*st.StorageFile, error) {
	var files []*st.StorageFile
	// we are getting files by user ID, entity type and entity ID, or entity ID = 0 which will get file for this specific entity and anything
	// in purgatory ( file upload without having yet an entity ID )
	if err := r.db.WithContext(ctx).Where("user_id = ? and entity_type = ? and (entity_id = ?  or entity_id = 0)", userID, entityType, entityID).Find(&files).Error; err != nil {
		return nil, err
	}
	return files, nil
}

func (r *StorageRepository) GetStorageStats(ctx context.Context, currentUser *uModel.UserDetails) (int, int, error) {
	var totalUsedBytes int64
	if err := r.db.WithContext(ctx).Model(&st.StorageUsage{}).
		Select("COALESCE(SUM(used_bytes), 0)").
		Where("family_id = ?", currentUser.FamilyID).
		Scan(&totalUsedBytes).Error; err != nil {
		return 0, 0, err
	}
	return int(totalUsedBytes), r.maxUserStorage, nil
}

func (r *StorageRepository) GetFileByPath(ctx context.Context, filePath string, userID int) (*st.StorageFile, error) {
	var file st.StorageFile
	if err := r.db.WithContext(ctx).Where("file_path = ? and user_id = ?", filePath, userID).First(&file).Error; err != nil {
		return nil, err
	}
	return &file, nil
}

func (r *StorageRepository) GetFileByPathOnly(ctx context.Context, filePath string) (*st.StorageFile, error) {
	var file st.StorageFile
	if err := r.db.WithContext(ctx).Where("file_path = ?", filePath).First(&file).Error; err != nil {
		return nil, err
	}
	return &file, nil
}

func (r *StorageRepository) ReassignDraftAttachments(ctx context.Context, draftID string, userID int, choreID int) error {
	if err := r.db.WithContext(ctx).Model(&st.StorageFile{}).
		Where("draft_id = ? AND user_id = ? AND entity_type = ?", draftID, userID, st.EntityTypeChoreAttachmentDraft).
		Updates(map[string]interface{}{
			"entity_type": st.EntityTypeChoreAttachment,
			"entity_id":   choreID,
			"draft_id":    "",
		}).Error; err != nil {
		return err
	}
	return r.db.WithContext(ctx).Model(&st.StorageFile{}).
		Where("draft_id = ? AND user_id = ? AND entity_type = ?", draftID, userID, st.EntityTypeChoreDescriptionDraft).
		Updates(map[string]interface{}{
			"entity_type": st.EntityTypeChoreDescription,
			"entity_id":   choreID,
			"draft_id":    "",
		}).Error
}

// GetExpiredDraftFiles returns draft attachment files older than the given unix timestamp.
func (r *StorageRepository) CreateStorageUsage(ctx context.Context, userID, familyID int) error {
	return r.db.WithContext(ctx).Create(&st.StorageUsage{
		UserID:    userID,
		FamilyID:  familyID,
		UsedBytes: 0,
		UpdatedAt: time.Now().UTC(),
	}).Error
}

func (r *StorageRepository) GetExpiredDraftFiles(ctx context.Context, olderThanUnix int64) ([]*st.StorageFile, error) {
	var files []*st.StorageFile
	if err := r.db.WithContext(ctx).
		Where("entity_type IN ? AND created_at < ?",
			[]st.EntityType{st.EntityTypeChoreAttachmentDraft, st.EntityTypeChoreDescriptionDraft},
			olderThanUnix).
		Find(&files).Error; err != nil {
		return nil, err
	}
	return files, nil
}
