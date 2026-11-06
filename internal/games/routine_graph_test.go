package games

import "testing"

func TestValidateRoutineGraphAllowsParallelStepsAndANDPrerequisites(t *testing.T) {
	steps := []int{1, 2, 3, 4, 5, 6, 7, 8}
	dependencies := []RoutineDependency{
		{StepID: 2, DependsOnStepID: 1},
		{StepID: 3, DependsOnStepID: 1},
		{StepID: 4, DependsOnStepID: 1},
		{StepID: 5, DependsOnStepID: 4},
		{StepID: 6, DependsOnStepID: 2},
		{StepID: 6, DependsOnStepID: 3},
		{StepID: 6, DependsOnStepID: 4},
		{StepID: 6, DependsOnStepID: 5},
		{StepID: 7, DependsOnStepID: 2},
		{StepID: 7, DependsOnStepID: 3},
		{StepID: 7, DependsOnStepID: 4},
		{StepID: 7, DependsOnStepID: 5},
		{StepID: 8, DependsOnStepID: 6},
		{StepID: 8, DependsOnStepID: 7},
	}
	if err := ValidateRoutineGraph(steps, dependencies); err != nil {
		t.Fatalf("expected valid DAG, got %v", err)
	}
}

func TestValidateRoutineGraphRejectsCyclesAndUnknownSteps(t *testing.T) {
	if err := ValidateRoutineGraph([]int{1, 2}, []RoutineDependency{
		{StepID: 2, DependsOnStepID: 1},
		{StepID: 1, DependsOnStepID: 2},
	}); err != ErrRoutineGraphCycle {
		t.Fatalf("expected cycle error, got %v", err)
	}
	if err := ValidateRoutineGraph([]int{1}, []RoutineDependency{
		{StepID: 1, DependsOnStepID: 99},
	}); err != ErrRoutineGraphStep {
		t.Fatalf("expected unknown step error, got %v", err)
	}
}

func TestRoutineItemAvailabilityResolvesOptionalAndSkippedPrerequisites(t *testing.T) {
	dependencies := []RoutineDependency{{StepID: 3, DependsOnStepID: 1}, {StepID: 3, DependsOnStepID: 2}}
	policies := map[int]RoutineItemPolicy{1: {StepID: 1, Required: true}, 2: {StepID: 2, Required: false}}
	states := map[int]RoutineItemState{1: RoutineItemPending, 2: RoutineItemPending, 3: RoutineItemPending}
	if RoutineItemAvailable(3, dependencies, policies, states) {
		t.Fatal("required pending prerequisite should block")
	}
	states[2] = RoutineItemSkipped
	if RoutineItemAvailable(3, dependencies, policies, states) {
		t.Fatal("required pending prerequisite should still block")
	}
	states[1] = RoutineItemCompleted
	if !RoutineItemAvailable(3, dependencies, policies, states) {
		t.Fatal("resolved required and optional prerequisites should unlock step")
	}
	states[3] = RoutineItemNotApplicable
	if RoutineItemAvailable(3, dependencies, policies, states) {
		t.Fatal("non-applicable step must not be startable")
	}
}
