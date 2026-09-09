// Contract test: the interview's persisted question codes must exist in the service's seed.
// This is the guard that was missing when the web shipped invented codes (AGE, SMK, …) that the
// service 400-rejected, so no answer was ever persisted (REVIEW-2026-09-09 W1). It reads the
// sibling repo's seed directly so the two can never drift silently again.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALL_QUESTIONS, DEFAULT_ANSWERS, answersForApi } from './questionnaire'

const SEED_PATH = resolve(process.cwd(), '../clock-of-life-service/seeds/questions.json')
if (!existsSync(SEED_PATH)) {
  throw new Error(
    `Contract fixture missing: ${SEED_PATH}. This suite needs the sibling clock-of-life-service ` +
      'checkout (the question seed is the contract source of truth). Check out both repos side by side.',
  )
}
// Read once — the two tests must see the same snapshot.
const SEEDED_CODES: string[] = (
  JSON.parse(readFileSync(SEED_PATH, 'utf8')) as Array<{ code: string }>
).map((q) => q.code)

describe('questionnaire ↔ service seed contract', () => {
  it('every apiCode the web persists exists in the service question seed', () => {
    const seeded = new Set(SEEDED_CODES)
    const unknown = ALL_QUESTIONS.filter((q) => q.apiCode && !seeded.has(q.apiCode)).map(
      (q) => q.apiCode,
    )
    expect(unknown).toEqual([])
  })

  it('pins the known coverage gaps so a change is a conscious decision', () => {
    // Seeded questions the web does not ask yet: Q23 location (REVIEW W4 — ENV term inert).
    const asked = new Set(ALL_QUESTIONS.map((q) => q.apiCode).filter(Boolean))
    const notAsked = SEEDED_CODES.filter((c) => !asked.has(c))
    expect(notAsked).toEqual(['Q23_location'])

    // Asked questions with no seeded row, therefore not persisted (REVIEW W1/S8).
    const unpersisted = ALL_QUESTIONS.filter((q) => !q.apiCode).map((q) => q.code)
    expect(unpersisted).toEqual(['HEIGHT', 'WEIGHT', 'SBP'])
  })

  it('sends canonical codes and drops hidden conditional answers', () => {
    // A former smoker answers the quit-year, then switches back to "never": the stale
    // conditional answers must not be persisted.
    const stale = { ...DEFAULT_ANSWERS, SMK: 'never', YEARS_QUIT: 2015, CIGS: 10 }
    const payload = answersForApi(stale)
    const codes = payload.map((p) => p.question_code)
    expect(codes).toContain('Q5_smoking')
    expect(codes).not.toContain('Q6_quit_year')
    expect(codes).not.toContain('Q7_cigs_per_day')
    // Every emitted code is canonical (Qn_*), never an internal UI key.
    expect(codes.every((c) => /^Q\d+_/.test(c))).toBe(true)

    // And for a current smoker the dose question is included, under its canonical code.
    const smoker = { ...DEFAULT_ANSWERS, SMK: 'current', CIGS: 10 }
    expect(answersForApi(smoker).map((p) => p.question_code)).toContain('Q7_cigs_per_day')
  })
})
