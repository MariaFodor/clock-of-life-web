// In-memory mock implementation of ApiClient.
//
// Deterministic and dependency-free so pages render in dev and tests run without a network. It keeps a
// tiny amount of session state (calculation history, saved answers) to make Progress and the interview
// round-trip feel real. Scoring is delegated to mockScoring (the pure, tested core).

import type { ApiClient } from './client'
import type {
  AnswerInput,
  AnswerRow,
  Attribution,
  Benchmark,
  CalcRow,
  CohortStat,
  Estimate,
  Location,
  Meta,
  Profile,
  Recommendation,
  RelocateResult,
  WhatIf,
  WhatIfChanges,
} from './types'
import { attributions, averageRemainingYears, scoreEstimate, scoreWhatIf } from './mockScoring'

const CONFIDENCE_WEIGHT = { strong: 1.0, moderate: 0.7, limited: 0.4 } as const

const LOCATIONS: Location[] = [
  { id: 'bucuresti', name: 'Bucharest', pm25: 19.4, ndvi: 0.34, kind: 'city' },
  { id: 'cluj', name: 'Cluj-Napoca', pm25: 15.1, ndvi: 0.43, kind: 'city' },
  { id: 'brasov', name: 'Brașov', pm25: 12.0, ndvi: 0.56, kind: 'suburb' },
  { id: 'bran-rural', name: 'Bran (rural)', pm25: 7.8, ndvi: 0.73, kind: 'rural' },
]

/** ENV term (THE_QUESTIONNAIRE.md Q23/Q24) expressed as a log-hazard contribution. */
function envLogHazard(loc: Location, ref: Location): number {
  return Math.log(1.095) * ((loc.pm25 - ref.pm25) / 10) + Math.log(0.965) * ((loc.ndvi - ref.ndvi) / 0.1)
}

const round1 = (x: number) => Math.round(x * 10) / 10

/** A short stable id for mock rows. */
function mockId(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return `mock-${h.toString(16).padStart(8, '0')}`
}

export function createMockClient(): ApiClient {
  const history: CalcRow[] = []
  const answers = new Map<string, AnswerRow>()
  let seq = 0

  return {
    async register(email: string): Promise<{ token: string; account_id: string }> {
      return { token: `mock-token-${mockId(email)}`, account_id: mockId(`acct-${email}`) }
    },
    async login(email: string): Promise<{ token: string; account_id: string }> {
      return { token: `mock-token-${mockId(email)}`, account_id: mockId(`acct-${email}`) }
    },

    async getMeta(): Promise<Meta> {
      return {
        model_version: '2.0.0',
        algorithm: 'cox_ph',
        countries: ['RO'],
        assumptions: [
          'statistical estimate, not a prediction or diagnosis',
          'relative risk centred on the selected country’s average person',
        ],
      }
    },

    async estimate(profile: Profile): Promise<Estimate> {
      const s = scoreEstimate(profile)
      const id = mockId(`calc-${seq++}-${JSON.stringify(profile)}`)
      history.unshift({
        id,
        input_hash: mockId(JSON.stringify(profile)).slice(5),
        estimate_years: s.estimate_years,
        interval_low: s.interval[0],
        interval_high: s.interval[1],
        reaches_age: s.reaches_age,
        relative_risk: s.relative_risk,
        inputs: profile,
        attributions: attributions(profile),
        created_at: new Date().toISOString(),
      })
      return { ...s, calculation_id: id }
    },

    async whatif(base: Profile, changes: WhatIfChanges): Promise<WhatIf> {
      return scoreWhatIf(base, changes)
    },

    async listCalculations(): Promise<CalcRow[]> {
      return history.slice(0, 50)
    },

    async getAnswers(): Promise<AnswerRow[]> {
      return [...answers.values()]
    },

    async saveAnswers(input: AnswerInput[]): Promise<{ saved: number }> {
      for (const a of input) {
        answers.set(a.question_code, {
          question_code: a.question_code,
          question_version: 1,
          value: a.value,
          created_at: new Date().toISOString(),
        })
      }
      return { saved: input.length }
    },

    async getBenchmark(profile: Profile): Promise<Benchmark> {
      const avg = averageRemainingYears(profile.age, profile.sex)
      const est = scoreEstimate(profile).estimate_years
      return { national_avg_years: avg, delta_years: round1(est - avg) }
    },

    async getWhy(profile: Profile): Promise<Attribution[]> {
      return attributions(profile)
    },

    async getRecommendations(profile: Profile): Promise<Recommendation[]> {
      const recs: Recommendation[] = []
      const push = (r: Omit<Recommendation, 'priority'>) => {
        const priority = (r.potential_years * CONFIDENCE_WEIGHT[r.evidence]) / r.difficulty
        recs.push({ ...r, priority: round1(priority) })
      }
      const gain = (changes: WhatIfChanges) => Math.max(0, scoreWhatIf(profile, changes).delta_years)

      if (profile.smoke === 2) {
        push({
          factor: 'Smoking',
          role: 'lever',
          headline: 'Stop smoking',
          detail: 'The single largest modifiable factor. Benefit builds over roughly ten years.',
          potential_years: gain({ smoke: 0 }),
          evidence: 'strong',
          difficulty: 3,
        })
      }
      if (profile.pa_min < 900) {
        push({
          factor: 'Physical activity',
          role: 'lever',
          headline: 'Move more — aim for ~150 active minutes a week',
          detail: 'Brisk walking, cycling, or sport most days. Even modest increases help.',
          potential_years: gain({ pa_min: 900 }),
          evidence: 'strong',
          difficulty: 2,
        })
      }
      if (profile.waist > 94) {
        push({
          factor: 'Waist circumference',
          role: 'lever',
          headline: 'Reduce your waistline',
          detail: 'Where you carry weight tracks health better than weight alone.',
          potential_years: gain({ waist: 94 }),
          evidence: 'moderate',
          difficulty: 2,
        })
      }
      if (profile.diabetes) {
        push({
          factor: 'Diabetes',
          role: 'manage',
          headline: 'Keep your diabetes well-controlled',
          detail: 'We never suggest undoing a diagnosis — managing it well protects the years ahead.',
          potential_years: 1.2,
          evidence: 'strong',
          difficulty: 2,
        })
      }
      if (profile.high_bp) {
        push({
          factor: 'High blood pressure',
          role: 'manage',
          headline: 'Keep your blood pressure in range',
          detail: 'Regular monitoring and treatment adherence.',
          potential_years: 0.9,
          evidence: 'strong',
          difficulty: 2,
        })
      }
      return recs.sort((a, b) => b.priority - a.priority)
    },

    async listLocations(): Promise<Location[]> {
      return LOCATIONS
    },

    async relocate(profile: Profile, candidateId: string): Promise<RelocateResult> {
      // The user's current location is implied by their profile country; mock it as Bucharest.
      const current = LOCATIONS[0]
      const candidate = LOCATIONS.find((l) => l.id === candidateId) ?? LOCATIONS[0]
      // Only the ENV term changes when relocating, so the person's other risk cancels: the year effect
      // depends solely on the change in environmental log-hazard.
      const dLogHazard = envLogHazard(candidate, current)
      const base = scoreEstimate(profile).estimate_years
      const scenario = base * Math.pow(Math.exp(dLogHazard), -0.4)
      const delta = round1(scenario - base)
      const cleaner = candidate.pm25 < current.pm25
      return {
        current,
        candidate,
        delta_years: delta,
        explanation: cleaner
          ? `${candidate.name} has cleaner air (PM2.5 ${candidate.pm25} vs ${current.pm25} µg/m³) and more greenspace.`
          : `${candidate.name} has higher PM2.5 (${candidate.pm25} vs ${current.pm25} µg/m³) than your current area.`,
      }
    },

    async getStats(): Promise<CohortStat[]> {
      // k-gated: cohorts under 20 are suppressed and never report a mean (privacy, api-and-scoring.md).
      const raw: Array<{ label: string; size: number; mean: number }> = [
        { label: 'Age 30–39', size: 142, mean: 47.8 },
        { label: 'Age 40–49', size: 98, mean: 38.9 },
        { label: 'Age 50–59', size: 61, mean: 29.4 },
        { label: 'Non-smokers', size: 210, mean: 41.2 },
        { label: 'Current smokers', size: 34, mean: 33.7 },
        { label: 'Age 80+', size: 12, mean: 8.1 }, // suppressed (k < 20)
      ]
      return raw.map((r) => ({
        label: r.label,
        cohort_size: r.size,
        suppressed: r.size < 20,
        mean_estimate_years: r.size < 20 ? null : r.mean,
      }))
    },
  }
}
