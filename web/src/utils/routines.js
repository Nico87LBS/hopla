// A routine chains tasks in order (morning: get dressed, teeth, school bag).
// Each child sees one step at a time: the server says, per routine and per
// child, which task is the step to do now, and the lists hide the other steps
// due today until their turn comes.

const membersOf = chore =>
  chore?.assignStrategy === 'together'
    ? (chore.assignees || []).map(a => a.userId)
    : chore?.assignedTo
      ? [chore.assignedTo]
      : []

// routineOf returns the routine a task is a step of, if any.
export const routineOf = (routines, choreId) =>
  (routines || []).find(routine => routine.taskIds?.includes(choreId)) || null

// routineStepOf returns, when a task is the step to do now of a child of
// its, the routine and that child's progress in it.
export const routineStepOf = (routines, chore, userId) => {
  const routine = routineOf(routines, chore?.id)
  if (!routine) return null
  const progress = (routine.members || []).find(
    p =>
      p.current === chore.id &&
      (userId === undefined
        ? membersOf(chore).includes(p.userId)
        : p.userId === userId),
  )
  return progress ? { routine, progress } : null
}

// waitsInRoutine tells whether a task is a step due today that is nobody's
// step to do now: it shows once the steps before it are done. Steps due on a
// later day show as usual.
export const waitsInRoutine = (routines, chore, endOfToday) => {
  if (!routineOf(routines, chore?.id)) return false
  if (!chore.nextDueDate || new Date(chore.nextDueDate) > endOfToday) {
    return false
  }
  return !routineStepOf(routines, chore)
}

// The tasks a list shows: steps waiting their turn are left out.
export const withoutWaitingSteps = (chores, routines, endOfToday) =>
  routines?.length
    ? chores.filter(chore => !waitsInRoutine(routines, chore, endOfToday))
    : chores

// taskKey is how a routine step stands for each child's copy of a task.
export const taskKey = name => (name || '').trim().toLowerCase()

// routineTasks lists the tasks a routine can chain: one per name (the copies
// of a task are one step), active, minus the ones already in another routine.
export const routineTasks = (chores, routines, editingId) => {
  const taken = new Set()
  for (const routine of routines || []) {
    if (routine.id === editingId) continue
    for (const id of routine.choreIds || []) {
      const chore = chores.find(c => c.id === id)
      if (chore) taken.add(taskKey(chore.name))
    }
  }
  const seen = new Set()
  return chores
    .filter(chore => chore.isActive !== false)
    .filter(chore => {
      const key = taskKey(chore.name)
      if (taken.has(key) || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

// moveStep moves the step at index by delta (-1 up, +1 down).
export const moveStep = (ids, index, delta) => {
  const to = index + delta
  if (to < 0 || to >= ids.length) return ids
  const next = [...ids]
  ;[next[index], next[to]] = [next[to], next[index]]
  return next
}
