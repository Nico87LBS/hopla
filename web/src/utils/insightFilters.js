// The insight filters a link can open on Aujourd'hui with ?filterId=…

// Home's triage tiles (overdue / due-today / coming-up) only count chores
// that are "mine" — unassigned or assigned to me — and exclude anything
// already awaiting approval, since a finished-but-unapproved task isn't
// actionable the same way. These insight filters have to apply the same two
// conditions, or clicking a tile opens a wider set than the number it showed.
const MINE_NOT_PENDING_APPROVAL = [
  { type: 'assignee', operator: 'is', value: 'available_for_me' },
  { type: 'status', operator: 'isNot', value: 3 },
]

// Static insight filter definitions – used for URL restoration
export const INSIGHT_FILTER_DEFS = {
  overdue: {
    name: 'Overdue',
    filter: {
      conditions: [
        { type: 'dueDate', operator: 'isOverdue', value: null },
        ...MINE_NOT_PENDING_APPROVAL,
      ],
      operator: 'AND',
    },
  },
  'due-today': {
    name: 'Due Today',
    filter: {
      conditions: [
        { type: 'dueDate', operator: 'isDueToday', value: null },
        ...MINE_NOT_PENDING_APPROVAL,
      ],
      operator: 'AND',
    },
  },
  'due-next-two-days': {
    name: 'Due Today & Tomorrow',
    filter: {
      conditions: [
        {
          type: 'dueDate',
          operator: 'anyOf',
          value: ['isDueToday', 'isDueTomorrow'],
        },
      ],
      operator: 'AND',
    },
  },
  'pending-approval': {
    name: 'Pending Approval',
    filter: {
      conditions: [{ type: 'status', operator: 'is', value: 3 }],
      operator: 'AND',
    },
  },
  unplanned: {
    name: 'Unplanned',
    filter: {
      conditions: [{ type: 'dueDate', operator: 'hasNoDueDate', value: null }],
      operator: 'AND',
    },
  },
  'due-this-week': {
    name: 'Due This Week',
    filter: {
      conditions: [{ type: 'dueDate', operator: 'isDueThisWeek', value: null }],
      operator: 'AND',
    },
  },
  // What Home's "Coming up" triage tile links back into: due tomorrow.
  'coming-up': {
    name: 'Coming Up',
    filter: {
      conditions: [
        { type: 'dueDate', operator: 'isDueTomorrow', value: null },
        ...MINE_NOT_PENDING_APPROVAL,
      ],
      operator: 'AND',
    },
  },
  // What Home's "Next up" link opens: the week ahead plus everything already
  // late, which is the set that section is actually a preview of.
  'due-this-week-overdue': {
    name: 'Due This Week & Overdue',
    filter: {
      conditions: [
        {
          type: 'dueDate',
          operator: 'anyOf',
          value: ['isOverdue', 'isDueThisWeek'],
        },
      ],
      operator: 'AND',
    },
  },
  'no-due-date': {
    name: 'No Due Date',
    filter: {
      conditions: [{ type: 'dueDate', operator: 'hasNoDueDate', value: null }],
      operator: 'AND',
    },
  },
}
