// Contract test: the interview's persisted question codes must exist in the service's seed.
// This is the guard that was missing when the web shipped invented codes (AGE, SMK, …) that the
// service 400-rejected, so no answer was ever persisted (REVIEW-2026-09-09 W1). It reads the
// sibling repo's seed directly so the two can never drift silently again.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALL_QUESTIONS, DEFAULT_ANSWERS, answersForApi, buildProfile, dietScore, stressScore } from './questionnaire'

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
    // LEV-04 closed the Q23 gap: every seeded question is now asked.
    const asked = new Set(ALL_QUESTIONS.map((q) => q.apiCode).filter(Boolean))
    const notAsked = SEEDED_CODES.filter((c) => !asked.has(c))
    expect(notAsked).toEqual([])

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


describe('aggregation formulas (LEV-04)', () => {
  it('computes the Mediterranean diet score with the declared thresholds', () => {
    const best = { DIET_VEG: 'daily', DIET_FRUIT: 'most', DIET_GRAIN: 'few', DIET_FISH: 'few', DIET_MEAT: 'weekly' }
    const worst = { DIET_VEG: 'never', DIET_FRUIT: 'weekly', DIET_GRAIN: 'never', DIET_FISH: 'never', DIET_MEAT: 'daily' }
    expect(dietScore(best)).toBe(5)
    expect(dietScore(worst)).toBe(0)
    expect(dietScore({ ...best, DIET_MEAT: 'few' })).toBe(4) // meat 2-4x/week loses the meat point
    expect(dietScore({ DIET_VEG: 'daily' })).toBeUndefined() // partial answers never guess
  })

  it('scores PSS-4 with items b and c reverse-scored', () => {
    expect(stressScore({ STRESS: [4, 0, 0, 4] })).toBe(16) // worst
    expect(stressScore({ STRESS: [0, 4, 4, 0] })).toBe(0) // best
    expect(stressScore({ STRESS: [2, 2, 2, 2] })).toBe(8)
    expect(stressScore({ STRESS: [2, 2, 2] })).toBeUndefined() // incomplete battery
  })

  it('maps the levers into the profile only when answered', () => {
    const base = buildProfile(DEFAULT_ANSWERS).profile
    expect(base.diet_score).toBeUndefined()
    expect(base.alcohol).toBeUndefined()
    expect(base.sitting_hours).toBeUndefined()
    expect(base.stress_score).toBeUndefined()
    expect(base.mobility).toBeUndefined()

    const full = buildProfile({
      ...DEFAULT_ANSWERS,
      SEDENTARY: '8-10',
      ALC: 'heavy',
      DIET_VEG: 'daily', DIET_FRUIT: 'daily', DIET_GRAIN: 'few', DIET_FISH: 'few', DIET_MEAT: 'weekly',
      STRESS: [3, 1, 1, 3],
      HIST: ['mobility'],
      LOCATION: { name: 'Cluj-Napoca', country: 'RO', pm25: 16, ndvi: 0.45 },
    }).profile
    expect(full.sitting_hours).toBe(9)
    expect(full.alcohol).toBe('heavy')
    expect(full.diet_score).toBe(5)
    expect(full.stress_score).toBe(12)
    expect(full.mobility).toBe(1)
    expect(full.pm25).toBe(16)
    expect(full.ndvi).toBe(0.45)
  })

  it('persists batteries and the location under their canonical codes', () => {
    const a = { ...DEFAULT_ANSWERS, STRESS: [1, 2, 3, 4], MOOD: [1, 2],
                LOCATION: { name: 'Iasi', country: 'RO', pm25: 18, ndvi: 0.4 } }
    const codes = answersForApi(a).map((p) => p.question_code)
    expect(codes).toContain('Q19_stress')
    expect(codes).toContain('Q20_mood')
    expect(codes).toContain('Q23_location')
    // An incomplete battery is not "answered".
    const partial = answersForApi({ ...DEFAULT_ANSWERS, STRESS: [1, undefined, 3, 4] as unknown as number[] })
    expect(partial.map((p) => p.question_code)).not.toContain('Q19_stress')
  })
})
