package repo

import (
	"context"
	"time"

	fModel "github.com/nico87lbs/hopla/internal/family/model"
	pModel "github.com/nico87lbs/hopla/internal/points"
	uModel "github.com/nico87lbs/hopla/internal/user/model"
	"github.com/nico87lbs/hopla/logging"
	"gorm.io/gorm"
)

type IFamilyRepository interface {
	CreateFamily(family *fModel.Family) error
	AddUserToFamily(familyUser *fModel.UserFamily) error
	GetFamilyUsers(familyID int) ([]*fModel.UserFamily, error)
	GetUserFamilies(userID int) ([]*fModel.Family, error)
	DeleteUserFromFamily(familyID, userID int) error
	ChangeUserRole(familyID, userID int, role string) error
	GetFamilyByInviteCode(inviteCode string) (*fModel.Family, error)
	GetFamilyByID(familyID int) (*fModel.Family, error)
}

type FamilyRepository struct {
	db *gorm.DB
}

func NewFamilyRepository(db *gorm.DB) *FamilyRepository {
	return &FamilyRepository{db}
}

func (r *FamilyRepository) CreateFamily(c context.Context, family *fModel.Family) (*fModel.Family, error) {
	if err := r.db.WithContext(c).Save(&family).Error; err != nil {
		return nil, err
	}
	return family, nil

}

func (r *FamilyRepository) AddUserToFamily(c context.Context, familyUser *fModel.UserFamily) error {
	// Use FirstOrCreate to handle the unique constraint
	// This will create the record if it doesn't exist, or return the existing one
	result := r.db.WithContext(c).Where(fModel.UserFamily{
		UserID:   familyUser.UserID,
		FamilyID: familyUser.FamilyID,
	}).FirstOrCreate(familyUser)

	return result.Error
}

func (r *FamilyRepository) GetFamilyUsers(c context.Context, familyID int) ([]*fModel.UserFamilyDetail, error) {
	var familyUsers []*fModel.UserFamilyDetail
	if err := r.db.WithContext(c).
		Table("user_families uc").
		Select("uc.*, u.username, u.display_name, u.image").
		Joins("left join users u on u.id = uc.user_id").
		Where("uc.family_id = ?", familyID).
		Scan(&familyUsers).Error; err != nil {
		return nil, err
	}
	return familyUsers, nil
}

func (r *FamilyRepository) GetPendingJoinRequests(c context.Context, familyID int) ([]*fModel.UserFamilyDetail, error) {
	var pendingRequests []*fModel.UserFamilyDetail
	if err := r.db.WithContext(c).Raw("SELECT *, user_families.id as id FROM user_families LEFT JOIN users on users.id = user_families.user_id WHERE user_families.family_id = ? AND user_families.is_active = false", familyID).Scan(&pendingRequests).Error; err != nil {
		return nil, err
	}
	return pendingRequests, nil
}

func (r *FamilyRepository) AcceptJoinRequest(c context.Context, familyID, requestID int) error {

	return r.db.WithContext(c).Model(&fModel.UserFamily{}).Where("family_id = ? AND id = ?", familyID, requestID).Update("is_active", true).Error
}

// DeclineJoinRequest removes a pending join request. The is_active = false
// guard makes sure an already accepted membership can never be deleted through
// this path. Returns gorm.ErrRecordNotFound when no pending request matched.
func (r *FamilyRepository) DeclineJoinRequest(c context.Context, familyID, requestID int) error {
	result := r.db.WithContext(c).
		Where("family_id = ? AND id = ? AND is_active = ?", familyID, requestID, false).
		Delete(&fModel.UserFamily{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (r *FamilyRepository) GetUserFamilies(c context.Context, userID int) ([]*fModel.FamilyDetail, error) {
	var families []*fModel.FamilyDetail
	if err := r.db.WithContext(c).Raw("SELECT families.*, user_families.role as role, user_families.created_at uc_created_at  FROM families Left JOIN user_families on families.id = user_families.family_id WHERE user_families.user_id = ? ORDER BY uc_created_at desc", userID).Scan(&families).Error; err != nil {
		return nil, err
	}
	return families, nil
}

func (r *FamilyRepository) DeleteUserFromFamily(c context.Context, familyID, userID int) error {
	return r.db.WithContext(c).Where("family_id = ? AND user_id = ?", familyID, userID).Delete(&fModel.UserFamily{}).Error
}

func (r *FamilyRepository) ChangeUserRole(c context.Context, familyID, userID int, role fModel.Role) error {
	return r.db.WithContext(c).Model(&fModel.UserFamily{}).Where("family_id = ? AND user_id = ?", familyID, userID).Update("role", role).Error
}

func (r *FamilyRepository) GetUserFamilyRole(c context.Context, familyID, userID int) (fModel.Role, error) {
	var role fModel.Role
	err := r.db.WithContext(c).Model(&fModel.UserFamily{}).Select("role").Where("family_id = ? AND user_id = ?", familyID, userID).Scan(&role).Error
	return role, err
}

func (r *FamilyRepository) GetFamilyByInviteCode(c context.Context, inviteCode string) (*fModel.Family, error) {
	var family fModel.Family
	if err := r.db.WithContext(c).Where("invite_code = ?", inviteCode).First(&family).Error; err != nil {
		return nil, err
	}
	return &family, nil
}

func (r *FamilyRepository) GetFamilyByID(c context.Context, familyID int) (*fModel.Family, error) {
	var family fModel.Family
	if err := r.db.WithContext(c).First(&family, familyID).Error; err != nil {
		return nil, err
	}
	return &family, nil
}

func (r *FamilyRepository) LeaveFamilyByUserID(c context.Context, familyID, userID int) error {
	return r.db.WithContext(c).Transaction(func(tx *gorm.DB) error {
		return tx.Where("family_id = ? AND user_id = ? AND role != 'admin'", familyID, userID).Delete(&fModel.UserFamily{}).Error
	})
}

func (r *FamilyRepository) GetUserOriginalFamily(c context.Context, userID int) (int, error) {
	var familyID int
	if err := r.db.WithContext(c).Raw("SELECT family_id FROM user_families WHERE user_id = ? AND role = 'admin'", userID).Scan(&familyID).Error; err != nil {
		return 0, err
	}
	return familyID, nil
}

func (r *FamilyRepository) DeleteMemberByID(c context.Context, familyID, userID int) error {
	return r.db.WithContext(c).Transaction(func(tx *gorm.DB) error {
		return tx.Where("family_id = ? AND user_id = ?", familyID, userID).Delete(&fModel.UserFamily{}).Error
	})
}

func (r *FamilyRepository) GetFamilyAdmins(c context.Context, familyID int) ([]*fModel.UserFamilyDetail, error) {
	var familyAdmins []*fModel.UserFamilyDetail
	if err := r.db.WithContext(c).Raw("SELECT * FROM user_families LEFT JOIN users on users.id = user_families.user_id WHERE user_families.family_id = ? AND user_families.role = 'admin'", familyID).Scan(&familyAdmins).Error; err != nil {
		return nil, err
	}
	return familyAdmins, nil
}

func (r *FamilyRepository) GetDefaultFamily(c context.Context, userID int) (*fModel.Family, error) {
	var family fModel.Family
	if err := r.db.WithContext(c).
		Raw("SELECT families.* FROM families LEFT JOIN user_families ON families.id = user_families.family_id WHERE user_families.user_id = ? AND user_families.role = 'admin' ORDER BY user_families.created_at ASC LIMIT 1", userID).
		Scan(&family).Error; err != nil {
		return nil, err
	}
	return &family, nil
}

func (r *FamilyRepository) AssignDefaultFamily(c context.Context, userID int) error {
	defaultFamily, err := r.GetDefaultFamily(c, userID)
	if err != nil {
		return err
	}

	return r.db.WithContext(c).Model(&uModel.User{}).Where("id = ?", userID).Update("family_id", defaultFamily.ID).Error
}

func (r *FamilyRepository) RedeemPoints(c context.Context, familyID int, userID int, points int, createdBy int) error {
	logger := logging.FromContext(c)
	err := r.db.Transaction(func(tx *gorm.DB) error {

		if err := tx.Model(&fModel.UserFamily{}).Where("user_id = ? AND family_id = ?", userID, familyID).Update("points_redeemed", gorm.Expr("points_redeemed + ?", points)).Error; err != nil {
			return err
		}
		if err := tx.Create(&pModel.PointsHistory{
			Action:    pModel.PointsHistoryActionRedeem,
			FamilyID:  familyID,
			UserID:    userID,
			Points:    points,
			CreatedAt: time.Now().UTC(),
			CreatedBy: createdBy,
		}).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		logger.Error("Error redeeming points", err)
		return err
	}
	return nil
}

// SetCurrency renames what the family earns.
func (r *FamilyRepository) SetCurrency(c context.Context, familyID int, currency string) error {
	return r.db.WithContext(c).Model(&fModel.Family{}).Where("id = ?", familyID).Update("currency", currency).Error
}
