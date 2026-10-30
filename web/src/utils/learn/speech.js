// The device's own voice says the words of the listening questions: free,
// offline, and good enough in English on a tablet.

const synth = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis
    : null

export const canSpeak = () => !!synth()

// pickVoice prefers a voice of the device in the language, British English
// first for English, the language taught at school here.
export const pickVoice = (voices, lang) => {
  if (!lang) return null
  const base = lang.toLowerCase().split('-')[0]
  const matching = (voices || []).filter(v =>
    v.lang?.toLowerCase().replace('_', '-').startsWith(base),
  )
  const wanted = base === 'en' ? ['en-gb', 'en-us'] : [lang.toLowerCase()]
  for (const tag of wanted) {
    const found = matching.find(
      v => v.lang.toLowerCase().replace('_', '-') === tag && v.localService,
    )
    if (found) return found
  }
  return matching.find(v => v.localService) || matching[0] || null
}

// speak says a text slowly, cutting what was being said. A voice that fails
// never stops the game: the speaker button is still there to try again.
export const speak = (text, lang) => {
  const voice = synth()
  if (!voice || !text) return false
  try {
    voice.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    const chosen = pickVoice(voice.getVoices(), lang)
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
