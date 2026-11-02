// The device's own voice says the words of the listening questions: free,
// offline, and good enough in English on a tablet.

const synth = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis
    : null

export const canSpeak = () => !!synth()

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

// speak says a text slowly, cutting what was being said, or after it when
// queued. A voice that fails never stops the game: the speaker button is
// still there to try again.
export const speak = (text, lang, { queue = false, voiceURI } = {}) => {
  const voice = synth()
  if (!voice || !text) return false
  try {
    if (!queue) voice.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    const chosen = pickVoice(
      voice.getVoices(),
      lang,
      voiceURI ?? chosenVoice(lang),
    )
    if (chosen) utterance.voice = chosen
    utterance.lang = chosen?.lang || lang || ''
    utterance.rate = 0.85
    voice.speak(utterance)
    return true
  } catch {
    return false
  }
}

export const stopSpeaking = () => {
  try {
    synth()?.cancel()
  } catch {
    // Nothing was being said.
  }
}
