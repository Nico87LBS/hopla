package games

import "errors"

// RoutineDependency makes a routine step available only after another step
// has been resolved. Dependencies form a directed acyclic graph (DAG), not a
// fixed sequence. A step with several prerequisites requires all of them.
type RoutineDependency struct {
	RoutineID      int `json:"routineId" gorm:"column:routine_id;index;not null"`
	StepID         int `json:"stepId" gorm:"column:step_id;not null"`
	DependsOnStepID int `json:"dependsOnStepId" gorm:"column:depends_on_step_id;not null"`
}

func (RoutineDependency) TableName() string { return "routine_dependencies" }

// RoutineItemPolicy describes whether a step blocks its successors while it
// is still pending. Optional steps are available but never block the graph.
type RoutineItemPolicy struct {
	StepID   int  `json:"stepId"`
	Required bool `json:"required"`
}

// RoutineItemState is the state of one step in one member's occurrence.
type RoutineItemState string

const (
	RoutineItemPending       RoutineItemState = "pending"
	RoutineItemCompleted     RoutineItemState = "completed"
	RoutineItemSkipped       RoutineItemState = "skipped"
	RoutineItemNotApplicable RoutineItemState = "not_applicable"
)

// ValidateRoutineGraph checks that all dependency endpoints belong to the
// routine and that the graph contains no self-links, duplicate links or
// cycles. The empty dependency list is valid (all steps are independent).
func ValidateRoutineGraph(stepIDs []int, dependencies []RoutineDependency) error {
	if len(stepIDs) == 0 {
		return ErrRoutineEmpty
	}
	known := make(map[int]bool, len(stepIDs))
	for _, id := range stepIDs {
		if id <= 0 || known[id] {
			return ErrRoutineGraphStep
		}
		known[id] = true
	}

	adjacency := make(map[int][]int, len(stepIDs))
	indegree := make(map[int]int, len(stepIDs))
	seen := make(map[[2]int]bool, len(dependencies))
	for _, dependency := range dependencies {
		from, to := dependency.DependsOnStepID, dependency.StepID
		if !known[from] || !known[to] {
			return ErrRoutineGraphStep
		}
		if from == to {
			return ErrRoutineGraphCycle
		}
		key := [2]int{from, to}
		if seen[key] {
			return ErrRoutineGraphDuplicate
		}
		seen[key] = true
		adjacency[from] = append(adjacency[from], to)
		indegree[to]++
	}

	// Kahn's algorithm: every node must be removable from the graph.
	queue := make([]int, 0, len(stepIDs))
	for _, id := range stepIDs {
		if indegree[id] == 0 {
			queue = append(queue, id)
		}
	}
	visited := 0
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		visited++
		for _, next := range adjacency[id] {
			indegree[next]--
			if indegree[next] == 0 {
				queue = append(queue, next)
			}
		}
	}
	if visited != len(stepIDs) {
		return ErrRoutineGraphCycle
	}
	return nil
}

// RoutineItemAvailable reports whether a pending step can be started.
// Every required prerequisite must be resolved. Optional prerequisites do
// not block successors; skipped and not-applicable steps are resolved too.
func RoutineItemAvailable(stepID int, dependencies []RoutineDependency, policies map[int]RoutineItemPolicy, states map[int]RoutineItemState) bool {
	if states[stepID] != RoutineItemPending {
		return false
	}
	for _, dependency := range dependencies {
		if dependency.StepID != stepID {
			continue
		}
		policy, hasPolicy := policies[dependency.DependsOnStepID]
		if hasPolicy && !policy.Required {
			continue
		}
		switch states[dependency.DependsOnStepID] {
		case RoutineItemCompleted, RoutineItemSkipped, RoutineItemNotApplicable:
			// Resolved prerequisite.
		default:
			return false
		}
	}
	return true
}

var (
	ErrRoutineGraphStep      = errors.New("a dependency references a step outside the routine")
	ErrRoutineGraphCycle     = errors.New("routine dependencies contain a cycle")
	ErrRoutineGraphDuplicate = errors.New("a routine dependency is duplicated")
)
