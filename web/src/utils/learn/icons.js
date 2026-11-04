// The icons of the packs and modules: Twemoji drawings kept in public/icones,
// named by the code of the emoji, so they also show offline.

export const ICONS = [
  '🧮',
  '📖',
  '🇬🇧',
  '🌍',
  '🔤',
  '✈️',
  '✍️',
  '⚖️',
  '🖐️',
  '🔺',
  '🔢',
  '🍎',
  '🐾',
  '✏️',
  '⚡',
  '➕',
  '🪙',
  '🧩',
  '📐',
  '🕒',
  '✖️',
  '➗',
  '📏',
  '🔠',
  '🖼️',
  '🎵',
  '👂',
  '👏',
  '👫',
  '💬',
  '🔗',
  '🏃',
  '📝',
  '📚',
  '👯',
  '📜',
  '🧱',
  '🐱',
  '🔑',
  '🙈',
  '🐸',
  '🐶',
  '🎨',
  '☀️',
  '🏠',
  '🎒',
  '🔁',
  '👋',
  '👕',
  '📅',
  '🏫',
  '⏰',
  '🍽️',
  '👨‍👩‍👧',
  '🛬',
  '🎧',
  '💡',
  '⛅',
  '🗣️',
  '📻',
  '🎙️',
  '⚙️',
  '🚨',
  '🐰',
  '🧸',
  '🌱',
  '🍂',
  '⏳',
  '🐞',
  '🗺️',
  '🧊',
  '🌳',
  '🦷',
  '💧',
  '🔌',
  '🫀',
  '🧭',
  '🏰',
  '🦋',
  '🦁',
  '🐻',
  '🦊',
  '🐼',
  '🐠',
  '🌻',
  '🌈',
  '⭐',
  '🚀',
  '⚽',
  '🚲',
  '🧪',
  '🔬',
  '🌋',
  '🧠',
  '🔭',
  '🤖',
  '🎮',
  '🍕',
  '🚗',
  '🎯',
  '🏆',
  '❤️',
  '🦖',
  '🐢',
  '🌙',
  '❓',
]

// SUBJECT_ICONS stand in for a module or pack that has none.
const SUBJECT_ICONS = {
  maths: '🧮',
  francais: '📖',
  anglais: '🇬🇧',
  langues: '🇬🇧',
  monde: '🌍',
}
const FALLBACK = '🎒'

const known = new Set(ICONS)

// iconFile gives the drawing of an emoji, or null when Hopla has none.
export const iconFile = emoji => {
  if (!known.has(emoji)) return null
  const name = [...emoji]
    .map(c => c.codePointAt(0))
    .filter(code => code !== 0xfe0f)
    .map(code => code.toString(16))
    .join('-')
  return `/icones/${name}.svg`
}

// iconOf is the emoji shown for a module or pack: its own, or its subject's.
export const iconOf = (entity, subject) =>
  (entity?.icon && known.has(entity.icon) ? entity.icon : null) ||
  (entity?.document?.icone && known.has(entity.document.icone)
    ? entity.document.icone
    : null) ||
  SUBJECT_ICONS[subject || entity?.subject] ||
  FALLBACK
