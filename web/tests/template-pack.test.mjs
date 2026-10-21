import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  applyImport,
  buildTemplate,
  planImport,
  readTemplate,
  taskRequests,
} from '../src/utils/templatePack.js'

const instance = {
  chores: [
    {
      id: 1,
      name: 'Ranger la chambre',
      frequencyType: 'days_of_the_week',
      frequency: 1,
      frequencyMetadata: {
        days: ['monday'],
        time: '2026-10-19T18:00:00Z',
        timezone: 'Europe/Brussels',
      },
      nextDueDate: '2026-10-26T18:00:00Z',
      assignStrategy: 'keep_last_assigned',
      assignees: [{ userId: 7 }],
      assignedTo: 7,
      points: 5,
      isActive: true,
      labelsV2: [{ id: 3 }],
      subTasks: [
        { id: 40, name: 'Jouets', orderId: 0, parentId: null },
        { id: 41, name: 'Lego', orderId: 1, parentId: 40 },
      ],
    },
    // The same task created for the second child.
    {
      id: 2,
      name: ' ranger la chambre ',
      frequencyType: 'daily',
      isActive: true,
      assignStrategy: 'keep_last_assigned',
    },
    { id: 3, name: 'Secret', isPrivate: true, isActive: true },
    { id: 4, name: 'Old', isActive: false },
  ],
  labels: [{ id: 3, name: 'Chambre', color: '#f00' }],
  rewards: [{ id: 9, name: 'Glace', pointsCost: 20, createdBy: 7 }],
  presets: [{ id: 1, name: 'Oubli', points: -5 }],
  rules: { streakEvery: 7, streakBonus: 10, circleId: 12 },
  ranks: [{ name: 'Petit Hop', icon: '🐣', minPoints: 0 }],
  quests: [
    {
      id: 5,
      name: 'Chambre nickel',
      kind: 'tasks',
      choreId: 1,
      target: 5,
      reward: 20,
      period: 'week',
      userIds: [7],
    },
  ],
}

test('a template keeps no people, ids or dates', () => {
  const template = buildTemplate(instance, undefined, new Date(0))
  assert.equal(template.tasks.length, 1)
  const [task] = template.tasks
  assert.equal(task.name, 'Ranger la chambre')
  assert.deepEqual(task.frequencyMetadata, { days: ['monday'] })
  assert.match(task.dueTime, /^\d\d:\d\d$/)
  assert.deepEqual(task.labels, [{ name: 'Chambre', color: '#f00' }])
  assert.deepEqual(task.subTasks, [
    { ref: 1, name: 'Jouets', parent: null },
    { ref: 2, name: 'Lego', parent: 1 },
  ])
  assert.equal(template.games.quests[0].task, 'Ranger la chambre')
  const text = JSON.stringify(template)
  for (const leak of ['assignees', 'userIds', 'choreId', 'circleId', '2026']) {
    assert.ok(!text.includes(leak), leak)
  }
})

test('only the chosen sections are exported', () => {
  const template = buildTemplate(instance, ['rewards'])
  assert.deepEqual(Object.keys(template).sort(), [
    'exportedAt',
    'format',
    'rewards',
    'version',
  ])
})

test('a file that is not a template is refused', () => {
  assert.throws(() => readTemplate('{'), /notJson/)
  assert.throws(() => readTemplate('{"tasks":[]}'), /notTemplate/)
  assert.throws(
    () => readTemplate('{"format":"hopla-template","version":99}'),
    /tooNew/,
  )
})

test('the import leaves out what already exists by name', () => {
  const template = buildTemplate(instance)
  template.tasks.push({ name: 'Mettre la table', labels: [{ name: 'Repas' }] })
  template.rewards.push({ name: 'Cinéma', pointsCost: 50 })
  const plan = planImport(template, instance)
  assert.deepEqual(
    plan.tasks.added.map(t => t.name),
    ['Mettre la table'],
  )
  assert.equal(plan.tasks.skipped.length, 1)
  assert.deepEqual(plan.labels, [{ name: 'Repas' }])
  assert.deepEqual(
    plan.rewards.added.map(r => r.name),
    ['Cinéma'],
  )
  assert.equal(plan.presets.added.length, 0)
  assert.equal(plan.quests.added.length, 0)
  assert.ok(plan.rules && plan.ranks)
})

test('an imported task is due at its time, today or tomorrow', () => {
  const task = { name: 'Bain', frequencyType: 'daily', dueTime: '19:00' }
  const morning = new Date(2026, 9, 21, 8, 0)
  const evening = new Date(2026, 9, 21, 20, 0)
  const options = { labelIds: new Map(), members: [] }
  const [early] = taskRequests(task, { ...options, now: morning })
  const [late] = taskRequests(task, { ...options, now: evening })
  assert.equal(new Date(early.nextDueDate).getDate(), 21)
  assert.equal(new Date(late.nextDueDate).getDate(), 22)
  assert.equal(new Date(late.nextDueDate).getHours(), 19)
  assert.equal(early.assignStrategy, 'no_assignee')
  assert.deepEqual(early.assignees, [])
})

test('tasks go to the chosen members, shared or one copy each', () => {
  const task = {
    name: 'Vaisselle',
    frequencyType: 'days_of_the_week',
    frequencyMetadata: { days: ['monday'] },
    dueTime: '18:00',
    assignStrategy: 'round_robin',
    labels: [{ name: 'Cuisine' }],
    subTasks: [{ ref: 1, name: 'Laver', parent: null }],
  }
  const options = {
    labelIds: new Map([['cuisine', 8]]),
    members: [7, 8],
    now: new Date(2026, 9, 21, 8, 0),
  }
  const [shared] = taskRequests(task, options)
  assert.deepEqual(shared.assignees, [{ userId: 7 }, { userId: 8 }])
  assert.equal(shared.assignStrategy, 'round_robin')
  assert.deepEqual(shared.labelsV2, [{ id: 8 }])
  assert.deepEqual(shared.subTasks, [
    { id: -1, orderId: 0, name: 'Laver', parentId: null },
  ])
  assert.equal(shared.frequencyMetadata.days[0], 'monday')
  assert.ok(shared.frequencyMetadata.time && shared.frequencyMetadata.timezone)

  const copies = taskRequests(task, { ...options, perMember: true })
  assert.deepEqual(
    copies.map(c => [c.assignedTo, c.assignStrategy]),
    [
      [7, 'keep_last_assigned'],
      [8, 'keep_last_assigned'],
    ],
  )
})

test('the import creates labels before tasks and tasks before quests', async () => {
  const template = {
    format: 'hopla-template',
    version: 1,
    tasks: [
      { name: 'Lit', frequencyType: 'daily', labels: [{ name: 'Matin' }] },
    ],
    rewards: [{ name: 'Glace', pointsCost: 20 }],
    games: {
      rules: { streakEvery: 7 },
      ranks: [{ name: 'Hop', minPoints: 0 }],
      quests: [
        {
          name: 'Lit fait',
          kind: 'tasks',
          task: 'Lit',
          target: 5,
          reward: 10,
          period: 'week',
        },
        {
          name: 'Ailleurs',
          kind: 'tasks',
          task: 'Inconnue',
          target: 1,
          reward: 1,
          period: 'week',
        },
      ],
    },
  }
  const calls = []
  const api = {
    createLabel: async label => (calls.push(['label', label.name]), { id: 50 }),
    createChore: async chore => (calls.push(['chore', chore.labelsV2]), 60),
    createReward: async () => {
      throw new Error('down')
    },
    savePreset: async () => {},
    saveRules: async () => calls.push(['rules']),
    saveRanks: async () => calls.push(['ranks']),
    saveQuest: async quest => calls.push(['quest', quest.choreId]),
  }
  const plan = planImport(template, {
    chores: [],
    labels: [],
    rewards: [],
    presets: [],
    quests: [],
  })
  const report = await applyImport(plan, { members: [], now: new Date() }, api)
  assert.deepEqual(calls, [
    ['label', 'Matin'],
    ['chore', [{ id: 50 }]],
    ['rules'],
    ['ranks'],
    ['quest', 60],
  ])
  assert.equal(report.tasks, 1)
  assert.equal(report.rewards, 0)
  assert.equal(report.quests, 1)
  assert.deepEqual(
    report.errors.map(e => e.name),
    ['Glace', 'Ailleurs'],
  )
})
