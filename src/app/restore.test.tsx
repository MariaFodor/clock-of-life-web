// What comes back out of the database is not the shape that went in.
//
// The interview submits a profile with its unanswered optionals ABSENT (questionnaire.ts `buildProfile`
// spreads them in conditionally), but the service stores `serde_json::to_value(&profile)` over a struct
// with no `skip_serializing_if` (service scoring.rs `Profile`, lib.rs), so every `None` is written as a
// JSON null. A row scored without a home location comes back carrying `"pm25": null`, and every surface
// asks `pm25 === undefined`.

import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { RelocatePage } from '../features/relocate/RelocatePage'
import { createMockClient } from '../api/mockClient'
import { renderWithProviders, SAMPLE_CALC_ROW } from '../test/harness'
import { useProfile } from './profile'
import type { CalcRow } from '../api/types'

const SESSION = { email: 'a@example.com' }

/**
 * One stored calculation from a reader who answered no optional question, serialised exactly as the
 * service serialises it: the required fields as values, every `Option::None` as null. `cigs_day` is a
 * bare `f64` over there, not an `Option`, so it comes back 0 rather than null — the shape is copied
 * from the struct rather than assumed.
 */
const ROW_WITH_NULLS: CalcRow = {
  ...SAMPLE_CALC_ROW,
  inputs: {
    country: 'RO',
    age: 45,
    sex: 'F',
    smoke: 0,
    pa_min: 400,
    sleep: 7.5,
    waist: 88,
    bmi: 25.9,
    cigs_day: 0,
    sbp: null,
    diabetes: false,
    high_bp: false,
    respiratory: false,
    cvd_hx: false,
    cancer_hx: false,
    higher_educ: false,
    income: 2.5,
    pm25: null,
    ndvi: null,
    diet_score: null,
    alcohol: null,
    sitting_hours: null,
    stress_score: null,
    mobility: null,
  },
}

/** A client serving `rows` as this account's history. */
function historyClient(rows: CalcRow[]) {
  const client = createMockClient()
  client.listCalculations = async () => rows
  return client
}

/** Names the fields the restored profile actually has, so a test can ask what came back. */
function ProfileKeys() {
  const { profile } = useProfile()
  if (!profile) return <div>no profile</div>
  return <div data-testid="profile-keys">{Object.keys(profile).join(' ')}</div>
}

describe('restoring a profile the service has serialised', () => {
  it('brings an unanswered optional back as absent, never as null', async () => {
    renderWithProviders(<ProfileKeys />, { client: historyClient([ROW_WITH_NULLS]), session: SESSION })

    const keys = (await screen.findByTestId('profile-keys')).textContent!.split(' ')

    // What was answered is there, unchanged.
    expect(keys).toEqual(expect.arrayContaining(['country', 'age', 'sex', 'smoke', 'bmi', 'waist']))
    // What was not answered is GONE, rather than present and null. A null passes every
    // `=== undefined` test the surfaces are written with and then fails on the first method call.
    for (const optional of [
      'sbp',
      'pm25',
      'ndvi',
      'diet_score',
      'alcohol',
      'sitting_hours',
      'stress_score',
      'mobility',
    ]) {
      expect(keys).not.toContain(optional)
    }
  })

  it('lets "Where Should I Live?" describe an unmeasured home instead of crashing on it', async () => {
    renderWithProviders(<RelocatePage />, { client: historyClient([ROW_WITH_NULLS]), session: SESSION })

    // `homeUnmeasured` asks `pm25 === undefined`, which a null walks straight past — and the strip it
    // guards then calls `profile.pm25.toFixed(1)`. That is a blank page on every reload, for every
    // reader who skipped the location question.
    expect(await screen.findByText(/no air measurement is recorded for your home/i)).toBeInTheDocument()
  })
})
