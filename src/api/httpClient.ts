// The real backend client — talks to clock-of-life-service over HTTP.
//
// In dev, Vite proxies /api → http://localhost:8080 (see vite.config.ts); in production the service
// serves the built SPA from the same origin, so a relative base works in both. Responses are mapped to
// the web's view types (src/api/types.ts). This is the seam the mock also implements, so pages and hooks
// are identical against either.

import type { AtlasData, AtlasEnvironment, CountryPlaces } from './types'

import type { ApiClient } from './client'
import { EVIDENCE_GRADES } from './types'
import type {
  AnswerInput,
  AnswerRow,
  Attribution,
  AuthResult,
  Benchmark,
  CalcRow,
  CohortStat,
  EvidenceGrade,
  Estimate,
  FactorRole,
  Location,
  Ontology,
  Meta,
  Profile,
  Recommendation,
  RelocateResult,
  WhatIf,
  WhatIfChanges,
} from './types'
import { getToken } from './token'

const BASE = '/api'

/**
 * A failed request, with the HTTP status alongside the service's own words.
 *
 * The status cannot be recovered from the message: when the service sends `{ error: "..." }` the
 * message IS that sentence, and it carries no code — `/api/places/{iso3}` answers 404 with "no measured
 * settlements for ROU", which reads no differently from a fault. Callers that must tell a refusal apart
 * from a failure read `status`; the message text is unchanged, because other surfaces assert on it.
 */
export interface HttpError extends Error {
  status: number
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body) headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    // The service returns { error: "..." } (ApiError); surface that message when present.
    let message = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (body && typeof body.error === 'string') message = body.error
    } catch {
      /* non-JSON error body */
    }
    const error = new Error(message) as HttpError
    error.status = res.status
    throw error
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) })
const get = <T>(path: string) => request<T>(path)

// ── mapping helpers ───────────────────────────────────────────────────────────
// Conservative by construction: an unknown or missing grade is shown as ungraded ('na'),
// never promoted to a stronger-looking one (REVIEW-2026-09-09 W3).
const asGrade = (g: string | null | undefined): EvidenceGrade =>
  // alcohol's bundle grade is "strong_for_harm" — strong evidence, harm-directional (RES-02).
  g === 'strong_for_harm'
    ? 'strong'
    : (EVIDENCE_GRADES as readonly string[]).includes(g ?? '')
      ? (g as EvidenceGrade)
      : 'na'

const asRole = (r: string): FactorRole | 'marker' =>
  r === 'lever' || r === 'manage' || r === 'context' || r === 'baseline' || r === 'marker'
    ? r
    : 'context'

const round1 = (x: number) => Math.round(x * 10) / 10

/** Server /api/estimate response — Estimate fields plus why/model/calculation_id. */
interface EstimateEnvelope extends Estimate {
  /**
   * scoring.rs serves this beside `relative_risk`; only the benchmark reads it.
   *
   * OPTIONAL on purpose, and this type is a cast over `res.json()` with no runtime validation, so
   * "required" here would only have been a promise about a server we do not control. Two ways it is
   * legitimately absent: a service older than this change, and a country whose bundle has no
   * measured prevalence (Switzerland today), where the service withholds it rather than serve a
   * figure its own artifact calls mis-centred.
   *
   * Declaring it required cost a white screen, not a missing card: `avgCache.set(key, undefined)`
   * leaves `Map.has()` TRUE, so the re-estimate guard never re-fires, `round1(x - undefined)` is
   * NaN, `LifeClockPage` gates on a truthy object so the card still renders, and `fmtYears` calls
   * `undefined.toFixed(1)`. There is no error boundary in this app, so that throw unmounts the root.
   */
  national_avg_years?: number | null
  why: Array<{
    key: string; factor: string; delta_years: number; evidence: string; role: string
    citation: string
    url?: string; doi?: string; first_author?: string; year?: number
  }>
}

// The "average person" this file used to build by hand is GONE, and deliberately not replaced by a
// better hand-built one. It was: never smoked, 600 MET-min/week, BMI 25.5, no conditions — which the
// model scores at 0.58x, not 1.0. So the Life Clock compared a reader against a healthy invention
// while labelling it "the average person of your age and sex", directly under a risk figure centred
// on the country's real prevalence-weighted population. The two disagreed, and the invention usually
// won: a Cypriot woman of 32 at 0.60x risk was told she was 0.2 years BELOW average when the life
// table puts her 4.2 above it.
//
// No profile assembled on this side can be the average person — the average is a property of the
// country's life table, which only the service holds. It now arrives as `national_avg_years` on the
// same response that carries `relative_risk`, so the two cannot come apart again.

export function createHttpClient(): ApiClient {
  // Cache the "why" breakdown and the point estimate from each /api/estimate call, keyed by the exact
  // profile, so the Why? and Benchmark surfaces don't trigger a second scoring round-trip for a profile
  // just estimated.
  const whyCache = new Map<string, Attribution[]>()
  const yearsCache = new Map<string, number>()
  // `number | null`, never absent. Skipping the write on a missing field would leave `has()` false,
  // so every getBenchmark would re-POST /estimate — with the caller's auth, writing a history row per
  // view of the card. The null sentinel keeps the entry present and the meaning explicit.
  const avgCache = new Map<string, number | null>()
  const keyOf = (p: Profile) => JSON.stringify(p)

  const runEstimate = async (profile: Profile): Promise<EstimateEnvelope> => {
    const env = await post<EstimateEnvelope>('/estimate', profile)
    whyCache.set(
      keyOf(profile),
      env.why.map((w) => ({
        // The service has always sent this; the client dropped it on the floor, so no page could
        // join a breakdown row back to the ontology except by its display label.
        key: w.key,
        factor: w.factor,
        delta_years: w.delta_years,
        evidence: asGrade(w.evidence),
        role: asRole(w.role),
        citation: w.citation,
        url: w.url,
        doi: w.doi,
        first_author: w.first_author,
        year: w.year,
      })),
    )
    yearsCache.set(keyOf(profile), env.estimate_years)
    avgCache.set(
      keyOf(profile),
      typeof env.national_avg_years === 'number' && Number.isFinite(env.national_avg_years)
        ? env.national_avg_years
        : null,
    )
    return env
  }

  return {
    async register(email, password, locale) {
      return post<AuthResult>('/auth/register', { email, password, locale })
    },
    async login(email, password) {
      return post<AuthResult>('/auth/login', { email, password })
    },

    async getMeta(): Promise<Meta> {
      return get<Meta>('/meta')
    },

    async estimate(profile: Profile): Promise<Estimate> {
      const env = await runEstimate(profile)
      return {
        estimate_years: env.estimate_years,
        interval: env.interval,
        reaches_age: env.reaches_age,
        relative_risk: env.relative_risk,
        country: env.country,
        calculation_id: env.calculation_id,
      }
    },

    async whatif(base: Profile, changes: WhatIfChanges, baseCalculationId?: string): Promise<WhatIf> {
      return post<WhatIf>('/whatif', { base, changes, base_calculation_id: baseCalculationId })
    },

    async listCalculations(): Promise<CalcRow[]> {
      return get<CalcRow[]>('/calculations')
    },

    async getAnswers(): Promise<AnswerRow[]> {
      return get<AnswerRow[]>('/answers')
    },

    async saveAnswers(answers: AnswerInput[]): Promise<{ saved: number }> {
      return post<{ saved: number }>('/answers', { answers })
    },

    async setHomeLocation(name: string, country: string): Promise<void> {
      await post<unknown>('/profile/location', { name, country })
    },

    async getBenchmark(profile: Profile): Promise<Benchmark> {
      const key = keyOf(profile)
      // One call, one life table, both numbers. This also stops the second estimate that used to run
      // here: scoring the invented reference posted it to the shared anonymous account, so every view
      // of this card wrote a fictional healthy person into the aggregates.
      if (!yearsCache.has(key) || !avgCache.has(key)) await runEstimate(profile)
      const userYears = yearsCache.get(key)
      const avgYears = avgCache.get(key)
      // Throwing puts the query in its error state, so `LifeClockPage`'s `benchmark.data &&` drops
      // the card. No comparison is the honest outcome when there is no average to compare against.
      if (userYears === undefined || avgYears === undefined || avgYears === null) {
        throw new Error('no national average is available for this country')
      }
      return { national_avg_years: avgYears, delta_years: round1(userYears - avgYears) }
    },

    async getWhy(profile: Profile): Promise<Attribution[]> {
      const cached = whyCache.get(keyOf(profile))
      if (cached) return cached
      await runEstimate(profile)
      return whyCache.get(keyOf(profile)) ?? []
    },

    async getRecommendations(profile: Profile): Promise<Recommendation[]> {
      const rows = await post<
        Array<{
          feature: string
          message: string
          role: string
          evidence_grade: string | null
          evidence_citation: string
          impact_years: number
          score: number
        }>
      >('/recommendations', profile)
      return rows.map((r) => ({
        factor: r.feature,
        role: r.role === 'manage' ? 'manage' : 'lever',
        headline: r.message,
        detail: r.evidence_citation,
        potential_years: round1(Math.abs(r.impact_years)),
        evidence: asGrade(r.evidence_grade),
        difficulty: 2,
        priority: round1(r.score),
      }))
    },

    async getOntology(): Promise<Ontology> {
      const raw = await get<Record<string, unknown>>('/ontology')
      // Strip the file's leading `_comment`/`_meta` bookkeeping keys — the UI wants factors only.
      return Object.fromEntries(
        Object.entries(raw).filter(([k]) => !k.startsWith('_')),
      ) as Ontology
    },

    async listLocations(): Promise<Location[]> {
      const rows = await get<
        Array<{ name: string; country: string; pm25?: number | null; ndvi?: number | null; area_type?: string | null }>
      >('/locations')
      return rows.map((l) => ({
        id: l.name,
        name: l.name,
        // A missing exposure stays unknown — coercing it to 0 would score pristine air (PR#1 N1).
        pm25: l.pm25 ?? undefined,
        ndvi: l.ndvi ?? undefined,
        kind: l.area_type === 'rural' ? 'rural' : l.area_type === 'suburb' ? 'suburb' : 'city',
      }))
    },

    async relocate(profile: Profile, candidateId: string, toCountry?: string): Promise<RelocateResult> {
      const destination = toCountry ?? profile.country
      const res = await post<{
        from: { name: string; pm25: number; ndvi: number } | null
        to: { name: string; pm25: number; ndvi: number }
        delta_years: number
        moving_country: boolean
        from_country: string
        to_country: string
        breakdown: {
          air_delta_years: number | null
          greenspace_delta_years: number | null
          national_delta_years: number | null
          address_delta_years: number | null
        }
        note: string
      }>('/relocate', { base: profile, to: candidateId, country: destination })

      const current: Location = res.from
        ? { id: res.from.name, name: res.from.name, pm25: res.from.pm25, ndvi: res.from.ndvi, kind: 'city' }
        : {
            id: 'current',
            name: 'your current area',
            // Unknown stays unknown — 0 µg/m³ would read as pristine air (PR#1 N1).
            pm25: profile.pm25,
            ndvi: profile.ndvi,
            kind: 'city',
          }
      const candidate: Location = { id: res.to.name, name: res.to.name, pm25: res.to.pm25, ndvi: res.to.ndvi, kind: 'city' }
      const { air_delta_years: air, greenspace_delta_years: green } = res.breakdown
      const signed = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} yr`
      // Across a border the sentence is about the two halves that exist there; within one country it is
      // about air and greenness. Saying "air accounts for +0.0" after a move abroad would be reporting
      // a split the service deliberately did not make, because it is not separable across a border.
      const explanation = res.moving_country
        ? `Almost all of this is the country itself — its death rates account for ` +
          `${signed(res.breakdown.national_delta_years ?? 0)} and the address for ` +
          `${signed(res.breakdown.address_delta_years ?? 0)}. ${res.note}`
        : air === null || green === null
          ? res.note
          : `Air quality accounts for ${signed(air)} and greenspace ${signed(green)} of the difference. ${res.note}`
      return {
        current,
        candidate,
        delta_years: res.delta_years,
        explanation,
        moving_country: res.moving_country,
        from_country: res.from_country,
        to_country: res.to_country,
        national_delta_years: res.breakdown.national_delta_years,
        address_delta_years: res.breakdown.address_delta_years,
      }
    },

    async getAtlas(): Promise<AtlasData> {
      // No auth header: this is population data, and the service serves it identically to everyone.
      // Sending a token would only invite a cache keyed on who asked.
      return get<AtlasData>('/atlas')
    },

    async getEnvironment(): Promise<AtlasEnvironment> {
      // `/atlas/environment`, not `/api/atlas/environment`: `get` already prepends `/api`. The last
      // route added here was written the other way and 404'd — through every unit test, because they
      // run against the mock. Only the browser found it.
      return get<AtlasEnvironment>('/atlas/environment')
    },

    async getPlaces(iso3: string): Promise<CountryPlaces> {
      return get<CountryPlaces>(`/places/${encodeURIComponent(iso3)}`)
    },

    async getStats(): Promise<CohortStat[]> {
      const agg = await get<{
        n: number
        estimate_years: { mean: number; p10: number; p50: number; p90: number } | null
        by_country: Array<{ country: string | null; n: number; mean_years: number | null }>
      }>('/aggregates')

      const stats: CohortStat[] = [
        {
          label: 'All users',
          cohort_size: agg.n,
          mean_estimate_years: agg.estimate_years ? round1(agg.estimate_years.mean) : null,
          suppressed: agg.estimate_years === null,
        },
        ...agg.by_country.map((c) => ({
          label: c.country ?? 'Unknown',
          cohort_size: c.n,
          mean_estimate_years: c.mean_years != null ? round1(c.mean_years) : null,
          suppressed: c.mean_years == null,
        })),
      ]
      return stats
    },
  }
}
