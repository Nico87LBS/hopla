// A task that each member must do is kept as one copy per member, all with
// the same name. These helpers create the copies and keep them in step when
// one of them is edited, archived or deleted.

export const sameName = name =>
  String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()

// copiesOf lists the other tasks that share this task's name, archived ones
// included, in the circle's task list.
export const copiesOf = (chore, chores) => {
  if (!chore?.id || !chore?.name) return []
  const key = sameName(chore.name)
  return (chores || []).filter(
    other => other.id !== chore.id && sameName(other.name) === key,
  )
}

// perMemberChores turns the task the editor would save into one copy per
// assignee, each assigned to that member alone.
export const perMemberChores = (chore, assignees) =>
  assignees.map(({ userId }, index) => ({
    ...chore,
    assignees: [{ userId }],
    assignedTo: userId,
    assignStrategy: 'keep_last_assigned',
    // Attachments uploaded with the draft go to the first copy only.
    draftId: index === 0 ? chore.draftId : undefined,
  }))

// What an edit carries over to the other copies. Who the task is for, its
// sub-tasks, triggers and actions stay each copy's own; so does when it is
// next due, unless the edit changed it.
export const SHARED_FIELDS = [
  'name',
  'description',
  'frequencyType',
  'frequency',
  'frequencyMetadata',
  'isRolling',
  'notification',
  'notificationMetadata',
  'labels',
  'labelsV2',
  'points',
  'requireApproval',
  'isPrivate',
  'completionWindow',
  'deadlineOffset',
  'priority',
  'projectId',
]

// Two due dates are the same to the minute: the editor rounds seconds.
const sameDate = (a, b) =>
  (a ?? null) === null || (b ?? null) === null
    ? (a ?? null) === (b ?? null)
    : Math.floor(new Date(a).getTime() / 60000) ===
      Math.floor(new Date(b).getTime() / 60000)

// copyUpdate builds the save request for one copy, from the copy as the
// server returns it and the request the editor is saving for the task.
// previousDueDate is the edited task's due date before the edit: a new due
// date goes to the copies too.
export const copyUpdate = (copy, saved, previousDueDate) => {
  const dueDateChanged =
    previousDueDate !== undefined && !sameDate(saved.dueDate, previousDueDate)
  const dueDate = dueDateChanged
    ? (saved.dueDate ?? null)
    : (copy.nextDueDate ?? null)
  const update = {
    id: copy.id,
    assignees: copy.assignees || [],
    assignedTo: copy.assignedTo ?? null,
    assignStrategy: copy.assignStrategy,
    dueDate,
    nextDueDate: dueDate,
    isActive: copy.isActive,
  }
  for (const field of SHARED_FIELDS) update[field] = saved[field]
  return update
}
