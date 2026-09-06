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
