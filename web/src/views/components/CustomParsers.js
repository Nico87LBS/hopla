import moment from 'moment'

// The quick add reads a sentence in the user's language. Every word it knows
// comes from the translation files (chores:quickAdd), as a grammar:
//  - days, months, units and occurrences map a canonical value to the words
//    that say it, separated by "|", such as monday: "lundi|lundis|lun";
//  - patterns are regular expressions, where {day}, {month}, {unit} and
//    {occurrence} stand for any of those words;
//  - separator splits a list of days or months, anyone names everyone after
//    an @, and preceding are the words before a start date to drop with it.

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The words of a map, longest first so "lundis" wins over "lundi".
const wordsOf = map =>
  Object.values(map || {})
    .flatMap(words => words.split('|'))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)

const lookup = (map, word) => {
  const wanted = word.trim().toLowerCase()
  return Object.keys(map || {}).find(value =>
    map[value].split('|').some(w => w.toLowerCase() === wanted),
  )
}

const capitalize = word => word.charAt(0).toUpperCase() + word.slice(1)

// A pattern of the grammar as a regular expression that only matches whole
// words.
const patternOf = (grammar, source) => {
  const alternatives = {
    day: wordsOf(grammar.days),
    month: wordsOf(grammar.months),
    occurrence: wordsOf(grammar.occurrences),
    unit: wordsOf(grammar.units),
  }
  const expanded = source.replace(
    /\{(day|month|occurrence|unit)\}/g,
    (_, kind) => `(?:${alternatives[kind].map(escape).join('|')})`,
  )
  return new RegExp(
    `(?<![\\p{L}\\p{N}_])(?:${expanded})(?![\\p{L}\\p{N}_])`,
    'iu',
  )
}

// Helper function to validate word boundaries for date/time matches
// Prevents matching partial words like 'wed' in 'wedding', 'fri' in 'friend', etc.
const isValidWordBoundary = (text, matchIndex, matchLength) => {
  const charBefore = matchIndex > 0 ? text[matchIndex - 1] : ' '
  const charAfter =
    matchIndex + matchLength < text.length
      ? text[matchIndex + matchLength]
      : ' '
  // Valid boundaries: spaces, punctuation, but NOT alphanumeric or word-forming characters
  return !(
    /[\p{L}\p{N}_]/u.test(charBefore) || /[\p{L}\p{N}_]/u.test(charAfter)
  )
}

export const parseLabels = (inputSentence, userLabels) => {
  const currentLabels = []
  const matchedRanges = []
  const allHighlights = []

  // Labels can contain spaces (e.g. "New Label"), so a plain word-boundary
  // regex can't capture them — check each '#' against real label names
  // instead, longest name first so "New Label" wins over a label named "New".
  const sortedLabels = [...userLabels].sort(
    (a, b) => b.name.length - a.name.length,
  )
  const isWordChar = ch => ch !== undefined && /[\p{L}\p{N}_]/u.test(ch)

  const hashPattern = /#/g
  let hashMatch
  while ((hashMatch = hashPattern.exec(inputSentence)) !== null) {
    const startIndex = hashMatch.index
    const rest = inputSentence.slice(startIndex + 1)

    const existingLabel = sortedLabels.find(label => {
      const name = label.name
      if (rest.toLowerCase().slice(0, name.length) !== name.toLowerCase()) {
        return false
      }
      // Require a non-word boundary right after the name so "New" doesn't
      // match inside a longer typed word like "Newer".
      return !isWordChar(rest[name.length])
    })

    // Unmatched #mentions (no existing label, not created) are left as plain
    // text — only #mentions resolving to a real label are extracted/cleaned.
    if (!existingLabel) continue

    const fullMatch = `#${existingLabel.name}`
    currentLabels.push(existingLabel)
    matchedRanges.push({
      start: startIndex,
      end: startIndex + fullMatch.length,
    })
    allHighlights.push({
      text: inputSentence.slice(startIndex, startIndex + fullMatch.length),
      start: startIndex,
      end: startIndex + fullMatch.length,
    })
    hashPattern.lastIndex = startIndex + fullMatch.length
  }

  if (currentLabels.length > 0) {
    let cleanedSentence = inputSentence
    for (const range of matchedRanges
      .slice()
      .sort((a, b) => b.start - a.start)) {
      cleanedSentence =
        cleanedSentence.slice(0, range.start) + cleanedSentence.slice(range.end)
    }

    return {
      result: currentLabels,
      highlight: allHighlights,
      cleanedSentence: cleanedSentence.replace(/\s+/g, ' ').trim(),
    }
  }

  return {
    result: null,
    cleanedSentence: inputSentence,
  }
}

const matched = (inputSentence, match, extra = {}) => ({
  ...extra,
  highlight: [
    {
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
    },
  ],
  cleanedSentence: (
    inputSentence.slice(0, match.index) +
    inputSentence.slice(match.index + match[0].length)
  )
    .replace(/\s+/g, ' ')
    .trim(),
})

const interval = (frequency, unit) => ({
  frequency,
  frequencyType: 'interval',
  frequencyMetadata: {
    days: [],
    months: [],
    unit,
    time: new Date().toISOString(),
  },
})

// How each pattern of the grammar turns its match into a repeat, in the
// order they are tried.
const REPEATS = {
  // "15th of every month": monthly, from the next 15th.
  monthDay: match => {
    const dayOfMonth = parseInt(match[1], 10)
    const now = moment()
    let dueDate = moment(now).set({
      date: dayOfMonth,
      hour: 23,
      minute: 59,
      second: 0,
      millisecond: 0,
    })
    if (!dueDate.isAfter(now)) dueDate = dueDate.add(1, 'month')
    return { result: interval(1, 'months'), dueDate: dueDate.toISOString() }
  },
  // "last Friday of the month".
  nthWeekday: (match, grammar) => {
    const occurrence = Number(lookup(grammar.occurrences, match[1]))
    const day = lookup(grammar.days, match[2])
    if (!occurrence || !day) return null
    const result = interval(1, null)
    result.frequencyType = 'days_of_the_week'
    result.frequencyMetadata.unit = null
    result.frequencyMetadata.days = [day]
    result.frequencyMetadata.weekPattern = 'week_of_month'
    result.frequencyMetadata.occurrences = [occurrence]
    return { result }
  },
  daily: () => ({ result: interval(1, 'days') }),
  dailyTime: () => {
    const result = interval(1, 'days')
    result.frequencyType = 'daily'
    return { result }
  },
  weekly: () => ({ result: interval(1, 'weeks') }),
  monthly: () => ({ result: interval(1, 'months') }),
  yearly: () => ({ result: interval(1, 'years') }),
  everyOtherWeek: () => ({ result: interval(2, 'weeks') }),
  interval: (match, grammar) => {
    const unit = lookup(grammar.units, match[2])
    return unit ? { result: interval(parseInt(match[1], 10), unit) } : null
  },
  everyOther: (match, grammar) => {
    const unit = lookup(grammar.units, match[1])
    return unit ? { result: interval(2, unit) } : null
  },
  // "every Tuesday and Thursday".
  weekdays: (match, grammar) => {
    const days = match[1]
      .split(new RegExp(grammar.separator, 'iu'))
      .map(word => lookup(grammar.days, word))
      .filter(Boolean)
      .filter((day, i, all) => all.indexOf(day) === i)
      .map(capitalize)
    if (!days.length) return null
    const result = interval(1, null)
    result.frequencyType = 'days_of_the_week'
    result.frequencyMetadata.unit = null
    result.frequencyMetadata.days = days
    return { result }
  },
  // "1st of January and July".
  monthDays: (match, grammar) => {
    const months = match[2]
      .split(new RegExp(grammar.separator, 'iu'))
      .map(word => lookup(grammar.months, word))
      .filter(Boolean)
      .filter((month, i, all) => all.indexOf(month) === i)
      .map(capitalize)
    if (!months.length) return null
    const result = interval(parseInt(match[1], 10), 'days')
    result.frequencyType = 'day_of_the_month'
    result.frequencyMetadata.months = months
    return { result }
  },
}

export const parseRepeatV2 = (inputSentence, grammar) => {
  for (const [name, toRepeat] of Object.entries(REPEATS)) {
    const source = grammar?.patterns?.[name]
    if (!source) continue
    const match = inputSentence.match(patternOf(grammar, source))
    if (!match) continue
    const repeat = toRepeat(match, grammar)
    if (repeat) return matched(inputSentence, match, repeat)
  }
  return {
    result: null,
    highlight: [],
    cleanedSentence: inputSentence,
  }
}

export const parseAssignees = (inputSentence, users, grammar) => {
  const result = []
  const highlight = []
  const matchedTexts = []

  // Check for @Anyone first (special case), in any language.
  const anyoneWords = ['anyone', ...(grammar?.anyone || '').split('|')]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
  const anyoneRegex = new RegExp(
    `@(?:${anyoneWords.map(escape).join('|')})(?=\\s|$)`,
    'iu',
  )
  const anyoneMatch = inputSentence.match(anyoneRegex)

  if (anyoneMatch) {
    const index = inputSentence.search(anyoneRegex)
    highlight.push({
      text: anyoneMatch[0],
      start: index,
      end: index + anyoneMatch[0].length,
    })
    matchedTexts.push({ pattern: '@anyone', original: anyoneMatch[0] })

    // For @Anyone, return empty result (no specific assignees)
    let cleanedSentence = inputSentence
    for (const matchedText of matchedTexts) {
      cleanedSentence = cleanedSentence.replace(
        new RegExp(
          matchedText.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          'gi',
        ),
        '',
      )
    }

    return {
      result: [], // Empty assignees for @Anyone
      isAnyone: true, // Flag to indicate @Anyone was used
      highlight,
      cleanedSentence: cleanedSentence.replace(/\s+/g, ' ').trim(),
    }
  }

  // Sort users by longest displayName first to avoid partial matches
  const sortedUsers = users.sort(
    (a, b) => (b.displayName?.length || 0) - (a.displayName?.length || 0),
  )

  for (const user of sortedUsers) {
    if (!user.displayName) continue

    // Only match on display name - use word boundaries for exact matching
    const displayNamePattern = `@${user.displayName.toLowerCase()}`
    // Use word boundary or space/end to ensure exact match, not partial
    const exactMatchRegex = new RegExp(
      `@${user.displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`,
      'i',
    )
    const exactMatch = inputSentence.match(exactMatchRegex)

    if (exactMatch && !result.some(r => r.userId === user.userId)) {
      result.push(user)
      const index = inputSentence.search(exactMatchRegex)

      highlight.push({
        text: exactMatch[0],
        start: index,
        end: index + exactMatch[0].length,
      })
      matchedTexts.push({
        pattern: displayNamePattern,
        original: exactMatch[0],
      })
    }
  }

  if (result.length > 0) {
    let cleanedSentence = inputSentence
    // Remove all matched assignee patterns using the original matched text
    for (const matchedText of matchedTexts) {
      cleanedSentence = cleanedSentence.replace(
        new RegExp(
          matchedText.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          'gi',
        ),
        '',
      )
    }

    return {
      result,
      isAnyone: false,
      highlight,
      cleanedSentence: cleanedSentence.replace(/\s+/g, ' ').trim(),
    }
  }

  return { result: null, isAnyone: false, cleanedSentence: inputSentence }
}

// "*5", or "*5 hops" with the family's words for what it earns.
export const parsePoints = (inputSentence, unitWords = []) => {
  const sentence = inputSentence.toLowerCase()
  const words = unitWords
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(escape)
  const pointsPattern = new RegExp(
    words.length
      ? `\\*(\\d+)(?:\\s*(?:${words.join('|')})(?![\\p{L}\\p{N}_]))?`
      : '\\*(\\d+)',
    'giu',
  )
  const match = sentence.match(pointsPattern)

  if (!match) {
    return {
      result: null,
      highlight: [],
      cleanedSentence: inputSentence,
    }
  }

  // Extract the first points match
  const pointsMatch = match[0]
  const pointsValue = parseInt(pointsMatch.replace(/\D/g, ''), 10)
  const startIndex = inputSentence
    .toLowerCase()
    .indexOf(pointsMatch.toLowerCase())

  return {
    result: pointsValue,
    highlight: [
      {
        text: pointsMatch,
        start: startIndex,
        end: startIndex + pointsMatch.length,
      },
    ],
    cleanedSentence: inputSentence
      .replace(
        new RegExp(pointsMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
        '',
      )
      .replace(/\s+/g, ' ')
      .trim(),
  }
}

export const parseDueDate = (inputSentence, chrono, grammar) => {
  // Parse the due date using chrono
  // Read in the family's time zone, not the device's.
  const parsedDueDate = chrono.parse(
    inputSentence,
    { instant: new Date(), timezone: moment().utcOffset() },
    { forwardDate: true },
  )

  if (!parsedDueDate.length) {
    return {
      result: null,
      highlight: [],
      cleanedSentence: inputSentence,
    }
  }

  // Select the first valid word-bounded date match
  // Prevents false positives like "wed" in "wedding" while still allowing later valid matches
  const dueDateMatch = parsedDueDate.find(
    match =>
      match.index !== -1 &&
      isValidWordBoundary(inputSentence, match.index, match.text.length),
  )

  if (!dueDateMatch) {
    return {
      result: null,
      highlight: [],
      cleanedSentence: inputSentence,
    }
  }
  const dueDateText = dueDateMatch.text
  const dueDateStartIndex = dueDateMatch.index
  const dueDateEndIndex = dueDateStartIndex + dueDateText.length

  // Words that might precede the due date and should be removed
  const precedingWords = (grammar?.preceding || '').split('|').filter(Boolean)

  // Look for preceding words before the due date
  let cleanStartIndex = dueDateStartIndex
  let highlightStartIndex = dueDateStartIndex
  let precedingWord = ''

  // Extract text before the due date to check for preceding words
  const textBeforeDueDate = inputSentence.substring(0, dueDateStartIndex).trim()

  for (const word of precedingWords) {
    // Check if the text before due date ends with this preceding word
    const wordPattern = new RegExp(
      `(?<![\\p{L}\\p{N}_])${escape(word)}\\s*$`,
      'iu',
    )
    const match = textBeforeDueDate.match(wordPattern)

    if (match) {
      // Found a preceding word, include it in the text to be removed
      const matchStart = textBeforeDueDate.length - match[0].length
      cleanStartIndex = matchStart
      highlightStartIndex = matchStart
      precedingWord = match[0].trim()
      break
    }
  }

  // Create the highlight text
  const fullHighlightText = precedingWord
    ? `${precedingWord} ${dueDateText}`
    : dueDateText

  // Create cleaned sentence by removing the full match (preceding word + due date)
  const textToRemove = inputSentence.substring(cleanStartIndex, dueDateEndIndex)
  const cleanedSentence = inputSentence
    .replace(textToRemove, '')
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim()

  // If no specific time was mentioned, set to end of day (23:59:59)
  // to indicate the date has no specific time tied to it (same convention as ChoreEdit)
  let resultDate = dueDateMatch.start.date()
  if (!dueDateMatch.start.isCertain('hour')) {
    resultDate = moment(resultDate)
      .set({ hour: 23, minute: 59, second: 59, millisecond: 0 })
      .toDate()
  }

  return {
    result: resultDate,
    highlight: [
      {
        text: fullHighlightText,
        start: highlightStartIndex,
        end: dueDateEndIndex,
      },
    ],
    cleanedSentence: cleanedSentence,
  }
}
