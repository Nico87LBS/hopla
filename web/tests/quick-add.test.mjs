import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import * as chrono from 'chrono-node'

import {
  parseAssignees,
  parseDueDate,
  parsePoints,
  parseRepeatV2,
} from '../src/views/components/CustomParsers.js'

const grammar = lang =>
  JSON.parse(readFileSync(`public/locales/${lang}/chores.json`, 'utf8'))
    .quickAdd

const repeatOf = (sentence, lang) => {
  const { cleanedSentence, result } = parseRepeatV2(sentence, grammar(lang))
  return result && { ...result.frequencyMetadata, ...result, cleanedSentence }
}

test('French repeats', () => {
  const fr = s => repeatOf(s, 'fr')
  assert.equal(fr('Sortir les poubelles tous les jours').unit, 'days')
  assert.equal(
    fr('Sortir les poubelles tous les jours').cleanedSentence,
    'Sortir les poubelles',
  )
  assert.equal(fr('Arroser chaque semaine').unit, 'weeks')
  const every3 = fr('Changer les draps tous les 3 jours')
  assert.deepEqual([every3.frequency, every3.unit], [3, 'days'])
  const other = fr('Aspirer une semaine sur deux')
  assert.deepEqual([other.frequency, other.unit], [2, 'weeks'])
  const otherMonth = fr('Ménage un mois sur deux')
  assert.deepEqual([otherMonth.frequency, otherMonth.unit], [2, 'months'])
  const days = fr('Piscine tous les mardis et jeudis')
  assert.equal(days.frequencyType, 'days_of_the_week')
  assert.deepEqual(days.days, ['Tuesday', 'Thursday'])
  assert.equal(days.cleanedSentence, 'Piscine')
  const nth = fr('Réunion le dernier vendredi du mois')
  assert.deepEqual(nth.days, ['friday'])
  assert.deepEqual(nth.occurrences, [-1])
  assert.equal(fr('Loyer le 5 de chaque mois').unit, 'months')
  assert.equal(fr('Promener le chien tous les soirs').frequencyType, 'daily')
  // A word that only starts like a day is not one.
  assert.equal(fr('Nettoyer chaque lunette'), null)
  assert.equal(fr('Ranger la chambre'), null)
})

test('English repeats still work', () => {
  const en = s => repeatOf(s, 'en')
  assert.equal(en('Take out the bins daily').unit, 'days')
  assert.deepEqual(en('Swim every tuesday and thursday').days, [
    'Tuesday',
    'Thursday',
  ])
  assert.deepEqual(
    [en('Water every 2 weeks').frequency, en('Water every 2 weeks').unit],
    [2, 'weeks'],
  )
  assert.equal(en('Pay rent 1st of every month').unit, 'months')
  assert.equal(en('Plan the wedding'), null)
})

test('French dates and start words', () => {
  const parsed = parseDueDate(
    'Rendre le livre à partir de demain',
    chrono.fr,
    grammar('fr'),
  )
  assert.ok(parsed.result)
  assert.equal(parsed.cleanedSentence, 'Rendre le livre')
})

test('points follow the family words', () => {
  const parsed = parsePoints('Ranger *5 étoiles', ['étoile', 'étoiles'])
  assert.equal(parsed.result, 5)
  assert.equal(parsed.cleanedSentence, 'Ranger')
  assert.equal(parsePoints('Ranger *3', ['hop', 'hops']).result, 3)
})

test('everyone in French', () => {
  const parsed = parseAssignees('Vaisselle @Tout le monde', [], grammar('fr'))
  assert.equal(parsed.isAnyone, true)
  assert.equal(parsed.cleanedSentence, 'Vaisselle')
})
