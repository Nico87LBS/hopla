// A small calculator for the formulas of module documents, such as "k*q+r"
// or "r<k": numbers, variables, + - * / and parentheses, comparisons and
// && ||. It never runs code; an unknown variable or a stray sign throws.

const TOKEN =
  /\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(<=|>=|==|!=|&&|\|\||[-+*/()<>]))/y

const tokenize = text => {
  const tokens = []
  TOKEN.lastIndex = 0
  while (TOKEN.lastIndex < text.length) {
    if (/^\s*$/.test(text.slice(TOKEN.lastIndex))) break
    const match = TOKEN.exec(text)
    if (!match) throw new Error(`Formule illisible : ${text}`)
    if (match[1] !== undefined) tokens.push({ num: Number(match[1]) })
    else if (match[2] !== undefined) tokens.push({ name: match[2] })
    else tokens.push({ op: match[3] })
  }
  return tokens
}

const LEVELS = [
  ['||'],
  ['&&'],
  ['==', '!=', '<', '>', '<=', '>='],
  ['+', '-'],
  ['*', '/'],
]

const apply = (op, a, b) => {
  switch (op) {
    case '||':
      return a || b ? 1 : 0
    case '&&':
      return a && b ? 1 : 0
    case '==':
      return a === b ? 1 : 0
    case '!=':
      return a !== b ? 1 : 0
    case '<':
      return a < b ? 1 : 0
    case '>':
      return a > b ? 1 : 0
    case '<=':
      return a <= b ? 1 : 0
    case '>=':
      return a >= b ? 1 : 0
    case '+':
      return a + b
    case '-':
      return a - b
    case '*':
      return a * b
    case '/':
      return a / b
  }
  throw new Error(`Opération inconnue : ${op}`)
}

export const evaluate = (text, vars = {}) => {
  const tokens = tokenize(String(text))
  let pos = 0
  const peek = () => tokens[pos]

  const primary = () => {
    const token = tokens[pos++]
    if (!token) throw new Error(`Formule incomplète : ${text}`)
    if (token.num !== undefined) return token.num
    if (token.name !== undefined) {
      const value = vars[token.name]
      if (typeof value !== 'number') {
        throw new Error(`Variable inconnue : ${token.name}`)
      }
      return value
    }
    if (token.op === '-') return -primary()
    if (token.op === '(') {
      const value = level(0)
      if (tokens[pos++]?.op !== ')') throw new Error(`Parenthèse : ${text}`)
      return value
    }
    throw new Error(`Formule illisible : ${text}`)
  }

  const level = depth => {
    if (depth === LEVELS.length) return primary()
    let value = level(depth + 1)
    while (peek()?.op && LEVELS[depth].includes(peek().op)) {
      const op = tokens[pos++].op
      value = apply(op, value, level(depth + 1))
    }
    return value
  }

  const value = level(0)
  if (pos !== tokens.length) throw new Error(`Formule illisible : ${text}`)
  return value
}
