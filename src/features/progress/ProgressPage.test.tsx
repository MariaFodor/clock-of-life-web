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
})
