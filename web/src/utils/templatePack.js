// A Hopla template: the tasks, rewards, presets and game settings of a
// family, without anyone in it and without dates, to start another instance
// quickly. Everything refers to everything else by name, never by id.

export const TEMPLATE_FORMAT = 'hopla-template'
export const TEMPLATE_VERSION = 1
export const SECTIONS = ['tasks', 'rewards', 'presets', 'games']

const REPEAT_ON_TYPE = ['interval', 'days_of_the_week', 'day_of_the_month']

const sameName = name =>
  String(name ?? '')
    .trim()
    .toLowerCase()

const pad = n => String(n).padStart(2, '0')

// The local time of day a task is due, as HH:mm, or null without a due date.
export const dueTimeOf = nextDueDate => {
  if (!nextDueDate) return null
  const date = new Date(nextDueDate)
  if (Number.isNaN(date.getTime())) return null
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// The first due date of an imported task: today at its time of day, or
// tomorrow when that time has passed.
export const firstDueDate = (dueTime, now = new Date()) => {
  if (!dueTime) return null
  const [hours, minutes] = dueTime.split(':').map(Number)
  const due = new Date(now)
  due.setHours(hours || 0, minutes || 0, 0, 0)
  if (due <= now) due.setDate(due.getDate() + 1)
  return due
}

// Subtasks keep their order and nesting through a reference local to the
// task, since their ids belong to the instance.
const exportSubtasks = subTasks => {
  const refs = new Map((subTasks || []).map((s, i) => [s.id, i + 1]))
  return (subTasks || [])
    .slice()
    .sort((a, b) => (a.orderId ?? 0) - (b.orderId ?? 0))
    .map(s => ({
      ref: refs.get(s.id),
      name: s.name,
      parent: s.parentId ? refs.get(s.parentId) || null : null,
    }))
}

// The time a task repeats at is a date of this instance; the template keeps
// the time of day in dueTime instead.
const withoutDate = metadata => {
  if (!metadata) return null
  // eslint-disable-next-line no-unused-vars
  const { time, timezone, ...rest } = metadata
  return rest
}

const exportTask = (chore, labelsById) => ({
  name: chore.name.trim(),
  description: chore.description || '',
  frequencyType: chore.frequencyType,
  frequency: chore.frequency,
  frequencyMetadata: withoutDate(chore.frequencyMetadata),
  dueTime: dueTimeOf(chore.nextDueDate),
  isRolling: !!chore.isRolling,
  assignStrategy: chore.assignStrategy,
  points: chore.points ?? null,
  requireApproval: !!chore.requireApproval,
  priority: chore.priority || 0,
  completionWindow: chore.completionWindow ?? null,
  notification: !!chore.notification,
  notificationMetadata: chore.notificationMetadata || null,
  labels: (chore.labelsV2 || [])
    .map(l => labelsById.get(l.id) || l)
    .map(l => ({ name: l.name, color: l.color || '' })),
  subTasks: exportSubtasks(chore.subTasks),
})

// buildTemplate turns what the instance holds into a template. Private tasks
// stay out, and a task created once per child is kept once.
export const buildTemplate = (data, sections = SECTIONS, now = new Date()) => {
  const template = {
    format: TEMPLATE_FORMAT,
    version: TEMPLATE_VERSION,
    exportedAt: now.toISOString(),
  }
  const chores = (data.chores || []).filter(c => !c.isPrivate && c.isActive)
  const labelsById = new Map((data.labels || []).map(l => [l.id, l]))
  const choreNames = new Map(chores.map(c => [c.id, c.name.trim()]))

  if (sections.includes('tasks')) {
    const seen = new Set()
    template.tasks = []
    for (const chore of chores) {
      if (seen.has(sameName(chore.name))) continue
      seen.add(sameName(chore.name))
      template.tasks.push(exportTask(chore, labelsById))
    }
  }
  if (sections.includes('rewards')) {
    template.rewards = (data.rewards || [])
      .filter(r => r.isActive !== false)
      .map(r => ({
        name: r.name,
        description: r.description || '',
        pointsCost: r.pointsCost,
        quotaCount: r.quotaCount || 0,
        quotaPeriod: r.quotaPeriod || '',
      }))
  }
  if (sections.includes('presets')) {
    template.presets = (data.presets || []).map(p => ({
      name: p.name,
      points: p.points,
    }))
  }
  if (sections.includes('games')) {
    const rules = data.rules || {}
    template.games = {
      rules: {
        streakEvery: rules.streakEvery ?? 0,
        streakBonus: rules.streakBonus ?? 0,
        surpriseEnabled: !!rules.surpriseEnabled,
        surpriseBonus: rules.surpriseBonus ?? 0,
        questsPerWeek: rules.questsPerWeek ?? 0,
      },
      ranks: (data.ranks || []).map(r => ({
        name: r.name,
        icon: r.icon || '',
        image: r.image || '',
        minPoints: r.minPoints,
      })),
      quests: (data.quests || []).map(q => ({
        name: q.name,
        kind: q.kind,
        task: q.choreId ? choreNames.get(q.choreId) || null : null,
        target: q.target,
        reward: q.reward,
        period: q.period,
      })),
    }
  }
  return template
}

// readTemplate checks a file is a Hopla template and returns it, or throws.
export const readTemplate = text => {
  let template
  try {
    template = typeof text === 'string' ? JSON.parse(text) : text
  } catch {
    throw new Error('notJson')
  }
  if (!template || template.format !== TEMPLATE_FORMAT) {
    throw new Error('notTemplate')
  }
  if (template.version > TEMPLATE_VERSION) throw new Error('tooNew')
  return template
}

const splitByName = (items, existing) => {
  const taken = new Set((existing || []).map(e => sameName(e.name)))
  const added = []
  const skipped = []
  for (const item of items || []) {
    if (taken.has(sameName(item.name))) {
      skipped.push(item)
    } else {
      taken.add(sameName(item.name))
      added.push(item)
    }
  }
  return { added, skipped }
}

// planImport says what an import creates, leaving out what the instance
// already has under the same name. Rules and ranks replace the current ones.
export const planImport = (template, existing, sections = SECTIONS) => {
  const plan = {}
  if (sections.includes('tasks') && template.tasks) {
    plan.tasks = splitByName(template.tasks, existing.chores)
    const known = new Set((existing.labels || []).map(l => sameName(l.name)))
    plan.labels = []
    for (const task of plan.tasks.added) {
      for (const label of task.labels || []) {
        if (!known.has(sameName(label.name))) {
          known.add(sameName(label.name))
          plan.labels.push(label)
        }
      }
    }
  }
  if (sections.includes('rewards') && template.rewards) {
    plan.rewards = splitByName(template.rewards, existing.rewards)
  }
  if (sections.includes('presets') && template.presets) {
    plan.presets = splitByName(template.presets, existing.presets)
  }
  if (sections.includes('games') && template.games) {
    plan.rules = template.games.rules || null
    plan.ranks = template.games.ranks?.length ? template.games.ranks : null
    plan.quests = splitByName(template.games.quests, existing.quests)
  }
  return plan
}

// taskRequests turns a template task into the requests that create it: one
// task shared by the chosen members, or one copy for each of them. With no
// member chosen, the task is for anyone.
export const taskRequests = (task, { labelIds, members, now, perMember }) => {
  const due = firstDueDate(task.dueTime, now)
  let frequencyMetadata = task.frequencyMetadata || {}
  if (due && REPEAT_ON_TYPE.includes(task.frequencyType)) {
    frequencyMetadata = {
      ...frequencyMetadata,
      time: due.toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }
  }
  const subTasks = (task.subTasks || []).map((s, i) => ({
    id: -s.ref,
    orderId: i,
    name: s.name,
    parentId: s.parent ? -s.parent : null,
  }))
  const base = {
    name: task.name,
    description: task.description || '',
    frequencyType: task.frequencyType,
    frequency: Number(task.frequency) || 1,
    frequencyMetadata,
    nextDueDate: due ? due.toISOString() : null,
    isRolling: !!task.isRolling && !!due,
    isActive: true,
    isPrivate: false,
    points: task.points ?? null,
    requireApproval: !!task.requireApproval,
    priority: task.priority || 0,
    completionWindow: due ? (task.completionWindow ?? null) : null,
    notification: !!task.notification,
    notificationMetadata: task.notificationMetadata || {},
    labelsV2: (task.labels || [])
      .map(l => labelIds.get(sameName(l.name)))
      .filter(Boolean)
      .map(id => ({ id })),
    subTasks,
  }
  const assigned = userIds => ({
    ...base,
    assignees: userIds.map(userId => ({ userId })),
    assignStrategy:
      userIds.length > 1 && task.assignStrategy !== 'no_assignee'
        ? task.assignStrategy
        : 'keep_last_assigned',
    assignedTo: userIds[0],
  })
  if (!members.length) {
    return [
      {
        ...base,
        assignees: [],
        assignStrategy: 'no_assignee',
        assignedTo: null,
      },
    ]
  }
  if (perMember) return members.map(id => assigned([id]))
  return [assigned(members)]
}

// applyImport creates what the plan holds through the api, in an order where
// each step finds what it refers to: labels before tasks, tasks before quests.
// A failure is noted and the import goes on with the rest.
export const applyImport = async (plan, options, api) => {
  const report = {
    labels: 0,
    tasks: 0,
    rewards: 0,
    presets: 0,
    quests: 0,
    rules: false,
    ranks: false,
    errors: [],
  }
  const attempt = async (section, name, step) => {
    try {
      await step()
      return true
    } catch {
      report.errors.push({ section, name })
      return false
    }
  }

  const labelIds = new Map(
    (options.labels || []).map(l => [sameName(l.name), l.id]),
  )
  for (const label of plan.labels || []) {
    await attempt('labels', label.name, async () => {
      const created = await api.createLabel(label)
      labelIds.set(sameName(label.name), created.id)
      report.labels++
    })
  }

  const choreIds = new Map(
    (options.chores || []).map(c => [sameName(c.name), c.id]),
  )
  for (const task of plan.tasks?.added || []) {
    let created = false
    for (const request of taskRequests(task, { ...options, labelIds })) {
      const ok = await attempt('tasks', task.name, async () => {
        const id = await api.createChore(request)
        if (!choreIds.has(sameName(task.name))) {
          choreIds.set(sameName(task.name), id)
        }
      })
      created = created || ok
    }
    if (created) report.tasks++
  }

  for (const reward of plan.rewards?.added || []) {
    await attempt('rewards', reward.name, async () => {
      await api.createReward(reward)
      report.rewards++
    })
  }
  for (const preset of plan.presets?.added || []) {
    await attempt('presets', preset.name, async () => {
      await api.savePreset(preset)
      report.presets++
    })
  }

  if (plan.rules) {
    report.rules = await attempt('games', 'rules', () =>
      api.saveRules(plan.rules),
    )
  }
  if (plan.ranks) {
    report.ranks = await attempt('games', 'ranks', () =>
      api.saveRanks(plan.ranks),
    )
  }
  for (const quest of plan.quests?.added || []) {
    const choreId = quest.task ? choreIds.get(sameName(quest.task)) : null
    if (quest.task && !choreId) {
      report.errors.push({ section: 'quests', name: quest.name })
      continue
    }
    await attempt('quests', quest.name, async () => {
      await api.saveQuest({
        name: quest.name,
        kind: quest.kind,
        choreId: choreId || null,
        target: quest.target,
        reward: quest.reward,
        period: quest.period,
        userIds: [],
      })
      report.quests++
    })
  }
  return report
}

export { sameName }
