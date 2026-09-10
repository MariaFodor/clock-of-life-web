import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LifeClockPage } from './LifeClockPage'
import {
  renderWithProviders,
  SAMPLE_CALC_ROW,
  SAMPLE_PROFILE,
  SAMPLE_ESTIMATE,
} from '../../test/harness'
import { createMockClient } from '../../api/mockClient'
import type { CalcRow } from '../../api/types'

describe('<LifeClockPage/>', () => {
  it('prompts for the interview when there is no estimate yet', () => {
    renderWithProviders(<LifeClockPage />)
    expect(screen.getByText(/haven’t calculated/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /start the interview/i })).toBeInTheDocument()
  })

  it('shows the estimate with its interval when a profile is present', () => {
    renderWithProviders(<LifeClockPage />, { profile: SAMPLE_PROFILE, estimate: SAMPLE_ESTIMATE })
    expect(screen.getByText('31.2 yr')).toBeInTheDocument()
    expect(screen.getByText(/range 29\.3 yr – 33\.1 yr/i)).toBeInTheDocument()
    expect(screen.getByText(/statistical estimate, not a/i)).toBeInTheDocument()
  })

  it('shows the national-average benchmark comparison', async () => {
    renderWithProviders(<LifeClockPage />, { profile: SAMPLE_PROFILE, estimate: SAMPLE_ESTIMATE })
    expect(await screen.findByText(/how you compare/i)).toBeInTheDocument()
    expect(screen.getByText(/the average person of your age and sex/i)).toBeInTheDocument()
  })

  it('does not show the safeguard note for a normal estimate', () => {
    renderWithProviders(<LifeClockPage />, { profile: SAMPLE_PROFILE, estimate: SAMPLE_ESTIMATE })
    expect(screen.queryByText(/not a statement about you personally/i)).not.toBeInTheDocument()
  })

  it('shows the safeguard note when the estimate lands at/below current age', () => {
    renderWithProviders(<LifeClockPage />, {
      profile: { ...SAMPLE_PROFILE, age: 80 },
      estimate: { ...SAMPLE_ESTIMATE, estimate_years: 0.5, reaches_age: 80 },
    })
    expect(screen.getByText(/not a statement about you personally/i)).toBeInTheDocument()
  })
})

// UX-3: everything below used to be lost on reload — the profile and estimate live in memory, so the
// page said "you haven't calculated" while the calculation sat in the database.
describe('restoring the saved Life Clock', () => {
  const SESSION = { email: 'a@example.com' }

  /** A client serving `rows` as this account's history, counting any attempt to score a new estimate. */
  function historyClient(rows: CalcRow[]) {
    const client = createMockClient()
    const scored = { calls: 0 }
    const score = client.estimate
    client.estimate = async (profile) => {
      scored.calls++
      return score(profile)
    }
    client.listCalculations = async () => rows
    return { client, scored }
  }

  it('shows the calculation the server already holds, without scoring a new one', async () => {
    const { client, scored } = historyClient([SAMPLE_CALC_ROW])
    renderWithProviders(<LifeClockPage />, { client, session: SESSION })

    expect(await screen.findByText('31.2 yr')).toBeInTheDocument()
    expect(screen.getByText(/range 29\.3 yr – 33\.1 yr/i)).toBeInTheDocument()
    // Every column of the stored row, not just the headline number.
    expect(screen.getByText('Reaches about').nextElementSibling).toHaveTextContent('age 76')
    expect(screen.getByText('1.28×')).toBeInTheDocument()
    // Every POST /api/estimate appends a history row, so rehydrating through one would add an
    // identical entry to "My Progress" on every reload.
    expect(scored.calls).toBe(0)
  })

  it('offers the interview to an account that has never calculated one', async () => {
    const { client } = historyClient([])
    renderWithProviders(<LifeClockPage />, { client, session: SESSION })

    expect(await screen.findByText(/haven’t calculated/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /start the interview/i })).toBeInTheDocument()
  })

  it('falls back to the empty state when the stored inputs are not a profile any more', async () => {
    // `inputs` is whatever was submitted, by whatever questionnaire was live then. A blob missing
    // the fields the surfaces read must not reach them: a clock drawn around "NaN" looks like an
    // answer, which is worse than being asked to start the interview.
    const { client } = historyClient([
      { ...SAMPLE_CALC_ROW, inputs: { country: 'RO', age: 'forty-five' } },
    ])
    renderWithProviders(<LifeClockPage />, { client, session: SESSION })

    expect(await screen.findByText(/haven’t calculated/i)).toBeInTheDocument()
    expect(screen.queryByText('31.2 yr')).not.toBeInTheDocument()
  })

  it('says it is still looking rather than claiming there is nothing yet', async () => {
    let deliver: (rows: CalcRow[]) => void = () => {}
    const client = createMockClient()
    client.listCalculations = () =>
      new Promise<CalcRow[]>((resolve) => {
        deliver = resolve
      })
    renderWithProviders(<LifeClockPage />, { client, session: SESSION })

    expect(screen.getByRole('status')).toHaveTextContent(/looking for your saved life clock/i)
    expect(screen.queryByText(/haven’t calculated/i)).not.toBeInTheDocument()

    deliver([SAMPLE_CALC_ROW])
    expect(await screen.findByText('31.2 yr')).toBeInTheDocument()
    expect(screen.queryByText(/haven’t calculated/i)).not.toBeInTheDocument()
  })
})

describe('carried notices', () => {
  it('shows a notice handed over by the interview and lets the user dismiss it', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LifeClockPage />, {
      profile: SAMPLE_PROFILE,
      estimate: SAMPLE_ESTIMATE,
      routerState: { notice: 'could not record Cluj-Napoca as your home location' },
    })
    expect(await screen.findByText(/could not record Cluj-Napoca/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByText(/could not record Cluj-Napoca/i)).not.toBeInTheDocument()
  })
})
