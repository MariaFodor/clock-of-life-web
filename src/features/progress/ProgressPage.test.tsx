import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { ProgressPage } from './ProgressPage'
import { renderWithProviders, SAMPLE_PROFILE } from '../../test/harness'
import { createMockClient } from '../../api/mockClient'

describe('<ProgressPage/>', () => {
  it('shows an empty state before any calculation', async () => {
    renderWithProviders(<ProgressPage />)
    expect(await screen.findByText(/no calculations yet/i)).toBeInTheDocument()
  })

  it('lists a persisted calculation with its interval', async () => {
    const client = createMockClient()
    await client.estimate(SAMPLE_PROFILE) // seed one history row
    renderWithProviders(<ProgressPage />, { client })

    // The persisted row renders its interval badge (range …).
    expect(await screen.findByText(/range/i)).toBeInTheDocument()
    expect(screen.getByText(/reaches age/i)).toBeInTheDocument()
  })

  // UX-4: the row read "RR 0.62×" — the model's shorthand for a comparison, and a history row is no
  // place to learn it.
  it('spells the comparison out instead of abbreviating it', async () => {
    const client = createMockClient()
    await client.estimate(SAMPLE_PROFILE)
    renderWithProviders(<ProgressPage />, { client })

    const row = await screen.findByText(/risk vs average/i)
    // Still the same figure, still compact enough for a history row.
    expect(row).toHaveTextContent(/risk vs average \d+\.\d{2}×/)
    expect(row).not.toHaveTextContent(/\bRR\b/)
  })

  it('shows a trend sparkline once there is more than one calculation', async () => {
    const client = createMockClient()
    await client.estimate(SAMPLE_PROFILE)
    await client.estimate({ ...SAMPLE_PROFILE, smoke: 0 }) // a second, healthier snapshot
    renderWithProviders(<ProgressPage />, { client })

    expect(await screen.findByText(/your estimate over time/i)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /estimate trend/i })).toBeInTheDocument()
    expect(screen.getByText(/since first/i)).toBeInTheDocument()
  })
})
