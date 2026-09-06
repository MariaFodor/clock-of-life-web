// A compact, deterministic re-implementation of the service's scoring *shape* for the mock client.
//
// This is NOT the real model — coefficients are illustrative — but it mirrors the pipeline in
// scoring.rs so the UI behaves correctly: design vector → linear predictor → relative risk centred on
// the reference person → remaining years from a life-table-style baseline → interval. Keeping the same
// structure means the mock produces sensible, monotonic What-If deltas and honest "Why?" attributions.

import type { Attribution, EvidenceGrade, FactorRole, Profile } from './types'

const round1 = (x: number) => Math.round(x * 10) / 10

interface Standardizer {
  mean: number
  sd: number
}
const STD: Record<string, Standardizer> = {
  activity: { mean: 6.0, sd: 1.3 }, // ln(MET-min/week + 1)
  waist: { mean: 94, sd: 13 },
  income: { mean: 2.5, sd: 1.2 },
}
const z = (raw: number, key: string) => (raw - STD[key].mean) / STD[key].sd

/** Log-hazard coefficients (illustrative). Positive = shortens life. */
const BETA: Record<string, number> = {
  smk_former: 0.22,
  smk_current: 0.62,
  activity: -0.13, // per z; more activity lowers risk
  sleep_long: 0.09,
  waist: 0.16,
  diabetes: 0.45,
  high_bp: 0.2,
  respiratory: 0.42,
  cvd_hx: 0.5,
  cancer_hx: 0.55,
  education: -0.1,
  income: -0.09,
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
    diabetes: p.diabetes ? 1 : 0,
    high_bp: p.high_bp ? 1 : 0,
    respiratory: p.respiratory ? 1 : 0,
    cvd_hx: p.cvd_hx ? 1 : 0,
    cancer_hx: p.cancer_hx ? 1 : 0,
    education: p.higher_educ ? 1 : 0,
    income: z(p.income ?? 2.5, 'income'),
  }
}

function linearPredictor(d: Record<string, number>): number {
  return Object.entries(BETA).reduce((sum, [k, b]) => sum + b * (d[k] ?? 0), 0)
}

const LP_REFERENCE = linearPredictor(design(REFERENCE_PROFILE))

export function relativeRisk(p: Profile): number {
  const lp = linearPredictor(design(p))
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

export function scoreWhatIf(
  base: Profile,
  changes: { smoke?: Profile['smoke']; pa_min?: number; sleep?: number; waist?: number },
): WhatIfResult {
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
  if (changes.sleep !== undefined) modified.sleep = changes.sleep
  if (changes.waist !== undefined) modified.waist = changes.waist
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
  role: FactorRole
  evidence: EvidenceGrade
  citation: string
  /** produce a copy of the profile with this factor set to the reference value */
  toReference: (p: Profile) => Profile
}

const FACTORS: FactorSpec[] = [
  { key: 'smk_current', factor: 'Smoking', role: 'lever', evidence: 'strong', citation: 'RES-02 · GBD 2019 tobacco', toReference: (p) => ({ ...p, smoke: 0 }) },
  { key: 'activity', factor: 'Physical activity', role: 'lever', evidence: 'strong', citation: 'RES-03 · IPAQ / Arem 2015', toReference: (p) => ({ ...p, pa_min: REFERENCE_PROFILE.pa_min }) },
  { key: 'waist', factor: 'Waist circumference', role: 'lever', evidence: 'moderate', citation: 'RES-03 · EXP-12 total effect', toReference: (p) => ({ ...p, waist: REFERENCE_PROFILE.waist }) },
  { key: 'sleep_long', factor: 'Long sleep', role: 'lever', evidence: 'limited', citation: 'RES-02 · EXP-12', toReference: (p) => ({ ...p, sleep: 7 }) },
  { key: 'diabetes', factor: 'Diabetes', role: 'manage', evidence: 'strong', citation: 'RES-02', toReference: (p) => ({ ...p, diabetes: false }) },
  { key: 'high_bp', factor: 'High blood pressure', role: 'manage', evidence: 'strong', citation: 'RES-02', toReference: (p) => ({ ...p, high_bp: false }) },
  { key: 'respiratory', factor: 'Respiratory disease', role: 'manage', evidence: 'moderate', citation: 'RES-02', toReference: (p) => ({ ...p, respiratory: false }) },
  { key: 'cvd_hx', factor: 'Cardiovascular history', role: 'context', evidence: 'strong', citation: 'RES-02', toReference: (p) => ({ ...p, cvd_hx: false }) },
  { key: 'cancer_hx', factor: 'Cancer history', role: 'context', evidence: 'moderate', citation: 'RES-02', toReference: (p) => ({ ...p, cancer_hx: false }) },
  { key: 'education', factor: 'Education', role: 'context', evidence: 'moderate', citation: 'RES-02 · SES', toReference: (p) => ({ ...p, higher_educ: REFERENCE_PROFILE.higher_educ }) },
  { key: 'income', factor: 'Income', role: 'context', evidence: 'moderate', citation: 'RES-02 · SES', toReference: (p) => ({ ...p, income: REFERENCE_PROFILE.income }) },
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
    out.push({ factor: f.factor, delta_years: delta, evidence: f.evidence, role: f.role, citation: f.citation })
  }
  return out.sort((a, b) => Math.abs(b.delta_years) - Math.abs(a.delta_years))
}
