import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  auditKeys,
  collectUsages,
  expressionValues,
} from '../scripts/i18n/i18n-keys.mjs'

test('every key used in src/ exists in every locale', () => {
  const { missing } = auditKeys()
  assert.deepEqual(missing, [])
})

test('the locales hold the same keys', () => {
  const { unmatched } = auditKeys()
  assert.deepEqual(unmatched, [])
})

test('ternaries inside a template key are expanded', () => {
  assert.deepEqual(expressionValues("mode === 'points' ? 'Points' : 'Tasks'"), [
    'Points',
    'Tasks',
  ])
  assert.deepEqual(expressionValues("a ? 'x' : b ? 'y' : 'z'"), ['x', 'y', 'z'])
  assert.equal(expressionValues('goal.kind'), null)

  const src = `
    const { t } = useTranslation('points')
    t(
      \`leaderboard.title\${mode === 'points' ? 'Points' : 'Tasks'}\`,
    )`
  assert.deepEqual(
    collectUsages(src).map(u => `${u.ns}:${u.pattern.join('*')}`),
    ['points:leaderboard.titlePoints', 'points:leaderboard.titleTasks'],
  )
})

test('the namespace comes from the closest useTranslation above', () => {
  const src = `
    function A() {
      const { t } = useTranslation('games')
      return t('ranks.title')
    }
    function B() {
      const { t } = useTranslation(['rewards', 'common'])
      return [t('view.title'), t('common:save'), t(\`quota.\${p}\`)]
    }`
  assert.deepEqual(
    collectUsages(src).map(u => `${u.ns}:${u.pattern.join('*')}`),
    [
      'games:ranks.title',
      'rewards:view.title',
      'common:save',
      'rewards:quota.*',
    ],
  )
})

test('i18n.t() outside components uses the default namespace', () => {
  const src = `
    import i18n from 'i18next'
    export const label = () => [i18n.t('chores:sections.today'), i18n.t('save')]`
  assert.deepEqual(
    collectUsages(src).map(u => `${u.ns}:${u.pattern.join('*')}`),
    ['chores:sections.today', 'common:save'],
  )
})
