import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { WhyPage } from './WhyPage'
import { renderWithProviders, SAMPLE_PROFILE } from '../../test/harness'

describe('<WhyPage/>', () => {
  it('asks for the interview when there is no profile', () => {
    renderWithProviders(<WhyPage />)
    expect(screen.getByRole('link', { name: /start the interview/i })).toBeInTheDocument()
  })

  it('lists per-factor contributions with evidence grades', async () => {
    renderWithProviders(<WhyPage />, { profile: SAMPLE_PROFILE })
    // SAMPLE_PROFILE is a current smoker with a high waist and diabetes.
    expect(await screen.findByText('Smoking')).toBeInTheDocument()
    expect(screen.getByText('Diabetes')).toBeInTheDocument()
    expect(screen.getAllByText(/evidence/i).length).toBeGreaterThan(0)
  })
})
