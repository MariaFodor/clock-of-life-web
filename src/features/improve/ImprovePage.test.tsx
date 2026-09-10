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

  // UX-4: the chip read "lever" — the model's own word for a factor you can act on, and a word the
  // reader has never been told. Why? already said these in plain words; Improve never got them.
  it('says what a role means rather than naming it', async () => {
    renderWithProviders(<ImprovePage />, { profile: SAMPLE_PROFILE })
    expect((await screen.findAllByText('you can change this')).length).toBeGreaterThan(0)
    expect(screen.getByText('manage the condition')).toBeInTheDocument()
    expect(screen.queryByText('lever')).toBeNull()
    expect(screen.queryByText('manage')).toBeNull()
  })

  it('shows no difficulty, because the service does not send one', async () => {
    // An unlabelled "moderate" sat next to the evidence chip. It was not a property of the
    // recommendation: `httpClient` fills difficulty in as 2 for every row it maps, so the chip read
    // "moderate" for all of them. The field still ranks the mock's list; only the display is gone.
    renderWithProviders(<ImprovePage />, { profile: SAMPLE_PROFILE })
    await screen.findByText(/stop smoking/i)
    expect(screen.queryByText('moderate')).toBeNull()
    expect(screen.queryByText('easier')).toBeNull()
    expect(screen.queryByText('harder')).toBeNull()
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
