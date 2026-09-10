// Contract test: the interview's persisted question codes must exist in the service's seed.
// This is the guard that was missing when the web shipped invented codes (AGE, SMK, …) that the
// service 400-rejected, so no answer was ever persisted (REVIEW-2026-09-09 W1). It reads the
// sibling repo's seed directly so the two can never drift silently again.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ALL_QUESTIONS,
  CONFIDENCE_LABEL,
  DEFAULT_ANSWERS,
  SECTIONS,
  answerProgress,
  answersForApi,
  buildProfile,
  dietScore,
  isVisible,
  stressScore,
} from './questionnaire'

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

  // Still open (REVIEW-2026-09-09 W10, half-closed by LEV-04): the CODES are pinned here, but the
  // persisted VALUES are still internal option keys ('few', 'u15', 'hbp') and battery indices, where
  // the seed stores display labels. Q19 is now a 4-item array as W10 asked; the value vocabulary is
  // the remaining half and needs a service-side decision before anything reads answers back.
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

  // The clamp briefly stood at 60, to match a What-If bound that has since moved to 80 — which
  // recorded a 75-a-day smoker as smoking 60, silently, and changed their estimate. Both halves are
  // pinned: what we keep, and that we say something when we cannot keep it.
  it("keeps a heavy smoker's real answer, and speaks up when it cannot", () => {
    // COUNTRY is part of a real profile now and deliberately NOT in DEFAULT_ANSWERS: a pre-filled
    // country would be the most harmful default in the questionnaire, since it picks the life table.
    // buildProfile says so through `errors` when it is missing, so the fixture supplies it.
    const smoker = { ...DEFAULT_ANSWERS, COUNTRY: { iso2: 'RO', iso3: 'ROU', name: 'Romania' }, SMK: 'current' as const }
    expect(buildProfile({ ...smoker, CIGS: 75 }).profile.cigs_day).toBe(75)
    expect(buildProfile({ ...smoker, CIGS: 75 }).errors).toEqual([])
    expect(buildProfile({ ...smoker, CIGS: 80 }).profile.cigs_day).toBe(80)

    const tooMany = buildProfile({ ...smoker, CIGS: 100 })
    expect(tooMany.profile.cigs_day).toBe(80)
    expect(tooMany.errors.join(' ')).toMatch(/cigarettes per day/i)

    // A former smoker's dose is not scored, so it is not carried.
    expect(buildProfile({ ...DEFAULT_ANSWERS, SMK: 'former', CIGS: 40 }).profile.cigs_day).toBe(0)
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

// UX-6: the interview's bottom bar says "N of M answered", so the two counts have to mean what a
// reader would take them to mean — the questions on THIS page, and the ones they have filled in.
describe('how much of the interview is answered (UX-6)', () => {
  it('counts the questions on screen, and the standard answers among them', () => {
    // The starting state of a first visit. Both numbers are pinned rather than derived here: a
    // question added to the questionnaire should make somebody look at this line and agree with it.
    expect(answerProgress(DEFAULT_ANSWERS)).toEqual({ answered: 12, total: 24 })
  })

  it('grows the total when an answer reveals more questions', () => {
    const never = answerProgress({ ...DEFAULT_ANSWERS, SMK: 'never' })
    const former = answerProgress({ ...DEFAULT_ANSWERS, SMK: 'former' })
    // "I used to smoke" reveals the quit year and the dose: there is genuinely more to answer, and a
    // total that ignored it would drift away from the page it describes.
    expect(former.total).toBe(never.total + 2)
    expect(former.answered).toBe(never.answered)
    expect(answerProgress({ ...DEFAULT_ANSWERS, SMK: 'former', YEARS_QUIT: 2015, CIGS: 10 }))
      .toEqual({ answered: never.answered + 2, total: never.total + 2 })
  })

  it('leaves the tick-box questions out of both counts', () => {
    // Ticking nothing under "has a doctor ever told you…" is a complete answer for a healthy person
    // and indistinguishable from never having looked, so neither count claims to know.
    const untouched = answerProgress(DEFAULT_ANSWERS)
    const ticked = answerProgress({ ...DEFAULT_ANSWERS, COND: ['diabetes'], HIST: ['cvd'] })
    expect(ticked).toEqual(untouched)
    // The two of them (conditions, history) are absent from the total, not merely never answered.
    const onScreen = ALL_QUESTIONS.filter((q) => isVisible(q, DEFAULT_ANSWERS)).length
    expect(untouched.total).toBe(onScreen - 2)
  })

  it('counts a scale once, and only when every line of it is answered', () => {
    const base = answerProgress(DEFAULT_ANSWERS)
    // The shape a half-filled battery really holds: the field seeds one slot per item.
    const half = { ...DEFAULT_ANSWERS, STRESS: [1, 2, undefined, undefined] as unknown as number[] }
    expect(answerProgress(half).answered).toBe(base.answered)
    expect(answerProgress({ ...DEFAULT_ANSWERS, STRESS: [1, 2, 3, 0] }).answered).toBe(base.answered + 1)
  })

  it('counts the country, whose answer is an object rather than a value', () => {
    const base = answerProgress(DEFAULT_ANSWERS)
    const withCountry = { ...DEFAULT_ANSWERS, COUNTRY: { iso2: 'RO', iso3: 'ROU', name: 'Romania' } }
    expect(answerProgress(withCountry)).toEqual({ answered: base.answered + 1, total: base.total })
  })

  it('words every evidence grade in the app’s one scale, in lower case and without "confidence"', () => {
    // The WHOLE record, not only the grades some section happens to carry today: `low` reaches no
    // screen yet, and a grade nothing renders is exactly where a second vocabulary creeps back in.
    const graded = Object.entries(CONFIDENCE_LABEL)
    expect(graded.map(([grade]) => grade).sort()).toEqual(['high', 'low', 'medium'])

    // And the scale is the app's existing one, read from where it is already written down rather
    // than restated here — the same reason this file reads the service's seed instead of copying it.
    // The interview's section chips and the attributed factors on the Why page are seen by the same
    // reader, so "medium/limited evidence" beside "moderate/weak evidence" is two scales for one idea.
    const framing = readFileSync(resolve(process.cwd(), 'src/components/framing.tsx'), 'utf8')
    for (const [, label] of graded) {
      expect(label).toBeTruthy()
      expect(label).toBe(label.toLowerCase())
      // "CONFIDENCE: HIGH" in the margin of a health questionnaire reads as a verdict on the reader.
      expect(label).not.toMatch(/confidence/i)
      expect(framing).toContain(`'${label}'`)
    }

    // Every grade a section actually carries is one the record words.
    for (const section of SECTIONS) {
      if (section.confidence) expect(CONFIDENCE_LABEL[section.confidence]).toBeTruthy()
    }
  })
})
