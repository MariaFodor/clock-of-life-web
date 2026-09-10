// Logout must wipe per-account client state: the in-memory profile/estimate (and the query cache),
// so the next sign-in on a shared machine can never see the previous user's data (REVIEW-2026-09-09 W2).
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  renderWithProviders,
  SAMPLE_CALC_ROW,
  SAMPLE_ESTIMATE,
  SAMPLE_PROFILE,
  sessionAccountId,
  sessionToken,
} from '../test/harness'
import { createMockClient } from '../api/mockClient'
import { getToken } from '../api/token'
import { useAnswers } from '../api/hooks'
import type { AnswerRow, CalcRow } from '../api/types'
import { useAuth } from './auth'
import { useProfile } from './profile'

function Probe() {
  const { logout } = useAuth()
  const { profile, estimate } = useProfile()
  return (
    <div>
      <span>{profile ? `age:${profile.age}` : 'no-profile'}</span>
      <span>{estimate ? `years:${estimate.estimate_years}` : 'no-estimate'}</span>
      <button type="button" onClick={logout}>
        sign out
      </button>
    </div>
  )
}

describe('logout', () => {
  it('resets the in-memory profile and estimate', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Probe />, { profile: SAMPLE_PROFILE, estimate: SAMPLE_ESTIMATE })

    expect(screen.getByText('age:45')).toBeInTheDocument()
    expect(screen.getByText('years:31.2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /sign out/i }))

    expect(screen.getByText('no-profile')).toBeInTheDocument()
    expect(screen.getByText('no-estimate')).toBeInTheDocument()
  })
})

// UX-3 restores a profile from the server on load, which is exactly the thing FIX-W2 spent its time
// making sure could not cross an account boundary. So: it must come back for the account that saved
// it, and never for the one that signs in next.
describe('an account boundary, now that saved work comes back', () => {
  const FIRST = 'first@example.com'
  const SECOND = 'second@example.com'

  const savedAnswer = (value: unknown): AnswerRow[] => [
    { question_code: 'Q1_age', question_version: 1, value, created_at: '2026-09-09T10:00:00.000Z' },
  ]

  /** Answers as whichever account presents its token, the way the real client is identified. */
  function twoAccountClient() {
    const client = createMockClient()
    const held: Record<string, { calculation: CalcRow; answers: AnswerRow[] }> = {
      [sessionToken(FIRST)]: {
        calculation: { ...SAMPLE_CALC_ROW, inputs: { ...SAMPLE_PROFILE, age: 45 } },
        answers: savedAnswer(45),
      },
      [sessionToken(SECOND)]: {
        calculation: {
          ...SAMPLE_CALC_ROW,
          id: 'calc-second',
          estimate_years: 12.5,
          inputs: { ...SAMPLE_PROFILE, age: 70 },
        },
        answers: savedAnswer(70),
      },
    }
    const forCaller = () => held[getToken() ?? '']
    client.login = async (email: string) => ({
      token: sessionToken(email),
      account_id: sessionAccountId(email),
    })
    client.listCalculations = async () => {
      const account = forCaller()
      return account ? [account.calculation] : []
    }
    client.getAnswers = async () => forCaller()?.answers ?? []
    return client
  }

  /** Mirrors how the app queries: the saved answers belong to a session, so they are asked for
   *  only while there is one (see InterviewPage). */
  function AccountProbe() {
    const { session, login, logout } = useAuth()
    const { profile, estimate } = useProfile()
    const answers = useAnswers(Boolean(session))
    return (
      <div>
        <span>{profile ? `age:${profile.age}` : 'no-profile'}</span>
        <span>{estimate ? `years:${estimate.estimate_years}` : 'no-estimate'}</span>
        <span>{`answers:${(answers.data ?? []).map((r) => String(r.value)).join(',') || 'none'}`}</span>
        <button type="button" onClick={logout}>
          sign out
        </button>
        <button type="button" onClick={() => void login(SECOND, 'hunter2hunter2')}>
          sign in as the second account
        </button>
      </div>
    )
  }

  it('brings back the signed-in account’s own saved work, and only theirs', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AccountProbe />, {
      client: twoAccountClient(),
      session: { email: FIRST },
    })

    expect(await screen.findByText('age:45')).toBeInTheDocument()
    expect(screen.getByText('years:31.2')).toBeInTheDocument()
    expect(await screen.findByText('answers:45')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /sign out/i }))

    expect(screen.getByText('no-profile')).toBeInTheDocument()
    expect(screen.getByText('no-estimate')).toBeInTheDocument()
    expect(screen.getByText('answers:none')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /sign in as the second account/i }))

    expect(await screen.findByText('age:70')).toBeInTheDocument()
    expect(screen.getByText('years:12.5')).toBeInTheDocument()
    expect(await screen.findByText('answers:70')).toBeInTheDocument()
    expect(screen.queryByText('age:45')).not.toBeInTheDocument()
    expect(screen.queryByText('years:31.2')).not.toBeInTheDocument()
    expect(screen.queryByText('answers:45')).not.toBeInTheDocument()
  })
})
