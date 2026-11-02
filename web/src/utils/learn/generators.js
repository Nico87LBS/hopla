// The question sources of a module: generators that draw calculations and
// problems, and written cards. Each source can list its questions when there
// are few enough, draw one at random, and rebuild a question from its key so
// a card due for review comes back as the same question.

import { evaluate } from './expression.js'
import { formatNumber, frenchWords } from './numbers.js'

// Sources with more questions than this are drawn at random instead of
// listed.
export const LIST_LIMIT = 2500
const DRAW_TRIES = 300

// ── value specs: [min, max], [min, max, step] or { valeurs: [...] } ──

export const parseSpec = spec => {
  if (Array.isArray(spec)) {
    const [min, max, step = 1] = spec
    return { min, max, step: Math.max(1, step) }
  }
  if (spec && Array.isArray(spec.valeurs)) return { list: spec.valeurs }
  if (typeof spec === 'number' || typeof spec === 'string') {
    return { list: [spec] }
  }
  return null
}

export const specCount = s =>
  s.list ? s.list.length : Math.max(0, Math.floor((s.max - s.min) / s.step) + 1)

const specAt = (s, i) => (s.list ? s.list[i] : s.min + i * s.step)

export const specHas = (s, v) =>
  s.list
    ? s.list.includes(v)
    : typeof v === 'number' &&
      Number.isInteger(v) &&
      v >= s.min &&
      v <= s.max &&
      (v - s.min) % s.step === 0

const specPick = (s, rng) => specAt(s, Math.floor(rng() * specCount(s)))

const specAll = s =>
  Array.from({ length: specCount(s) }, (_, i) => specAt(s, i))

const f = formatNumber

const digitsOf = n => String(n).split('').reverse().map(Number)

const hasCarry = (a, b) => {
  const da = digitsOf(a)
  const db = digitsOf(b)
  return da.some((d, i) => d + (db[i] || 0) >= 10)
}

const hasBorrow = (a, b) => {
  const da = digitsOf(a)
  const db = digitsOf(b)
  return db.some((d, i) => (da[i] || 0) < d)
}

const inResult = (gen, value) =>
  (gen.resultat_min === undefined || value >= gen.resultat_min) &&
  (gen.resultat_max === undefined || value <= gen.resultat_max)

const carryOk = (wanted, has) =>
  wanted === 'avec' ? has : wanted === 'sans' ? !has : true

// ── the arithmetic of two numbers ──

const ARITHMETIC = {
  addition: {
    tag: 'add',
    sign: '+',
    ok: (gen, a, b) =>
      inResult(gen, a + b) && carryOk(gen.retenue, hasCarry(a, b)),
    result: (a, b) => a + b,
  },
  soustraction: {
    tag: 'sub',
    sign: '−',
    keySign: '-',
    ok: (gen, a, b) =>
      a - b >= (gen.resultat_min ?? 0) &&
      inResult(gen, a - b) &&
      carryOk(gen.retenue, hasBorrow(a, b)),
    result: (a, b) => a - b,
  },
  multiplication: {
    tag: 'mul',
    sign: '×',
    keySign: 'x',
    ok: (gen, a, b) => inResult(gen, a * b),
    result: (a, b) => a * b,
  },
}

// steps explains a calculation, shown when the answer was wrong: the way
// one works it out in their head, not only its result.
const tensAndUnits = n => [n - (n % 10), n % 10]

export const steps = (operation, a, b) => {
  const r = ARITHMETIC[operation]?.result(a, b)
  if (operation === 'multiplication') {
    // The factor with the easiest trick leads (× 10, × 9, × 2…), the
    // calculation keeps the order shown.
    const rank = n => {
      const i = [10, 9, 2, 5, 4, 3, 6, 7, 8, 0, 1].indexOf(n)
      return i === -1 ? 99 : i
    }
    const [x, y] = rank(b) <= rank(a) ? [a, b] : [b, a]
    const head = `${f(a)} × ${f(b)}`
    if (y === 0 || y === 1) return `${head} = ${f(r)}`
    if (y === 10) return `${head} : on ajoute un zéro, ${f(r)}.`
    if (y === 2) return `${head}, c’est le double de ${f(x)} : ${f(r)}.`
    if (y === 4)
      return `${head}, c’est le double du double : ${f(x * 2)}, puis ${f(r)}.`
    if (y === 5)
      return `${head}, c’est la moitié de ${f(x)} × 10 = ${f(x * 10)} : ${f(r)}.`
    if (y === 9)
      return `${head} = ${f(x)} × 10 − ${f(x)} = ${f(x * 10)} − ${f(x)} = ${f(r)}.`
    if (y > 5 && y < 9)
      return `${head} = ${f(x)} × 5 + ${f(x)} × ${y - 5} = ${f(x * 5)} + ${f(x * (y - 5))} = ${f(r)}.`
    if (y === 3) return `${head} = ${f(x)} + ${f(x)} + ${f(x)} = ${f(r)}.`
    const [t, u] = tensAndUnits(x)
    if (t && u)
      return `${head} = ${f(t)} × ${f(y)} + ${f(u)} × ${f(y)} = ${f(t * y)} + ${f(u * y)} = ${f(r)}.`
    return `${head} = ${f(r)}.`
  }
  if (operation === 'addition' || operation === 'soustraction') {
    const sign = operation === 'addition' ? '+' : '−'
    const [t, u] = tensAndUnits(b)
    const head = `${f(a)} ${sign} ${f(b)}`
    if (!t || !u) return `${head} = ${f(r)}.`
    const mid = operation === 'addition' ? a + t : a - t
    return `${head} = ${f(a)} ${sign} ${f(t)} ${sign} ${f(u)} = ${f(mid)} ${sign} ${f(u)} = ${f(r)}.`
  }
  return ''
}

const arithmeticSource = (gen, chapter) => {
  const op = ARITHMETIC[gen.operation]
  const keySign = op.keySign || op.sign
  const A = parseSpec(gen.tables ?? gen.a)
  const B = parseSpec(gen.b)
  const forms = gen.formes?.length ? gen.formes : ['normal']
  const valid = (a, b) => specHas(A, a) && specHas(B, b) && op.ok(gen, a, b)
  const item = (a, b, form) => {
    const result = op.result(a, b)
    if (form === 'trou') {
      return {
        key: `${op.tag}:${a}${keySign}?=${result}`,
        prompt: `${f(a)} ${op.sign} ? = ${f(result)}`,
        answer: String(b),
        whenWrong: `${f(b)}, car ${f(a)} ${op.sign} ${f(b)} = ${f(result)}.`,
      }
    }
    return {
      key: `${op.tag}:${a}${keySign}${b}`,
      prompt: `${f(a)} ${op.sign} ${f(b)}`,
      answer: String(result),
      whenWrong: steps(gen.operation, a, b),
    }
  }
  const pattern = new RegExp(
    `^${op.tag}:(\\d+)${keySign === '+' ? '\\+' : keySign}(\\?=)?(\\d+)$`,
  )
  return {
    size: specCount(A) * specCount(B) * forms.length,
    list: () =>
      specAll(A).flatMap(a =>
        specAll(B)
          .filter(b => op.ok(gen, a, b))
          .flatMap(b => forms.map(form => item(a, b, form))),
      ),
    draw: rng => {
      for (let i = 0; i < DRAW_TRIES; i++) {
        const a = specPick(A, rng)
        const b = specPick(B, rng)
        if (op.ok(gen, a, b)) {
          return item(a, b, forms[Math.floor(rng() * forms.length)])
        }
      }
      return null
    },
    fromKey: key => {
      const m = pattern.exec(key)
      if (!m) return null
      const a = Number(m[1])
      const form = m[2] ? 'trou' : 'normal'
      if (!forms.includes(form)) return null
      let b = Number(m[3])
      if (form === 'trou') {
        if (gen.operation === 'addition') b -= a
        else if (gen.operation === 'soustraction') b = a - b
        else if (a === 0 || b % a) return null
        else b /= a
      }
      return valid(a, b) ? item(a, b, form) : null
    },
  }
}

const divisionSource = gen => {
  const T = parseSpec(gen.tables ?? gen.a)
  const B = parseSpec(gen.b)
  const forms = gen.formes?.length ? gen.formes : ['normal']
  const item = (t, q, form) => {
    const d = t * q
    return form === 'trou'
      ? {
          key: `div:${d}/?=${q}`,
          prompt: `${f(d)} ÷ ? = ${f(q)}`,
          answer: String(t),
          whenWrong: `${f(t)}, car ${f(d)} ÷ ${f(t)} = ${f(q)} : ${f(t)} × ${f(q)} = ${f(d)}.`,
        }
      : {
          key: `div:${d}/${t}`,
          prompt: `${f(d)} ÷ ${f(t)}`,
          answer: String(q),
          whenWrong: `${f(d)} ÷ ${f(t)} = ${f(q)}, car ${f(t)} × ${f(q)} = ${f(d)}.`,
        }
  }
  return {
    size: specCount(T) * specCount(B) * forms.length,
    list: () =>
      specAll(T).flatMap(t =>
        specAll(B).flatMap(q => forms.map(form => item(t, q, form))),
      ),
    draw: rng =>
      item(
        specPick(T, rng),
        specPick(B, rng),
        forms[Math.floor(rng() * forms.length)],
      ),
    fromKey: key => {
      const m = /^div:(\d+)\/(\?=)?(\d+)$/.exec(key)
      if (!m) return null
      const d = Number(m[1])
      const form = m[2] ? 'trou' : 'normal'
      const x = Number(m[3])
      if (!forms.includes(form) || x === 0 || d % x) return null
      const [t, q] = form === 'trou' ? [d / x, x] : [x, d / x]
      return specHas(T, t) && specHas(B, q) ? item(t, q, form) : null
    },
  }
}

// One number in, one number out: doubles, halves, complements.
const unarySource = (A, tag, ok, make) => ({
  size: specCount(A),
  list: () => specAll(A).filter(ok).map(make),
  draw: rng => {
    for (let i = 0; i < DRAW_TRIES; i++) {
      const a = specPick(A, rng)
      if (ok(a)) return make(a)
    }
    return null
  },
  fromKey: key => {
    const m = new RegExp(`^${tag}:(\\d+)`).exec(key)
    if (!m) return null
    const a = Number(m[1])
    if (!specHas(A, a) || !ok(a)) return null
    const built = make(a)
    return built.key === key ? built : null
  },
})

const complementTarget = (cible, a) => {
  const step = { dizaine: 10, centaine: 100, millier: 1000 }[cible]
  if (step) return (Math.floor(a / step) + 1) * step
  return Number(cible)
}

const comparisonSource = gen => {
  const A = parseSpec(gen.a)
  const lo = A.list ? Math.min(...A.list) : A.min
  const hi = A.list ? Math.max(...A.list) : A.max
  const item = (a, b) => ({
    key: `cmp:${a}?${b}`,
    prompt: `${f(a)}  …  ${f(b)}`,
    mode: 'choice',
    answer: a < b ? '<' : a > b ? '>' : '=',
    choices: ['<', '=', '>'],
    keepOrder: true,
  })
  return {
    size: Infinity,
    list: () => null,
    draw: rng => {
      const a = specPick(A, rng)
      const scale =
        10 ** Math.max(0, String(a).length - 1 - Math.floor(rng() * 3))
      const roll = rng()
      let b =
        roll < 0.1
          ? a
          : roll < 0.3
            ? Number(String(a).split('').reverse().join(''))
            : a + (rng() < 0.5 ? -1 : 1) * scale * (1 + Math.floor(rng() * 9))
      if (b < lo || b > hi || String(b).length !== String(a).length) b = a + 1
      return item(a, Math.min(hi, Math.max(lo, b)))
    },
    fromKey: key => {
      const m = /^cmp:(\d+)\?(\d+)$/.exec(key)
      if (!m) return null
      const a = Number(m[1])
      const b = Number(m[2])
      return specHas(A, a) && b >= lo && b <= hi ? item(a, b) : null
    },
  }
}

const PLACES = { unites: 1, dizaines: 10, centaines: 100, milliers: 1000 }
const PLACE_NAMES = {
  unites: 'unités',
  dizaines: 'dizaines',
  centaines: 'centaines',
  milliers: 'milliers',
}

const positionSource = gen => {
  const A = parseSpec(gen.a)
  const places = (gen.rangs?.length ? gen.rangs : Object.keys(PLACES)).filter(
    p => PLACES[p],
  )
  const forms = gen.formes?.length ? gen.formes : ['chiffre']
  const valid = (a, place, form) =>
    a >= PLACES[place] && !(form === 'nombre' && place === 'unites')
  const item = (a, place, form) => {
    const p = PLACES[place]
    return form === 'nombre'
      ? {
          key: `pos:${a}:${place}:nombre`,
          prompt: `Dans ${f(a)}, combien y a-t-il de ${PLACE_NAMES[place]} en tout ?`,
          answer: String(Math.floor(a / p)),
        }
      : {
          key: `pos:${a}:${place}:chiffre`,
          prompt: `Dans ${f(a)}, quel est le chiffre des ${PLACE_NAMES[place]} ?`,
          answer: String(Math.floor(a / p) % 10),
        }
  }
  return {
    size: specCount(A) * places.length * forms.length,
    list: () =>
      specAll(A).flatMap(a =>
        places.flatMap(place =>
          forms
            .filter(form => valid(a, place, form))
            .map(form => item(a, place, form)),
        ),
      ),
    draw: rng => {
      for (let i = 0; i < DRAW_TRIES; i++) {
        const a = specPick(A, rng)
        const place = places[Math.floor(rng() * places.length)]
        const form = forms[Math.floor(rng() * forms.length)]
        if (valid(a, place, form)) return item(a, place, form)
      }
      return null
    },
    fromKey: key => {
      const m = /^pos:(\d+):([a-z]+):([a-z]+)$/.exec(key)
      if (!m) return null
      const [a, place, form] = [Number(m[1]), m[2], m[3]]
      return specHas(A, a) &&
        places.includes(place) &&
        forms.includes(form) &&
        valid(a, place, form)
        ? item(a, place, form)
        : null
    },
  }
}

const wordsSource = gen => {
  const A = parseSpec(gen.a)
  const forms = gen.formes?.length ? gen.formes : ['chiffres']
  const lo = A.list ? Math.min(...A.list) : A.min
  const hi = A.list ? Math.max(...A.list) : A.max
  const neighbours = a => {
    const digits = String(a).split('')
    const swapped = digits.length > 1 ? [...digits] : null
    if (swapped) [swapped[0], swapped[1]] = [swapped[1], swapped[0]]
    const options = [
      a + 100,
      a - 10,
      a + 1,
      a + 1000,
      a - 100,
      swapped ? Number(swapped.join('')) : a + 10,
      a + 20,
    ]
    return [...new Set(options.filter(n => n !== a && n >= lo && n <= hi))]
  }
  const item = (a, form) =>
    form === 'mots'
      ? {
          key: `num:${a}:mots`,
          prompt: `Comment s'écrit ${f(a)} en lettres ?`,
          mode: 'choice',
          answer: frenchWords(a),
          choices: [
            frenchWords(a),
            ...neighbours(a).slice(0, 3).map(frenchWords),
          ],
        }
      : {
          key: `num:${a}:chiffres`,
          prompt: `Écris en chiffres : ${frenchWords(a)}`,
          answer: String(a),
        }
  return {
    size: specCount(A) * forms.length,
    list: () => specAll(A).flatMap(a => forms.map(form => item(a, form))),
    draw: rng =>
      item(specPick(A, rng), forms[Math.floor(rng() * forms.length)]),
    fromKey: key => {
      const m = /^num:(\d+):([a-z]+)$/.exec(key)
      return m && specHas(A, Number(m[1])) && forms.includes(m[2])
        ? item(Number(m[1]), m[2])
        : null
    },
  }
}

// A problem written with variables: "{p} a {a} billes et en gagne {b}…".
const modelSource = (gen, moduleId) => {
  const names = Object.keys(gen.variables || {})
  const specs = names.map(name => parseSpec(gen.variables[name]))
  const prefix = `pb:${moduleId}:${gen.id}:`
  const build = values => {
    const vars = {}
    names.forEach((name, i) => {
      vars[name] = values[i]
    })
    const numbers = Object.fromEntries(
      Object.entries(vars).filter(([, v]) => typeof v === 'number'),
    )
    for (const [name, formula] of Object.entries(gen.calculs || {})) {
      numbers[name] = evaluate(formula, numbers)
      vars[name] = numbers[name]
    }
    if (gen.si && !evaluate(gen.si, numbers)) return null
    const answer = evaluate(gen.reponse, numbers)
    if (!Number.isInteger(answer) || answer < 0) return null
    const prompt = gen.texte.replace(
      /\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
      (all, name) =>
        vars[name] === undefined
          ? all
          : typeof vars[name] === 'number'
            ? f(vars[name])
            : vars[name],
    )
    return {
      key: prefix + values.join('|'),
      prompt,
      answer: String(answer),
      unit: gen.unite,
    }
  }
  const size = specs.reduce((total, s) => total * specCount(s), 1)
  return {
    size,
    list: () => {
      let combos = [[]]
      for (const s of specs) {
        combos = combos.flatMap(combo => specAll(s).map(v => [...combo, v]))
      }
      return combos.map(build).filter(Boolean)
    },
    draw: rng => {
      for (let i = 0; i < DRAW_TRIES; i++) {
        const built = build(specs.map(s => specPick(s, rng)))
        if (built) return built
      }
      return null
    },
    fromKey: key => {
      if (!key.startsWith(prefix)) return null
      const parts = key.slice(prefix.length).split('|')
      if (parts.length !== names.length) return null
      const values = parts.map((part, i) =>
        specs[i].list && typeof specs[i].list[0] === 'string'
          ? part
          : Number(part),
      )
      if (!values.every((v, i) => specHas(specs[i], v))) return null
      return build(values)
    },
  }
}

// Counting a collection drawn on the screen: objects of the catalogue's
// drawings, or the dots of a die. Up to ten, the answer is picked among
// four numbers; above, it is typed.
const COUNT_CHOICES_UP_TO = 10

const countSource = gen => {
  const A = parseSpec(gen.a ?? [1, 10])
  const forms = (gen.formes?.length ? gen.formes : ['objets']).filter(form =>
    ['objets', 'de'].includes(form),
  )
  const objects = gen.objets?.length ? gen.objets : ['carrot']
  const lo = A.list ? Math.min(...A.list) : A.min
  const hi = A.list ? Math.max(...A.list) : A.max
  // A die shows one to six dots.
  const valid = (n, form) =>
    Number.isInteger(n) && n >= 1 && (form !== 'de' || n <= 6)
  const neighbours = n => {
    const top = Math.min(hi, COUNT_CHOICES_UP_TO)
    const near = [n - 1, n + 1, n - 2, n + 2, n + 3, n - 3].filter(
      m => m >= Math.max(1, lo) && m <= top && m !== n,
    )
    return near.slice(0, 3)
  }
  const item = (n, form) => {
    const choosing = n <= COUNT_CHOICES_UP_TO
    return {
      key: `cnt:${form}:${n}`,
      prompt: 'Combien y en a-t-il ?',
      answer: String(n),
      count: { n, form, objects },
      ...(choosing && {
        mode: 'choice',
        choices: [n, ...neighbours(n)].sort((a, b) => a - b).map(String),
        keepOrder: true,
      }),
    }
  }
  return {
    size: specCount(A) * forms.length,
    list: () =>
      specAll(A).flatMap(n =>
        forms.filter(form => valid(n, form)).map(form => item(n, form)),
      ),
    draw: rng => {
      for (let i = 0; i < DRAW_TRIES; i++) {
        const n = specPick(A, rng)
        const form = forms[Math.floor(rng() * forms.length)]
        if (valid(n, form)) return item(n, form)
      }
      return null
    },
    fromKey: key => {
      const m = /^cnt:([a-z]+):(\d+)$/.exec(key)
      if (!m) return null
      const [form, n] = [m[1], Number(m[2])]
      return forms.includes(form) && specHas(A, n) && valid(n, form)
        ? item(n, form)
        : null
    },
  }
}

// Reading the time on a clock with hands. The hours come from `a` (1 to
// 12); `formes` says which minutes: `pile` (o'clock), `demie` (half past),
// `quart` (quarter past and to). The answer is picked among four times
// that are easy to mix up: the hands swapped, an hour off, the other half.
const CLOCK_FORMS = { pile: [0], demie: [30], quart: [15, 45] }

export const clockText = (h, m) => (m ? `${h} h ${m}` : `${h} h`)

const clockSource = gen => {
  const A = parseSpec(gen.a ?? [1, 12])
  const forms = (gen.formes?.length ? gen.formes : ['pile']).filter(
    form => CLOCK_FORMS[form],
  )
  const minutes = forms.flatMap(form => CLOCK_FORMS[form])
  const valid = (h, m) =>
    Number.isInteger(h) && h >= 1 && h <= 12 && minutes.includes(m)
  const wrap = h => ((h + 11) % 12) + 1
  const item = (h, m) => {
    const near = [
      [wrap(h + 1), m],
      [wrap(h - 1), m],
      // The hands mixed up: the long hand, on 12, read as the hour.
      ...(m === 0 ? [[12, 0]] : [[h, (m + 30) % 60]]),
      [wrap(h + 6), m],
    ]
    const choices = [clockText(h, m)]
    for (const [hh, mm] of near) {
      const text = clockText(hh, mm)
      if (choices.length < 4 && !choices.includes(text)) choices.push(text)
    }
    return {
      key: `hr:${h}:${m}`,
      prompt: 'Quelle heure est-il ?',
      answer: clockText(h, m),
      clock: { h, m },
      mode: 'choice',
      choices,
    }
  }
  const all = () =>
    specAll(A).flatMap(h => minutes.filter(m => valid(h, m)).map(m => [h, m]))
  return {
    size: specCount(A) * minutes.length,
    list: () => all().map(([h, m]) => item(h, m)),
    draw: rng => {
      for (let i = 0; i < DRAW_TRIES; i++) {
        const h = specPick(A, rng)
        const m = minutes[Math.floor(rng() * minutes.length)]
        if (valid(h, m)) return item(h, m)
      }
      return null
    },
    fromKey: key => {
      const found = /^hr:(\d+):(\d+)$/.exec(key)
      if (!found) return null
      const [h, m] = [Number(found[1]), Number(found[2])]
      return specHas(A, h) && valid(h, m) ? item(h, m) : null
    },
  }
}

// Measuring a line drawn above a ruler, in centimetres. The lengths come
// from `a` (1 to 15); `formes` says where the line starts: `zero` (at the
// 0 of the ruler) or `decale` (further along, where reading the end mark
// is the trap). The answer is picked among four lengths.
const RULER_CM = 16

const rulerSource = gen => {
  const A = parseSpec(gen.a ?? [1, 15])
  const forms = (gen.formes?.length ? gen.formes : ['zero']).filter(form =>
    ['zero', 'decale'].includes(form),
  )
  const starts = form =>
    form === 'zero' ? [0] : Array.from({ length: 6 }, (_, i) => i + 1)
  const valid = (start, n) =>
    Number.isInteger(n) && n >= 1 && start + n <= RULER_CM - 1
  const item = (start, n) => {
    const near = [start ? start + n : n + 2, n + 1, n - 1, n + 2, n - 2, n + 3]
    const choices = [n]
    for (const m of near) {
      if (choices.length < 4 && m >= 1 && !choices.includes(m)) choices.push(m)
    }
    return {
      key: `mes:${start}:${n}`,
      prompt: 'Combien mesure le trait ?',
      answer: `${n} cm`,
      ruler: { start, length: n, size: RULER_CM },
      mode: 'choice',
      choices: choices.sort((a, b) => a - b).map(m => `${m} cm`),
      keepOrder: true,
    }
  }
  const all = () =>
    forms.flatMap(form =>
      starts(form).flatMap(start =>
        specAll(A)
          .filter(n => valid(start, n))
          .map(n => [start, n]),
      ),
    )
  return {
    size: forms.length * 6 * specCount(A),
    list: () => all().map(([start, n]) => item(start, n)),
    draw: rng => {
      for (let i = 0; i < DRAW_TRIES; i++) {
        const form = forms[Math.floor(rng() * forms.length)]
        const options = starts(form)
        const start = options[Math.floor(rng() * options.length)]
        const n = specPick(A, rng)
        if (valid(start, n)) return item(start, n)
      }
      return null
    },
    fromKey: key => {
      const found = /^mes:(\d+):(\d+)$/.exec(key)
      if (!found) return null
      const [start, n] = [Number(found[1]), Number(found[2])]
      const form = start ? 'decale' : 'zero'
      return forms.includes(form) &&
        starts(form).includes(start) &&
        specHas(A, n) &&
        valid(start, n)
        ? item(start, n)
        : null
    },
  }
}

// ── the player's first name ──

// NAME_WORD stands for the player's first name in a card; without one, the
// card speaks to them.
const NAME_WORD = /\{prenom\}/g

// withName writes the player's first name into the cards that ask about it.
export const withName = (cards, name) => {
  const put = value =>
    typeof value === 'string'
      ? value.replace(NAME_WORD, name || 'toi')
      : Array.isArray(value)
        ? value.map(put)
        : value && typeof value === 'object'
          ? Object.fromEntries(
              Object.entries(value).map(([k, v]) => [k, put(v)]),
            )
          : value
  return cards.map(card =>
    JSON.stringify(card).includes('{prenom}') ? put(card) : card,
  )
}

// Names of other children, for the choices around the player's own.
const OTHER_NAMES = (
  'ADAM ALICE ANNA ARTHUR BAPTISTE CAMILLE CHLOÉ CLARA ÉMILE EMMA ÉTHAN GABRIEL ' +
  'HUGO INÈS JADE JULES LÉA LÉO LÉON LINA LOUIS LOUISE LUCAS MAËL MANON MARIUS ' +
  'MIA NATHAN NOAH NOÉ NORA PAUL RAPHAËL ROSE SACHA SARAH TOM VICTOR ZOÉ'
).split(' ')

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

const lettersOf = name =>
  name
    .toUpperCase()
    .split('')
    .filter(c => c.toLowerCase() !== c.toUpperCase())

// A few others that look like it: those of the same first letter first,
// then of the same length.
const lookAlikes = (name, count) => {
  const others = OTHER_NAMES.filter(n => n !== name)
  const score = n =>
    (n[0] === name[0] ? 0 : 2) + Math.abs(n.length - name.length)
  return [...others]
    .sort((a, b) => score(a) - score(b) || a.localeCompare(b))
    .slice(0, count)
}

// The questions about the player's first name, written in capitals as at
// school: its first letter, its letters in order, how many there are, and
// finding it among others. Without a name there are none.
const firstNameSource = (gen, moduleId, context) => {
  const name = (context.firstName || '').trim().toUpperCase()
  const letters = lettersOf(name)
  const forms = (
    gen.formes?.length
      ? gen.formes
      : ['premiere', 'reconnaitre', 'ordre', 'nombre']
  ).filter(form => letters.length >= (form === 'ordre' ? 3 : 2))
  const near = n =>
    [n - 1, n + 1, n + 2, n - 2, n + 3].filter(m => m >= 1 && m !== n)
  const make = {
    premiere: () => ({
      prompt: 'Par quelle lettre commence ton prénom ?',
      mode: 'choice',
      answer: letters[0],
      choices: [letters[0], 'O', 'S', 'X'].filter(
        (l, i, all) => all.indexOf(l) === i,
      ),
      trapPool: ALPHABET.filter(l => l !== letters[0] && !letters.includes(l)),
    }),
    reconnaitre: () => ({
      prompt: 'Lequel est ton prénom ?',
      mode: 'choice',
      answer: name,
      choices: [name, ...lookAlikes(name, 3)],
    }),
    ordre: () => ({
      prompt: 'Remets les lettres de ton prénom dans l’ordre.',
      mode: 'order',
      elements: letters,
      answer: letters.join(' → '),
    }),
    nombre: () => ({
      prompt: 'Combien de lettres a ton prénom ?',
      mode: 'choice',
      answer: String(letters.length),
      choices: [letters.length, ...near(letters.length).slice(0, 3)]
        .sort((a, b) => a - b)
        .map(String),
      keepOrder: true,
    }),
  }
  const item = form => ({ key: `prenom:${form}`, ...make[form]() })
  return {
    size: forms.length,
    list: () => forms.map(item),
    draw: rng =>
      forms.length ? item(forms[Math.floor(rng() * forms.length)]) : null,
    fromKey: key => {
      const form = key.startsWith('prenom:') && key.slice(7)
      return forms.includes(form) ? item(form) : null
    },
  }
}

const SOURCES = {
  addition: arithmeticSource,
  soustraction: arithmeticSource,
  multiplication: arithmeticSource,
  division: divisionSource,
  double: gen =>
    unarySource(
      parseSpec(gen.a),
      'dbl',
      () => true,
      a => ({
        key: `dbl:${a}`,
        prompt: `Le double de ${f(a)}`,
        answer: String(2 * a),
      }),
    ),
  moitie: gen =>
    unarySource(
      parseSpec(gen.a),
      'half',
      a => a % 2 === 0,
      a => ({
        key: `half:${a}`,
        prompt: `La moitié de ${f(a)}`,
        answer: String(a / 2),
      }),
    ),
  complement: gen =>
    unarySource(
      parseSpec(gen.a),
      'cpl',
      a => complementTarget(gen.cible, a) > a,
      a => {
        const target = complementTarget(gen.cible, a)
        return {
          key: `cpl:${a}>${target}`,
          prompt: `De ${f(a)} pour aller à ${f(target)}, il manque…`,
          answer: String(target - a),
        }
      },
    ),
  comparaison: comparisonSource,
  position: positionSource,
  lettres: wordsSource,
  modele: modelSource,
  compter: countSource,
  prenom: firstNameSource,
  heure: clockSource,
  mesurer: rulerSource,
}

// generatorSource turns a generator of a module into a question source.
export const generatorSource = (gen, moduleId, context = {}) => {
  const make = SOURCES[gen.operation]
  if (!make) return null
  const source = make(gen, moduleId, context)
  const stamp = item =>
    item && { mode: 'number', ...item, chapter: gen.chapitre, source: gen.id }
  const finite = source.size <= LIST_LIMIT
  let listed = null
  return {
    id: gen.id,
    chapter: gen.chapitre,
    finite,
    list: () => {
      if (!finite) return null
      if (!listed) listed = source.list().map(stamp)
      return listed
    },
    draw: rng => stamp(source.draw(rng)),
    fromKey: key => stamp(source.fromKey(key)),
  }
}

// ── written cards ──

export const cardKey = (moduleId, card, direction = 'direct') =>
  `${card.cle || `${moduleId}:${card.id}`}${direction === 'direct' ? '' : `:${direction}`}`

// slug names a label to sort in its key, as the server does: lower case,
// without accents, words joined by dashes.
export const slug = text =>
  String(text ?? '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')

// label reads a side of a pair, or a label, written as a word or as
// { texte, image }.
export const label = side =>
  typeof side === 'string'
    ? { text: side }
    : { text: side?.texte || '', image: side?.image }

const labelText = l => l.text || l.image || ''

// cardAnswer tells in a line what a written card expects, for the lists of
// cards: its answer, its pairs, its labels in order or by box.
export const cardAnswer = card => {
  switch (card.type) {
    case 'associer':
      return (card.paires || [])
        .map(pair => pair.map(side => labelText(label(side))).join(' – '))
        .join(', ')
    case 'ordre':
      return (card.elements || []).join(' → ')
    case 'classer':
      return (card.boites || [])
        .map(
          box =>
            `${box.nom} : ${(card.a_classer || [])
              .filter(e => e.boite === box.nom)
              .map(e => e.texte)
              .join(', ')}`,
        )
        .join(' · ')
    default:
      return card.reponse
  }
}

// The cards that hold several labels: pairs to match, labels to put in
// order or to sort into boxes, zones of a picture.
const MATCH_SHOWN = 5

const matchItem = (card, base) => {
  const pairs = (card.paires || []).map(pair => pair.map(label))
  return {
    ...base,
    mode: 'match',
    pairs,
    shown: Math.min(MATCH_SHOWN, pairs.length),
    answer: pairs
      .map(([l, r]) => `${labelText(l)} – ${labelText(r)}`)
      .join(', '),
  }
}

const permutations = list =>
  list.length <= 1
    ? [list]
    : list.flatMap((x, i) =>
        permutations([...list.slice(0, i), ...list.slice(i + 1)]).map(rest => [
          x,
          ...rest,
        ]),
      )

// orderings lists the right orders of labels: the one written, and those
// where labels that may swap (getting dressed and having breakfast) do.
export const orderings = (elements, swappable = []) => {
  let out = [elements]
  for (const group of swappable || []) {
    const places = group
      .map(label => elements.indexOf(label))
      .filter(i => i !== -1)
      .sort((a, b) => a - b)
    if (places.length < 2) continue
    const values = places.map(i => elements[i])
    out = out.flatMap(order =>
      permutations(values).map(perm => {
        const next = [...order]
        places.forEach((place, i) => {
          next[place] = perm[i]
        })
        return next
      }),
    )
  }
  return [...new Set(out.map(order => order.join(' → ')))]
}

const orderItem = (card, base) => {
  const elements = card.elements || []
  const accepted = orderings(elements, card.echangeables)
  return {
    ...base,
    mode: 'order',
    elements,
    answer: elements.join(' → '),
    ...(accepted.length > 1 && { accepted }),
  }
}

const sortItems = (card, moduleId) => {
  const boxes = (card.boites || []).map(b => ({ name: b.nom, image: b.image }))
  // What makes a label go into a box, said when one went into another.
  const rules = Object.fromEntries(
    (card.boites || []).filter(b => b.regle).map(b => [b.nom, b.regle]),
  )
  return (card.a_classer || []).map(element => ({
    key: `${cardKey(moduleId, card)}:${slug(element.texte)}`,
    chapter: card.chapitre,
    source: card.id,
    prompt: card.question,
    subject: { text: element.texte, image: element.image },
    answer: element.boite,
    explanation: card.explication,
    ...(Object.keys(rules).length > 0 && { rules }),
    ...(element.pourquoi && { whenWrong: element.pourquoi }),
    ...(card.consigne && { instruction: card.consigne }),
    mode: 'sort',
    boxes,
    choices: boxes.map(b => b.name),
  }))
}

// A zone is touched on its picture, from its name, or named once shown in
// colour. The names of the other zones of the same picture are the traps,
// from the same chapter first.
const zoneItems = (card, moduleId, siblings) => {
  const sameImage = siblings.filter(
    s => s.type === 'zones' && s.image === card.image,
  )
  const names = Object.fromEntries(sameImage.map(s => [s.question, s.reponse]))
  const directions = card.sens?.length ? card.sens : ['toucher', 'nommer']
  return directions
    .filter(d => d === 'toucher' || d === 'nommer')
    .map(direction => {
      const base = {
        key: `${cardKey(moduleId, card)}${direction === 'toucher' ? '' : ':nommer'}`,
        chapter: card.chapitre,
        source: card.id,
        answer: card.reponse,
        explanation: card.explication,
        ...(card.consigne && { instruction: card.consigne }),
        zones: card.image,
        zone: card.question,
        zoneNames: names,
      }
      if (direction === 'toucher') {
        return { ...base, mode: 'zone', prompt: `Touche : ${card.reponse}` }
      }
      // The traps come from the same chapter when it has enough of them, so
      // that a river is not mixed with a city on the same map.
      const others = list =>
        [...new Set(list.map(s => s.reponse))].filter(n => n !== card.reponse)
      const sameChapter = others(
        sameImage.filter(s => s.chapitre === card.chapitre),
      )
      const traps = sameChapter.length >= 3 ? sameChapter : others(sameImage)
      return {
        ...base,
        mode: 'choice',
        prompt: 'Comment s’appelle la zone en couleur ?',
        choices: [card.reponse, ...traps.slice(0, 3)],
        trapPool: traps,
      }
    })
}

// cardItems lists the questions of a written card, one per direction asked.
// lang is the language the module teaches, which a listening card says.
export const cardItems = (card, moduleId, siblings, lang) => {
  if (card.type === 'classer') return sortItems(card, moduleId)
  if (card.type === 'zones') return zoneItems(card, moduleId, siblings)
  if (card.type === 'associer' || card.type === 'ordre') {
    const base = {
      key: cardKey(moduleId, card),
      chapter: card.chapitre,
      source: card.id,
      prompt: card.question,
      explanation: card.explication,
      ...(card.consigne && { instruction: card.consigne }),
      // The drawing of the word to put back together, syllable by syllable.
      ...(card.type === 'ordre' && card.image && { image: card.image }),
    }
    return [
      card.type === 'associer' ? matchItem(card, base) : orderItem(card, base),
    ]
  }
  const listening = card.type === 'ecoute'
  const known = listening
    ? ['direct', 'lire', 'inverse', 'dictee', 'chiffres']
    : ['direct', 'inverse']
  const directions = card.sens?.length ? card.sens : ['direct']
  return directions
    .filter(d => known.includes(d))
    .map(direction => {
      const inverse = direction === 'inverse'
      const prompt = inverse ? card.reponse : card.question
      const answer = inverse ? card.question : card.reponse
      const base = {
        key: cardKey(moduleId, card, direction),
        chapter: card.chapitre,
        source: card.id,
        prompt,
        answer,
        explanation: card.explication,
        ...(card.consigne && { instruction: card.consigne }),
      }
      if (listening) return listeningItem(card, base, direction, siblings, lang)
      // A drawing above the question, such as the word whose syllables are
      // counted; the other way round, it would give the answer away.
      if (card.image && !inverse) base.image = card.image
      if (card.type === 'choix') {
        const others = siblings
          .filter(s => s.id !== card.id)
          .map(s => (inverse ? s.question : s.reponse))
        const own = !inverse && card.pieges?.length
        const traps = [
          ...new Set((own ? card.pieges : others).filter(t => t !== answer)),
        ]
        return {
          ...base,
          // Why each wrong answer is wrong, said when it was picked.
          ...(!inverse && card.pourquoi && { whyNot: card.pourquoi }),
          mode: 'choice',
          choices: [answer, ...traps.slice(0, 3)],
          // Without traps of its own, a game draws three of the chapter's
          // other answers, so they change from one game to the next.
          trapPool: own ? undefined : traps,
        }
      }
      if (card.type === 'saisie') {
        return {
          ...base,
          mode: 'text',
          accepted: inverse
            ? [answer]
            : [answer, ...(card.autres_reponses || [])],
          tolerance: card.tolerance || 'accents',
        }
      }
      return { ...base, mode: 'flip' }
    })
}

// Words that sound the same, by language: one of them heard cannot be told
// from the others. A leading article is left aside (le ver, le verre).
const HOMOPHONES = {
  fr: [
    ['et', 'est', 'es', 'ai', 'eh'],
    ['a', 'à', 'as', 'ah'],
    ['ou', 'où', 'houx', 'août'],
    ['on', 'ont'],
    ['son', 'sont'],
    ['ces', 'ses', 'c’est', 's’est', 'sait', 'sais'],
    ['mes', 'mais', 'met', 'mets'],
    ['la', 'là', 'l’a', 'las'],
    ['peu', 'peut', 'peux'],
    ['ce', 'se'],
    ['ni', 'n’y', 'nid'],
    ['leur', 'leurs'],
    ['ver', 'verre', 'vers', 'vert', 'verts', 'vertes'],
    ['mer', 'mère', 'maire'],
    ['cent', 'sans', 'sang', 's’en'],
    ['dans', 'dent', 'dents'],
    ['cour', 'cours', 'court', 'courre'],
    ['pain', 'pin', 'peint'],
    ['sel', 'selle', 'celle'],
    ['pois', 'poids', 'poix'],
    ['fois', 'foie', 'foi'],
    ['conte', 'compte', 'comte'],
    ['chair', 'cher', 'chère', 'chaire'],
    ['père', 'paire', 'perd', 'pair'],
    ['vin', 'vingt', 'vain', 'vint'],
    ['mi', 'mie', 'mis', 'mit'],
    ['si', 'scie', 'six'],
    ['dix', 'dis', 'dit'],
    ['nez', 'né', 'née'],
    ['quand', 'quant', 'camp'],
    ['moi', 'mois'],
    ['tant', 'temps', 'tend', 'taon'],
    ['du', 'dû'],
    ['sur', 'sûr'],
    ['vos', 'veau', 'vaut'],
    ['eau', 'au', 'aux', 'haut', 'oh'],
    ['bal', 'balle'],
    ['chant', 'champ'],
    ['coup', 'cou', 'coût'],
    ['faim', 'fin'],
    ['lait', 'les', 'laid'],
    ['fée', 'fait'],
  ],
  en: [
    ['to', 'too', 'two'],
    ['there', 'their', 'they’re'],
    ['right', 'write'],
    ['sea', 'see'],
    ['be', 'bee'],
    ['for', 'four'],
    ['son', 'sun'],
    ['hear', 'here'],
    ['know', 'no'],
    ['one', 'won'],
    ['eight', 'ate'],
    ['blue', 'blew'],
    ['flower', 'flour'],
    ['pear', 'pair'],
    ['meat', 'meet'],
    ['night', 'knight'],
    ['tail', 'tale'],
    ['wear', 'where'],
    ['which', 'witch'],
    ['hour', 'our'],
    ['by', 'buy', 'bye'],
    ['red', 'read'],
    ['week', 'weak'],
  ],
}

const ARTICLES = /^(le|la|les|l’|un|une|des|the|a|an)\s+|^l’/

const soundOf = text =>
  String(text ?? '')
    .toLowerCase()
    .replace(/'/g, '’')
    .trim()
    .replace(ARTICLES, '')

const families = {}
const familyOf = (word, lang) => {
  const base = String(lang || 'fr').split(/[-_]/)[0]
  if (!families[base]) {
    families[base] = new Map()
    ;(HOMOPHONES[base] || []).forEach((family, i) => {
      for (const w of family) families[base].set(w, i)
    })
  }
  return families[base].get(word)
}

// soundsAlike tells whether two words are said the same way.
export const soundsAlike = (a, b, lang) => {
  const x = soundOf(a)
  const y = soundOf(b)
  // The same word after different articles is heard apart.
  if (x === y) return false
  const fx = familyOf(x, lang)
  return fx !== undefined && fx === familyOf(y, lang)
}

// A listening card says its question aloud, in the language taught:
// - direct: hear the word, pick its meaning, as a drawing when it has one;
// - lire: read the word, pick its meaning, as a drawing when it has one;
//   the word is said once answered;
// - inverse: see the meaning, pick the word, said once answered too;
// - dictee: hear the word and write it;
// - chiffres: hear a message and type the figures of its answer, such as
//   the levels and codes of a clearance to read back.
const listeningItem = (card, base, direction, siblings, lang) => {
  const say = { listen: card.question, lang }
  if (direction === 'chiffres') {
    return { ...base, ...say, mode: 'number' }
  }
  if (direction === 'dictee') {
    return {
      ...base,
      ...say,
      prompt: card.question,
      answer: card.question,
      mode: 'text',
      accepted: [card.question, ...(card.autres_reponses || [])],
      tolerance: card.tolerance || 'une_faute',
    }
  }
  const inverse = direction === 'inverse'
  const reading = direction === 'lire'
  const others = siblings.filter(
    s => s.id !== card.id && (inverse ? s.question : s.reponse) !== base.answer,
  )
  // Traps of its own, such as words that sound alike, stay the same from
  // one game to the next; otherwise they are the chapter's other answers.
  // A word heard is never shown beside one that sounds the same (et, est):
  // nobody could tell which one was said.
  const own = !inverse && card.pieges?.length
  const heard = direction === 'direct'
  const traps = (
    own
      ? [...new Set(card.pieges.filter(t => t !== base.answer))]
      : [...new Set(others.map(s => (inverse ? s.question : s.reponse)))]
  ).filter(t => !heard || !soundsAlike(t, base.answer, lang))
  // Seen as a drawing, a word is named without being written above: the
  // question is then the drawing, with what to say of it.
  if (inverse && card.image) {
    base = {
      ...base,
      prompt: card.question_inverse || 'Comment s’appelle ce dessin ?',
      image: card.image,
    }
  }
  const images = {}
  if (!inverse) {
    for (const s of [card, ...others]) if (s.image) images[s.reponse] = s.image
  }
  // Three drawings are enough for the youngest, who cannot read yet.
  const drawn = Object.keys(images).length > 0
  const trapCount = drawn ? 2 : 3
  return {
    ...base,
    // The word read, or picked from its meaning, is said once answered;
    // not a word named from its drawing, which the child just heard.
    ...(reading || (inverse && !card.image) ? { said: say } : {}),
    ...(!inverse && !reading && say),
    mode: 'choice',
    choices: [base.answer, ...traps.slice(0, trapCount)],
    trapPool: own ? undefined : traps,
    trapCount,
    ...(drawn && { images }),
  }
}
