import { isTogether } from './Chores.jsx'

// The mode of a task, given how many copies of it are shown together; none
// for a task that is only ever one person's.
export const taskModeOf = (chore, copies = 1) => {
  if (copies > 1) return 'each'
  if (isTogether(chore)) return 'first'
  if ((chore?.assignees?.length || 0) > 1) return 'one'
  return null
}
