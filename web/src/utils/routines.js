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
      (p.current === chore.id || p.available?.includes(chore.id)) &&
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
  const taken = new Map()
  for (const routine of routines || []) {
    if (routine.id === editingId) continue
    ;(routine.choreIds || []).forEach((id, index) => {
      const chore = chores.find(c => c.id === id)
      if (!chore) return
      const key = taskKey(chore.name)
      if (!taken.has(key)) taken.set(key, new Set())
      const slotId = routine.slotIds?.[index] || ''
      taken.get(key).add(slotId || '*')
    })
  }

  const byName = new Map()
  for (const chore of chores) {
    if (chore.isActive === false) continue
    const used = taken.get(taskKey(chore.name)) || new Set()
    if (used.has('*')) continue
    const slots = chore.frequencyMetadata?.slots || []
    let available
    if (slots.length) {
      available = slots.filter(slot => slot.id && !used.has(slot.id))
      if (available.length === 0) continue
    } else {
      if (used.size) continue
      available = []
    }
    const key = taskKey(chore.name)
    if (!byName.has(key)) {
      byName.set(key, {
        ...chore,
        routineAvailableSlots: available,
        routineCanUseAllSlots: used.size === 0,
      })
    }
  }

  // A step represents all member copies of a task, even when their names
  // differ only by surrounding whitespace or letter case.
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

// moveStep moves the step at index by delta (-1 up, +1 down).
export const moveStep = (ids, index, delta) => {
  const to = index + delta
  if (to < 0 || to >= ids.length) return ids
  const next = [...ids]
  ;[next[index], next[to]] = [next[to], next[index]]
  return next
}

// ---------------------------------------------------------------------------
// The routine editor. A routine draft is
//   { name, bonus, validityMinutes, choreIds, slotIds, optionalStepIds,
//     dependencies }
// where steps are numbered from 1 by place, and a dependency
// { stepId, dependsOnStepId } says a step opens once another is resolved.

export const MAX_ROUTINE_STEPS = 12
export const BONUS_PRESETS = [0, 2, 5, 10]
export const VALIDITY_PRESETS = [60, 120, 240, 720, 1440]
export const DEFAULT_VALIDITY = 720
export const MAX_VALIDITY = 2880

// chainDependencies makes each step open once the one before is done.
export const chainDependencies = count =>
  Array.from({ length: Math.max(0, count - 1) }, (_, index) => ({
    stepId: index + 2,
    dependsOnStepId: index + 1,
  }))

const sameEdges = (a, b) => {
  const key = edge => `${edge.stepId}>${edge.dependsOnStepId}`
  const left = new Set(a.map(key))
  return a.length === b.length && b.every(edge => left.has(key(edge)))
}

// orderModeOf tells how a routine is ordered: 'sequence' (one step after the
// other), 'free' (any step, any time) or 'custom' (each step says after what).
export const orderModeOf = (dependencies, count) => {
  const edges = dependencies || []
  if (count <= 1) return 'sequence'
  if (edges.length === 0) return 'free'
  return sameEdges(edges, chainDependencies(count)) ? 'sequence' : 'custom'
}

// draftOrderMode is the order the editor shows. A custom order that still
// looks like a sequence (or like a free order) stays custom once chosen.
export const draftOrderMode = draft => {
  const count = draft.choreIds.length
  if (draft.orderMode === 'custom' && count > 1) return 'custom'
  return orderModeOf(draft.dependencies, count)
}

// withOrder applies an order to a draft. Going to 'custom' starts from the
// order it had, to be changed step by step.
export const withOrder = (draft, mode) => {
  const count = draft.choreIds.length
  if (mode === 'sequence') {
    return { ...draft, orderMode: mode, dependencies: chainDependencies(count) }
  }
  if (mode === 'free') return { ...draft, orderMode: mode, dependencies: [] }
  const current = draftOrderMode(draft)
  return {
    ...draft,
    orderMode: 'custom',
    dependencies:
      current === 'free'
        ? []
        : (draft.dependencies || []).map(edge => ({ ...edge })),
  }
}

// Rebuilds a draft after its steps changed place. `places` maps each old
// step number to its new one (or nothing when the step is gone).
const remapped = (draft, choreIds, slotIds, places) => {
  const place = position => places.get(position)
  const dependencies = (draft.dependencies || [])
    .map(edge => ({
      stepId: place(edge.stepId),
      dependsOnStepId: place(edge.dependsOnStepId),
    }))
    .filter(edge => edge.stepId && edge.dependsOnStepId)
  const optionalStepIds = (draft.optionalStepIds || [])
    .map(place)
    .filter(Boolean)
  const mode = draftOrderMode(draft)
  return {
    ...draft,
    choreIds,
    slotIds,
    optionalStepIds,
    dependencies:
      mode === 'sequence' ? chainDependencies(choreIds.length) : dependencies,
  }
}

const slotsOf = draft =>
  draft.choreIds.map((_, index) => draft.slotIds?.[index] || '')

// moveStepTo moves the step at place `from` (0-based) to place `to`.
export const moveStepTo = (draft, from, to) => {
  const count = draft.choreIds.length
  if (from === to || from < 0 || to < 0 || from >= count || to >= count) {
    return draft
  }
  const order = draft.choreIds.map((_, index) => index)
  order.splice(to, 0, order.splice(from, 1)[0])
  const places = new Map(
    order.map((oldIndex, index) => [oldIndex + 1, index + 1]),
  )
  const slots = slotsOf(draft)
  return remapped(
    draft,
    order.map(index => draft.choreIds[index]),
    order.map(index => slots[index]),
    places,
  )
}

// removeStepAt takes a step out; the ones after it move up one place.
export const removeStepAt = (draft, index) => {
  const places = new Map()
  draft.choreIds.forEach((_, position) => {
    if (position < index) places.set(position + 1, position + 1)
    if (position > index) places.set(position + 1, position)
  })
  const slots = slotsOf(draft)
  return remapped(
    draft,
    draft.choreIds.filter((_, position) => position !== index),
    slots.filter((_, position) => position !== index),
    places,
  )
}

// addSteps puts steps at the end: { choreId, slotId } each. In a sequence
// they follow the last step; in a custom order they open right away.
export const addSteps = (draft, entries) => {
  const room = MAX_ROUTINE_STEPS - draft.choreIds.length
  const added = entries.slice(0, Math.max(0, room))
  const mode = draftOrderMode(draft)
  const next = {
    ...draft,
    choreIds: [...draft.choreIds, ...added.map(entry => entry.choreId)],
    slotIds: [...slotsOf(draft), ...added.map(entry => entry.slotId || '')],
  }
  return mode === 'sequence' || draft.choreIds.length === 0
    ? { ...next, dependencies: chainDependencies(next.choreIds.length) }
    : next
}

// setPrerequisites says after which steps a step opens (custom order).
export const setPrerequisites = (draft, position, prerequisites) => ({
  ...draft,
  dependencies: [
    ...(draft.dependencies || []).filter(edge => edge.stepId !== position),
    ...prerequisites
      .filter(other => other !== position)
      .map(dependsOnStepId => ({ stepId: position, dependsOnStepId })),
  ],
})

// Steps that cannot be a prerequisite of a step without making a loop: the
// ones that already come after it.
export const loopingPrerequisites = (dependencies, position) => {
  const after = new Set()
  const walk = from => {
    for (const edge of dependencies || []) {
      if (edge.dependsOnStepId === from && !after.has(edge.stepId)) {
        after.add(edge.stepId)
        walk(edge.stepId)
      }
    }
  }
  walk(position)
  return after
}

// previewSteps tells what a child sees first: which steps are open from the
// start and, for the others, the step they wait for. An optional step never
// makes the next one wait.
export const previewSteps = draft =>
  draft.choreIds.map((_, index) => {
    const position = index + 1
    const blockers = (draft.dependencies || [])
      .filter(
        edge =>
          edge.stepId === position &&
          !(draft.optionalStepIds || []).includes(edge.dependsOnStepId),
      )
      .map(edge => edge.dependsOnStepId)
    return {
      position,
      optional: (draft.optionalStepIds || []).includes(position),
      open: blockers.length === 0,
      waitsFor: blockers,
    }
  })

// The routine as the editor edits it, from what the server sent.
export const draftFromRoutine = (routine, knownIds) => {
  const keep = routine.choreIds
    .map((id, index) => [id, index])
    .filter(([id]) => knownIds.has(id))
  const places = new Map(
    keep.map(([, oldIndex], index) => [oldIndex + 1, index + 1]),
  )
  const optional =
    routine.optionalStepIds ||
    (routine.optionalChoreIds || []).flatMap(id =>
      routine.choreIds.flatMap((choreId, index) =>
        choreId === id ? [index + 1] : [],
      ),
    )
  return {
    id: routine.id,
    name: routine.name,
    bonus: routine.bonus,
    validityMinutes: routine.validityMinutes || DEFAULT_VALIDITY,
    choreIds: keep.map(([id]) => id),
    slotIds: keep.map(([, index]) => routine.slotIds?.[index] || ''),
    optionalStepIds: optional.map(p => places.get(p)).filter(Boolean),
    // A sequence stays a sequence when a task of it was deleted.
    dependencies:
      orderModeOf(routine.dependencies, routine.choreIds.length) === 'sequence'
        ? chainDependencies(keep.length)
        : (routine.dependencies || [])
            .map(edge => ({
              stepId: places.get(edge.stepId),
              dependsOnStepId: places.get(edge.dependsOnStepId),
            }))
            .filter(edge => edge.stepId && edge.dependsOnStepId),
  }
}

export const emptyRoutineDraft = () => ({
  name: '',
  bonus: 5,
  validityMinutes: DEFAULT_VALIDITY,
  choreIds: [],
  slotIds: [],
  optionalStepIds: [],
  dependencies: [],
})
