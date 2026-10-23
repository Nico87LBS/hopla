// A child staying at the other parent's home is "away": her tasks wait until
// she is back. Same rule as the server.

export const awayMemberIds = members =>
  new Set((members || []).filter(m => m.away).map(m => m.userId))

// Whether a task waits for its members to come back: its current assignee is
// away, or, for a task everyone has at once, all of its assignees are.
export const waitsForAbsent = (chore, awayIds) => {
  if (!awayIds || awayIds.size === 0) return false
  if (chore.assignStrategy === 'together') {
    const assignees = chore.assignees || []
    return assignees.length > 0 && assignees.every(a => awayIds.has(a.userId))
  }
  return chore.assignedTo != null && awayIds.has(chore.assignedTo)
}
