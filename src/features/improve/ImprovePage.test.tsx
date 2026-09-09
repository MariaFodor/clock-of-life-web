import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { ImprovePage } from './ImprovePage'
import { renderWithProviders, SAMPLE_PROFILE } from '../../test/harness'

describe('<ImprovePage/>', () => {
  it('asks for the interview when there is no profile', () => {
    renderWithProviders(<ImprovePage />)
    expect(screen.getByRole('link', { name: /start the interview/i })).toBeInTheDocument()
  })

  it('prioritises modifiable recommendations for the sample profile', async () => {
    renderWithProviders(<ImprovePage />, { profile: SAMPLE_PROFILE })
    // Smoking is the biggest lever for a current smoker → should be present and near the top.
    expect(await screen.findByText(/stop smoking/i)).toBeInTheDocument()
    expect(screen.getByText(/aim for ~150 active minutes/i)).toBeInTheDocument()
  })

  it('frames a managed condition as "manage", never as undoing it', async () => {
    renderWithProviders(<ImprovePage />, { profile: SAMPLE_PROFILE })
    expect(await screen.findByText(/keep your diabetes well-controlled/i)).toBeInTheDocument()
  })

  it('links every recommendation to the paper behind it', async () => {
    // This is the test that was missing: the mock used to put display labels where the service puts
    // feature keys, so the lookup silently returned nothing and not one link rendered.
    renderWithProviders(<ImprovePage />, { profile: SAMPLE_PROFILE })
    const links = await screen.findAllByRole('link', { name: /↗/ })
    expect(links.length).toBeGreaterThan(0)
    for (const a of links) {
      expect(a.getAttribute('href')).toMatch(/^https:\/\/doi\.org\//)
    }
  })
})
