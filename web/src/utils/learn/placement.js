// The placement test of a pack finds where a person starts. It goes through
// the chapters of a level in order, its modules one after the other, then
// the next level: two questions a chapter, both right to pass it, and it
// stops at the first chapter missed. When the very first chapter of the
// level chosen to start is missed, it goes down a level, so that only the
// levels below a level passed count as known.

import { compile } from './engine.js'

// QUESTIONS_BY_CHAPTER is how many questions a chapter asks, all right to
// pass it.
export const QUESTIONS_BY_CHAPTER = 2

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

// startTest is the test before the first answer, from the level chosen.
export const startTest = (plan, start = 0) => ({
  level: Math.max(0, Math.min(start, plan.length - 1)),
  index: 0,
  // floor is the lowest level tested: the levels below count as known.
  floor: Math.max(0, Math.min(start, plan.length - 1)),
  // ceiling is the level whose first chapter was missed, when the test went
  // down from it.
  ceiling: null,
  passed: [],
  done: false,
  reached: null,
})

const finish = (state, level) => ({ ...state, done: true, reached: level })

// settle moves past the end of a level, and past the levels with no
// chapter, which pass by themselves.
const settle = (plan, state) => {
  let s = state
  while (!s.done && s.index >= plan[s.level].chapters.length) {
    if (s.level + 1 >= plan.length) return finish(s, s.level)
    if (s.level + 1 === s.ceiling) return finish(s, s.ceiling)
    s = { ...s, level: s.level + 1, index: 0 }
  }
  return s
}

// currentStep is the chapter being tested, or null once done.
export const currentStep = (plan, state) =>
  state.done ? null : plan[state.level]?.chapters[state.index] || null

// answerChapter moves the test on once a chapter was passed or missed.
export const answerChapter = (plan, state, passed) => {
  const s = settle(plan, state)
  if (s.done) return s
  const step = plan[s.level].chapters[s.index]
  if (passed) {
    return settle(plan, {
      ...s,
      index: s.index + 1,
      passed: [...s.passed, chapterKey(step)],
    })
  }
  if (s.index === 0 && s.level === s.floor && s.level > 0) {
    return settle(plan, {
      ...s,
      ceiling: s.level,
      level: s.level - 1,
      floor: s.level - 1,
      index: 0,
    })
  }
  return finish(s, s.level)
}

// beginTest is the start, past the levels with no chapter.
export const beginTest = (plan, start = 0) =>
  settle(plan, startTest(plan, start))

// testResult is what a test opened: every chapter of the levels below the
// lowest one tested, and the chapters passed.
export const testResult = (plan, state) => {
  const opened = []
  plan.forEach((level, i) => {
    if (i < state.floor) opened.push(...level.chapters.map(chapterKey))
  })
  opened.push(...state.passed)
  const set = new Set(opened)
  const levels = plan.map((level, i) => {
    const open = level.chapters.filter(step => set.has(chapterKey(step)))
    const next = level.chapters.find(step => !set.has(chapterKey(step)))
    return {
      id: level.id,
      name: level.name,
      opened: open.length,
      total: level.chapters.length,
      next: next ? next.chapter.name : null,
      tested: i <= Math.max(state.reached, state.ceiling ?? -1),
    }
  })
  return { reached: plan[state.reached]?.id, opened, levels }
}
