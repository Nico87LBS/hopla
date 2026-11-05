package games

import "slices"

// progressOfGraph evaluates the routine for one member. A step is applicable
// only when one of the member's task copies is due in the current family day.
// Non-applicable steps are resolved for dependency purposes. Optional steps
// remain visible when unlocked, but do not count toward completion or block
// successors.
func (day *routineDay) progressOfGraph(userID int, steps [][]int, routine Routine) RoutineProgress {
	progress := RoutineProgress{UserID: userID, Available: []int{}}
	states := make(map[int]RoutineItemState, len(steps))
	policies := make(map[int]RoutineItemPolicy, len(steps))
	todos := make(map[int]int, len(steps))

	for i, ids := range steps {
		position := i + 1
		slotID := ""
		if i < len(routine.Steps) { slotID = routine.Steps[i].SlotID }
		required := true
		if routine.GraphEnabled && i < len(routine.Steps) && routine.Steps[i].Required != nil {
			required = *routine.Steps[i].Required
		}
		policies[position] = RoutineItemPolicy{StepID: position, Required: required}
		var todo int
		done := false
		for _, id := range ids {
			chore := day.chores[id]
			isDone := day.doneBy[userID][id] && isFor(chore, userID)
			if slotID != "" { isDone = day.doneSlotsBy[userID][id][slotID] && isFor(chore, userID) }
			if isDone {
				done = true
				break
			}
			due := chore != nil && chore.NextDueDate != nil && !chore.NextDueDate.After(day.end)
			if slotID != "" { due = routineSlotDue(chore, slotID, day.start, day.end) }
			if todo == 0 && due && slices.Contains(membersNow(chore), userID) && !Paused(chore, day.away) {
				todo = chore.ID
			}
		}
		switch {
		case done:
			states[position] = RoutineItemCompleted
			if required { progress.Done++; progress.Total++ }
		case todo != 0:
			states[position] = RoutineItemPending
			todos[position] = todo
			if required { progress.Total++ }
		default:
			states[position] = RoutineItemNotApplicable
		}
	}

	for position := 1; position <= len(steps); position++ {
		if taskID, ok := todos[position]; ok && RoutineItemAvailable(position, routine.Dependencies, policies, states) {
			progress.Available = append(progress.Available, taskID)
		}
	}
	// Keep Current for older clients; new clients can display every available
	// parallel step through Available.
	if len(progress.Available) > 0 {
		progress.Current = &progress.Available[0]
		for i, ids := range steps {
			if slices.Contains(ids, *progress.Current) {
				progress.Step = i + 1
				break
			}
		}
	}
	progress.Finished = progress.Total > 0 && progress.Done == progress.Total
	return progress
}
