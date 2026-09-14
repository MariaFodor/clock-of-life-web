// The benchmark's "average person" — a regression test for a contradiction that reached a reader.
//
// The Life Clock showed, on one card: "your yearly risk of dying is about 40% lower" and "you're 0.2
// years below the average person of your age and sex". Both numbers were computed correctly; they were
// answering different questions. The risk ratio is centred on the country's real prevalence-weighted
// population, while the benchmark's "average" was a profile this file's subject used to build by hand
// — never smoked, 600 MET-min/week, BMI 25.5, no conditions — which the model scores at 0.58x.
//
// Nothing tested `getBenchmark` on either client, which is how a comparison against an invented person
// shipped. These are the tests that would have caught it.

import { describe, expect, it, vi, afterEach } from 'vitest'
import { createHttpClient } from './httpClient'
import { createMockClient } from './mockClient'
import { SAMPLE_PROFILE } from '../test/harness'
import type { Profile } from './types'

const served = {
  estimate_years: 56.4,
  interval: [50.7, 62.0],
  reaches_age: 88.4,
  relative_risk: 0.6,
  national_avg_years: 52.1, // rr = 1.0 over the same life table
  country: 'CY',
  calculation_id: 'calc-1',
  why: [],
}

afterEach(() => vi.unstubAllGlobals())

describe('the benchmark average', () => {
  it('is the number the service served, not one the client assembled', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(served), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = createHttpClient()
    const result = await client.getBenchmark({ ...SAMPLE_PROFILE, country: 'CY', age: 32, sex: 'F' })

    expect(result.national_avg_years).toBe(52.1)
    expect(result.delta_years).toBe(4.3)
  })

  it('asks the service once, and never scores a profile the reader did not enter', async () => {
    // The second call was the invented person, and it was posted with skipAuth — writing a fictional
    // healthy row into the shared anonymous account on every view of this card.
    const bodies: unknown[] = []
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(init?.body ? JSON.parse(init.body as string) : null)
      return new Response(JSON.stringify(served), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const profile: Profile = { ...SAMPLE_PROFILE, country: 'CY', age: 32, sex: 'F', smoke: 2 }
    await createHttpClient().getBenchmark(profile)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(bodies[0]).toMatchObject({ smoke: 2 })
  })

  it('never points the opposite way from the risk ratio, on either client', async () => {
    const client = createMockClient()
    const variants: Profile[] = [
      { ...SAMPLE_PROFILE, smoke: 0, pa_min: 2000, waist: 84, diabetes: false },
      { ...SAMPLE_PROFILE, smoke: 2, pa_min: 0, waist: 115, diabetes: true },
      { ...SAMPLE_PROFILE, smoke: 1, pa_min: 600, waist: 95 },
    ]
    for (const p of variants) {
      const [estimate, benchmark] = [await client.estimate(p), await client.getBenchmark(p)]
      if (estimate.relative_risk < 1) {
        expect(benchmark.delta_years, `rr ${estimate.relative_risk} is below average`).toBeGreaterThan(0)
      } else if (estimate.relative_risk > 1) {
        expect(benchmark.delta_years, `rr ${estimate.relative_risk} is above average`).toBeLessThan(0)
      }
    }
  })
})
