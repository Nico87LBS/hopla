package chore

import (
	"errors"
	"testing"

	"github.com/go-playground/validator/v10"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
)

// Every assignment rule the editor offers must pass the request binding.
func TestChoreReqAcceptsEveryAssignStrategy(t *testing.T) {
	v := validator.New()
	v.SetTagName("binding")
	for _, strategy := range []chModel.AssignmentStrategy{
		chModel.AssignmentStrategyRandom,
		chModel.AssignmentStrategyLeastAssigned,
		chModel.AssignmentStrategyLeastCompleted,
		chModel.AssignmentStrategyKeepLastAssigned,
		chModel.AssignmentStrategyRandomExceptLastAssigned,
		chModel.AssignmentStrategyRoundRobin,
		chModel.AssignmentStrategyNoAssignee,
		chModel.AssignmentStrategyTogether,
	} {
		err := v.Struct(ChoreReq{AssignStrategy: strategy})
		var fieldErrors validator.ValidationErrors
		if errors.As(err, &fieldErrors) {
			for _, fieldError := range fieldErrors {
				if fieldError.Field() == "AssignStrategy" {
					t.Errorf("%s is rejected: %v", strategy, fieldError)
				}
			}
		}
	}
}
