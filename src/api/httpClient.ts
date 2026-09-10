// The real backend client — talks to clock-of-life-service over HTTP.
//
// In dev, Vite proxies /api → http://localhost:8080 (see vite.config.ts); in production the service
// serves the built SPA from the same origin, so a relative base works in both. Responses are mapped to
// the web's view types (src/api/types.ts). This is the seam the mock also implements, so pages and hooks
// are identical against either.

import type { AtlasData } from './types'

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

async function request<T>(path: string, init: RequestInit = {}, skipAuth = false): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body) headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token && !skipAuth) headers.set('Authorization', `Bearer ${token}`)

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
    throw new Error(message)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

const post = <T>(path: string, body: unknown, skipAuth = false) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) }, skipAuth)
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
  why: Array<{
    key: string; factor: string; delta_years: number; evidence: string; role: string
    citation: string
    url?: string; doi?: string; first_author?: string; year?: number
  }>
}

/** A reference "average person" of the same age & sex, for the benchmark comparison (RR ≈ 1). */
function referenceProfile(p: Profile): Profile {
  return {
    country: p.country,
    age: p.age,
    sex: p.sex,
    smoke: 0,
    pa_min: 600,
    sleep: 7,
    waist: p.sex === 'F' ? 84 : 96,
    bmi: 25.5,
    cigs_day: 0,
    income: 2.5,
    diabetes: false,
    high_bp: false,
    respiratory: false,
    cvd_hx: false,
    cancer_hx: false,
    higher_educ: false,
  }
}

export function createHttpClient(): ApiClient {
  // Cache the "why" breakdown and the point estimate from each /api/estimate call, keyed by the exact
  // profile, so the Why? and Benchmark surfaces don't trigger a second scoring round-trip for a profile
  // just estimated.
  const whyCache = new Map<string, Attribution[]>()
  const yearsCache = new Map<string, number>()
  const keyOf = (p: Profile) => JSON.stringify(p)

  // skipAuth routes the write to the shared anonymous account instead of the caller's — used for the
  // benchmark's "average person" reference so it never appears in the user's own history.
  const runEstimate = async (profile: Profile, skipAuth = false): Promise<EstimateEnvelope> => {
    const env = await post<EstimateEnvelope>('/estimate', profile, skipAuth)
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
      const userYears = yearsCache.get(key) ?? (await runEstimate(profile)).estimate_years
      const avgYears = (await runEstimate(referenceProfile(profile), true)).estimate_years
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

    async relocate(profile: Profile, candidateId: string): Promise<RelocateResult> {
      const res = await post<{
        from: { name: string; pm25: number; ndvi: number } | null
        to: { name: string; pm25: number; ndvi: number }
        delta_years: number
        breakdown: { air_delta_years: number; greenspace_delta_years: number }
        note: string
      }>('/relocate', { base: profile, to: candidateId, country: profile.country })

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
      const air = res.breakdown.air_delta_years
      const green = res.breakdown.greenspace_delta_years
      const explanation = `Air quality accounts for ${air >= 0 ? '+' : ''}${air.toFixed(1)} yr and greenspace ${green >= 0 ? '+' : ''}${green.toFixed(1)} yr of the difference. ${res.note}`
      return { current, candidate, delta_years: res.delta_years, explanation }
    },

    async getAtlas(): Promise<AtlasData> {
      // No auth header: this is population data, and the service serves it identically to everyone.
      // Sending a token would only invite a cache keyed on who asked.
      return get<AtlasData>('/atlas')
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
