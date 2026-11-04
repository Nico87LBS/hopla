import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  canReloadNow,
  isBusyPath,
  isGamePath,
  isPageBusy,
} from '../src/utils/autoReload.js'

const doc = ({ active = null, dialog = false } = {}) => ({
  activeElement: active,
  querySelector: () => (dialog ? {} : null),
})

test('games and editors are busy pages', () => {
  assert.ok(isGamePath('/play/3/maths-ce2'))
  assert.ok(isGamePath('/play/3/test/anglais'))
  assert.ok(isGamePath('/play/3/recre'))
  assert.ok(isGamePath('/learn/3/play/maths-ce2'))
  assert.ok(isGamePath('/learn/3/recre'))
  assert.ok(!isGamePath('/play'))
  assert.ok(!isGamePath('/play/ABCD'))
  assert.ok(!isGamePath('/learn/3'))
  assert.ok(isBusyPath('/chores/create'))
  assert.ok(isBusyPath('/chores/12/edit'))
  assert.ok(isBusyPath('/manage/learn/editeur/perso'))
  assert.ok(!isBusyPath('/chores'))
  assert.ok(!isBusyPath('/chores/12'))
  assert.ok(!isBusyPath('/manage/learn/catalogue'))
})

test('an open window or a field being typed in holds the reload', () => {
  assert.ok(!isPageBusy(doc()))
  assert.ok(isPageBusy(doc({ dialog: true })))
  assert.ok(isPageBusy(doc({ active: { tagName: 'INPUT', type: 'text' } })))
  assert.ok(isPageBusy(doc({ active: { tagName: 'TEXTAREA' } })))
  assert.ok(
    isPageBusy(doc({ active: { tagName: 'DIV', isContentEditable: true } })),
  )
  assert.ok(
    !isPageBusy(doc({ active: { tagName: 'INPUT', type: 'checkbox' } })),
  )
  assert.ok(!isPageBusy(doc({ active: { tagName: 'BUTTON' } })))
})

test('a new page reloads unless a game starts', () => {
  const busy = doc({ dialog: true })
  assert.ok(
    canReloadNow({ reason: 'navigation', pathname: '/chores', doc: busy }),
  )
  assert.ok(
    canReloadNow({
      reason: 'navigation',
      pathname: '/chores/create',
      doc: doc(),
    }),
  )
  assert.ok(
    !canReloadNow({
      reason: 'navigation',
      pathname: '/play/3/recre',
      doc: doc(),
    }),
  )
})

test('back on the tab, it reloads only when nothing is in progress', () => {
  assert.ok(
    canReloadNow({ reason: 'visible', pathname: '/chores', doc: doc() }),
  )
  assert.ok(
    !canReloadNow({
      reason: 'visible',
      pathname: '/chores',
      doc: doc({ dialog: true }),
    }),
  )
  assert.ok(
    !canReloadNow({
      reason: 'visible',
      pathname: '/chores/3/edit',
      doc: doc(),
    }),
  )
  assert.ok(
    !canReloadNow({
      reason: 'hidden',
      pathname: '/learn/3/play/x',
      doc: doc(),
    }),
  )
})
