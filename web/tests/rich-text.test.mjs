import assert from 'node:assert/strict'
import test from 'node:test'

import {
  LIST_KINDS,
  safeClasses,
  safeLanguage,
} from '../src/utils/sanitizeRichText.js'

test('the editor layout classes are kept, others dropped', () => {
  assert.equal(
    safeClasses('ql-align-center ql-indent-2 evil ql-indent-12'),
    'ql-align-center ql-indent-2',
  )
  assert.equal(safeClasses('ql-code-block'), 'ql-code-block')
  assert.equal(safeClasses('onclick'), '')
})

test('bullets stay bullets', () => {
  assert.ok(LIST_KINDS.has('bullet'))
  assert.ok(LIST_KINDS.has('ordered'))
  assert.ok(!LIST_KINDS.has('x" onclick="a'))
})

test('a code block language is a plain word', () => {
  assert.ok(safeLanguage('plain'))
  assert.ok(!safeLanguage('java script'))
  assert.ok(!safeLanguage(''))
})
