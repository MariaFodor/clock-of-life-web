import { describe, expect, it } from 'vitest'
import {
  REFERENCE_PROFILE,
  relativeRisk,
  scoreEstimate,
  scoreWhatIf,
  attributions,
} from './mockScoring'
import type { Profile } from './types'

describe('mock scoring', () => {
  // The mock has to refuse exactly what the service refuses, or the dev harness disagrees with
  // production about which scenarios exist at all — which is how a Sleep slider survived for as
  // long as it did. Both bounds went untested through two review rounds.
  it('refuses the doses the service refuses, and accepts the ones it accepts', () => {
    const smoker: Profile = {
      country: 'RO', age: 55, sex: 'M', smoke: 2, cigs_day: 20, pa_min: 300, sleep: 7,
      waist: 100, bmi: 27,
    }
    // Zero from a current smoker is quitting, and the model reads it as "unanswered" instead.
    expect(() => scoreWhatIf(smoker, { cigs_day: 0 })).toThrow(/quitting/i)
    // 80 matches Profile::validate and the service's lever; 81 does not.
    expect(() => scoreWhatIf(smoker, { cigs_day: 80 })).not.toThrow()
    expect(() => scoreWhatIf(smoker, { cigs_day: 81 })).toThrow(/between 0 and 80/)
    // A never-smoker's zero is not a refusal — nothing to quit.
    expect(() => scoreWhatIf({ ...smoker, smoke: 0, cigs_day: 0 }, { cigs_day: 0 })).not.toThrow()
  })

  it('centres relative risk on the reference person (RR ≈ 1)', () => {
    expect(relativeRisk(REFERENCE_PROFILE)).toBeCloseTo(1, 5)
  })

  it('gives a higher-risk profile RR > 1 and fewer years', () => {
    const risky: Profile = { ...REFERENCE_PROFILE, smoke: 2, waist: 120, diabetes: true, pa_min: 0 }
    expect(relativeRisk(risky)).toBeGreaterThan(1)
    expect(scoreEstimate(risky).estimate_years).toBeLessThan(scoreEstimate(REFERENCE_PROFILE).estimate_years)
  })

  it('always returns an interval bracketing the point estimate', () => {
    const e = scoreEstimate({ ...REFERENCE_PROFILE, age: 30 })
    expect(e.interval[0]).toBeLessThan(e.estimate_years)
    expect(e.interval[1]).toBeGreaterThan(e.estimate_years)
  })

  it('widens the interval for younger users', () => {
    const young = scoreEstimate({ ...REFERENCE_PROFILE, age: 30 })
    const old = scoreEstimate({ ...REFERENCE_PROFILE, age: 70 })
    const youngRel = (young.interval[1] - young.interval[0]) / young.estimate_years
    const oldRel = (old.interval[1] - old.interval[0]) / old.estimate_years
    expect(youngRel).toBeGreaterThan(oldRel)
  })

  it('scores quitting smoking as a gain and notes the long-run caveat', () => {
    const smoker: Profile = { ...REFERENCE_PROFILE, smoke: 2 }
    const wi = scoreWhatIf(smoker, { smoke: 0 })
    expect(wi.delta_years).toBeGreaterThan(0)
    expect(wi.note).toMatch(/cessation/i)
  })

  it('attributes smoking a negative contribution for a smoker', () => {
    const smoker: Profile = { ...REFERENCE_PROFILE, smoke: 2 }
    const smokingRow = attributions(smoker).find((a) => a.factor === 'Smoking')
    expect(smokingRow).toBeDefined()
    expect(smokingRow!.delta_years).toBeLessThan(0)
    expect(smokingRow!.role).toBe('lever')
  })
})

describe('literature levers (mock parity with the service)', () => {
  const base: Profile = {
    country: 'RO', age: 50, sex: 'M', smoke: 0, pa_min: 600, sleep: 7, waist: 94, bmi: 28.9,
  }

  it('is neutral for unanswered levers and at their reference values', () => {
    const unanswered = scoreEstimate(base).estimate_years
    const atReference = scoreEstimate({
      ...base, diet_score: 2.5, sitting_hours: 6, stress_score: 6.11, alcohol: 'light',
    }).estimate_years
    expect(atReference).toBe(unanswered)
  })

  it('moves the estimate in the evidenced direction', () => {
    const years = (p: Partial<Profile>) => scoreEstimate({ ...base, ...p }).estimate_years
    const b = years({})
    expect(years({ alcohol: 'heavy' })).toBeLessThan(years({ alcohol: 'none' }))
    expect(years({ diet_score: 5 })).toBeGreaterThan(years({ diet_score: 0 }))
    expect(years({ sitting_hours: 12 })).toBeLessThan(b)
    expect(years({ stress_score: 16 })).toBeLessThan(b)
    expect(years({ mobility: 1 })).toBeLessThan(b)
    expect(years({ pm25: 25, ndvi: 0.3 })).toBeLessThan(years({ pm25: 8, ndvi: 0.7 }))
  })

  it('explains the levers in the Why? breakdown and prices them in What-If', () => {
    const keys = attributions({ ...base, alcohol: 'heavy', diet_score: 0 }).map((a) => a.factor)
    expect(keys).toContain('Alcohol')
    expect(keys).toContain('Diet quality')
    const wi = scoreWhatIf({ ...base, alcohol: 'heavy', diet_score: 0 },
                           { alcohol: 'none', diet_score: 5 })
    expect(wi.delta_years).toBeGreaterThan(0)
  })
})
