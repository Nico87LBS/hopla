import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'

import { ICONS, iconFile, iconOf } from '../src/utils/learn/icons.js'

test('every icon of the list has its drawing', () => {
  for (const emoji of ICONS) {
    const file = iconFile(emoji)
    assert.ok(file, emoji)
    assert.ok(existsSync(new URL(`../public${file}`, import.meta.url)), emoji)
  }
})

test('an unknown emoji has no drawing', () => {
  assert.equal(iconFile('🫠'), null)
  assert.equal(iconFile('x'), null)
})

test('a module shows its icon, else its subject’s, else a bag', () => {
  assert.equal(iconOf({ icon: '➗', subject: 'maths' }), '➗')
  assert.equal(iconOf({ icon: '', subject: 'maths' }), '🧮')
  assert.equal(iconOf({ document: { icone: '🐶' }, subject: 'anglais' }), '🐶')
  assert.equal(iconOf({ icon: '🫠', subject: 'monde' }), '🌍')
  assert.equal(iconOf({}, 'inconnu'), '🎒')
  assert.equal(iconOf(null, 'francais'), '📖')
})
