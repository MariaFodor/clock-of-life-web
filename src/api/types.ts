// API contract types.
//
// These mirror the Rust service's serde structs (clock-of-life-service/src/{lib,scoring,db}.rs) so that
// when the OpenAPI client generation lands (ARCH-04), this file is replaced by generated types with no
// change to callers. Fields not yet served by the backend are marked MOCK-ONLY and live behind the
// same client seam so the "Why?/Improve/Relocate/Stats" surfaces can be built ahead of their endpoints.

/** Sex as the model expects it (drives the life table, not the risk score). */
export type Sex = 'M' | 'F'

/** 0 = never, 1 = former, 2 = current. */
export type SmokeStatus = 0 | 1 | 2

/** Request body for POST /api/estimate — the scored profile (scoring.rs `Profile`). */
export interface Profile {
  country: string
  age: number
  sex: Sex
  smoke: SmokeStatus
  /** weekly MET-minutes */
  pa_min: number
  /** hours */
  sleep: number
  /** cm */
  waist: number
  diabetes?: boolean
  high_bp?: boolean
  respiratory?: boolean
  cvd_hx?: boolean
  cancer_hx?: boolean
  higher_educ?: boolean
  /** income-to-poverty ratio (default 2.5) */
  income?: number
}

/** scoring.rs `Estimate` + the persisted calculation id (lib.rs `EstimateResponse`). */
export interface Estimate {
  estimate_years: number
  interval: [number, number]
  reaches_age: number
  relative_risk: number
  country: string
  calculation_id: string
}

/** Levers that What-If may change (scoring.rs `WhatIfChanges`). Only modifiable factors. */
export interface WhatIfChanges {
  smoke?: SmokeStatus
  pa_min?: number
  sleep?: number
  waist?: number
}

/** scoring.rs `WhatIf` + optional persisted scenario id. */
export interface WhatIf {
  current_years: number
  scenario_years: number
  delta_years: number
  note?: string
  scenario_id?: string
}

/** GET /api/meta. */
export interface Meta {
  model_version: string
  algorithm: string
  countries: string[]
  assumptions: string[]
}

/** db.rs `CalcRow` — one row of history from GET /api/calculations. */
export interface CalcRow {
  id: string
  input_hash: string
  estimate_years: number
  interval_low: number
  interval_high: number
  reaches_age: number
  relative_risk: number
  inputs: unknown
  attributions: unknown
  created_at: string
}

/** db.rs `AnswerRow` — GET /api/answers. */
export interface AnswerRow {
  question_code: string
  question_version: number
  value: unknown
  created_at: string
}

/** POST /api/answers body item. */
export interface AnswerInput {
  question_code: string
  value: unknown
}

// ── MOCK-ONLY shapes (no backend endpoint yet) ────────────────────────────────
// Shaped to match the design docs (api-and-scoring.md transparent payload, web-architecture.md) so the
// real endpoints can drop in later.

export type EvidenceGrade = 'strong' | 'moderate' | 'limited'
export type FactorRole = 'lever' | 'manage' | 'context' | 'baseline'

/** One row of the "Why?" breakdown (api-and-scoring.md `why[]`, extended with role for framing). */
export interface Attribution {
  factor: string
  delta_years: number
  evidence: EvidenceGrade
  role: FactorRole
  citation: string
}

/** One prioritized recommendation (Improve surface). Levers/manage only, never context/baseline. */
export interface Recommendation {
  factor: string
  role: Extract<FactorRole, 'lever' | 'manage'>
  headline: string
  detail: string
  /** potential gain in years if adopted */
  potential_years: number
  evidence: EvidenceGrade
  /** 1 = easy, 3 = hard */
  difficulty: 1 | 2 | 3
  /** derived priority = impact × confidence ÷ difficulty */
  priority: number
}

/** A place the user can compare (Where Should I Live?). */
export interface Location {
  id: string
  name: string
  /** annual mean PM2.5 (µg/m³) */
  pm25: number
  /** greenspace index (NDVI, 0–1) */
  ndvi: number
  kind: 'city' | 'suburb' | 'rural'
}

/** Result of comparing a candidate location against the user's current one. */
export interface RelocateResult {
  current: Location
  candidate: Location
  delta_years: number
  explanation: string
}

/** Cohort aggregate for the Statistics surface — always k-gated (k ≥ 20). */
export interface CohortStat {
  label: string
  cohort_size: number
  /** null when suppressed for small-cohort privacy (k < 20) */
  mean_estimate_years: number | null
  suppressed: boolean
}
