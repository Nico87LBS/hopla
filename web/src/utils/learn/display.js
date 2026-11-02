// How the words of a question are shown.

// capitalFor tells how the written answers of a question begin: with a
// capital letter when it asks a question, as a reply would; as written
// otherwise, such as the end of a sentence (« devient… une chatte ») or a
// word for a blank (« Le chat ___ noir. »). A question whose answers are
// letters or sounds alone (« ph », « ou ») is left as it is.
export const capitalFor = item => {
  const asked = String(item.prompt || '').trim()
  const letters = text => String(text).replace(/[^\p{L}]/gu, '').length
  const sounds = (item.choices || []).every(choice => letters(choice) <= 3)
  // A word to put in a blank keeps its case, even in a question.
  const blank = /_{2,}/.test(asked)
  if (!asked.endsWith('?') || blank || sounds) return choice => String(choice)
  return choice => {
    const text = String(choice)
    return text.charAt(0).toLocaleUpperCase('fr') + text.slice(1)
  }
}

// isolated tells a word, a syllable, a number or a calculation to read on its
// own, shown big, from a sentence, shown at one size whatever its length.
export const isolated = item => {
  const text = String(item.prompt || '').trim()
  if (!text || item.prompt === item.instruction) return false
  if (/[?.!…:]$/.test(text) || /_{2,}/.test(text)) return false
  return text.split(/\s+/).length <= 3 || /^[\d\s+\-−×÷=?.,]+$/.test(text)
}
