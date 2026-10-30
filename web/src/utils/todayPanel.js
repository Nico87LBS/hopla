// What the side of Aujourd'hui shows on a wide screen.

const isParent = member => member.role === 'admin' || member.role === 'manager'

// membersOfDay are the children, active ones, or everyone when the family
// has no child.
export const membersOfDay = members => {
  const active = (members || []).filter(member => member.isActive !== false)
  const children = active.filter(member => !isParent(member))
  return children.length ? children : active
}

// dayTotals counts the tasks due on each of the next seven days, today
// first; tasks late from earlier days count for today. `now` is a moment in
// the family's time zone.
export const dayTotals = (chores, now) => {
  const days = Array.from({ length: 7 }, (_, index) => {
    const start = now.clone().startOf('day').add(index, 'days')
    return { date: start.toDate(), end: start.clone().endOf('day'), count: 0 }
  })
  for (const chore of chores || []) {
    if (!chore.nextDueDate) continue
    const due = new Date(chore.nextDueDate)
    const day = days.find(d => due <= d.end.toDate())
    if (day) day.count += 1
  }
  return days.map(({ count, date }) => ({ count, date }))
}
