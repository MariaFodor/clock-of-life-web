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
    // SAMPLE_PROFILE is a current smoker with a high waist and diabetes. The causal graph names the
    // same factors, so scope the assertions to the breakdown list rather than the whole page.
    expect((await screen.findAllByText(/Smoking/)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Diabetes/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/evidence/i).length).toBeGreaterThan(0)
  })

  it('links every factor to the paper behind it, and draws the causal graph', async () => {
    renderWithProviders(<WhyPage />, { profile: SAMPLE_PROFILE })
    // Evidence traceability is a product promise: a citation nobody can open does not keep it.
    const links = await screen.findAllByRole('link', { name: /↗/ })
    expect(links.length).toBeGreaterThan(0)
    for (const a of links) {
      expect(a.getAttribute('href')).toMatch(/^https:\/\/doi\.org\//)
    }
    expect(screen.getByRole('img', { name: /causal graph/i })).toBeInTheDocument()
  })
})
