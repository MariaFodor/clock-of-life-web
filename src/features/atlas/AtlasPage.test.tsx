import { describe, expect, it } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AtlasPage } from './AtlasPage'
import { CLASSES } from './scale'
import { renderWithProviders, SAMPLE_PROFILE } from '../../test/harness'

/** The legend row, as an ordered list: [low end, six swatch groups, high end, no-figure swatch]. */
const legendRow = () => [...screen.getByTestId('map-legend-row').children]

/** The first number a swatch group prints — the bottom of the value range it stands for. */
const rangeStart = (el: Element): number => Number(/[\d.]+/.exec(el.textContent ?? '')![0])

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

  it('does not call the widest women–men gap "longest lives"', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AtlasPage />, { profile: SAMPLE_PROFILE })
    await screen.findByTestId('mortality-map')
    await user.click(screen.getByRole('radio', { name: /advantage/i }))
    // The widest gaps are where men die young — Russia, Ukraine, Belarus at 10-13 years. Labelling
    // that end "longest lives", as a single higherIsBetter flag did, tells a reader the opposite of
    // the truth in a health product.
    expect(screen.queryByText(/longest lives/i)).not.toBeInTheDocument()
    // Twice: the heading a sighted reader sees, and the table caption a screen reader hears.
    expect(screen.getAllByText(/widest gap/i).length).toBeGreaterThanOrEqual(2)
    // The legend must stop promising that the colour tracks how long people live on this measure.
    // The phrase spans an <em>, so match on the assembled text rather than a single node.
    expect(document.body.textContent).toMatch(/The stronger the colour, the wider the gap/i)
    expect(document.body.textContent).not.toMatch(/the longer people live/i)
    // And the two ends of the legend say the same thing in the same words.
    expect(legendRow()[0]).toHaveTextContent('narrower gap')
    expect(legendRow()[CLASSES + 1]).toHaveTextContent('wider gap')
  })

  it('does not blank the page when a reader clicks a territory with no life table', async () => {
    const user = userEvent.setup()
    const { container } = renderWithProviders(<AtlasPage />, { profile: SAMPLE_PROFILE })
    await screen.findByTestId('mortality-map')
    const kosovo = container.querySelector('[data-iso3="KOS"]') as SVGPathElement
    expect(kosovo, 'Kosovo is drawn but the UN publishes no life table for it').not.toBeNull()
    await user.click(kosovo)
    // The reader's own country card must survive the click, and the map must say something.
    expect(await screen.findByTestId('country-card')).toBeInTheDocument()
    expect(screen.getByTestId('country-card')).toHaveTextContent('Romania')
  })

  it('never tells a reader that darker means longer, on any measure', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AtlasPage />, { profile: SAMPLE_PROFILE })
    await screen.findByTestId('mortality-map')
    const show = within(screen.getByRole('radiogroup', { name: 'Show' })).getAllByRole('radio')
    expect(show.length).toBeGreaterThan(1)

    for (const option of show) {
      await user.click(option)
      // The ramp is one hue at rising ALPHA. Over the light theme's white sea that reads as darker;
      // over the dark theme's near-black one, more of a light blue reads as LIGHTER, and the caption
      // promising "darker always means people live longer" was then exactly backwards. The app
      // follows the reader's operating system unless they have chosen, so it cannot know which half
      // it is talking to: no sentence about darkness can be true for both, and the word is out of
      // this surface entirely. "Stronger" is what alpha does in either theme.
      expect(screen.getByTestId('map-legend')).toBeInTheDocument()
      expect(document.body.textContent, `showing “${option.textContent}”`)
        .not.toMatch(/darker|darkest/i)
    }
  })

  it('labels the two ends of the legend in words, in the direction the numbers run', async () => {
    renderWithProviders(<AtlasPage />, { profile: SAMPLE_PROFILE })
    await screen.findByTestId('mortality-map')
    // Life expectancy at birth: the words bracket the swatches, and they hang off the printed
    // ranges rather than off the colours — which is what makes them survive the theme.
    const row = legendRow()
    expect(row[0]).toHaveTextContent('shorter lives')
    expect(row[1]).toHaveAttribute('data-legend-class', '0')
    expect(row[CLASSES]).toHaveAttribute('data-legend-class', String(CLASSES - 1))
    expect(row[CLASSES + 1]).toHaveTextContent('longer lives')
    expect(rangeStart(row[1])).toBeLessThan(rangeStart(row[CLASSES]))
  })

  it('swaps those labels on the measure whose ramp runs backwards', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AtlasPage />, { profile: SAMPLE_PROFILE })
    await screen.findByTestId('mortality-map')
    await user.click(screen.getByRole('radio', { name: /deaths between/i }))

    // "Deaths between 15 and 60" counts deaths, so its smallest numbers are its best news — and the
    // legend still prints them smallest-first. Carrying "shorter lives" over from the other maps
    // would put the words for the worst outcome beside the countries with the fewest deaths.
    const row = legendRow()
    expect(row[0]).toHaveTextContent('fewer deaths')
    expect(row[CLASSES + 1]).toHaveTextContent('more deaths')
    expect(rangeStart(row[1])).toBeLessThan(rangeStart(row[CLASSES]))
    // The colour half of the same claim is pinned in scale.test.ts: on an inverted measure class 0
    // — the "fewer deaths" end — carries the strongest alpha. The caption says so out loud.
    expect(screen.getByTestId('map-legend'))
      .toHaveTextContent(/the strongest colours are the countries with the fewest deaths/i)
  })

  it('says what the deaths measure counts, where its numbers are', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AtlasPage />, { profile: SAMPLE_PROFILE })
    await screen.findByTestId('mortality-map')
    await user.click(screen.getByRole('radio', { name: /deaths between/i }))

    // The card puts three measures in one column of bare figures: 128 directly beneath 79.6, one a
    // count per 1,000 and the other a number of years, with nothing on the card saying which.
    const card = screen.getByTestId('country-card')
    expect(within(card).getByText('per 1,000 alive at 15')).toBeInTheDocument()
    expect(within(card).getAllByText('years').length).toBe(2)
    // The legend's unit line names it too, so the swatch ranges are not bare numbers either.
    expect(screen.getByTestId('map-legend'))
      .toHaveTextContent(/per 1,000 alive at 15, in six equal-sized groups/)
    // The dense places keep the short form — a table cell cannot carry the long one beside a number.
    expect(within(screen.getByTestId('extremes')).getAllByText(/per 1,000$/).length).toBeGreaterThan(0)
  })

  it('invites the click the copy asks for', async () => {
    const { container } = renderWithProviders(<AtlasPage />, { profile: SAMPLE_PROFILE })
    await screen.findByTestId('mortality-map')
    // "Pick a country — on the map" is what the page says; nothing on the map used to suggest the
    // shapes could be clicked at all.
    for (const iso3 of ['JPN', 'ROU', 'NGA']) {
      expect(container.querySelector(`[data-iso3="${iso3}"]`), iso3).toHaveClass('cursor-pointer')
    }
  })

  it('answers the pointer next to the pointer, not only below the legend', async () => {
    const { container } = renderWithProviders(<AtlasPage />, { profile: SAMPLE_PROFILE })
    await screen.findByTestId('mortality-map')
    // Nothing under the pointer, nothing claimed: the tooltip is not mounted at rest, even though
    // the readout below already shows the pinned country.
    expect(screen.queryByTestId('map-tooltip')).toBeNull()

    fireEvent.mouseEnter(container.querySelector('[data-iso3="JPN"]')!)
    fireEvent.mouseMove(screen.getByTestId('mortality-map'), { clientX: 140, clientY: 90 })

    const tip = await screen.findByTestId('map-tooltip')
    expect(tip).toHaveTextContent('Japan')
    expect(tip).toHaveTextContent(/years \(women\)/)
    // The live region below the map remains the accessible channel and says the same sentence; the
    // tooltip is the same words a second time for the eye, and must not be announced twice.
    expect(tip).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByTestId('map-readout')).toHaveTextContent('Japan')
  })

  it('draws no tooltip on a touch screen, which has no cursor to anchor one to', async () => {
    // The guard reads `(pointer: coarse)` once, at mount, so the stub has to be in place before the
    // render — and put back afterwards, because the whole suite shares this window.
    const real = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: query.includes('pointer: coarse'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
    try {
      const { container } = renderWithProviders(<AtlasPage />, { profile: SAMPLE_PROFILE })
      await screen.findByTestId('mortality-map')
      fireEvent.mouseEnter(container.querySelector('[data-iso3="JPN"]')!)
      // A finger has no cursor, and a box beside it would cover the country it is naming. The same
      // two events on a mouse-driven screen do produce one, two tests above.
      expect(screen.queryByTestId('map-tooltip')).toBeNull()
      // The readout below the map is what a touch reader gets, and it still fills in.
      expect(screen.getByTestId('map-readout')).toHaveTextContent('Japan')
    } finally {
      window.matchMedia = real
    }
  })

  it('drops the tooltip when the pointer leaves the land', async () => {
    const { container } = renderWithProviders(<AtlasPage />, { profile: SAMPLE_PROFILE })
    await screen.findByTestId('mortality-map')
    fireEvent.mouseEnter(container.querySelector('[data-iso3="JPN"]')!)
    expect(await screen.findByTestId('map-tooltip')).toHaveTextContent('Japan')

    // Out into the Atlantic. A tooltip that keeps naming the last country it crossed is a visible
    // lie in a way the same staleness in a text line below the fold never was.
    fireEvent.mouseEnter(container.querySelector('rect')!)
    expect(screen.queryByTestId('map-tooltip')).toBeNull()
    // The readout is deliberately not blanked: it falls back to the pinned country, which is the
    // reader's own. The two are driven by different things and that is on purpose.
    expect(screen.getByTestId('map-readout')).toHaveTextContent('Romania')
  })

  it('says one sentence at a time: on a monitoring dot the tooltip is the place readout', async () => {
    const user = userEvent.setup()
    const { container } = renderWithProviders(<AtlasPage />, { profile: SAMPLE_PROFILE })
    await screen.findByTestId('mortality-map')
    await user.click(screen.getByTestId('air-toggle'))
    await screen.findByTestId('air-layer')

    // Poland first, with nothing but the country under the pointer.
    fireEvent.mouseEnter(container.querySelector('[data-iso3="POL"]')!)
    fireEvent.mouseMove(screen.getByTestId('mortality-map'), { clientX: 140, clientY: 90 })
    expect(await screen.findByTestId('map-tooltip')).toHaveTextContent('Poland')

    // Now onto a dot INSIDE Poland. The dot does not clear the country hover — it sits on the
    // country, which is still under the pointer — and the svg's own mousemove keeps firing from the
    // circle. Assembling the tooltip from the hovered country alone therefore left it saying
    // "Poland · 82.3 years (women)" at the cursor while the live region below had already switched
    // to Kraków's air: two sentences on screen at once, about different things, disagreeing. The
    // tooltip is documented as a second copy of that live region's sentence, so it says this one.
    const dot = container.querySelector('[data-city="Krakow"]')!
    fireEvent.mouseEnter(dot)
    fireEvent.mouseMove(screen.getByTestId('mortality-map'), { clientX: 141, clientY: 91 })

    const placeReadout = screen.getByTestId('place-readout')
    expect(placeReadout).toHaveTextContent('Krakow')
    expect(placeReadout).toHaveTextContent(/17\.5 µg\/m³ PM2\.5, measured 2024/)
    // Word for word the same, from the same builder — not merely "mentions the city".
    expect(screen.getByTestId('map-tooltip').textContent).toBe(placeReadout.textContent)
    // And specifically NOT the country line it used to carry here.
    expect(screen.getByTestId('map-tooltip')).not.toHaveTextContent('82.3')
    expect(screen.queryByTestId('map-readout')).toBeNull()

    // Off the dot and back onto the country beneath it: the dot's leave, then the country's enter —
    // the pair a pointer makes sliding off a station onto the map. (In a browser that enter changes
    // nothing, because the dot never took `hovered` away in the first place, which is half of why
    // the two channels could disagree at all; here the synthetic leave reaches the svg's own leave
    // handler too, and the enter puts the country hover back.)
    fireEvent.mouseLeave(dot)
    fireEvent.mouseEnter(container.querySelector('[data-iso3="POL"]')!)
    expect(screen.queryByTestId('place-readout')).toBeNull()
    const mapReadout = screen.getByTestId('map-readout')
    expect(mapReadout).toHaveTextContent('Poland · 82.3 years (women)')
    expect(screen.getByTestId('map-tooltip').textContent).toBe(mapReadout.textContent)
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
