import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import console from 'node:console'
import { readFileSync } from 'node:fs'
import { URL } from 'node:url'
import vm from 'node:vm'

import { parseSync } from '@swc/core'

// Exercise the real editor callbacks without mounting the entire application.
function sourceFile(name) {
  const source = readFileSync(
    new URL(`../src/views/ChoreEdit/${name}`, import.meta.url),
  )
  // Anchor the module span before any leading comments.
  const anchoredSource = Buffer.concat([Buffer.from(';'), source])
  const ast = parseSync(anchoredSource.toString(), {
    syntax: 'ecmascript',
    jsx: true,
  })
  return {
    ast,
    text: node =>
      anchoredSource
        .subarray(
          node.span.start - ast.span.start,
          node.span.end - ast.span.start,
        )
        .toString(),
  }
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return undefined
  if (predicate(node)) return node
  for (const child of Object.values(node)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const result = find(item, predicate)
        if (result) return result
      }
    } else {
      const result = find(child, predicate)
      if (result) return result
    }
  }
}
const attribute = (element, name) =>
  element.opening.attributes.find(item => item.name?.value === name)
const evaluate = (file, node, context) =>
  vm.runInNewContext(`(${file.text(node)})`, context)
const repeat = sourceFile('RepeatSection.jsx')
const modeSelect = find(
  repeat.ast,
  node =>
    node.type === 'JSXElement' &&
    node.opening.name.value === 'Select' &&
    attribute(node, 'aria-label')?.value?.expression?.arguments?.[0]?.expression
      ?.value === 'repeat.picker.scheduleType',
)
const modeCallback = attribute(modeSelect, 'onChange').value.expression
{
  const context = {
    onFrequencyTypeUpdate: value => {
      context.frequency = value
    },
  }
  evaluate(repeat, modeCallback, context)(null, 'trigger')
  assert.equal(context.frequency, 'trigger')
  evaluate(repeat, modeCallback, context)(null, 'once')
  assert.equal(context.frequency, 'once')
  evaluate(repeat, modeCallback, context)(null, 'repeat')
  assert.equal(context.frequency, 'daily')
}

console.log('Editor switches between one-time, repeating and triggered tasks')
