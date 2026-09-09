// Drift guard: the mock scorer's literature constants must match the shipped model bundle.
//
// The mock is deliberately illustrative for the FITTED coefficients, but the literature levers are
// the real shipped numbers — if the bundle changes them and the mock silently doesn't, the dev
// harness and every test score a different world than production (REVIEW PR#1 B2).
//
// The assertions deliberately go through `effectiveStandardizer`/`effectiveBeta` — what the scorer
// actually uses — rather than the source objects, so a later override inside STD/BETA cannot slip
// past this guard (PR#2 review, gap 1).
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ALCOHOL_LEVELS,
  ALCOHOL_REFERENCE_LEVEL,
  effectiveBeta,
  effectiveStandardizer,
  RO_NDVI_REF,
  RO_PM25_REF,
} from './mockScoring'

// Pinned to the bundle version the service defaults to (its src/main.rs). Resolved relative to this
// file where the runner exposes a file URL, else relative to the working directory — so the suite
// behaves the same under vitest, an IDE, or a workspace runner.
const BUNDLE_VERSION = 'model-v2.2.0'
const SERVICE_DIR = (() => {
  try {
    if (import.meta.url?.startsWith('file:')) {
      return resolve(dirname(fileURLToPath(import.meta.url)), '../../../clock-of-life-service')
    }
  } catch {
    /* fall through to the cwd-relative path */
  }
  return resolve(process.cwd(), '../clock-of-life-service')
})()
const BUNDLE = resolve(SERVICE_DIR, 'bundle', BUNDLE_VERSION, 'coefficients.json')

if (!existsSync(BUNDLE)) {
  // Distinguish the two causes: no sibling checkout, vs the bundle version moved on.
  const bundleDir = resolve(SERVICE_DIR, 'bundle')
  const found = existsSync(bundleDir) ? readdirSync(bundleDir).join(', ') : null
  throw new Error(
    found === null
      ? `Parity fixture missing: ${BUNDLE}. This suite needs the sibling clock-of-life-service ` +
        'checkout (its vendored bundle is the source of truth for the literature coefficients).'
      : `Parity fixture missing: ${BUNDLE_VERSION} is not in the sibling service bundle/ directory, ` +
        `which holds: ${found}. Update BUNDLE_VERSION here (and the mock's constants) to match.`,
  )
}

interface LiteratureFeature {
  beta?: number
  levels?: Record<string, number>
  reference?: { kind: string; level?: string }
}
const bundle = JSON.parse(readFileSync(BUNDLE, 'utf8')) as {
  literature: Record<string, LiteratureFeature>
  standardizer: Record<string, { mean: number; sd: number }>
}

// The service's own ENV reference points live in code, not the bundle — read them from the source
// of truth rather than restating them here, which would make the assertion a tautology (gap 3).
function serviceConst(name: string): number {
  const src = readFileSync(resolve(SERVICE_DIR, 'src/scoring.rs'), 'utf8')
  const m = new RegExp(`pub const ${name}: f64 = ([0-9.]+);`).exec(src)
  if (!m) throw new Error(`could not find ${name} in the service's scoring.rs`)
  return Number(m[1])
}

const CONTINUOUS = ['diet', 'sedentary', 'stress'] as const

describe('mock ↔ bundle parity (literature levers)', () => {
  it.each(CONTINUOUS)('%s: the standardizer the scorer uses matches the bundle', (key) => {
    const shipped = bundle.standardizer[key]
    expect(effectiveStandardizer(key)).toEqual({ mean: shipped.mean, sd: shipped.sd })
  })

  it.each(CONTINUOUS)('%s: the beta the scorer uses matches the bundle', (key) => {
    expect(effectiveBeta(key)).toBe(bundle.literature[key].beta)
  })

  it('alcohol levels match the bundle, and both centre on the same level', () => {
    expect(ALCOHOL_LEVELS).toEqual(bundle.literature.alcohol.levels)
    expect(ALCOHOL_REFERENCE_LEVEL).toBe(bundle.literature.alcohol.reference?.level)
  })

  it('the environment reference points match the service constants', () => {
    expect(RO_PM25_REF).toBe(serviceConst('RO_PM25_REF'))
    expect(RO_NDVI_REF).toBe(serviceConst('RO_NDVI_REF'))
  })
})
