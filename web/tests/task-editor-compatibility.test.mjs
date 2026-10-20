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
    onTriggerUpdate: value => {
      context.trigger = value
    },
  }
  evaluate(repeat, modeCallback, context)(null, 'trigger')
  assert.equal(context.frequency, 'trigger')
  evaluate(repeat, modeCallback, context)(null, 'once')
  assert.equal(context.frequency, 'once')
  assert.equal(context.trigger, null)
}

const trigger = sourceFile('ThingTriggerSection.jsx')
const effect = find(
  trigger.ast,
  node =>
    node.type === 'CallExpression' &&
    node.callee.value === 'useEffect' &&
    trigger.text(node.arguments[0].expression).includes('onTriggerUpdate'),
)
const context = {
  selectedThing: { id: 1, type: 'number' },
  condition: 'eq',
  triggerState: 0,
  hasValue: value => value !== null && value !== undefined && value !== '',
  onTriggerUpdate: value => {
    context.updated = value
  },
  onValidate: value => {
    context.valid = value
  },
}
const validator = find(
  trigger.ast,
  node =>
    node.type === 'VariableDeclarator' && node.id.value === 'isValidTrigger',
)
context.isValidTrigger = evaluate(trigger, validator.init, context)
evaluate(trigger, effect.arguments[0].expression, context)()
assert.equal(context.updated.triggerState, 0)
assert.equal(context.valid, true)
context.triggerState = null
context.updated = undefined
evaluate(trigger, effect.arguments[0].expression, context)()
assert.equal(context.updated, undefined)
assert.equal(context.valid, false)
console.log('Editor keeps trigger mode and zero-valued Thing triggers')
