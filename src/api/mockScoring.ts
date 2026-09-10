// A compact, deterministic re-implementation of the service's scoring *shape* for the mock client.
//
// This is NOT the real model — coefficients are illustrative — but it mirrors the pipeline in
// scoring.rs so the UI behaves correctly: design vector → linear predictor → relative risk centred on
// the reference person → remaining years from a life-table-style baseline → interval. Keeping the same
// structure means the mock produces sensible, monotonic What-If deltas and honest "Why?" attributions.

import type { Attribution, EvidenceGrade, FactorRole, Profile, WhatIfChanges } from './types'
import { effectiveCigsDay, REDUCTION_NOTE, SMOKER_MEAN_CIGS } from './modelRules'

export { effectiveCigsDay, REDUCTION_NOTE, SMOKER_MEAN_CIGS }

const round1 = (x: number) => Math.round(x * 10) / 10

interface Standardizer {
  mean: number
  sd: number
}
/** The bundle's shipped literature standardizers (model-v2.2.0) — pinned by a parity test. */
// Object.freeze is shallow, so the nested entries are frozen too — otherwise
// `LITERATURE_STD.diet.mean = 9` would silently change live scoring, since STD spreads references.
export const LITERATURE_STD: Readonly<Record<string, Readonly<Standardizer>>> = Object.freeze({
  diet: Object.freeze({ mean: 2.5, sd: 1.12 }),      // Mediterranean-style item sum 0-5
  sedentary: Object.freeze({ mean: 6.0, sd: 2.5 }),  // daily sitting hours
  stress: Object.freeze({ mean: 6.11, sd: 3.14 }),   // PSS-4 sum 0-16 (Warttig 2013 norms)
})

const STD: Record<string, Standardizer> = {
  activity: { mean: 6.0, sd: 1.3 }, // ln(MET-min/week + 1)
  waist: { mean: 94, sd: 13 },
  income: { mean: 2.5, sd: 1.2 },
  bmi: { mean: 28.9, sd: 6.7 },       // kg/m²
  cigs_day: { mean: 2.6, sd: 6.7 },   // current-smoker cigarettes/day
  sbp: { mean: 123, sd: 18 },         // systolic BP (mmHg)
  ...LITERATURE_STD,
}

/** Alcohol log-hazard by level, centred on "light" — monotonic, never protective (RES-02). */
export const ALCOHOL_LEVELS: Readonly<Record<string, number>> = Object.freeze({
  none: 0.0,
  light: 0.03,
  moderate: 0.12,
  heavy: 0.3,
})
/** The level the alcohol term is centred on — the bundle's `literature.alcohol.reference.level`. */
export const ALCOHOL_REFERENCE_LEVEL = 'light'
const ALCOHOL_REFERENCE = ALCOHOL_LEVELS[ALCOHOL_REFERENCE_LEVEL]

/**
 * What an average person in each scoreable country is exposed to — the value the ENV term is centred on.
 *
 * This replaced two constants, `RO_PM25_REF = 14.0` and `RO_NDVI_REF = 0.5`, which were applied to every
 * country and were wrong for Romania as well: WHO measures 10.412 µg/m³ and Bucharest's
 * population-weighted NDVI is 0.2539. Copied here for the same reason `STD` and `LITERATURE_BETA` are —
 * the mock must score in a browser with no bundle to read — and pinned the same way: the parity test
 * asserts every entry against `env_reference` in the vendored bundle's own baselines, so a drift is a
 * failing test rather than a quietly different number.
 */
export const ENV_REFERENCE: Readonly<Record<string, { pm25: number; ndvi: number }>> = Object.freeze({
  AT: { pm25: 9.535, ndvi: 0.2839 },
  BE: { pm25: 9.562, ndvi: 0.284 },
  BG: { pm25: 12.574, ndvi: 0.3439 },
  CH: { pm25: 8.128, ndvi: 0.3795 },
  CY: { pm25: 14.225, ndvi: 0.2092 },
  CZ: { pm25: 10.968, ndvi: 0.3211 },
  DE: { pm25: 8.692, ndvi: 0.3453 },
  DK: { pm25: 7.713, ndvi: 0.2491 },
  EE: { pm25: 5.249, ndvi: 0.2236 },
  ES: { pm25: 8.029, ndvi: 0.252 },
  FI: { pm25: 4.118, ndvi: 0.2409 },
  FR: { pm25: 8.806, ndvi: 0.2844 },
  GR: { pm25: 14.381, ndvi: 0.1796 },
  HR: { pm25: 13.285, ndvi: 0.3924 },
  HU: { pm25: 11.21, ndvi: 0.2841 },
  IE: { pm25: 6.623, ndvi: 0.3156 },
  IS: { pm25: 5.645, ndvi: 0.0673 },
  IT: { pm25: 13.3, ndvi: 0.3198 },
  LT: { pm25: 8.171, ndvi: 0.3086 },
  LU: { pm25: 6.975, ndvi: 0.3269 },
  LV: { pm25: 9.644, ndvi: 0.2644 },
  MT: { pm25: 11.186, ndvi: 0.1611 },
  NL: { pm25: 9.032, ndvi: 0.2715 },
  NO: { pm25: 5.093, ndvi: 0.2939 },
  PL: { pm25: 14.732, ndvi: 0.2939 },
  PT: { pm25: 6.208, ndvi: 0.2856 },
  RO: { pm25: 10.412, ndvi: 0.2539 },
  SE: { pm25: 4.62, ndvi: 0.2488 },
  SI: { pm25: 12.121, ndvi: 0.3982 },
  SK: { pm25: 12.312, ndvi: 0.3179 },
})

/** Eurostat called Greece EL; the bundle and ISO call it GR. Stored profiles still say EL. */
const ENV_ALIASES: Readonly<Record<string, string>> = Object.freeze({ EL: 'GR' })

/** The country's own exposure reference, or `undefined` where there is none to centre on. */
export const envReference = (country: string): { pm25: number; ndvi: number } | undefined =>
  ENV_REFERENCE[ENV_ALIASES[country] ?? country]

/**
 * ENV term, same formula as `scoring.rs`: `ln(1.095)·(PM25−ref)/10 + ln(0.965)·(NDVI−ref)/0.1`.
 *
 * A country with no reference has its exposure left UNPRICED rather than priced at zero-deviation:
 * pricing a deviation from an average nobody has measured is a guess wearing a number. The service
 * returns the same 0.0 here and reports what it refused; the mock has nowhere to report, so it simply
 * does not price it.
 */
function envTerm(country: string, pm25?: number, ndvi?: number): number {
  const ref = envReference(country)
  if (ref === undefined) return 0
  const air = pm25 === undefined ? 0 : Math.log(1.095) * (pm25 - ref.pm25) / 10
  const green = ndvi === undefined ? 0 : Math.log(0.965) * (ndvi - ref.ndvi) / 0.1
  return air + green
}
const z = (raw: number, key: string) => (raw - STD[key].mean) / STD[key].sd

/** What the scorer actually uses for a key — the parity guard asserts against THIS, not the
 *  source objects, so a later override in STD/BETA cannot pass unnoticed. */
// Returns a copy: handing out a live reference to STD[key] would widen the mutation surface this
// module just closed.
export const effectiveStandardizer = (key: string): Standardizer => ({ ...STD[key] })
export const effectiveBeta = (key: string): number => BETA[key]

/** The bundle's shipped literature betas (per +1 SD) — pinned by a parity test. */
export const LITERATURE_BETA: Readonly<Record<string, number>> = Object.freeze({
  diet: -0.15,
  sedentary: 0.08,
  stress: 0.05,
})

/** Log-hazard coefficients (illustrative for the fitted terms). Positive = shortens life. */
const BETA: Record<string, number> = {
  smk_former: 0.22,
  smk_current: 0.62,
  activity: -0.13, // per z; more activity lowers risk
  sleep_long: 0.09,
  waist: 0.16,
  bmi: -0.12,        // per z; adds to waist — low-BMI-high-waist reads as frailty risk (illustrative)
  cigs_day: 0.1,     // per z; heavier current smoking shortens further (illustrative)
  sbp: 0.22,         // per z; higher systolic BP shortens life (illustrative)
  diabetes: 0.45,
  high_bp: 0.2,
  respiratory: 0.42,
  cvd_hx: 0.5,
  cancer_hx: 0.55,
  education: -0.1,
  income: -0.09,
  ...LITERATURE_BETA,
  mobility: 0.32,
}

/** The Romanian "average person" — the reference RR is centred here, so an average profile → RR ≈ 1. */
export const REFERENCE_PROFILE: Profile = {
  country: 'RO',
  age: 45,
  sex: 'M',
  smoke: 0,
  pa_min: 600,
  sleep: 7,
  waist: 94,
  bmi: 28.9,
  cigs_day: 0,
  sbp: 123, // cohort-mean systolic BP → reference z = 0
  diabetes: false,
  high_bp: false,
  respiratory: false,
  cvd_hx: false,
  cancer_hx: false,
  higher_educ: false,
  income: 2.5,
}

/** The design vector, keyed by coefficient name (mirrors scoring.rs `design`). */
function design(p: Profile): Record<string, number> {
  return {
    smk_former: p.smoke === 1 ? 1 : 0,
    smk_current: p.smoke === 2 ? 1 : 0,
    activity: z(Math.log(p.pa_min + 1), 'activity'),
    sleep_long: p.sleep >= 8.5 ? 1 : 0,
    waist: z(p.waist, 'waist'),
    bmi: z(p.bmi, 'bmi'),
    cigs_day: z(effectiveCigsDay(p), 'cigs_day'),
    // Real reading if known, else derived from the high-BP answer (matches scoring.rs).
    sbp: z(p.sbp ?? (p.high_bp ? 132.7 : 117.9), 'sbp'),
    diabetes: p.diabetes ? 1 : 0,
    high_bp: p.high_bp ? 1 : 0,
    respiratory: p.respiratory ? 1 : 0,
    cvd_hx: p.cvd_hx ? 1 : 0,
    cancer_hx: p.cancer_hx ? 1 : 0,
    education: p.higher_educ ? 1 : 0,
    income: z(p.income ?? 2.5, 'income'),
    // Literature levers: an unanswered lever contributes exactly 0 (the service treats an absent
    // answer as "assume the average person"), so these are deviations, not raw values.
    diet: p.diet_score === undefined ? 0 : z(p.diet_score, 'diet'),
    sedentary: p.sitting_hours === undefined ? 0 : z(p.sitting_hours, 'sedentary'),
    stress: p.stress_score === undefined ? 0 : z(p.stress_score, 'stress'),
    mobility: p.mobility === undefined ? 0 : p.mobility > 0 ? 1 : 0,
  }
}

/** Alcohol + ENV are additive log-hazard terms, not beta*design entries (mirrors scoring.rs). */
function extraLp(p: Profile): number {
  const alcohol =
    p.alcohol === undefined ? 0 : (ALCOHOL_LEVELS[p.alcohol] ?? ALCOHOL_REFERENCE) - ALCOHOL_REFERENCE
  return alcohol + envTerm(p.country, p.pm25, p.ndvi)
}

function linearPredictor(d: Record<string, number>): number {
  return Object.entries(BETA).reduce((sum, [k, b]) => sum + b * (d[k] ?? 0), 0)
}

const LP_REFERENCE = linearPredictor(design(REFERENCE_PROFILE)) + extraLp(REFERENCE_PROFILE)

export function relativeRisk(p: Profile): number {
  const lp = linearPredictor(design(p)) + extraLp(p)
  return Math.exp(lp - LP_REFERENCE)
}

/** RO baseline remaining life expectancy e(age), males; females get a modest advantage. */
const E_MALE: Array<[number, number]> = [
  [18, 57], [30, 46], [40, 37], [50, 28], [60, 20], [70, 13], [80, 7.5], [90, 4], [100, 2.5], [110, 1.2],
]
function baselineRemaining(age: number, sex: Profile['sex']): number {
  const pts = E_MALE
  const a = Math.max(18, Math.min(110, age))
  let e = pts[pts.length - 1][1]
  for (let i = 0; i < pts.length - 1; i++) {
    const [a0, e0] = pts[i]
    const [a1, e1] = pts[i + 1]
    if (a >= a0 && a <= a1) {
      e = e0 + ((e1 - e0) * (a - a0)) / (a1 - a0)
      break
    }
  }
  return sex === 'F' ? e + 4 : e
}

/** Apply relative risk to baseline remaining years (higher RR → fewer years), monotonic and bounded. */
function remainingYears(age: number, sex: Profile['sex'], rr: number): number {
  const base = baselineRemaining(age, sex)
  const adjusted = base * Math.pow(rr, -0.4)
  return Math.max(0.5, Math.min(base * 1.6, adjusted))
}

export interface EstimateResult {
  estimate_years: number
  interval: [number, number]
  reaches_age: number
  relative_risk: number
  country: string
}

export function scoreEstimate(p: Profile): EstimateResult {
  const rr = relativeRisk(p)
  const years = remainingYears(p.age, p.sex, rr)
  const rel = p.age >= 55 ? 0.06 : 0.1 // interval widens for the young (mirrors scoring.rs)
  return {
    estimate_years: round1(years),
    interval: [round1(years * (1 - rel)), round1(years * (1 + rel))],
    reaches_age: round1(p.age + years),
    relative_risk: Math.round(rr * 1000) / 1000,
    country: p.country,
  }
}

/** Average remaining years for the reference (average) person at this age & sex — i.e. RR = 1. */
export function averageRemainingYears(age: number, sex: Profile['sex']): number {
  return round1(remainingYears(age, sex, 1))
}

export interface WhatIfResult {
  current_years: number
  scenario_years: number
  delta_years: number
  note?: string
}

export function scoreWhatIf(base: Profile, changes: WhatIfChanges): WhatIfResult {
  const currentYears = remainingYears(base.age, base.sex, relativeRisk(base))
  const modified: Profile = { ...base }
  let note: string | undefined
  if (changes.smoke !== undefined) {
    // Quitting trends toward never-smoker risk (the causal target); cessation benefit is long-run.
    if (changes.smoke < base.smoke) {
      modified.smoke = 0
      note = 'smoking-cessation benefit accrues over ~10 years; shown as the long-run effect'
    } else {
      modified.smoke = changes.smoke
    }
  }
  if (changes.pa_min !== undefined) modified.pa_min = changes.pa_min
  if (changes.cigs_day !== undefined) {
    if (changes.cigs_day < 0 || changes.cigs_day > 80) {
      throw new Error('cigarettes per day must be between 0 and 80')
    }
    // Mirrors the service: a current smoker's zero is "did not answer", not "quit", so it is
    // refused rather than scored at the imputed average. The mock has to refuse what the service
    // refuses or the dev harness disagrees with production about which scenarios exist at all.
    if (changes.cigs_day === 0 && modified.smoke === 2) {
      throw new Error(
        'smoking zero cigarettes a day is quitting, and quitting is modelled by the smoking ' +
          'lever rather than the dose one: set smoking to never instead.',
      )
    }
    modified.cigs_day = changes.cigs_day
    // Same honesty the service applies: the per-cigarette gradient is the optimistic reading of
    // cutting down, and must never present itself as equivalent to stopping.
    // Against the EFFECTIVE dose, matching the service: an undeclared smoker is scored at the
    // cohort mean, and a former smoker's effective dose is 0, so a former smoker resuming can never
    // come in under it. One comparison fixes both — an explicit base.smoke check was decoration.
    const baseDose = effectiveCigsDay(base)
    if (modified.smoke === 2 && changes.cigs_day < baseDose) {
      note = REDUCTION_NOTE
    }
  }
  // Quitting zeroes the dose, matching how the score treats a non-smoker's cigarettes.
  if (modified.smoke !== 2) modified.cigs_day = 0
  if (changes.waist !== undefined) modified.waist = changes.waist
  if (changes.diet_score !== undefined) modified.diet_score = changes.diet_score
  if (changes.alcohol !== undefined) modified.alcohol = changes.alcohol
  if (changes.sitting_hours !== undefined) modified.sitting_hours = changes.sitting_hours
  if (changes.stress_score !== undefined) modified.stress_score = changes.stress_score
  const scenarioYears = remainingYears(modified.age, modified.sex, relativeRisk(modified))
  return {
    current_years: round1(currentYears),
    scenario_years: round1(scenarioYears),
    delta_years: round1(scenarioYears - currentYears),
    note,
  }
}

// ── Attribution ("Why?") — one-at-a-time total effect vs the reference person ─────────────────────
interface FactorSpec {
  key: keyof typeof BETA
  factor: string
  role: FactorRole | 'marker'
  evidence: EvidenceGrade
  citation: string
  /** verified DOI of the paper behind this factor — the real service always sends one */
  doi: string
  firstAuthor: string
  year: number
  /** produce a copy of the profile with this factor set to the reference value */
  toReference: (p: Profile) => Profile
}

const FACTORS: FactorSpec[] = [
  { key: 'smk_current', factor: 'Smoking', role: 'lever', evidence: 'strong', citation: 'RES-02 · GBD 2019 tobacco', doi: '10.1056/NEJMsa1211128', firstAuthor: 'Jha', year: 2013, toReference: (p) => ({ ...p, smoke: 0 }) },
  { key: 'activity', factor: 'Physical activity', role: 'lever', evidence: 'strong', citation: 'RES-03 · IPAQ / Arem 2015', doi: '10.1001/jamainternmed.2015.0533', firstAuthor: 'Arem', year: 2015, toReference: (p) => ({ ...p, pa_min: REFERENCE_PROFILE.pa_min }) },
  { key: 'waist', factor: 'Waist circumference', role: 'lever', evidence: 'moderate', citation: 'RES-03 · EXP-12 total effect', doi: '10.1136/bmj.m3324', firstAuthor: 'Jayedi', year: 2020, toReference: (p) => ({ ...p, waist: REFERENCE_PROFILE.waist }) },
  { key: 'sleep_long', factor: 'Long sleep', role: 'marker', evidence: 'weak', citation: 'RES-02 · EXP-12', doi: '10.1093/sleep/33.5.585', firstAuthor: 'Cappuccio', year: 2010, toReference: (p) => ({ ...p, sleep: 7 }) },
  { key: 'diabetes', factor: 'Diabetes', role: 'manage', evidence: 'strong', citation: 'RES-02', doi: '10.1056/NEJMoa1008862', firstAuthor: 'Emerging Risk Factors Collaboration', year: 2011, toReference: (p) => ({ ...p, diabetes: false }) },
  { key: 'high_bp', factor: 'High blood pressure', role: 'manage', evidence: 'strong', citation: 'RES-02', doi: '10.1016/S0140-6736(02)11911-8', firstAuthor: 'Prospective Studies Collaboration', year: 2002, toReference: (p) => ({ ...p, high_bp: false }) },
  { key: 'respiratory', factor: 'Respiratory disease', role: 'manage', evidence: 'moderate', citation: 'RES-02', doi: '10.1183/09031936.06.00124605', firstAuthor: 'Halbert', year: 2006, toReference: (p) => ({ ...p, respiratory: false }) },
  { key: 'cvd_hx', factor: 'Cardiovascular history', role: 'context', evidence: 'strong', citation: 'RES-02', doi: '10.1001/jama.2015.7008', firstAuthor: 'Di Angelantonio', year: 2015, toReference: (p) => ({ ...p, cvd_hx: false }) },
  { key: 'cancer_hx', factor: 'Cancer history', role: 'context', evidence: 'moderate', citation: 'RES-02', doi: '10.3322/caac.21565', firstAuthor: 'Miller', year: 2019, toReference: (p) => ({ ...p, cancer_hx: false }) },
  { key: 'education', factor: 'Education', role: 'context', evidence: 'moderate', citation: 'RES-02 · SES', doi: '10.1056/NEJMsa0707519', firstAuthor: 'Mackenbach', year: 2008, toReference: (p) => ({ ...p, higher_educ: REFERENCE_PROFILE.higher_educ }) },
  { key: 'income', factor: 'Income', role: 'context', evidence: 'moderate', citation: 'RES-02 · SES', doi: '10.1056/NEJMsa0707519', firstAuthor: 'Mackenbach', year: 2008, toReference: (p) => ({ ...p, income: REFERENCE_PROFILE.income }) },
  // Literature levers — reference = "unanswered" (i.e. the average person, contributing 0).
  { key: 'diet', factor: 'Diet quality', role: 'lever', evidence: 'strong', citation: 'RES-03 · Trichopoulou 2003', doi: '10.1056/NEJMoa025039', firstAuthor: 'Trichopoulou', year: 2003, toReference: (p) => ({ ...p, diet_score: undefined }) },
  { key: 'alcohol', factor: 'Alcohol', role: 'lever', evidence: 'strong', citation: 'RES-02 · GBD 2018/2020', doi: '10.1016/S0140-6736(18)31310-2', firstAuthor: 'Griswold', year: 2018, toReference: (p) => ({ ...p, alcohol: undefined }) },
  { key: 'sedentary', factor: 'Sitting time', role: 'lever', evidence: 'moderate', citation: 'RES-03 · Chau 2013', doi: '10.1371/journal.pone.0080000', firstAuthor: 'Chau', year: 2013, toReference: (p) => ({ ...p, sitting_hours: undefined }) },
  { key: 'stress', factor: 'Perceived stress', role: 'lever', evidence: 'weak', citation: 'RES-03 · Cohen 1983 PSS', doi: '10.2307/2136404', firstAuthor: 'Cohen', year: 1983, toReference: (p) => ({ ...p, stress_score: undefined }) },
  { key: 'mobility', factor: 'Mobility limitation', role: 'marker', evidence: 'strong', citation: 'EXP-11 · NHANES PFQ', doi: '10.1001/jama.2010.1923', firstAuthor: 'Studenski', year: 2011, toReference: (p) => ({ ...p, mobility: undefined }) },
]

/** Per-factor Δyears vs the reference person (positive = adds years). Sorted by magnitude. */
export function attributions(p: Profile): Attribution[] {
  const yearsAt = (q: Profile) => remainingYears(p.age, p.sex, relativeRisk(q))
  const userYears = yearsAt(p)
  const out: Attribution[] = []
  for (const f of FACTORS) {
    const refYears = yearsAt(f.toReference(p))
    const delta = round1(userYears - refYears) // user minus "if this factor were average"
    if (Math.abs(delta) < 0.05) continue
    out.push({
      key: f.key, factor: f.factor, delta_years: delta, evidence: f.evidence, role: f.role,
      citation: f.citation,
      // The real service always ships a resolvable link with every factor; the mock must too, or
      // the tests would pass on a page that shows unlinkable citations in production.
      doi: f.doi, url: `https://doi.org/${f.doi}`, first_author: f.firstAuthor, year: f.year,
    })
  }
  return out.sort((a, b) => Math.abs(b.delta_years) - Math.abs(a.delta_years))
}
