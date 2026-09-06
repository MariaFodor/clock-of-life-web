import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { LifeClockPage } from './LifeClockPage'
import { renderWithProviders, SAMPLE_PROFILE, SAMPLE_ESTIMATE } from '../../test/harness'

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
