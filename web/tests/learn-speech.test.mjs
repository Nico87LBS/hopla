import assert from 'node:assert/strict'
import { test } from 'node:test'

import { pickVoice, quality, voicesFor } from '../src/utils/learn/speech.js'

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
