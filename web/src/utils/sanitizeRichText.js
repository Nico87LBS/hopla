const allowedTags = new Set([
  'P',
  'BR',
  'STRONG',
  'B',
  'EM',
  'I',
  'U',
  'S',
  'BLOCKQUOTE',
  'PRE',
  'CODE',
  'UL',
  'OL',
  'LI',
  'H1',
  'H2',
  'H3',
  'H4',
  'A',
  'IMG',
])
const dropContentTags = new Set([
  'SCRIPT',
  'STYLE',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'SVG',
  'MATH',
  'TEMPLATE',
  'FORM',
  'INPUT',
  'BUTTON',
  'TEXTAREA',
])

const hasControlCharacters = value =>
  Array.from(value).some(character => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })

const safeUrl = (value, tag, attribute) => {
  if (!value || hasControlCharacters(value) || value.includes('\\')) return false
  const trimmed = value.trim()
  if (
    /^(?:javascript|vbscript|data):/i.test(trimmed) ||
    trimmed.startsWith('//')
  ) {
    return false
  }
  try {
    const parsed = new URL(trimmed, window.location.origin)
    if (
      parsed.protocol === 'blob:' &&
      attribute === 'src' &&
      parsed.origin === window.location.origin
    ) {
      return true
    }
    if (
      !['http:', 'https:'].includes(parsed.protocol) &&
      !(attribute === 'href' && parsed.protocol === 'mailto:')
    ) {
      return false
    }
    return tag === 'A' || (tag === 'IMG' && attribute === 'src')
  } catch {
    return false
  }
}

const sanitizeNode = node => {
  if (node.nodeType === Node.TEXT_NODE) {
    return document.createTextNode(node.textContent || '')
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null
  if (dropContentTags.has(node.tagName)) return null

  if (!allowedTags.has(node.tagName)) {
    const fragment = document.createDocumentFragment()
    Array.from(node.childNodes).forEach(child => {
      const safe = sanitizeNode(child)
      if (safe) fragment.appendChild(safe)
    })
    return fragment
  }

  const clean = document.createElement(node.tagName.toLowerCase())
  Array.from(node.attributes).forEach(({ name, value }) => {
    const key = name.toLowerCase()
    if (
      key === 'href' &&
      node.tagName === 'A' &&
      safeUrl(value, node.tagName, key)
    ) {
      clean.setAttribute('href', value)
    } else if (
      key === 'src' &&
      node.tagName === 'IMG' &&
      safeUrl(value, node.tagName, key)
    ) {
      clean.setAttribute('src', value)
    } else if (['alt', 'title'].includes(key)) {
      clean.setAttribute(key, value)
    } else if (key === 'data-hopla-path' && !hasControlCharacters(value)) {
      clean.setAttribute(key, value)
    } else if (key === 'target' && node.tagName === 'A' && value === '_blank') {
      clean.setAttribute('target', '_blank')
    }
  })
  if (node.tagName === 'A') clean.setAttribute('rel', 'noopener noreferrer')
  if (node.tagName === 'IMG' && !clean.hasAttribute('src')) return null

  Array.from(node.childNodes).forEach(child => {
    const safe = sanitizeNode(child)
    if (safe) clean.appendChild(safe)
  })
  return clean
}

// Sanitizes persisted rich text before it reaches any innerHTML sink.
export const sanitizeRichTextHTML = html => {
  if (!html) return ''
  const parsed = new DOMParser().parseFromString(String(html), 'text/html')
  const output = document.createElement('div')
  Array.from(parsed.body.childNodes).forEach(node => {
    const safe = sanitizeNode(node)
    if (safe) output.appendChild(safe)
  })
  return output.innerHTML
}
