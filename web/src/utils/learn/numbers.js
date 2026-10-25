// Numbers as a French school book writes them: 3 452 with a thin space, and
// in words with hyphens between tens and units (traditional spelling).

const UNITS = [
  'zéro',
  'un',
  'deux',
  'trois',
  'quatre',
  'cinq',
  'six',
  'sept',
  'huit',
  'neuf',
  'dix',
  'onze',
  'douze',
  'treize',
  'quatorze',
  'quinze',
  'seize',
]
const TENS = {
  2: 'vingt',
  3: 'trente',
  4: 'quarante',
  5: 'cinquante',
  6: 'soixante',
}

const belowHundred = n => {
  if (n <= 16) return UNITS[n]
  if (n < 20) return `dix-${UNITS[n - 10]}`
  const tens = Math.floor(n / 10)
  const unit = n % 10
  if (tens <= 6) {
    if (unit === 0) return TENS[tens]
    if (unit === 1) return `${TENS[tens]} et un`
    return `${TENS[tens]}-${UNITS[unit]}`
  }
  if (tens === 7) {
    return unit === 1
      ? 'soixante et onze'
      : `soixante-${belowHundred(10 + unit)}`
  }
  // 80 to 99
  if (n === 80) return 'quatre-vingts'
  return `quatre-vingt-${belowHundred(n - 80)}`
}

const belowThousand = n => {
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  if (hundreds === 0) return belowHundred(rest)
  const head =
    hundreds === 1 ? 'cent' : `${UNITS[hundreds]} cent${rest === 0 ? 's' : ''}`
  return rest === 0 ? head : `${head} ${belowHundred(rest)}`
}

// frenchWords writes 0 to 999 999 in letters: 2304 is « deux mille trois cent
// quatre ».
export const frenchWords = n => {
  if (!Number.isInteger(n) || n < 0 || n > 999999) return String(n)
  if (n < 1000) return belowThousand(n)
  const thousands = Math.floor(n / 1000)
  const rest = n % 1000
  // « mille » never takes an s; « quatre-vingts » and « cents » lose theirs
  // before it.
  const head =
    thousands === 1
      ? 'mille'
      : `${belowThousand(thousands).replace(/(vingt|cent)s$/, '$1')} mille`
  return rest === 0 ? head : `${head} ${belowThousand(rest)}`
}

// formatNumber groups the digits by three with a thin space, from 1 000.
export const formatNumber = n => {
  const sign = n < 0 ? '−' : ''
  const digits = String(Math.abs(n))
  if (digits.length < 4) return sign + digits
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f')
}
