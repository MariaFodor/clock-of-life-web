// The API client seam.
//
// Every network call goes through this interface. Today it is backed by `mockClient`; when the generated
// OpenAPI client lands, only `provideClient`/the default export changes — pages and hooks are untouched.

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

export interface ApiClient {
  // ── Live service contract (clock-of-life-service) ──
  getMeta(): Promise<Meta>
  estimate(profile: Profile): Promise<Estimate>
  whatif(base: Profile, changes: WhatIfChanges, baseCalculationId?: string): Promise<WhatIf>
  listCalculations(): Promise<CalcRow[]>
  getAnswers(): Promise<AnswerRow[]>
  saveAnswers(answers: AnswerInput[]): Promise<{ saved: number }>

  // ── Mock-only (surfaces ahead of their endpoints) ──
  getBenchmark(profile: Profile): Promise<Benchmark>
  getWhy(profile: Profile): Promise<Attribution[]>
  getRecommendations(profile: Profile): Promise<Recommendation[]>
  listLocations(): Promise<Location[]>
  relocate(profile: Profile, candidateId: string): Promise<RelocateResult>
  getStats(): Promise<CohortStat[]>
}

let active: ApiClient | null = null

/** Swap the client (used by main to install the mock, and by tests to inject fakes). */
export function provideClient(client: ApiClient): void {
  active = client
}

export function getClient(): ApiClient {
  if (!active) throw new Error('API client not initialised — call provideClient() first')
  return active
}
