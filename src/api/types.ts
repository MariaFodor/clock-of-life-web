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
  /** body-mass index (kg/m²), from height + weight */
  bmi: number
  /** current-smoker cigarettes/day (0 if not a current smoker) */
  cigs_day?: number
  /** systolic blood pressure (mmHg) if known; omitted → service derives it from high_bp */
  sbp?: number
  diabetes?: boolean
  high_bp?: boolean
  respiratory?: boolean
  cvd_hx?: boolean
  cancer_hx?: boolean
  higher_educ?: boolean
  /** income-to-poverty ratio (default 2.5) */
  income?: number
  /** home annual-mean PM2.5 (µg/m³), from the user's location (RES-04); omitted → ENV neutral */
  pm25?: number
  /** home greenspace NDVI, from the user's location; omitted → ENV neutral */
  ndvi?: number
  // Literature levers (LEV-04): omitted = "assume the average person", contributes 0 to the score.
  /** Mediterranean-style diet item sum 0–5 (Q13–Q17) */
  diet_score?: number
  /** drinking level (Q18) */
  alcohol?: 'none' | 'light' | 'moderate' | 'heavy'
  /** daily sitting/screen hours (Q10) */
  sitting_hours?: number
  /** perceived-stress PSS-4 sum 0–16 (Q19 a–d) */
  stress_score?: number
  /** difficulty walking/climbing stairs: 0 none / 1 some / 2 a lot (Q22) */
  mobility?: 0 | 1 | 2
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

/** Levers that What-If may change (scoring.rs `WhatIfChanges`). Only modifiable factors.
 *
 *  `sleep` is deliberately absent, though the wire format still accepts an UNCHANGED one for older
 *  clients: ONT-01 demoted long sleep to a marker, and the service refuses a sleep change with a
 *  400. Leaving the field here is an open invitation to build a control the backend rejects, which
 *  is exactly what happened. */
export interface WhatIfChanges {
  smoke?: SmokeStatus
  pa_min?: number
  /** Cigarettes per day (0-80, matching what the service validates a profile at). A lever in its own right since bundle v3.0.1, where the corrected
   *  smoking contrast moved the dose into its own coefficient — the breakdown charges for it, so
   *  What-If has to let people ask about it. */
  cigs_day?: number
  waist?: number
  diet_score?: number
  alcohol?: 'none' | 'light' | 'moderate' | 'heavy'
  sitting_hours?: number
  stress_score?: number
}

/** scoring.rs `WhatIf` + optional persisted scenario id. */
export interface WhatIf {
  current_years: number
  scenario_years: number
  delta_years: number
  note?: string
  scenario_id?: string
}

/** POST /api/auth/register and /api/auth/login response. */
export interface AuthResult {
  token: string
  account_id: string
}

/** GET /api/meta. */
export interface Meta {
  model_version: string
  algorithm: string
  countries: string[]
  /**
   * The same countries with names and ISO3 codes, for the interview's country question.
   *
   * Served rather than kept here, because a copy of 30 country names in the front end is a second
   * thing to update when the 31st arrives — and because until this shipped there WAS no country
   * question: `buildProfile` returned `country: 'RO'` for everyone.
   *
   * Optional: a service older than this change does not send it, and the question then says so rather
   * than falling back to a guess.
   */
  country_options?: CountryOption[]
  /** Codes that used to be valid and now resolve elsewhere — `{"EL": "GR"}`. */
  country_aliases?: Record<string, string>
  assumptions: string[]
}

export interface CountryOption {
  iso2: string
  /** The settlement picker keys on ISO3; a profile stores ISO2. Both travel together. */
  iso3: string | null
  name: string | null
  /** How many measured settlements this country has, so the picker can say what to expect. */
  settlements: number
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

// Matches the service vocabulary (seeds/features.json): never invent or upgrade a grade.
export const EVIDENCE_GRADES = ['strong', 'moderate', 'weak', 'na'] as const
export type EvidenceGrade = (typeof EVIDENCE_GRADES)[number]
export type FactorRole = 'lever' | 'manage' | 'context' | 'baseline'

/** One row of the "Why?" breakdown (api-and-scoring.md `why[]`, extended with role for framing). */
export interface Attribution {
  /** The feature/design key (e.g. `smk_current`), which is how this row maps back to the ontology,
   *  the features table and the recommendation rules. The service has always sent it; the type and
   *  the mock both omitted it, so anything wanting to join a breakdown row to the model had only
   *  the display label to go on — which is how ImprovePage once matched on labels and rendered zero
   *  links. */
  key: string
  factor: string
  delta_years: number
  evidence: EvidenceGrade
  /** `marker` factors predict and explain but are never recommended (e.g. long sleep, mobility). */
  role: FactorRole | 'marker'
  citation: string
  /** Resolvable link to the paper behind this factor, verified when the ontology was written. */
  url?: string
  doi?: string
  first_author?: string
  year?: number
}

/** One factor as the model's ontology describes it (`GET /api/ontology`). */
export interface OntologyFactor {
  role: FactorRole | 'marker'
  /** what this factor causes — its mediators, the edges of the causal graph */
  causes?: string[]
  confounded_by?: string[]
  sign?: 'positive' | 'negative' | 'free'
  grade?: EvidenceGrade
  questions?: string[]
  prior?: { doi?: string; url?: string; title?: string; first_author?: string; year?: number }
  note?: string
  decision?: string
  assumption?: string
}

export type Ontology = Record<string, OntologyFactor>

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
  /** annual mean PM2.5 (µg/m³); undefined when the layer has no value for this location */
  pm25?: number
  /** greenspace index (NDVI, 0–1); undefined when the layer has no value for this location */
  ndvi?: number
  kind: 'city' | 'suburb' | 'rural'
}

/** Result of comparing a candidate location against the user's current one. */
export interface RelocateResult {
  current: Location
  candidate: Location
  delta_years: number
  explanation: string
}

/** How the user's estimate compares to the average person of the same age & sex (Life Clock surface). */
export interface Benchmark {
  /** average remaining years for the reference person at this age & sex (RR = 1) */
  national_avg_years: number
  /** user's estimate minus the national average (positive = above average) */
  delta_years: number
}

/** Cohort aggregate for the Statistics surface — always k-gated (k ≥ 20). */
export interface CohortStat {
  label: string
  cohort_size: number
  /** null when suppressed for small-cohort privacy (k < 20) */
  mean_estimate_years: number | null
  suppressed: boolean
}

// ── The World surface (GET /api/atlas) ────────────────────────────────────────

/** Women, men, and both sexes together — every figure the atlas serves comes all three ways. */
export type SexKey = 'f' | 'm' | 'b'

/**
 * One country as the atlas sees it.
 *
 * These are NOT a second dataset. Every number is `remaining_le` — the same function that produces
 * the reader's own Life Clock — evaluated on the model bundle's own life table at age 0 and age 60
 * with a relative risk of 1.0. The map and the clock are the same arithmetic over the same table.
 */
export interface AtlasCountry {
  iso2: string
  iso3: string | null
  name: string | null
  /** UN subregion, e.g. "Eastern Europe". */
  region: string | null
  lifetable_year: number | null
  /**
   * Whether this app can give a PERSON from this country a number. Life tables cover the world;
   * the reference person a relative risk is centred on needs national smoking and overweight rates,
   * which exist for Europe. A false here is a country the map draws and the clock must refuse.
   */
  scoreable: boolean
  /** life expectancy at birth, years */
  le0: Partial<Record<SexKey, number>>
  /** years still ahead at 60 */
  le60: Partial<Record<SexKey, number>>
  /** of 1,000 people alive at 15, how many die before 60 */
  am: Partial<Record<SexKey, number>>
  /**
   * The air and greenness SUMMARY for this country. Present from model v4.1.1.
   *
   * `settlements: 0` is the statement the map is built around, and it is deliberately not the same as
   * a missing `env`: zero means nobody has published a PM2.5 measurement for any settlement here since
   * 2020, which is a fact about the measurement rather than about the country. 152 of the 237 drawn
   * countries are in that position, and most of them still have a national `pm25` — so no dot is not
   * the same as no data, and the page has to be able to say which.
   */
  env?: AtlasCountryEnv
}

export interface AtlasCountryEnv {
  /** measured settlements inside the 2020-2025 window; 0 means none, not unknown */
  settlements: number
  latest_year: number | null
  /** national population-weighted PM2.5, µg/m³ — exists for 227 countries */
  pm25: number | null
  pm25_year: number | null
  /** population-weighted annual mean NDVI, derived from this country's own measured cities */
  ndvi: number | null
  /**
   * How many cities that greenness figure rests on. 22 of the 30 scoreable countries rest on ONE, so
   * anything that shows `ndvi` has to be able to say how thin it is.
   */
  ndvi_cities: number | null
}

/** One settlement as the interview's city question offers it. */
export interface Place {
  iso3: string
  city: string
  lat: number
  lon: number
  population: number | null
  pm25: number
  pm25_year: number
  pm25_stations: number | null
  pm25_temporal_coverage: number | null
  ndvi: number | null
  ndvi_year: number | null
  /**
   * `'city'` — greenness measured in this settlement. `'country'` — this country's figure, shown here
   * because this settlement has none. `null` — no greenness at all.
   *
   * The word is not decoration: 3,066 of the 3,521 settlements carry their country's figure, and one
   * rendered bare reads as a measurement of that city.
   */
  ndvi_basis: 'city' | 'country' | null
  ndvi_matched_city: string | null
  ndvi_distance_km: number | null
}

export interface CountryPlaces {
  iso3: string
  iso2: string | null
  name: string | null
  /** Whether a personal estimate is possible for someone living here at all. */
  scoreable: boolean
  /** What the ENV term is centred on here, so a reading can be shown against its own country. */
  reference: AtlasCountryEnv & {
    pm25_low?: number | null
    pm25_high?: number | null
    pm25_by_area?: Record<string, number>
    ndvi_derived_from?: string[] | null
  } | null
  places: Place[]
  coverage: {
    settlements: number
    with_city_greenness: number
    with_country_greenness: number
    without_greenness: number
  }
}

/** One settlement with a measured reading, as the map draws it. */
export interface EnvPoint {
  iso3: string
  city: string
  lat: number
  lon: number
  /** annual mean PM2.5, µg/m³ */
  pm25: number
  year: number
}

/**
 * The air layer: where there is a measurement, and — the load-bearing half — where there is not.
 *
 * Loaded lazily, only when a reader switches the layer on: 3,521 coordinate pairs are several times
 * the whole country table. `unmeasured_iso3` arrives computed by the service rather than derived here
 * by subtracting one list from another, which is the arithmetic an off-by-one hides in.
 */
export interface AtlasEnvironment {
  model_version: string
  pollutant: string
  /**
   * The radius a single reading is being claimed to speak for, in km. Served rather than hardcoded:
   * it is the same tolerance the greenness match used, and the two claims must not drift apart.
   */
  speaks_for_km: number
  /** [first, last] year a reading may come from */
  window: [number, number]
  points: EnvPoint[]
  /** Countries the atlas draws that nobody has measured since 2020. */
  unmeasured_iso3: string[]
  sources?: Record<string, unknown>
  /** What the data obliges. WHO's air database is share-alike, and the page has to say so. */
  licences?: Array<{
    licence: string
    url: string | null
    applies_to: string[]
    share_alike: boolean
    non_commercial: boolean
  }>
}

/** Where the life tables came from — printed on the page rather than hardcoded into it. */
export interface AtlasSource {
  dataset: string
  publisher?: string
  variant?: string
  year?: number
  url?: string
  licence?: string
  licence_url?: string
  citation?: string
  retrieved?: string
}

export interface AtlasData {
  model_version: string
  /** How the numbers were produced, in the artifact's own words. */
  derived_by: string
  sources: AtlasSource[]
  countries: AtlasCountry[]
}
