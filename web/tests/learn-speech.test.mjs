import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  pickVoice,
  quality,
  SERVER,
  serverVoiceFor,
  serverVoicesFor,
  voicesFor,
} from '../src/utils/learn/speech.js'

const voice = (voiceURI, lang, localService = true) => ({
  voiceURI,
  name: voiceURI.split('.').pop(),
  lang,
  localService,
})

// What an iPad gives a web page once Audrey Premium is downloaded: the
// plain voice comes first, Siri is not there.
const ipad = [
  voice('com.apple.voice.compact.fr-FR.Thomas', 'fr-FR'),
  voice('com.apple.voice.compact.fr-CA.Amelie', 'fr-CA'),
  voice('com.apple.eloquence.fr-FR.Eddy', 'fr-FR'),
  voice('com.apple.voice.enhanced.fr-FR.Thomas', 'fr-FR'),
  voice('com.apple.voice.premium.fr-FR.Audrey', 'fr-FR'),
  voice('com.apple.voice.compact.en-US.Samantha', 'en-US'),
  voice('com.apple.voice.compact.en-GB.Daniel', 'en-GB'),
  voice('com.apple.voice.enhanced.en-US.Evan', 'en-US'),
]

test('the most natural voice is taken by itself', () => {
  assert.equal(
    pickVoice(ipad, 'fr').voiceURI,
    'com.apple.voice.premium.fr-FR.Audrey',
  )
  assert.equal(
    pickVoice(ipad, 'en').voiceURI,
    'com.apple.voice.enhanced.en-US.Evan',
  )
})

test('without a downloaded voice, French of France then British English', () => {
  const plain = ipad.filter(v => quality(v) < 2)
  assert.equal(
    pickVoice(plain, 'fr').voiceURI,
    'com.apple.voice.compact.fr-FR.Thomas',
  )
  assert.equal(
    pickVoice(plain, 'en-GB').voiceURI,
    'com.apple.voice.compact.en-GB.Daniel',
  )
})

test('the voice chosen on the device wins, unless it is gone', () => {
  const chosen = 'com.apple.voice.compact.fr-CA.Amelie'
  assert.equal(pickVoice(ipad, 'fr', chosen).voiceURI, chosen)
  assert.equal(
    pickVoice(ipad, 'fr', 'com.apple.voice.premium.fr-FR.Gone').voiceURI,
    'com.apple.voice.premium.fr-FR.Audrey',
  )
})

test('joke voices come last, online voices after the device ones', () => {
  const list = voicesFor(
    [...ipad, voice('Google français', 'fr-FR', false)],
    'fr',
  ).map(v => v.name)
  assert.deepEqual(list, [
    'Audrey',
    'Thomas',
    'Thomas',
    'Amelie',
    'Google français',
    'Eddy',
  ])
  assert.equal(pickVoice([], 'fr'), null)
  assert.equal(pickVoice(ipad, ''), null)
})

test('the server voice says the questions first, unless a device voice was chosen', () => {
  const server = [
    { name: 'fr_FR-gilles-low', languages: ['fr_FR'] },
    { name: 'fr_FR-mls-medium', languages: ['fr_FR'] },
    { name: 'fr_FR-siwis-medium', languages: ['fr_FR'] },
    { name: 'en_US-ryan-low', languages: ['en_US'] },
    { name: 'en_GB-alba-medium', languages: ['en_GB'] },
  ]
  assert.equal(serverVoiceFor('fr', '', server), 'fr_FR-siwis-medium')
  assert.equal(serverVoiceFor('en-GB', '', server), 'en_GB-alba-medium')
  assert.equal(
    serverVoiceFor('fr', `${SERVER}fr_FR-mls-medium`, server),
    'fr_FR-mls-medium',
  )
  assert.equal(
    serverVoiceFor('fr', 'com.apple.voice.premium.fr-FR.Audrey', server),
    null,
  )
  assert.equal(serverVoiceFor('fr', `${SERVER}gone`, server), null)
  assert.equal(serverVoiceFor('de', '', server), null)
  assert.deepEqual(
    serverVoicesFor('fr', server).map(v => v.name),
    ['fr_FR-siwis-medium', 'fr_FR-mls-medium', 'fr_FR-gilles-low'],
  )
})

test('a blank is said as a voice left hanging, not as a sentence cut in two', async () => {
  const { sayBlank } = await import('../src/utils/learn/saying.js')
  assert.equal(
    sayBlank('Avec ses jambes, on peut ___.'),
    'Avec ses jambes, on peut…',
  )
  assert.equal(sayBlank('Il ___ à l’école.'), 'Il … à l’école.')
  assert.equal(sayBlank('Bonjour.'), 'Bonjour.')
})

test('the same consigne is said once, again when it changes or after a mistake', async () => {
  const { partsOf, sayAgain } = await import('../src/utils/learn/saying.js')
  const sort = text => ({
    prompt: 'Vivant ou non vivant ?',
    instruction: 'Vivant ou non vivant ?',
    subject: { text },
  })
  const other = {
    prompt: 'Combien y en a-t-il ?',
    instruction: 'Combien y en a-t-il ?',
  }
  const questions = [
    sort('la fleur'),
    sort('la pierre'),
    sort('le chat'),
    other,
    other,
  ]
  const right = { correct: true }
  const wrong = { correct: false }
  const answers = [right, wrong, right, right]
  assert.equal(sayAgain(questions, answers, 0), true, 'the first question')
  assert.equal(sayAgain(questions, answers, 1), false, 'the same consigne')
  assert.equal(sayAgain(questions, answers, 2), true, 'after a mistake')
  assert.equal(sayAgain(questions, answers, 3), true, 'a new consigne')
  assert.equal(sayAgain(questions, answers, 4), false)
  assert.deepEqual(
    partsOf(questions[1], false),
    ['la pierre'],
    'only what it is about',
  )
  assert.deepEqual(partsOf(questions[1], true), [
    'Vivant ou non vivant ?',
    'la pierre',
  ])
  assert.deepEqual(partsOf(other, false), [], 'nothing new to say')

  const read = prompt => ({ prompt, instruction: 'Lis la phrase.' })
  assert.equal(
    sayAgain([read('Avec un crayon…'), read('Avec ses yeux…')], [right], 1),
    false,
    'the instruction above sentences that change',
  )
  assert.deepEqual(partsOf(read('Avec ses yeux…'), false), ['Avec ses yeux…'])

  const listen = word => ({
    listen: word,
    lang: 'fr',
    instruction: 'Écoute, puis touche le mot.',
  })
  assert.deepEqual(partsOf(listen('au'), false, 'fr'), [
    { text: 'au', lang: 'fr' },
  ])
  assert.deepEqual(partsOf(listen('au'), true, 'fr'), [
    { text: 'Écoute, puis touche le mot.', lang: 'fr' },
    { text: 'au', lang: 'fr' },
  ])
})
