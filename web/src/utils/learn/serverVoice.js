// The natural voice made by the server: the sentences come as sounds, kept
// on this device for the page's life, and are played one after another.

import { GetLearnSpeech, GetLearnVoices } from '../Fetcher'
import { setServer } from './speech'

// The sounds already fetched, by voice and text; the oldest go first.
const KEEP = 200
const sounds = new Map()

// After a failure, the device's own voice speaks for a while before the
// server is asked again.
const PAUSE_AFTER_FAILURE_MS = 60 * 1000
let downUntil = 0

// Kids hear the voice a little slower, as the device's voice.
const RATE = 0.92

let audio = null
const element = () => {
  if (!audio && typeof Audio !== 'undefined') {
    audio = new Audio()
    audio.preload = 'auto'
  }
  return audio
}

// An iPad plays a sound out of a touch only on an element a touch already
// started: the first touch of the page plays a silence on it.
const SILENCE =
  'data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA=='
let unlocked = false
const unlock = () => {
  const a = element()
  if (unlocked || !a) return
  unlocked = true
  a.src = SILENCE
  a.play().catch(() => {
    unlocked = false
  })
}
if (typeof document !== 'undefined') {
  for (const type of ['pointerdown', 'touchend', 'keydown']) {
    document.addEventListener(type, unlock, { capture: true, passive: true })
  }
}

const soundOf = async (text, voice) => {
  const key = `${voice}\u0000${text}`
  if (sounds.has(key)) {
    const url = sounds.get(key)
    sounds.delete(key)
    sounds.set(key, url)
    return url
  }
  const blob = await GetLearnSpeech(text, voice)
  const url = URL.createObjectURL(blob)
  sounds.set(key, url)
  if (sounds.size > KEEP) {
    const [oldKey, oldUrl] = sounds.entries().next().value
    sounds.delete(oldKey)
    URL.revokeObjectURL(oldUrl)
  }
  return url
}

// Each sentence said, not queued, starts a new turn and ends the older one.
let turn = 0
let chain = Promise.resolve()

const playOne = async (text, voice, mine, { fallback, onDone }) => {
  if (mine !== turn) return
  if (Date.now() < downUntil) {
    fallback()
    return
  }
  let url
  try {
    url = await soundOf(text, voice)
  } catch {
    downUntil = Date.now() + PAUSE_AFTER_FAILURE_MS
    if (mine === turn) fallback()
    return
  }
  const a = element()
  if (mine !== turn || !a) return
  await new Promise(resolve => {
    const end = () => {
      a.onended = a.onerror = null
      onDone()
      resolve()
    }
    a.onended = end
    a.onerror = end
    a.src = url
    a.playbackRate = RATE
    a.play().catch(() => {
      // The device refused to play: its voice says it instead.
      a.onended = a.onerror = null
      fallback()
      resolve()
    })
  })
}

const play = (text, voice, options) => {
  if (!options.queue) stop()
  const mine = turn
  chain = chain.then(() => playOne(text, voice, mine, options))
}

const stop = () => {
  turn++
  chain = Promise.resolve()
  const a = element()
  if (a && !a.paused) {
    a.onended = a.onerror = null
    a.pause()
  }
}

let loading = null

// loadServerVoices asks the server once for its voices; without a server or
// offline there are none, and the device speaks.
export const loadServerVoices = () => {
  loading ||= GetLearnVoices()
    .then(voices => {
      setServer({ play, stop, voices: voices || [] })
      return voices || []
    })
    .catch(() => {
      loading = null
      return []
    })
  return loading
}
