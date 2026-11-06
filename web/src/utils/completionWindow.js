// "Faire en avance": how many hours before its due date a task can be done.
// null means no limit; 0 is a real limit: only once the due date is reached.

// readCompletionWindow turns what the server sends into what the editor
// shows: -1 for no limit, else the number of hours, 0 included.
export const readCompletionWindow = value =>
  value !== null && value !== undefined && value >= 0 ? Number(value) : -1

// tooEarly tells whether a task cannot be done yet.
export const tooEarly = (chore, now = new Date()) => {
  if (
    chore.completionWindow === null ||
    chore.completionWindow === undefined ||
    chore.completionWindow < 0 ||
    !chore.nextDueDate
  ) {
    return false
  }
  const opens =
    new Date(chore.nextDueDate).getTime() -
    chore.completionWindow * 60 * 60 * 1000
  return now.getTime() < opens
}
