/**
 * Finds every t() / i18nKey key used in src/ and checks it against each
 * locale in public/locales/ (en and fr).
 *
 * The namespace of a bare t('foo') comes from the closest useTranslation()
 * call above it in the same file, so a file holding several components with
 * different namespaces is resolved correctly.
 *
 * Template keys are checked too:
 *   t(`a.title${mode === 'x' ? 'X' : 'Y'}`)  → a.titleX and a.titleY must exist
 *   t(`a.${kind}.title`)                      → at least one a.<…>.title must exist
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

export const DEFAULT_NS = 'common'
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/

const walk = dir =>
  readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry)
    return statSync(full).isDirectory()
      ? walk(full)
      : /\.[jt]sx?$/.test(full)
        ? [full]
        : []
  })

export const flatten = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) =>
    v !== null && typeof v === 'object'
      ? flatten(v, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  )

export const loadLocales = localesDir =>
  Object.fromEntries(
    readdirSync(localesDir)
      .filter(lang => statSync(join(localesDir, lang)).isDirectory())
      .map(lang => [
        lang,
        Object.fromEntries(
          readdirSync(join(localesDir, lang))
            .filter(f => f.endsWith('.json'))
            .map(f => [
              basename(f, '.json'),
              JSON.parse(readFileSync(join(localesDir, lang, f), 'utf8')),
            ]),
        ),
      ]),
  )

/** Every key of a namespace, plus `parent` for each object node, without plural suffixes. */
const keyIndex = bundle => {
  const keys = new Set()
  for (const key of flatten(bundle ?? {})) {
    const parts = key.replace(PLURAL_SUFFIX, '').split('.')
    for (let i = 1; i <= parts.length; i++)
      keys.add(parts.slice(0, i).join('.'))
  }
  return keys
}

/** Reads a JS string literal starting at src[i]; returns { parts, end } or null. */
const readLiteral = (src, i) => {
  const quote = src[i]
  if (quote !== "'" && quote !== '"' && quote !== '`') return null
  const parts = [] // strings, and { expr } for ${…}
  let text = ''
  let j = i + 1
  while (j < src.length) {
    const c = src[j]
    if (c === '\\') {
      text += src[j + 1]
      j += 2
      continue
    }
    if (c === quote) {
      parts.push(text)
      return { parts, end: j + 1 }
    }
    if (quote === '`' && c === '$' && src[j + 1] === '{') {
      parts.push(text)
      text = ''
      let depth = 1
      let k = j + 2
      while (k < src.length && depth > 0) {
        if (src[k] === '{') depth++
        else if (src[k] === '}') depth--
        k++
      }
      parts.push({ expr: src.slice(j + 2, k - 1).trim() })
      j = k
      continue
    }
    if (quote !== '`' && c === '\n') return null
    text += c
    j++
  }
  return null
}

/** Index just past the ')' matching the '(' at src[open]. */
const closeParen = (src, open) => {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    const c = src[i]
    if (c === "'" || c === '"' || c === '`') {
      const lit = readLiteral(src, i)
      if (lit) {
        i = lit.end - 1
        continue
      }
    }
    if (c === '(') depth++
    else if (c === ')' && --depth === 0) return i + 1
  }
  return src.length
}

/**
 * Values a ${…} expression can take: a list of strings for
 * `cond ? 'a' : 'b'` (nested ternaries too) or a plain literal, otherwise
 * null (unknown).
 */
export const expressionValues = expr => {
  const lit = /^(['"])([^'"]*)\1$/.exec(expr)
  if (lit) return [lit[2]]
  let depth = 0
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i]
    if ('([{'.includes(c)) depth++
    else if (')]}'.includes(c)) depth--
    else if (
      c === '?' &&
      depth === 0 &&
      expr[i + 1] !== '.' &&
      expr[i + 1] !== '?'
    ) {
      // find the matching ':' of this ternary
      let nested = 0
      for (let j = i + 1; j < expr.length; j++) {
        const d = expr[j]
        if ('([{'.includes(d)) depth++
        else if (')]}'.includes(d)) depth--
        else if (depth === 0 && d === '?' && expr[j + 1] !== '.') nested++
        else if (depth === 0 && d === ':') {
          if (nested === 0) {
            const a = expressionValues(expr.slice(i + 1, j).trim())
            const b = expressionValues(expr.slice(j + 1).trim())
            return a && b ? [...a, ...b] : null
          }
          nested--
        }
      }
      return null
    }
  }
  return null
}

/**
 * Turns literal parts into a list of patterns. Each pattern is an array of
 * fixed strings separated by wildcards.
 */
export const expandKey = parts => {
  let variants = [['']]
  for (const part of parts) {
    if (typeof part === 'string') {
      variants = variants.map(v => [...v.slice(0, -1), v.at(-1) + part])
      continue
    }
    const values = expressionValues(part.expr)
    variants = values
      ? variants.flatMap(v =>
          values.map(x => [...v.slice(0, -1), v.at(-1) + x]),
        )
      : variants.map(v => [...v, ''])
  }
  return variants
}

const matches = (keys, pattern) => {
  if (pattern.length === 1) return keys.has(pattern[0])
  const re = new RegExp(
    `^${pattern.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+')}$`,
  )
  for (const key of keys) if (re.test(key)) return true
  return false
}

/** Lists the keys used in one source file: [{ ns, pattern, line }]. */
export const collectUsages = src => {
  const namespaces = [
    ...src.matchAll(/useTranslation\(\s*(\[?)\s*(?:'([^']+)'|"([^"]+)")?/g),
  ].map(m => ({ at: m.index, ns: m[2] ?? m[3] ?? DEFAULT_NS }))
  const nsAt = pos => {
    const before = namespaces.filter(n => n.at < pos)
    return (before.at(-1) ?? namespaces[0])?.ns ?? DEFAULT_NS
  }
  const lineAt = pos => src.slice(0, pos).split('\n').length
  const usages = []
  const add = (pos, parts, nsOverride) => {
    let ns = nsOverride ?? nsAt(pos)
    const first = parts[0]
    if (typeof first === 'string' && /^\w+:/.test(first)) {
      const colon = first.indexOf(':')
      ns = first.slice(0, colon)
      parts = [first.slice(colon + 1), ...parts.slice(1)]
    }
    for (const pattern of expandKey(parts)) {
      // a template that is only a variable (t(`${key}`)) says nothing
      if (pattern.every(s => s === '')) continue
      usages.push({ ns, pattern, line: lineAt(pos) })
    }
  }

  if (!namespaces.length && !/i18nKey|\bi18n(?:ext)?\.t\(/.test(src)) {
    return usages
  }

  // t('…') from useTranslation, and i18n.t('…') outside components, which
  // has no useTranslation namespace and falls back to the default one
  for (const m of src.matchAll(/(?<![\w.$])(i18n(?:ext)?\.)?t\(/g)) {
    const open = m.index + m[0].length - 1
    let i = open + 1
    while (/\s/.test(src[i])) i++
    const lit = readLiteral(src, i)
    if (!lit) continue
    const args = src.slice(lit.end, closeParen(src, open) - 1)
    const nsOption =
      /\bns:\s*['"]([^'"]+)['"]/.exec(args)?.[1] ??
      (m[1] ? DEFAULT_NS : undefined)
    add(m.index, lit.parts, nsOption)
  }

  for (const m of src.matchAll(/i18nKey=\{?\s*(['"`])/g)) {
    const start = m.index + m[0].length - 1
    const lit = readLiteral(src, start)
    if (!lit) continue
    const tag = src.slice(
      src.lastIndexOf('<', m.index),
      src.indexOf('>', m.index),
    )
    const nsOption = /\bns=\{?['"]([^'"]+)['"]/.exec(tag)?.[1]
    add(m.index, lit.parts, nsOption)
  }
  return usages
}

/**
 * Returns the problems found:
 *   - keys used in src/ missing from a locale
 *   - keys present in one locale and not in another
 */
export const auditKeys = ({
  localesDir = 'public/locales',
  srcDir = 'src',
} = {}) => {
  const locales = loadLocales(localesDir)
  const indexes = Object.fromEntries(
    Object.entries(locales).map(([lang, bundles]) => [
      lang,
      Object.fromEntries(
        Object.entries(bundles).map(([ns, b]) => [ns, keyIndex(b)]),
      ),
    ]),
  )

  const missing = []
  for (const file of walk(srcDir).sort()) {
    for (const { line, ns, pattern } of collectUsages(
      readFileSync(file, 'utf8'),
    )) {
      for (const [lang, byNs] of Object.entries(indexes)) {
        if (!matches(byNs[ns] ?? new Set(), pattern)) {
          missing.push(`${lang}  ${file}:${line}  ${ns}:${pattern.join('…')}`)
        }
      }
    }
  }

  const unmatched = []
  const langs = Object.keys(locales)
  const leaves = (lang, ns) =>
    new Set(
      flatten(locales[lang][ns] ?? {}).map(k => k.replace(PLURAL_SUFFIX, '')),
    )
  for (const lang of langs) {
    for (const ns of Object.keys(locales[lang])) {
      for (const other of langs) {
        if (other === lang) continue
        const theirs = leaves(other, ns)
        for (const key of leaves(lang, ns)) {
          if (!theirs.has(key))
            unmatched.push(
              `${other}  missing  ${ns}:${key}  (present in ${lang})`,
            )
        }
      }
    }
  }

  return {
    missing: [...new Set(missing)].sort(),
    unmatched: [...new Set(unmatched)].sort(),
  }
}
