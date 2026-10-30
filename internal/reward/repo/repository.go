package repo

import (
	"context"
	"errors"
	"time"

	config "github.com/nico87lbs/hopla/config"
	fModel "github.com/nico87lbs/hopla/internal/family/model"
	pModel "github.com/nico87lbs/hopla/internal/points"
	rModel "github.com/nico87lbs/hopla/internal/reward/model"
	"gorm.io/gorm"
)

var ErrInsufficientPoints = errors.New("insufficient points balance")
var ErrRedemptionNotPending = errors.New("redemption is not pending")
var ErrQuotaReached = errors.New("reward quota reached for this period")

type RewardRepository struct {
	db *gorm.DB
}

func NewRewardRepository(db *gorm.DB, cfg *config.Config) *RewardRepository {
	return &RewardRepository{db: db}
}

func (r *RewardRepository) GetRewardsByFamily(ctx context.Context, familyID int) ([]*rModel.Reward, error) {
	var rewards []*rModel.Reward
	if err := r.db.WithContext(ctx).Where("family_id = ?", familyID).Order("points_cost asc").Find(&rewards).Error; err != nil {
		return nil, err
	}
	return rewards, nil
}

func (r *RewardRepository) CreateReward(ctx context.Context, reward *rModel.Reward) error {
	// is_active defaults to true, so GORM leaves out a false value on insert:
	// a reward created hidden is hidden right after.
	active := reward.IsActive
	if err := r.db.WithContext(ctx).Create(reward).Error; err != nil {
		return err
	}
	if active {
		return nil
	}
	reward.IsActive = false
	return r.db.WithContext(ctx).Model(&rModel.Reward{}).Where("id = ?", reward.ID).Update("is_active", false).Error
}

func (r *RewardRepository) UpdateReward(ctx context.Context, reward *rModel.Reward) error {
	return r.db.WithContext(ctx).Model(&rModel.Reward{}).
		Where("id = ? AND family_id = ?", reward.ID, reward.FamilyID).
		Updates(map[string]interface{}{
			"name":           reward.Name,
			"description":    reward.Description,
			"points_cost":    reward.PointsCost,
			"is_active":      reward.IsActive,
			"quota_count":    reward.QuotaCount,
			"quota_period":   reward.QuotaPeriod,
			"quota_timezone": reward.QuotaTimezone,
		}).Error
}

func (r *RewardRepository) DeleteReward(ctx context.Context, id int, familyID int) error {
	return r.db.WithContext(ctx).Where("id = ? AND family_id = ?", id, familyID).Delete(&rModel.Reward{}).Error
}

// RequestRedemption validates the reward exists/is active and the user has enough
// available balance (points - points_redeemed), then inserts a pending redemption
// request. Balance is re-checked at approval time too (see ApproveRedemption) since
// balance can change between request and approval.
func (r *RewardRepository) RequestRedemption(ctx context.Context, rewardID int, userID int, familyID int, note *string) (*rModel.RewardRedemption, error) {
	var redemption *rModel.RewardRedemption
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var reward rModel.Reward
		if err := tx.Where("id = ? AND family_id = ? AND is_active = ?", rewardID, familyID, true).First(&reward).Error; err != nil {
			return err
		}

		var member fModel.UserFamily
		if err := tx.Where("user_id = ? AND family_id = ?", userID, familyID).First(&member).Error; err != nil {
			return err
		}

		if reward.HasQuota() {
			start, _ := reward.QuotaWindow(time.Now().UTC())
			var used int64
			if err := tx.Model(&rModel.RewardRedemption{}).
				Where("reward_id = ? AND user_id = ? AND status <> ? AND requested_at >= ?", reward.ID, userID, rModel.RedemptionStatusRejected, start).
				Count(&used).Error; err != nil {
				return err
			}
			if int(used) >= reward.QuotaCount {
				return ErrQuotaReached
			}
		}

		available := member.Points - member.PointsRedeemed
		if available < reward.PointsCost {
			return ErrInsufficientPoints
		}

		redemption = &rModel.RewardRedemption{
			RewardID:    reward.ID,
			FamilyID:    familyID,
			UserID:      userID,
			RewardName:  reward.Name,
			PointsCost:  reward.PointsCost,
			Status:      rModel.RedemptionStatusPending,
			Note:        note,
			RequestedAt: time.Now().UTC(),
		}
		return tx.Create(redemption).Error
	})
	if err != nil {
		return nil, err
	}
	return redemption, nil
}

// ApproveRedemption debits the user's points (same points_redeemed increment +
// PointsHistory pattern as FamilyRepository.RedeemPoints) and marks the redemption
// approved. Re-validates balance and pending status inside the transaction to avoid
// a race with other redemptions/undo actions approved in between.
func (r *RewardRepository) ApproveRedemption(ctx context.Context, redemptionID int, familyID int, adminUserID int) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var redemption rModel.RewardRedemption
		if err := tx.Set("gorm:query_option", "FOR UPDATE").
			Where("id = ? AND family_id = ?", redemptionID, familyID).First(&redemption).Error; err != nil {
			return err
		}
		if redemption.Status != rModel.RedemptionStatusPending {
			return ErrRedemptionNotPending
		}

		var member fModel.UserFamily
		if err := tx.Where("user_id = ? AND family_id = ?", redemption.UserID, familyID).First(&member).Error; err != nil {
			return err
		}
		available := member.Points - member.PointsRedeemed
		if available < redemption.PointsCost {
			return ErrInsufficientPoints
		}

		if err := tx.Model(&fModel.UserFamily{}).
			Where("user_id = ? AND family_id = ?", redemption.UserID, familyID).
			Update("points_redeemed", gorm.Expr("points_redeemed + ?", redemption.PointsCost)).Error; err != nil {
			return err
		}
		if err := tx.Create(&pModel.PointsHistory{
			Action:    pModel.PointsHistoryActionRedeem,
			FamilyID:  familyID,
			UserID:    redemption.UserID,
			Points:    redemption.PointsCost,
			CreatedAt: time.Now().UTC(),
			CreatedBy: adminUserID,
			RewardID:  &redemption.RewardID,
			Reason:    &redemption.RewardName,
		}).Error; err != nil {
			return err
		}

		now := time.Now().UTC()
		return tx.Model(&rModel.RewardRedemption{}).Where("id = ?", redemption.ID).Updates(map[string]interface{}{
			"status":      rModel.RedemptionStatusApproved,
			"resolved_at": now,
			"resolved_by": adminUserID,
		}).Error
	})
}

func (r *RewardRepository) RejectRedemption(ctx context.Context, redemptionID int, familyID int, adminUserID int, note *string) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var redemption rModel.RewardRedemption
		if err := tx.Where("id = ? AND family_id = ?", redemptionID, familyID).First(&redemption).Error; err != nil {
			return err
		}
		if redemption.Status != rModel.RedemptionStatusPending {
			return ErrRedemptionNotPending
		}

		now := time.Now().UTC()
		updates := map[string]interface{}{
			"status":      rModel.RedemptionStatusRejected,
			"resolved_at": now,
			"resolved_by": adminUserID,
		}
		if note != nil {
			updates["note"] = *note
		}
		return tx.Model(&rModel.RewardRedemption{}).Where("id = ?", redemption.ID).Updates(updates).Error
	})
}

func (r *RewardRepository) GetRedemptionsByFamily(ctx context.Context, familyID int, status *rModel.RedemptionStatus) ([]*rModel.RewardRedemption, error) {
	q := r.db.WithContext(ctx).Where("family_id = ?", familyID)
	if status != nil {
		q = q.Where("status = ?", *status)
	}
	var redemptions []*rModel.RewardRedemption
	if err := q.Order("requested_at desc").Find(&redemptions).Error; err != nil {
		return nil, err
	}
	return redemptions, nil
}

func (r *RewardRepository) GetRedemptionsByUser(ctx context.Context, userID int, familyID int) ([]*rModel.RewardRedemption, error) {
	var redemptions []*rModel.RewardRedemption
	if err := r.db.WithContext(ctx).Where("user_id = ? AND family_id = ?", userID, familyID).
		Order("requested_at desc").Find(&redemptions).Error; err != nil {
		return nil, err
	}
	return redemptions, nil
}

// FillQuotaUsage sets QuotaUsed and QuotaResetsAt on each reward with a
// quota, counting pending and approved redemptions in the current period.
func (r *RewardRepository) FillQuotaUsage(ctx context.Context, familyID int, rewards []*rModel.Reward, now time.Time) error {
	for _, reward := range rewards {
		if !reward.HasQuota() {
			continue
		}
		start, end := reward.QuotaWindow(now)
		var rows []struct {
			UserID int
			Used   int
		}
		if err := r.db.WithContext(ctx).Model(&rModel.RewardRedemption{}).
			Select("user_id, count(*) as used").
			Where("reward_id = ? AND family_id = ? AND status <> ? AND requested_at >= ?", reward.ID, familyID, rModel.RedemptionStatusRejected, start).
			Group("user_id").Scan(&rows).Error; err != nil {
			return err
		}
		reward.QuotaUsed = map[int]int{}
		for _, row := range rows {
			reward.QuotaUsed[row.UserID] = row.Used
		}
		reward.QuotaResetsAt = &end
	}
	return nil
}
