// The device's own voice says the words of the listening questions: free,
// offline, and good enough in English on a tablet.

const synth = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis
    : null

export const canSpeak = () => !!synth() || server.voices.length > 0

const tagOf = voice => (voice?.lang || '').toLowerCase().replace('_', '-')

export const baseOf = lang => (lang || '').toLowerCase().split(/[-_]/)[0]

// QUALITY tells a natural voice from the plain one. On an iPad or a Mac the
// voices downloaded in the settings say so in their address
// (com.apple.voice.premium.fr-FR.Audrey, …enhanced…); the joke voices
// (Eloquence, Bubbles…) come last. Siri voices are never given to web
// pages by Apple.
const NOVELTY =
  /eloquence|albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|grandma|grandpa|rocko|shelley|sandy|reed|eddy|flo\b/i

export const quality = voice => {
  const id = `${voice?.voiceURI || ''} ${voice?.name || ''}`
  if (NOVELTY.test(id)) return 0
  if (/premium/i.test(id)) return 3
  if (/enhanced|améliorée|amélioré|neural|natural/i.test(id)) return 2
  return 1
}

// Among voices as natural, one of the device first (it works without the
// network), then the region of the language taught here: British English, French of
// France.
const REGIONS = { en: ['en-gb', 'en-us'], fr: ['fr-fr'] }

// voicesFor lists the device's voices in a language, the most natural
// first, then those that work offline, then the region taught here.
export const voicesFor = (voices, lang) => {
  const base = baseOf(lang)
  if (!base) return []
  const regions = REGIONS[base] || [String(lang).toLowerCase()]
  const region = voice => {
    const i = regions.indexOf(tagOf(voice))
    return i === -1 ? regions.length : i
  }
  return (voices || [])
    .filter(v => baseOf(v.lang) === base)
    .map((voice, i) => ({ voice, i }))
    .sort(
      (a, b) =>
        quality(b.voice) - quality(a.voice) ||
        Number(b.voice.localService) - Number(a.voice.localService) ||
        region(a.voice) - region(b.voice) ||
        a.i - b.i,
    )
    .map(({ voice }) => voice)
}

// The voice chosen on this device, by language: each device has its own
// voices, so the choice stays on it.
const KEY = 'hopla.voix.'

export const chosenVoice = lang => {
  try {
    return window.localStorage.getItem(KEY + baseOf(lang)) || ''
  } catch {
    return ''
  }
}

export const chooseVoice = (lang, voiceURI) => {
  try {
    if (voiceURI) window.localStorage.setItem(KEY + baseOf(lang), voiceURI)
    else window.localStorage.removeItem(KEY + baseOf(lang))
  } catch {
    // A private window keeps the automatic voice.
  }
}

// The voices made by the server, when the family set one up: a choice
// starts with SERVER, then the voice's name. The page that plays them
// gives them with setServer, so this file needs no network.
export const SERVER = 'serveur:'
let server = { play: null, stop: null, voices: [] }

export const setServer = next => {
  server = { ...server, ...next }
}

// The server's voices that speak best first: those known to be clear for
// children, then the better models (high, medium, then low).
const PREFERRED = {
  en: ['en_GB-cori-high', 'en_GB-alba-medium', 'en_US-lessac-medium'],
  fr: ['fr_FR-siwis-medium', 'fr_FR-upmc-medium', 'fr_FR-tom-medium'],
}
const MODEL = name => (/-high$/.test(name) ? 0 : /-medium$/.test(name) ? 1 : 2)

// serverVoicesFor lists the server's voices in a language, the best first.
export const serverVoicesFor = (lang, voices = server.voices) => {
  const preferred = PREFERRED[baseOf(lang)] || []
  const rank = name => {
    const i = preferred.indexOf(name)
    return i === -1 ? preferred.length : i
  }
  return (voices || [])
    .filter(v => (v.languages || []).some(l => baseOf(l) === baseOf(lang)))
    .map((voice, i) => ({ voice, i }))
    .sort(
      (a, b) =>
        rank(a.voice.name) - rank(b.voice.name) ||
        MODEL(a.voice.name) - MODEL(b.voice.name) ||
        a.i - b.i,
    )
    .map(({ voice }) => voice)
}

// serverVoiceFor tells the server's voice that says a language, or none:
// the one chosen, or by itself the first of the language, unless a voice of
// the device was chosen.
export const serverVoiceFor = (lang, chosen, voices = server.voices) => {
  const matching = serverVoicesFor(lang, voices)
  if (chosen?.startsWith(SERVER)) {
    const name = chosen.slice(SERVER.length)
    return matching.find(v => v.name === name)?.name || null
  }
  if (chosen) return null
  return matching[0]?.name || null
}

// pickVoice takes the voice chosen on this device, or else the most natural
// one in the language.
export const pickVoice = (voices, lang, chosen = '') => {
  const matching = voicesFor(voices, lang)
  return (
    (chosen && matching.find(v => v.voiceURI === chosen)) || matching[0] || null
  )
}

// deviceVoices gives the voices of the device; some browsers only know them
// a moment after the page opens, and then tell it.
export const deviceVoices = onChange => {
  const voice = synth()
  if (!voice) return () => {}
  const tell = () => onChange(voice.getVoices())
  tell()
  voice.addEventListener?.('voiceschanged', tell)
  return () => voice.removeEventListener?.('voiceschanged', tell)
}

// A text in parts is said with a short silence between them, such as an
// instruction, then the word it is about: « Solide ou liquide ? … la
// cuillère ». What is said next cancels the parts still to come.
export const PAUSE_MS = 700
let waiting = []
// Each new text said, not queued, starts a new turn: a part of an older
// turn that ends, even cut short, says nothing more.
let turn = 0
const stopWaiting = () => {
  turn++
  for (const timer of waiting) clearTimeout(timer)
  waiting = []
}

// speak says a text slowly, cutting what was being said, or after it when
// queued. A list of texts is said part after part, with a pause between
// them. A voice that fails never stops the game: the speaker button is
// still there to try again.
export const speak = (text, lang, options = {}) => {
  if (Array.isArray(text)) return speakParts(text, lang, options)
  const { onDone, queue = false, voiceURI } = options
  if (!text) return false
  const chosen = voiceURI ?? chosenVoice(lang)
  const fromServer = server.play && serverVoiceFor(lang, chosen)
  if (fromServer) {
    if (!queue) stopWaiting()
    try {
      synth()?.cancel()
    } catch {
      // Nothing was being said.
    }
    let done = false
    const finish = () => {
      if (!done) {
        done = true
        onDone?.()
      }
    }
    server.play(text, fromServer, {
      queue,
      onDone: finish,
      // Offline, or the server down: the device says it.
      fallback: () =>
        deviceSpeak(text, lang, { onDone: finish, queue: true, voiceURI: '' }),
    })
    return true
  }
  if (!queue) server.stop?.()
  return deviceSpeak(text, lang, {
    onDone,
    queue,
    voiceURI: chosen.startsWith(SERVER) ? '' : chosen,
  })
}

// deviceSpeak says a text with a voice of the device.
const deviceSpeak = (text, lang, { onDone, queue = false, voiceURI = '' }) => {
  const voice = synth()
  if (!voice) {
    onDone?.()
    return false
  }
  try {
    if (!queue) {
      stopWaiting()
      voice.cancel()
    }
    const utterance = new SpeechSynthesisUtterance(text)
    if (onDone) {
      let done = false
      utterance.onend = utterance.onerror = () => {
        if (!done) {
          done = true
          onDone()
        }
      }
    }
    const chosen = pickVoice(voice.getVoices(), lang, voiceURI)
    if (chosen) utterance.voice = chosen
    utterance.lang = chosen?.lang || lang || ''
    utterance.rate = 0.85
    voice.speak(utterance)
    return true
  } catch {
    return false
  }
}

const speakParts = (parts, lang, { queue = false, voiceURI } = {}) => {
  const said = parts.filter(Boolean)
  if (!said.length) return false
  if (!queue) {
    stopWaiting()
    server.stop?.()
    try {
      synth()?.cancel()
    } catch {
      // Nothing was being said.
    }
  }
  const mine = turn
  // A part may be in another language: { text, lang }.
  const sayFrom = (i, queued) =>
    speak(said[i].text ?? said[i], said[i].lang || lang, {
      queue: queued,
      voiceURI,
      ...(i + 1 < said.length && {
        onDone: () => {
          if (turn !== mine) return
          waiting.push(setTimeout(() => sayFrom(i + 1, true), PAUSE_MS))
        },
      }),
    })
  return sayFrom(0, true)
}

export const stopSpeaking = () => {
  stopWaiting()
  server.stop?.()
  try {
    synth()?.cancel()
  } catch {
    // Nothing was being said.
  }
}
