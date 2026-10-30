import i18n from '../i18n/config'

// What the family earns is a family setting (hops, stars, carrots…). Its
// words, kept in the translation files under common:currency, are given to
// every text as variables: {{unit}} and {{units}}, {{Unit}} and {{Units}}
// to start a sentence, {{AUnit}} for "a hop", {{ofUnits}} for "de hops" or
// "d'étoiles", and {{e}} for the French agreement of a feminine word.

export const CURRENCIES = [
  'hops',
  'points',
  'stars',
  'carrots',
  'coins',
  'tokens',
]
const STORAGE_KEY = 'familyCurrency'

const stored = () => {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

let currency = CURRENCIES.includes(stored()) ? stored() : CURRENCIES[0]

const capitalize = word => word.charAt(0).toUpperCase() + word.slice(1)

// The variables of a currency, in the current language.
export const currencyVariables = (name = currency) => {
  const t = i18n.getFixedT(null, 'common')
  const key = `currency.${name}`
  const one = t(`${key}.one`)
  const other = t(`${key}.other`)
  const a = t(`${key}.a`)
  return {
    AUnit: capitalize(a),
    // Empty for most words, so read as it is written.
    e: i18n.getResource(i18n.resolvedLanguage, 'common', `${key}.e`) ?? '',
    ofUnits: t(`${key}.of`),
    unit: one,
    Unit: capitalize(one),
    units: other,
    Units: capitalize(other),
  }
}

const apply = () => {
  if (!i18n.hasLoadedNamespace?.('common')) return
  i18n.options.interpolation.defaultVariables = currencyVariables()
}

i18n.on('initialized', apply)
i18n.on('loaded', apply)
i18n.on('languageChanged', apply)
apply()

export const familyCurrency = () => currency

// Sets the family's currency and draws the texts again.
export const setFamilyCurrency = name => {
  const next = CURRENCIES.includes(name) ? name : CURRENCIES[0]
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // The choice is only remembered for the next start.
  }
  if (next === currency) return
  currency = next
  apply()
  // The same language again makes every text ask for its words again.
  i18n.changeLanguage(i18n.language)
}
