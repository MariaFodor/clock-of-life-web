import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
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
    // same factors, so the assertions are scoped to the breakdown card — searching the whole page
    // would pass on the graph alone, even with an empty breakdown.
    const breakdown = await screen.findByTestId('why-breakdown')
    expect(within(breakdown).getByText('Smoking')).toBeInTheDocument()
    expect(within(breakdown).getByText('Diabetes')).toBeInTheDocument()
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
    expect(screen.getByRole('group', { name: /causal graph/i })).toBeInTheDocument()
    // Not just present — populated. An empty <svg> would pass a bare presence check.
    expect(screen.getByLabelText(/^Waist:/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Diabetes:/)).toBeInTheDocument()
  })

  it('never labels a marker as something you can change', async () => {
    renderWithProviders(<WhyPage />, { profile: SAMPLE_PROFILE })
    const breakdown = await screen.findByTestId('why-breakdown')
    const sleep = within(breakdown).queryByText('Long sleep')
    if (sleep) {
      const row = sleep.closest('li, div') as HTMLElement
      expect(within(row).queryByText(/you can change this/i)).toBeNull()
    }
  })
})
