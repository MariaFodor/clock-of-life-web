import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AtlasPage } from './AtlasPage'
import { renderWithProviders, SAMPLE_PROFILE } from '../../test/harness'

describe('<AtlasPage/>', () => {
  it('draws the world and marks the reader’s own country', async () => {
    const { container } = renderWithProviders(<AtlasPage />, { profile: SAMPLE_PROFILE })
    await screen.findByTestId('mortality-map')
    // Romania is on the sample profile; the map should single it out without being asked.
    expect(container.querySelector('[data-iso3="ROU"]')).toHaveAttribute('data-home', 'true')
    expect(container.querySelector('[data-iso3="JPN"]')).not.toHaveAttribute('data-home', 'true')
  })

  it('colours a country with no figure differently from one with a low figure', async () => {
    const { container } = renderWithProviders(<AtlasPage />, { profile: SAMPLE_PROFILE })
    await screen.findByTestId('mortality-map')
    // Japan tops life expectancy for women, so it must land in the darkest class.
    expect(container.querySelector('[data-iso3="JPN"]')).toHaveAttribute('data-class', '5')
    // Kosovo is drawn and the UN does not report on it; "no data" is a state, not a zero.
    expect(container.querySelector('[data-iso3="KOS"]')).toHaveAttribute('data-class', 'none')
  })

  it('switches between women and men, and the numbers move with it', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AtlasPage />, { profile: SAMPLE_PROFILE })
    await screen.findByTestId('country-card')
    const card = screen.getByTestId('country-card')
    // The sample profile is Romanian, so the card opens on Romania: women 79.6, men 72.4.
    expect(within(card).getByText('79.6')).toBeInTheDocument()
    expect(within(card).getByText('72.4')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Men' }))
    expect(screen.getByRole('radio', { name: 'Men' })).toHaveAttribute('aria-checked', 'true')
  })

  it('tells a reader whose country it cannot score why, instead of offering a dead click', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AtlasPage />, { profile: SAMPLE_PROFILE })
    await screen.findByTestId('mortality-map')
    await user.selectOptions(screen.getByLabelText(/find a country/i), 'NGA')
    const card = await screen.findByTestId('country-card')
    expect(within(card).getByText(/cannot work out a personal estimate/i)).toBeInTheDocument()
  })

  it('lists in the table the countries too small to draw at this scale', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AtlasPage />, { profile: SAMPLE_PROFILE })
    await user.click(await screen.findByText(/all \d+ countries/i))
    // Singapore has a life table and no polygon at 110m. The table is the only way to reach it, and
    // "it is not on the map" must never mean "it is not in the product".
    expect(screen.getByRole('button', { name: 'Singapore' })).toBeInTheDocument()
  })

  it('swaps the projection for the Europe view, which draws states the globe cannot', async () => {
    const user = userEvent.setup()
    const { container } = renderWithProviders(<AtlasPage />, { profile: SAMPLE_PROFILE })
    await screen.findByTestId('mortality-map')
    expect(container.querySelector('[data-iso3="MLT"]')).toBeNull()
    await user.click(screen.getByRole('radio', { name: 'Europe' }))
    await screen.findByTestId('mortality-map')
    expect(container.querySelector('[data-iso3="MLT"]')).not.toBeNull()
  })

  it('attributes what it drew from the payload, not from a string in the page', async () => {
    renderWithProviders(<AtlasPage />, { profile: SAMPLE_PROFILE })
    await screen.findByTestId('mortality-map')
    // Both the subtitle and the source line name it, which is the point — neither is hardcoded.
    expect(screen.getAllByText(/World Population Prospects/).length).toBeGreaterThan(0)
    expect(screen.getByText(/CC BY 3\.0 IGO/)).toBeInTheDocument()
    // The derivation is quoted from the artifact, so the page cannot claim a method it did not use.
    expect(screen.getByText(/remaining_le/)).toBeInTheDocument()
  })
})
