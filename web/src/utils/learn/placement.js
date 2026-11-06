// The test of a pack is the test of a level, or of one chapter. It asks
// QUESTIONS_BY_CHAPTER questions of each chapter of the level, all of them,
// and a chapter is passed with at least PASS_PERCENT of right answers. What
// is passed opens, and the next chapter with it. A chapter missed never
// stops the test, nor closes anything.

import { compile } from './engine.js'

// QUESTIONS_BY_CHAPTER is how many questions a chapter asks.
export const QUESTIONS_BY_CHAPTER = 8

// PASS_PERCENT is the share of right answers that passes a chapter.
export const PASS_PERCENT = 80

// rightNeeded is how many right answers pass a chapter of asked questions:
// 7 of 8 at 80 %.
export const rightNeeded = (asked, percent = PASS_PERCENT) =>
  Math.ceil((asked * percent) / 100 - 1e-9)

// testPlan compiles the levels of a test: each level its chapters in order,
// with the module each one is in.
export const testPlan = (test, context = {}) =>
  (test?.levels || []).map(level => {
    const chapters = []
    for (const module of level.modules || []) {
      let compiled
      try {
        compiled = compile(module.document, context)
      } catch {
        continue
      }
      for (const chapter of compiled.chapters) {
        chapters.push({ module: compiled, chapter })
      }
    }
    return { id: level.id, name: level.name, levels: level.levels, chapters }
  })

const chapterKey = step => `${step.module.id}/${step.chapter.id}`

// stepsOf lists the chapters a test asks, in order: all those of a level
// ({ level: index }), of a module ({ module: id }), or one chapter
// ({ chapter: "module/chapter" }).
export const stepsOf = (plan, scope = {}) => {
  const steps = []
  plan.forEach((level, i) => {
    for (const step of level.chapters) {
      const wanted = scope.chapter
        ? chapterKey(step) === scope.chapter
        : scope.module
          ? step.module.id === scope.module
          : i === (scope.level ?? 0)
      if (wanted) steps.push({ ...step, level: i })
    }
  })
  return steps
}

// startTest is the test before the first answer.
export const startTest = (plan, scope = {}) => {
  const steps = stepsOf(plan, scope)
  return { steps, index: 0, passed: [], missed: [], done: steps.length === 0 }
}

// currentStep is the chapter being tested, or null once done.
export const currentStep = (plan, state) =>
  state.done ? null : state.steps[state.index] || null

// answerChapter moves the test on once a chapter was passed or missed.
export const answerChapter = (plan, state, passed) => {
  const step = currentStep(plan, state)
  if (!step) return state
  const index = state.index + 1
  return {
    ...state,
    index,
    done: index >= state.steps.length,
    passed: passed ? [...state.passed, chapterKey(step)] : state.passed,
    missed: passed ? state.missed : [...state.missed, chapterKey(step)],
  }
}

// testResult is what a test opened: the chapters passed, the highest level
// with one passed (null when none), and the tally of each level tested.
export const testResult = (plan, state) => {
  const passed = new Set(state.passed)
  let reached = null
  const levels = []
  state.steps.forEach(step => {
    let line = levels.find(l => l.index === step.level)
    if (!line) {
      line = {
        index: step.level,
        id: plan[step.level].id,
        name: plan[step.level].name,
        passed: 0,
        total: 0,
        chapters: [],
      }
      levels.push(line)
    }
    const ok = passed.has(chapterKey(step))
    line.total += 1
    line.passed += ok ? 1 : 0
    line.chapters.push({ key: chapterKey(step), name: step.chapter.name, ok })
    if (ok && (reached === null || step.level > reached)) reached = step.level
  })
  return {
    reached: reached === null ? null : plan[reached].id,
    opened: state.steps.map(chapterKey).filter(key => passed.has(key)),
    levels,
  }
}
