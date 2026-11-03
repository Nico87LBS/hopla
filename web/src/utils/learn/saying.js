// What is said aloud of a question, and when.

// spoken is what is said of a question when it is read aloud, in parts
// said with a short silence between them: the instruction, the question,
// then what it is about (« Solide ou liquide ? … la cuillère »).
export const spoken = item =>
  [
    item.instruction !== item.prompt && item.instruction,
    item.prompt,
    item.word,
    item.subject?.text,
  ]
    .filter(Boolean)
    .map(sayBlank)

// A blank to fill is said as a voice left hanging, not as its dashes: at
// the end, the sentence stops on it (« on peut… »), and inside it, as a
// short pause. Its dot would make the voice end the sentence.
export const sayBlank = part =>
  part.replace(/\s*_{2,}\s*[.!?]*\s*$/, '…').replace(/_{2,}/g, '…')

// consigneOf is what a question says before what it is about: the same
// sentence, question after question, in many modules (« Vivant ou non
// vivant ? », « Lis la phrase et choisis le mot qui manque. »). A question
// to listen to has only its instruction.
export const consigneOf = item =>
  item.listen || (item.instruction && item.instruction !== item.prompt)
    ? item.instruction || ''
    : item.prompt || ''

// sayAgain tells whether the consigne of question i is said aloud: at the
// first question, when it changes, and after a mistake, which may come
// from a consigne forgotten. It always stays written, and the speaker
// button says it again.
export const sayAgain = (questions, answers, i) =>
  i <= 0 ||
  !answers[i - 1]?.correct ||
  consigneOf(questions[i - 1]) !== consigneOf(questions[i])

// partsOf is what is said as a question opens, with or without its
// consigne.
export const partsOf = (item, repeat, tellLang) => {
  if (item.listen) {
    return [
      repeat && item.instruction && { text: item.instruction, lang: tellLang },
      { text: item.listen, lang: item.lang },
    ].filter(Boolean)
  }
  const parts = spoken(item)
  if (repeat) return parts
  // Without the consigne: the instruction above the question, or else the
  // question itself when it is the same for all and only its subject
  // changes.
  if (item.instruction && item.instruction !== item.prompt) {
    return parts.slice(1)
  }
  return item.subject?.text || item.word ? parts.slice(-1) : []
}
