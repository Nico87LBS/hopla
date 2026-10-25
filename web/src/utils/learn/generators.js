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
      }
    }
    return {
      key: `${op.tag}:${a}${keySign}${b}`,
      prompt: `${f(a)} ${op.sign} ${f(b)}`,
      answer: String(result),
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
        }
      : { key: `div:${d}/${t}`, prompt: `${f(d)} ÷ ${f(t)}`, answer: String(q) }
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
}

// generatorSource turns a generator of a module into a question source.
export const generatorSource = (gen, moduleId) => {
  const make = SOURCES[gen.operation]
  if (!make) return null
  const source = make(gen, moduleId)
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

// cardItems lists the questions of a written card, one per direction asked.
export const cardItems = (card, moduleId, siblings) => {
  const directions = card.sens?.length ? card.sens : ['direct']
  return directions
    .filter(d => d === 'direct' || d === 'inverse')
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
      }
      if (card.type === 'choix') {
        const others = siblings
          .filter(s => s.id !== card.id)
          .map(s => (inverse ? s.question : s.reponse))
        const traps = !inverse && card.pieges?.length ? card.pieges : others
        return {
          ...base,
          mode: 'choice',
          choices: [answer, ...traps.filter(t => t !== answer).slice(0, 3)],
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
