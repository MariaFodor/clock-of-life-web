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
  ENV_REFERENCE,
  envReference,
  relativeRisk,
} from './mockScoring'
import { effectiveCigsDay, REDUCTION_NOTE, SMOKER_MEAN_CIGS } from './modelRules'
import type { Profile } from './types'

// The bundle version is READ from the service's own default, never restated here. It was pinned to
// a literal, and the literal went stale at v2.2.0 while the service moved to v3.0.1 — so this
// suite, the one guard against mock-vs-service drift, spent three bundle versions failing to
// collect. A drift guard that needs manual updating to keep working is a drift guard that stops
// working. Resolved relative to this file where the runner exposes a file URL, else relative to
// the working directory — so the suite behaves the same under vitest, an IDE, or a workspace runner.
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
/** The bundle directory `clock-of-life-service/src/main.rs` falls back to when CLOCK_BUNDLE is unset. */
function serviceDefaultBundle(): string {
  const mainRs = resolve(SERVICE_DIR, 'src/main.rs')
  if (!existsSync(mainRs)) {
    throw new Error(
      `Parity fixture missing: ${mainRs}. This suite needs the sibling clock-of-life-service ` +
        'checkout (its vendored bundle is the source of truth for the literature coefficients).',
    )
  }
  // matchAll, not exec: exec silently takes the first hit, so if the service ever grows a second
  // bundle-selection site this would quietly pin the wrong one — the same class of silent staleness
  // that made the literal go bad.
  const found = [
    ...readFileSync(mainRs, 'utf8').matchAll(
      /unwrap_or_else\(\|_\|\s*"bundle\/([^"]+)"\.to_string\(\)\)/g,
    ),
  ]
  if (found.length !== 1) {
    throw new Error(
      found.length === 0
        ? `Could not read the default bundle version out of ${mainRs}. If the service changed how ` +
          'it selects a bundle, update this reader — do not re-pin a literal here, that is what ' +
          'went stale.'
        : `${mainRs} names ${found.length} default bundles (${found.map((f) => f[1]).join(', ')}); ` +
          'this reader cannot tell which one the service uses. Make the service unambiguous.',
    )
  }
  return found[0][1]
}

const BUNDLE_VERSION = serviceDefaultBundle()
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
        `which holds: ${found}. The service's main.rs points at a bundle it does not ship — fix ` +
        'that, not this test.',
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

/** The scoreable countries and each one's measured exposure reference, read from the bundle itself. */
const MANIFEST = resolve(SERVICE_DIR, 'bundle', BUNDLE_VERSION, 'manifest.json')
function bundleEnvReferences(): Record<string, { pm25: number; ndvi: number | null }> {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as { countries: string[] }
  const out: Record<string, { pm25: number; ndvi: number | null }> = {}
  for (const iso of manifest.countries) {
    const path = resolve(SERVICE_DIR, 'bundle', BUNDLE_VERSION, 'baselines', `${iso}.json`)
    const baseline = JSON.parse(readFileSync(path, 'utf8')) as {
      env_reference?: { pm25: number; ndvi: number | null }
    }
    if (!baseline.env_reference) {
      throw new Error(
        `Parity fixture broken: ${iso}.json carries no env_reference, but the bundle's own release ` +
          'gate requires one for every scoreable country. The bundle is wrong, not this test.',
      )
    }
    out[iso] = baseline.env_reference
  }
  return out
}

// The service's ENV reference points used to live in code as two constants. They now live in the
// bundle, per country, so the assertion below reads them from there — but scoring.rs is still read, for
// the grep gate that proves the old constants are gone rather than merely unused here.
const SCORING_RS = resolve(SERVICE_DIR, 'src/scoring.rs')
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

  it.each(CONTINUOUS)('%s: a +1 SD answer moves the score by exactly its beta', (key) => {
    // The accessors could still drift from the arithmetic if z() ever read a different map, so
    // assert the behaviour: a one-standard-deviation answer must move the linear predictor by
    // exactly the bundle's beta (PR#2 review, residual note on gap 1).
    const { mean, sd } = effectiveStandardizer(key)
    const field = { diet: 'diet_score', sedentary: 'sitting_hours', stress: 'stress_score' }[key]!
    const base: Profile = {
      country: 'RO', age: 50, sex: 'M', smoke: 0, pa_min: 600, sleep: 7, waist: 94, bmi: 28.9,
    }
    const atMean = Math.log(relativeRisk({ ...base, [field]: mean }))
    const plusOneSd = Math.log(relativeRisk({ ...base, [field]: mean + sd }))
    expect(plusOneSd - atMean).toBeCloseTo(bundle.literature[key].beta!, 10)
  })

  // These were two constants — RO_PM25_REF = 14.0 and RO_NDVI_REF = 0.5 — applied to every country and
  // wrong for Romania too. They are now per-country measured values in the bundle, so the assertion
  // covers all thirty rather than restating two numbers.
  it("every country's exposure reference matches the bundle's own baseline, and none is missing", () => {
    const fromBundle = bundleEnvReferences()
    expect(Object.keys(ENV_REFERENCE).sort()).toEqual(Object.keys(fromBundle).sort())
    for (const [iso, ref] of Object.entries(fromBundle)) {
      expect(ENV_REFERENCE[iso].pm25, `${iso} pm25`).toBe(ref.pm25)
      expect(ENV_REFERENCE[iso].ndvi, `${iso} ndvi`).toBe(ref.ndvi)
    }
  })

  it('the deleted constants are really gone from the service, not merely unused here', () => {
    const src = readFileSync(SCORING_RS, 'utf8')
    // A grep gate, because the failure this guards against is the mock being updated while the service
    // keeps a second, stale copy of the same number — which is how these two files drifted before.
    expect(src).not.toMatch(/^\s*pub const RO_PM25_REF/m)
    expect(src).not.toMatch(/^\s*pub const RO_NDVI_REF/m)
  })

  it('a reader at their own country average scores exactly neutral, in every scoreable country', () => {
    // The property the old constants only had for a reader living at an invented 14.0 µg/m³.
    for (const [iso, ref] of Object.entries(ENV_REFERENCE)) {
      const base: Profile = {
        country: iso, age: 50, sex: 'M', smoke: 0, pa_min: 600, sleep: 7, waist: 94, bmi: 28.9,
      }
      const bare = Math.log(relativeRisk(base))
      const atAverage = Math.log(relativeRisk({ ...base, pm25: ref.pm25, ndvi: ref.ndvi }))
      expect(atAverage - bare, `${iso} is neutral at its own average`).toBeCloseTo(0, 10)
    }
  })

  it('the same air is priced differently in two countries with different averages', () => {
    const at = (country: string) => {
      const p: Profile = {
        country, age: 50, sex: 'M', smoke: 0, pa_min: 600, sleep: 7, waist: 94, bmi: 28.9, pm25: 12,
      }
      return Math.log(relativeRisk(p))
    }
    // Finland 4.118 vs Poland 14.732: 12 µg/m³ is dirty in Helsinki and clean in Warsaw.
    expect(at('FI')).toBeGreaterThan(at('PL'))
  })

  it('EL still resolves, because stored profiles say EL and the bundle says GR', () => {
    expect(envReference('EL')).toEqual(envReference('GR'))
  })

  // The mock told a DIFFERENT evidence story from the service: it said reduction "trials" show
  // less benefit, while the service documents on the same branch that the claim is COHORT evidence
  // and that reduction trials are powered for cessation, not mortality — and it shipped with
  // neither DOI, against this project's citation rule. Two copies of a sentence about evidence is
  // one copy too many, so it is pinned character-for-character.
  it("the reduction note matches the service's, word for word", () => {
    const src = readFileSync(SCORING_RS, 'utf8')
    // Line-anchored and counted, like every other reader in this file. Unanchored `.exec` took the
    // first hit, so a one-line commented-out copy above the real const silently won the match and
    // the suite went green while the two repos had actually drifted — demonstrated in review.
    // [\s\S] not . — the literal's line continuations are backslash-NEWLINE, which `.` cannot cross.
    const hits = [
      ...src.matchAll(/^\s*(?:pub )?const REDUCTION_NOTE: &str =\s*("(?:[^"\\]|\\[\s\S])*")\s*;/gm),
    ]
    if (hits.length !== 1) {
      throw new Error(
        hits.length === 0
          ? `Could not find REDUCTION_NOTE in ${SCORING_RS}. If the service renamed or ` +
            'restructured it, update this reader — do not drop the pin, the two copies drifted ' +
            'the moment they existed.'
          : `${SCORING_RS} declares REDUCTION_NOTE ${hits.length} times; this reader cannot tell ` +
            'which one the service returns.',
      )
    }
    const m = hits[0]
    // Rebuild the Rust literal: `\` at end-of-line eats the newline AND the following indentation.
    const fromService = m[1]
      .slice(1, -1)
      .replace(/\\\n\s*/g, '')
      .replace(/\\"/g, '"')
    expect(REDUCTION_NOTE).toBe(fromService)
    // And the claims it makes carry their sources where a user can see them.
    expect(REDUCTION_NOTE).toContain('doi.org/10.1136/tc.2005.011932')
    expect(REDUCTION_NOTE).toContain('doi.org/10.1093/aje/kwf150')
    expect(REDUCTION_NOTE).not.toContain('trials')
  })

  // The mock did not replicate this imputation at all, so mock and service disagreed about what a
  // current smoker who never gave a dose actually scores — and What-If's dose lever reasons about
  // exactly that number.
  it("an undeclared smoker's imputed dose matches the bundle", () => {
    const fromBundle = (
      JSON.parse(readFileSync(BUNDLE, 'utf8')) as {
        conditional_defaults?: Record<string, number>
      }
    ).conditional_defaults?.cigs_day_when_current_smoker
    expect(fromBundle).toBeDefined()
    expect(SMOKER_MEAN_CIGS).toBe(fromBundle)
    // And it is the number the scorer reaches for, not just a constant sitting next to it.
    expect(effectiveCigsDay({ smoke: 2, cigs_day: 0 })).toBe(fromBundle)
    expect(effectiveCigsDay({ smoke: 2, cigs_day: 15 })).toBe(15)
    expect(effectiveCigsDay({ smoke: 1, cigs_day: 15 })).toBe(0)
  })
})
