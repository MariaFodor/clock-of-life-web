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
