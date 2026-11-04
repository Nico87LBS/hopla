// The cards made of labels (pairs to match, labels to put in order or to
// sort into boxes), the letters to trace and the zones of a picture, as
// the editors write them: one row per label, never a syntax to remember.

// The limits the server checks.
export const LIMITS = {
  paires: [3, 20],
  elements: [3, 8],
  boites: [2, 3],
  a_classer: [2, 30],
  traced: 8,
}

// The groups of labels that may swap in an order.
export const GROUPS = ['A', 'B', 'C']

const text = value => String(value ?? '').trim()

// sideOf reads a label, a word, a drawing or both, written as a plain string
// when it is only a word.
export const sideOf = label =>
  typeof label === 'string'
    ? { texte: label, image: '' }
    : { texte: label?.texte || '', image: label?.image || '' }

const sideOut = side => {
  const texte = text(side.texte)
  const image = text(side.image)
  if (!image) return texte
  return texte ? { texte, image } : { image }
}

const sideEmpty = side => !text(side.texte) && !text(side.image)

// labelsOf reads the labels of a card into the editors' rows.
export const labelsOf = card => {
  const elements = (card.elements || []).map(String)
  const groupOf = {}
  ;(card.echangeables || []).forEach((group, i) => {
    for (const label of group) groupOf[label] = GROUPS[i] || ''
  })
  return {
    paires: (card.paires || []).map(pair => [sideOf(pair[0]), sideOf(pair[1])]),
    elements: elements.map(texte => ({ texte, groupe: groupOf[texte] || '' })),
    boites: (card.boites || []).map(box => ({
      nom: box.nom || '',
      image: box.image || '',
      regle: box.regle || '',
    })),
    a_classer: (card.a_classer || []).map(item => ({
      texte: item.texte || '',
      image: item.image || '',
      boite: item.boite || '',
      pourquoi: item.pourquoi || '',
    })),
  }
}

// emptyLabels are the rows a new card starts with, as few as it needs.
export const emptyLabels = () => ({
  paires: Array.from({ length: 3 }, () => [
    { texte: '', image: '' },
    { texte: '', image: '' },
  ]),
  elements: Array.from({ length: 3 }, () => ({ texte: '', groupe: '' })),
  boites: Array.from({ length: 2 }, () => ({ nom: '', image: '', regle: '' })),
  a_classer: Array.from({ length: 2 }, () => ({
    texte: '',
    image: '',
    boite: '',
    pourquoi: '',
  })),
})

// labelsFor writes the labels of a card of a type from the editors' rows,
// rows left empty aside.
export const labelsFor = (type, labels) => {
  switch (type) {
    case 'associer':
      return {
        paires: labels.paires
          .filter(pair => !sideEmpty(pair[0]) || !sideEmpty(pair[1]))
          .map(pair => [sideOut(pair[0]), sideOut(pair[1])]),
      }
    case 'ordre': {
      const rows = labels.elements.filter(row => text(row.texte))
      const groups = GROUPS.map(group =>
        rows.filter(row => row.groupe === group).map(row => text(row.texte)),
      ).filter(group => group.length > 1)
      return {
        elements: rows.map(row => text(row.texte)),
        echangeables: groups.length ? groups : undefined,
      }
    }
    case 'classer':
      return {
        boites: labels.boites
          .filter(box => text(box.nom))
          .map(box => ({
            nom: text(box.nom),
            ...(text(box.image) && { image: text(box.image) }),
            ...(text(box.regle) && { regle: text(box.regle) }),
          })),
        a_classer: labels.a_classer
          .filter(item => text(item.texte))
          .map(item => ({
            texte: text(item.texte),
            boite: text(item.boite),
            ...(text(item.image) && { image: text(item.image) }),
            ...(text(item.pourquoi) && { pourquoi: text(item.pourquoi) }),
          })),
      }
    default:
      return {}
  }
}

const within = (list, [min, max]) =>
  (list || []).length >= min && (list || []).length <= max

// labelProblem tells what a card of labels, a letter to trace or a zone
// lacks to be played, as a key of the editors' texts, or '' when nothing.
export const labelProblem = card => {
  switch (card.type) {
    case 'associer': {
      if (!within(card.paires, LIMITS.paires)) return 'pairsCount'
      const sides = card.paires.map(pair => pair.map(sideOf))
      if (sides.some(pair => pair.some(sideEmpty))) return 'pairsSides'
      const key = side => `${side.texte}|${side.image}`
      const left = new Set(sides.map(pair => key(pair[0])))
      const right = new Set(sides.map(pair => key(pair[1])))
      if (left.size < sides.length || right.size < sides.length)
        return 'pairsTwice'
      return ''
    }
    case 'ordre': {
      if (!within(card.elements, LIMITS.elements)) return 'elementsCount'
      if (new Set(card.elements).size < card.elements.length)
        return 'elementsTwice'
      return ''
    }
    case 'classer': {
      if (!within(card.boites, LIMITS.boites)) return 'boxesCount'
      const names = card.boites.map(box => box.nom)
      if (new Set(names).size < names.length) return 'boxesTwice'
      if (!within(card.a_classer, LIMITS.a_classer)) return 'toSortCount'
      if (card.a_classer.some(item => !names.includes(item.boite)))
        return 'toSortBox'
      const labels = card.a_classer.map(item => item.texte.toLowerCase())
      if (new Set(labels).size < labels.length) return 'toSortTwice'
      return ''
    }
    case 'tracer': {
      const n = [...text(card.reponse)].length
      return n === 0 || n > LIMITS.traced ? 'tracedLength' : ''
    }
    case 'zones':
      return card.image && card.question && text(card.reponse)
        ? ''
        : 'zoneMissing'
    default:
      return ''
  }
}
