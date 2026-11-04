import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  fromDocument,
  newPack,
  toDocument,
} from '../src/utils/learn/familyPack.js'
import {
  cleanPrereqs,
  readAloudOf,
  readAloudValue,
  withGameSetting,
  withRest,
} from '../src/utils/learn/packOptions.js'

test('the settings of a pack are written in its file, and read back', () => {
  const pack = newPack('Lecture')
  pack.id = 'famille-lecture'
  let rest = pack.rest
  rest = withRest(rest, 'description', 'Les sons de la semaine')
  rest = withRest(rest, 'auteur', 'Nico')
  rest = withRest(rest, 'lecture_voix_haute', readAloudValue('consigne'))
  rest = withRest(rest, 'ecriture', 'cursive')
  rest = withRest(rest, 'couleur', '#23934F')
  rest = withRest(rest, 'relire_reponse', true)
  rest = withRest(
    rest,
    'prerequis',
    cleanPrereqs([
      { module: 'francais-cp-sons', chapitre: '', pourcent: '70' },
      { module: '', chapitre: '', pourcent: 80 },
    ]),
  )
  rest = withGameSetting(rest, 'questions_par_partie', '12')
  rest = withGameSetting(rest, 'intervalle_max', '3', false)
  assert.equal(rest.reglages.intervalle_max, 3, 'kept as typed')
  rest = withGameSetting(rest, 'intervalle_max', '3')
  assert.equal(rest.reglages.intervalle_max, 7, 'within bounds once typed')
  rest = withGameSetting(rest, 'intervalle_max', '')
  pack.rest = rest
  pack.chapters[0].cards = [{ type: 'saisie', question: 'q', reponse: 'r' }]
  const doc = toDocument(pack)
  assert.equal(doc.description, 'Les sons de la semaine')
  assert.equal(doc.auteur, 'Nico')
  assert.equal(doc.lecture_voix_haute, 'consigne')
  assert.equal(doc.ecriture, 'cursive')
  assert.equal(doc.couleur, '#23934F')
  assert.equal(doc.relire_reponse, true)
  assert.deepEqual(doc.prerequis, [
    { module: 'francais-cp-sons', pourcent: 70 },
  ])
  assert.deepEqual(doc.reglages, { questions_par_partie: 12 })

  const back = fromDocument(doc)
  assert.equal(readAloudOf(back.rest, back.audience), 'consigne')
  assert.equal(withRest(back.rest, 'description', '').description, undefined)

  // Nothing said for a child unless chosen otherwise.
  const silent = toDocument({
    ...pack,
    rest: withRest({}, 'lecture_voix_haute', readAloudValue('rien')),
  })
  assert.equal(silent.lecture_voix_haute, false)
  assert.equal(readAloudOf({}, 'enfant'), 'tout')
  assert.equal(readAloudOf({}, 'adulte'), 'rien')
})
