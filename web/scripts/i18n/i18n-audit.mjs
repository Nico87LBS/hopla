#!/usr/bin/env node
/**
 * Fails if any t() / i18nKey key in src/ is missing from a locale in
 * public/locales/ (en and fr), or if the locales do not hold the same keys.
 * The checks themselves live in i18n-keys.mjs, shared with
 * tests/i18n-keys.test.mjs.
 *
 * Why this is a script and not an ESLint rule: the namespace for a bare
 * t('foo') comes from the useTranslation('chores') call at the top of the
 * component, so resolving a key needs whole-file context that a per-node lint
 * rule does not have.
 *
 * Usage:  node scripts/i18n/i18n-audit.mjs [--orphans]
 *   --orphans  also list en/*.json keys that nothing in src/ references
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { auditKeys, flatten, loadLocales } from './i18n-keys.mjs'

const SRC_DIR = 'src'
const LOCALES_DIR = 'public/locales'

if (process.argv.includes('--orphans')) {
  const walk = dir =>
    readdirSync(dir).flatMap(entry => {
      const full = join(dir, entry)
      return statSync(full).isDirectory() ? walk(full) : [full]
    })
  const allSrc = walk(SRC_DIR)
    .map(f => readFileSync(f, 'utf8'))
    .join('\n')
  const orphans = new Set()
  for (const [ns, bundle] of Object.entries(loadLocales(LOCALES_DIR).en)) {
    for (const key of flatten(bundle)) {
      const leaf = key.replace(/_(one|other|zero|two|few|many)$/, '')
      if (!allSrc.includes(leaf) && !allSrc.includes(leaf.split('.').pop())) {
        orphans.add(`${ns}:${leaf}`)
      }
    }
  }
  if (orphans.size) {
    console.log(`\nPossibly unused (${orphans.size}):`)
    console.log([...orphans].sort().join('\n'))
  }
}

const { missing, unmatched } = auditKeys({
  srcDir: SRC_DIR,
  localesDir: LOCALES_DIR,
})
if (missing.length || unmatched.length) {
  if (missing.length) {
    console.error(`i18n audit: ${missing.length} unresolved key(s)\n`)
    console.error(missing.join('\n'))
  }
  if (unmatched.length) {
    console.error(
      `\ni18n audit: ${unmatched.length} key(s) not in every locale\n`,
    )
    console.error(unmatched.join('\n'))
  }
  process.exit(1)
}
console.log('i18n audit: all keys resolve in every locale')
