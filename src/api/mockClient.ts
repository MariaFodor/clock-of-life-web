// In-memory mock implementation of ApiClient.
//
// Deterministic and dependency-free so pages render in dev and tests run without a network. It keeps a
// tiny amount of session state (calculation history, saved answers) to make Progress and the interview
// round-trip feel real. Scoring is delegated to mockScoring (the pure, tested core).

import atlasFixture from '../features/atlas/atlas.fixture.json'

import type { AtlasData, AtlasEnvironment, CountryPlaces } from './types'

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
  Ontology,
  Meta,
  Profile,
  Recommendation,
  RelocateResult,
  WhatIf,
  WhatIfChanges,
} from './types'
import { attributions, averageRemainingYears, scoreEstimate, scoreWhatIf } from './mockScoring'

const CONFIDENCE_WEIGHT = { strong: 1.0, moderate: 0.7, weak: 0.4, na: 0.2 } as const

const LOCATIONS: Location[] = [
  { id: 'bucuresti', name: 'Bucharest', pm25: 19.4, ndvi: 0.34, kind: 'city' },
  { id: 'cluj', name: 'Cluj-Napoca', pm25: 15.1, ndvi: 0.43, kind: 'city' },
  { id: 'brasov', name: 'Brașov', pm25: 12.0, ndvi: 0.56, kind: 'suburb' },
  { id: 'bran-rural', name: 'Bran (rural)', pm25: 7.8, ndvi: 0.73, kind: 'rural' },
]

/**
 * ENV term (THE_QUESTIONNAIRE.md Q23/Q24) as a log-hazard contribution. An unknown exposure on
 * either side contributes 0 for that component — missing data is not pristine air (PR#1 N1).
 */
function envLogHazard(loc: Location, ref: Location): number {
  const air =
    loc.pm25 === undefined || ref.pm25 === undefined
      ? 0
      : Math.log(1.095) * ((loc.pm25 - ref.pm25) / 10)
  const green =
    loc.ndvi === undefined || ref.ndvi === undefined
      ? 0
      : Math.log(0.965) * ((loc.ndvi - ref.ndvi) / 0.1)
  return air + green
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
        countries: ['RO', 'DE', 'FR', 'IT', 'ES', 'PL'],
        country_options: [
          { iso2: 'RO', iso3: 'ROU', name: 'Romania', settlements: 60 },
          { iso2: 'DE', iso3: 'DEU', name: 'Germany', settlements: 249 },
          { iso2: 'FR', iso3: 'FRA', name: 'France', settlements: 200 },
          { iso2: 'IT', iso3: 'ITA', name: 'Italy', settlements: 266 },
          { iso2: 'ES', iso3: 'ESP', name: 'Spain', settlements: 244 },
          { iso2: 'PL', iso3: 'POL', name: 'Poland', settlements: 158 },
        ],
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

    async setHomeLocation(_name: string, _country: string): Promise<void> {},

    // A small but structurally faithful slice of the real ontology: enough edges that the graph
    // renders and its "acts through" story is true, with the same verified DOIs the model ships.
    async getOntology(): Promise<Ontology> {
      return {
        education: { role: 'context', causes: ['income', 'smk_current', 'diet', 'activity', 'waist'], grade: 'moderate',
                     prior: { doi: '10.1056/NEJMsa0707519', first_author: 'Mackenbach', year: 2008 } },
        income: { role: 'context', causes: ['diet', 'activity', 'waist', 'env'], grade: 'moderate',
                  prior: { doi: '10.1056/NEJMsa0707519', first_author: 'Mackenbach', year: 2008 } },
        env: { role: 'context', causes: ['respiratory'], grade: 'moderate',
               prior: { doi: '10.1289/ehp.1307049', first_author: 'Burnett', year: 2014 } },
        smk_current: { role: 'lever', causes: ['respiratory', 'cvd_hx', 'waist'], sign: 'positive', grade: 'strong',
                       prior: { doi: '10.1056/NEJMsa1211128', first_author: 'Jha', year: 2013 } },
        activity: { role: 'lever', causes: ['waist', 'diabetes', 'sbp'], sign: 'negative', grade: 'strong',
                    prior: { doi: '10.1001/jamainternmed.2015.0533', first_author: 'Arem', year: 2015 } },
        diet: { role: 'lever', causes: ['waist', 'sbp', 'diabetes'], sign: 'negative', grade: 'strong',
                prior: { doi: '10.1056/NEJMoa025039', first_author: 'Trichopoulou', year: 2003 } },
        alcohol: { role: 'lever', causes: ['sbp', 'cancer_hx'], sign: 'positive', grade: 'strong',
                   prior: { doi: '10.1016/S0140-6736(18)31310-2', first_author: 'Griswold', year: 2018 } },
        sedentary: { role: 'lever', causes: ['waist', 'diabetes'], sign: 'positive', grade: 'moderate',
                     prior: { doi: '10.1371/journal.pone.0080000', first_author: 'Chau', year: 2013 } },
        waist: { role: 'lever', causes: ['diabetes', 'sbp', 'cvd_hx', 'mobility'], sign: 'positive', grade: 'strong',
                 prior: { doi: '10.1136/bmj.m3324', first_author: 'Jayedi', year: 2020 } },
        diabetes: { role: 'manage', causes: ['cvd_hx', 'mobility'], sign: 'positive', grade: 'strong',
                    prior: { doi: '10.1056/NEJMoa1008862', first_author: 'Emerging Risk Factors Collaboration', year: 2011 } },
        sbp: { role: 'manage', causes: ['cvd_hx'], sign: 'positive', grade: 'strong',
               prior: { doi: '10.1016/S0140-6736(02)11911-8', first_author: 'Prospective Studies Collaboration', year: 2002 } },
        respiratory: { role: 'manage', causes: ['mobility'], sign: 'positive', grade: 'strong',
                       prior: { doi: '10.1183/09031936.06.00124605', first_author: 'Halbert', year: 2006 } },
        cvd_hx: { role: 'context', causes: ['mobility'], sign: 'positive', grade: 'strong',
                  prior: { doi: '10.1001/jama.2015.7008', first_author: 'Di Angelantonio', year: 2015 } },
        cancer_hx: { role: 'context', causes: ['mobility'], sign: 'positive', grade: 'strong',
                     prior: { doi: '10.3322/caac.21565', first_author: 'Miller', year: 2019 } },
        sleep_long: { role: 'marker', causes: [], sign: 'positive', grade: 'moderate',
                      decision: 'Demoted from lever to marker: illness causes long sleep more than the reverse, so it explains but is never recommended.',
                      prior: { doi: '10.1093/sleep/33.5.585', first_author: 'Cappuccio', year: 2010 } },
        mobility: { role: 'marker', causes: [], sign: 'positive', grade: 'strong',
                    prior: { doi: '10.1001/jama.2010.1923', first_author: 'Studenski', year: 2011 } },
      }
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
          factor: 'smk_current',
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
          factor: 'activity',
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
          factor: 'waist',
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
          factor: 'diabetes',
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
          factor: 'high_bp',
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
      // The candidate is a place NAME resolved INSIDE the reader's own country, which is the rule the
      // service applies: `location_by_name(name, country)` over rows seeded from the same places.json
      // that `/places/{iso3}` serves, and a 404 "unknown location" for anything else. Matching against
      // the four illustrative rows instead priced every settlement as Bucharest.
      const atlas = await this.getAtlas()
      const iso3 = atlas.countries.find((c) => c.iso2 === profile.country)?.iso3 ?? null
      const places = iso3 ? (await this.getPlaces(iso3)).places : []
      const match = places.find((p) => p.city === candidateId)
      if (!match) throw new Error(`unknown location: ${candidateId} (${profile.country})`)

      const candidate: Location = {
        id: match.city,
        name: match.city,
        pm25: match.pm25,
        ndvi: match.ndvi ?? undefined,
        kind: 'city',
      }
      // The baseline is the reader's OWN recorded exposure, as `from` is on the wire. Unknown stays
      // unknown — 0 µg/m³ would read as pristine air (PR#1 N1).
      const current: Location = {
        id: 'current',
        name: 'your current area',
        pm25: profile.pm25,
        ndvi: profile.ndvi,
        kind: 'city',
      }
      // Only the ENV term changes when relocating, so the person's other risk cancels: the year effect
      // depends solely on the change in environmental log-hazard.
      const dLogHazard = envLogHazard(candidate, current)
      const base = scoreEstimate(profile).estimate_years
      const scenario = base * Math.pow(Math.exp(dLogHazard), -0.4)
      const delta = round1(scenario - base)
      const comparable = candidate.pm25 !== undefined && current.pm25 !== undefined
      const cleaner = comparable && candidate.pm25! < current.pm25!
      return {
        current,
        candidate,
        delta_years: delta,
        // Never state a comparison we cannot make: an unknown exposure on either side gets its
        // own branch instead of an "undefined vs undefined" claim (PR#1 round-2 note). The claim is
        // also held to what was actually tested — this used to add "and more greenspace" to the
        // cleaner-air branch, which compared nothing but air.
        explanation: !comparable
          ? `No air measurement is recorded for your home, so this comparison covers only what we could measure.`
          : cleaner
            ? `${candidate.name} has cleaner air than your home — ${candidate.pm25} against ${current.pm25} µg/m³.`
            : `${candidate.name} has more fine-particle pollution than your home — ${candidate.pm25} against ${current.pm25} µg/m³.`,
      }
    },

    async getAtlas(): Promise<AtlasData> {
      // Generated from the service's OWN response (see atlas.parity.test.ts), not written by hand:
      // a fixture invented in this repo is a second source of truth that drifts silently, which is
      // the whole failure this surface was redesigned to avoid.
      return atlasFixture as AtlasData
    },

    async getPlaces(iso3: string): Promise<CountryPlaces> {
      // Derived from the environment fixture and the atlas fixture rather than being a third generated
      // file: the two together already carry every settlement's coordinates and every country's
      // exposure reference, and a 700 KB places fixture would be the largest thing in this repo.
      //
      // ONE fidelity gap, stated rather than hidden: the environment payload carries no per-city
      // greenness (it is a country figure for 3,066 of the 3,521 settlements, and a value that is
      // usually the country's cannot be drawn as a property of a point), so every place here reports
      // `ndvi_basis: 'country'`. Against the real service, 426 of them say 'city'. The mock is for
      // offline UI work; the shipped client is the http one.
      const env = await this.getEnvironment()
      const atlas = await this.getAtlas()
      const country = atlas.countries.find((c) => c.iso3 === iso3)
      const places = env.points
        .filter((p) => p.iso3 === iso3)
        .map((p) => ({
          iso3: p.iso3, city: p.city, lat: p.lat, lon: p.lon, population: null,
          pm25: p.pm25, pm25_year: p.year, pm25_stations: null, pm25_temporal_coverage: null,
          ndvi: country?.env?.ndvi ?? null,
          ndvi_year: null,
          ndvi_basis: (country?.env?.ndvi == null ? null : 'country') as 'city' | 'country' | null,
          ndvi_matched_city: null, ndvi_distance_km: null,
        }))
        .sort((a, b) => a.city.localeCompare(b.city))
      return {
        iso3,
        iso2: country?.iso2 ?? null,
        name: country?.name ?? null,
        scoreable: country?.scoreable ?? false,
        reference: country?.env ?? null,
        places,
        coverage: {
          settlements: places.length,
          with_city_greenness: 0,
          with_country_greenness: places.filter((p) => p.ndvi_basis === 'country').length,
          without_greenness: places.filter((p) => p.ndvi_basis === null).length,
        },
      }
    },

    async getEnvironment(): Promise<AtlasEnvironment> {
      // Dynamically imported, unlike the atlas fixture: 3,521 points are several hundred KB, and a
      // static import would put them in the main chunk for every reader, including the ones who never
      // open the World tab. Generated from the service verbatim — not sampled — because the page states
      // coverage numbers and a thinned fixture would make every one of them wrong in the mock.
      const mod = await import('../features/atlas/environment.fixture.json')
      return (mod.default ?? mod) as unknown as AtlasEnvironment
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
