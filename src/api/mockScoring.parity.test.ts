// Drift guard: the mock scorer's literature constants must match the shipped bundle.
//
// The mock is deliberately illustrative for the FITTED coefficients, but the literature levers are
// the real shipped numbers — if the bundle changes them and the mock silently doesn't, the dev
// harness and every test scores a different world than production (REVIEW PR#1 B2).
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LITERATURE_STD, LITERATURE_BETA, ALCOHOL_LEVELS, RO_PM25_REF, RO_NDVI_REF } from './mockScoring'

const BUNDLE = resolve(process.cwd(), '../clock-of-life-service/bundle/model-v2.2.0/coefficients.json')
if (!existsSync(BUNDLE)) {
  throw new Error(
    `Parity fixture missing: ${BUNDLE}. This suite needs the sibling clock-of-life-service checkout ` +
      '(its vendored bundle is the source of truth for the literature coefficients).',
  )
}
const literature = (
  JSON.parse(readFileSync(BUNDLE, 'utf8')) as {
    literature: Record<
      string,
      { beta?: number; levels?: Record<string, number>; standardizer?: { mean: number; sd: number } }
    >
    standardizer: Record<string, { mean: number; sd: number }>
  }
)

describe('mock ↔ bundle parity (literature levers)', () => {
  it.each(['diet', 'sedentary', 'stress'])('%s standardizer matches the bundle', (key) => {
    const shipped = literature.standardizer[key]
    expect(LITERATURE_STD[key].mean).toBeCloseTo(shipped.mean, 2)
    expect(LITERATURE_STD[key].sd).toBeCloseTo(shipped.sd, 2)
  })

  it.each(['diet', 'sedentary', 'stress'])('%s beta matches the bundle', (key) => {
    expect(LITERATURE_BETA[key]).toBeCloseTo(literature.literature[key].beta!, 6)
  })

  it('alcohol levels and the centring reference match the bundle', () => {
    expect(ALCOHOL_LEVELS).toEqual(literature.literature.alcohol.levels)
  })

  it('the environment reference point matches the service formula', () => {
    // scoring.rs RO_PM25_REF / RO_NDVI_REF — illustrative RO reference (RES-04).
    expect(RO_PM25_REF).toBe(14.0)
    expect(RO_NDVI_REF).toBe(0.5)
  })
})
