// groupReports puts the reports of a family by module, then by question,
// the modules in alphabetical order and the questions as they were reported.
export const groupReports = reports => {
  const modules = new Map()
  for (const report of reports || []) {
    const module = modules.get(report.module) || {
      id: report.module,
      name: report.moduleName || report.module,
      questions: new Map(),
    }
    // A written card is one question whatever it showed; a question made by
    // the game is told apart by its own key.
    const key = report.written ? report.card : report.key || report.prompt
    const question = module.questions.get(key) || {
      key,
      card: report.written || null,
      prompt: report.prompt,
      expected: report.expected,
      reports: [],
    }
    question.reports.push(report)
    module.questions.set(key, question)
    modules.set(report.module, module)
  }
  return [...modules.values()]
    .map(module => ({ ...module, questions: [...module.questions.values()] }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
