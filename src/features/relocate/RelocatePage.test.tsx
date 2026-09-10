import { describe, expect, it } from 'vitest'
import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RelocatePage } from './RelocatePage'
import { renderWithProviders, SAMPLE_PROFILE } from '../../test/harness'
import { createMockClient } from '../../api/mockClient'
import type { CountryPlaces, Place, Profile, RelocateResult } from '../../api/types'

/** A reader whose home exposure was recorded by the interview, so a comparison has a baseline. */
const HOME_PROFILE: Profile = { ...SAMPLE_PROFILE, pm25: 16.27, ndvi: 0.2539 }

const place = (p: Partial<Place> & { city: string; pm25: number; pm25_year: number }): Place => ({
  iso3: 'ROU',
  lat: 0,
  lon: 0,
  population: null,
  pm25_stations: null,
  pm25_temporal_coverage: null,
  ndvi: null,
  ndvi_year: null,
  ndvi_basis: null,
  ndvi_matched_city: null,
  ndvi_distance_km: null,
  ...p,
})

/** Three Romanian places chosen to exercise each greenness basis and a diacritic in a name. */
const ROMANIA: CountryPlaces = {
  iso3: 'ROU',
  iso2: 'RO',
  name: 'Romania',
  scoreable: true,
  reference: null,
  places: [
    place({ city: 'Brasov', pm25: 13.99, pm25_year: 2024, ndvi: 0.41, ndvi_basis: 'city' }),
    place({ city: 'Bucuresti', pm25: 16.27, pm25_year: 2024, ndvi: 0.25, ndvi_basis: 'country' }),
    place({ city: 'Timișoara', pm25: 15.1, pm25_year: 2023 }),
  ],
  coverage: { settlements: 3, with_city_greenness: 1, with_country_greenness: 1, without_greenness: 1 },
}

/**
 * Comparisons the test answers by hand, so two clicks can come back in the wrong order — which is what
 * happens on the page as soon as a reader clicks a second place before the first has answered.
 */
function pendingCompares() {
  const waiting = new Map<string, { answer: (r: RelocateResult) => void; fail: (e: Error) => void }>()
  const relocate = (_profile: Profile, city: string): Promise<RelocateResult> =>
    new Promise((resolve, reject) => {
      waiting.set(city, { answer: resolve, fail: reject })
    })
  return { relocate, waiting }
}

/** What the service sends back for one comparison, shaped as the client hands it to the page. */
const answerFor = (city: string, delta: number): RelocateResult => ({
  current: { id: 'current', name: 'your current area', pm25: 16.27, ndvi: 0.2539, kind: 'city' },
  candidate: { id: city, name: city, pm25: 13.99, ndvi: 0.41, kind: 'city' },
  delta_years: delta,
  explanation: `${city} has cleaner air than your home.`,
})

describe('<RelocatePage/>', () => {
  it('asks for the interview when there is no profile', () => {
    renderWithProviders(<RelocatePage />)
    expect(screen.getByRole('link', { name: /start the interview/i })).toBeInTheDocument()
  })

  it('offers only the reader’s own country, and never the worldwide list', async () => {
    const client = createMockClient()
    const asked: string[] = []
    let worldwideCalls = 0
    client.getPlaces = async (iso3: string) => {
      asked.push(iso3)
      return ROMANIA
    }
    client.listLocations = async () => {
      worldwideCalls++
      return []
    }
    renderWithProviders(<RelocatePage />, { profile: HOME_PROFILE, client })

    expect(await screen.findByText('Brasov')).toBeInTheDocument()
    // The profile stores ISO2 ("RO"); the settlement list is keyed on ISO3, mapped through the served
    // country list. Only that one country is ever asked for.
    expect(asked).toEqual(['ROU'])
    // The defect this replaces: the page read `/api/locations`, which has no country filter at all.
    expect(worldwideCalls).toBe(0)
    expect(screen.getAllByRole('button', { name: /^compare /i })).toHaveLength(3)
  })

  it('does not offer a place from another country, so Compare cannot be a dead button', async () => {
    renderWithProviders(<RelocatePage />, { profile: HOME_PROFILE })

    expect(await screen.findByText('Brasov')).toBeInTheDocument()
    // "A Coruna" is the Spanish city whose Compare button threw `unknown location: A Coruna (RO)`
    // for a Romanian reader. It is not on this page any more, and neither is any other country's.
    expect(screen.queryByText('A Coruna')).not.toBeInTheDocument()
    expect(screen.queryByText('Madrid')).not.toBeInTheDocument()
  })

  it('never offers the literal “Unknown” row the settlement data still carries', async () => {
    const client = createMockClient()
    client.getPlaces = async () => ({
      ...ROMANIA,
      // Five of these are in the shipped bundle — Colombia, France, India, Israel, the United States —
      // and the service seeds them into its location table under that name, so the card's Compare
      // button really did answer, pricing a move to a place that does not exist. The French one's
      // coordinates are in the Gulf of Guinea.
      places: [...ROMANIA.places, place({ city: 'Unknown', pm25: 12.3, pm25_year: 2024 })],
      coverage: { ...ROMANIA.coverage, settlements: 4 },
    })
    renderWithProviders(<RelocatePage />, { profile: HOME_PROFILE, client })

    await screen.findByText('Brasov')
    expect(screen.queryByText('Unknown')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Compare Unknown' })).not.toBeInTheDocument()
    // The three real places are still offered, and the count the reader is shown is the count they can
    // actually act on — not the number of rows the service happened to send.
    expect(screen.getAllByRole('button', { name: /^compare /i })).toHaveLength(3)
    expect(screen.getByLabelText(/search the 3 measured places in Romania/i)).toBeInTheDocument()
  })

  it('says why the list is empty when every row a country has is an unnamed one', async () => {
    const client = createMockClient()
    client.getPlaces = async () => ({
      ...ROMANIA,
      places: [place({ city: 'Unknown', pm25: 12.3, pm25_year: 2024 })],
      coverage: { ...ROMANIA.coverage, settlements: 1 },
    })
    renderWithProviders(<RelocatePage />, { profile: HOME_PROFILE, client })

    // The boundary of the rule above: filtering every row away must not be reported as the 404's
    // "nobody has measured here since 2020", which would be false about a country that WAS measured.
    expect(await screen.findByText(/is missing its name/i)).toBeInTheDocument()
    expect(screen.queryByText(/has had its air measured since 2020/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^compare /i })).not.toBeInTheDocument()
  })

  it('states each reading with its year, and says when the greenness is the country’s', async () => {
    const client = createMockClient()
    client.getPlaces = async () => ROMANIA
    renderWithProviders(<RelocatePage />, { profile: HOME_PROFILE, client })

    const brasov = (await screen.findByText('Brasov')).closest('section')!
    expect(brasov).toHaveTextContent('Air 14.0 µg/m³ (2024)')
    // Measured in Brasov itself, so no qualifier is added.
    expect(brasov).toHaveTextContent('greenness 0.41')
    expect(brasov).not.toHaveTextContent(/figure, not this place/i)

    // Bucuresti carries Romania's figure rather than its own, and has to say so.
    const bucuresti = screen.getByText('Bucuresti').closest('section')!
    expect(bucuresti).toHaveTextContent('greenness 0.25 (Romania’s figure, not this place’s)')

    // Nothing at all was measured here, which is not the same as zero.
    expect(screen.getByText('Timișoara').closest('section')).toHaveTextContent('greenness not measured')
  })

  it('defines both measurements once, in words, and says what it does not cover', async () => {
    const client = createMockClient()
    client.getPlaces = async () => ROMANIA
    renderWithProviders(<RelocatePage />, { profile: HOME_PROFILE, client })

    // Wait for the list, which is also what proves the country has been named by then: until the
    // served country list arrives the page says "your country", never the bare code.
    await screen.findByText('Brasov')
    const explainer = screen.getByTestId('measure-explainer')
    expect(explainer).toHaveTextContent(/soot and dust small enough to be breathed/i)
    expect(explainer).toHaveTextContent(/micrograms per cubic metre/i)
    expect(explainer).toHaveTextContent(/how much living plant cover a satellite sees/i)
    // The honest scope, with somewhere to go for the question this page refuses to answer.
    expect(explainer).toHaveTextContent(/compares places inside Romania only/i)
    expect(screen.getByRole('link', { name: /the world/i })).toHaveAttribute('href', '/world')
  })

  it('says “your country” rather than a bare code while the country list is loading', async () => {
    const client = createMockClient()
    // The window where the page knows the profile's code but not yet the country's name.
    client.getMeta = () => new Promise(() => {})
    renderWithProviders(<RelocatePage />, { profile: HOME_PROFILE, client })

    const explainer = await screen.findByTestId('measure-explainer')
    expect(explainer).toHaveTextContent(/compares places inside your country only/i)
    expect(explainer).not.toHaveTextContent(/inside RO/)
  })

  it('filters the list by name, ignoring case and accents', async () => {
    const client = createMockClient()
    const user = userEvent.setup()
    client.getPlaces = async () => ROMANIA
    renderWithProviders(<RelocatePage />, { profile: HOME_PROFILE, client })

    await screen.findByText('Brasov')
    // Typed on a keyboard with no Romanian comma-below, which is how the name will be searched for.
    await user.type(screen.getByLabelText(/search the 3 measured places in Romania/i), 'timis')
    expect(screen.getByText('Timișoara')).toBeInTheDocument()
    expect(screen.queryByText('Brasov')).not.toBeInTheDocument()
  })

  it('shows the reader’s own home exposure as the baseline', async () => {
    const client = createMockClient()
    client.getPlaces = async () => ROMANIA
    renderWithProviders(<RelocatePage />, { profile: HOME_PROFILE, client })

    const home = await screen.findByTestId('home-exposure')
    expect(home).toHaveTextContent('Air 16.3 µg/m³')
    expect(home).toHaveTextContent('greenness 0.25')
  })

  it('says an unrecorded home is priced as the country average, on the strip AND on the answer', async () => {
    const client = createMockClient()
    const user = userEvent.setup()
    client.getPlaces = async () => ROMANIA
    // What the SERVICE does with a profile carrying no exposure: a missing measurement contributes 0 to
    // the environmental term, and 0 is where the country's own average sits, so the home is priced as
    // that average and a definite signed number comes back — never "unknown". Stubbed rather than left
    // to the mock, whose relocate drops the term instead and answers ±0.0.
    client.relocate = async (_profile, city) => ({
      current: { id: 'current', name: 'your current area', kind: 'city' },
      candidate: { id: city, name: city, pm25: 13.99, ndvi: 0.41, kind: 'city' },
      delta_years: 0.3,
      explanation: 'Air quality accounts for +0.3 yr and greenspace +0.0 yr of the difference.',
    })
    // SAMPLE_PROFILE has no pm25/ndvi — the interview's city question was never answered.
    renderWithProviders(<RelocatePage />, { profile: SAMPLE_PROFILE, client })

    // Waiting for the list is what proves the country has been named by now: until the served country
    // list arrives the strip says "your country", which is the honest word for that moment.
    const compare = await screen.findByRole('button', { name: 'Compare Brasov' })

    const home = screen.getByTestId('home-exposure')
    expect(home).toHaveTextContent(/no air measurement is recorded for your home/i)
    expect(home).toHaveTextContent(/starts from Romania’s average air and greenness/i)
    // The promise this replaces. The page used to say the difference "will read as unknown", and then
    // the very next thing it did was show a signed number.
    expect(home).not.toHaveTextContent(/read as unknown/i)

    expect(compare).toBeEnabled()
    await user.click(compare)

    // A definite number — and, next to it, what it was actually measured from.
    const region = await screen.findByTestId('relocate-result')
    expect(within(region).getByText('+0.3 yr')).toBeInTheDocument()
    expect(within(region).getByTestId('home-average-caveat')).toHaveTextContent(
      /starts from Romania’s average air and greenness/i,
    )
  })

  it('compares a cleaner-air place and shows the answer above the list, announced', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RelocatePage />, { profile: HOME_PROFILE })

    const brasov = await screen.findByText('Brasov')
    await user.click(within(brasov.closest('section')!).getByRole('button', { name: /compare/i }))

    const region = await screen.findByTestId('relocate-result')
    expect(within(region).getByText(/cleaner air/i)).toBeInTheDocument()
    expect(within(region).getByText(/your current area → Brasov/)).toBeInTheDocument()

    // Announced to a reader who is not watching this part of the page, and given focus so the next
    // Tab continues from the answer.
    expect(region).toHaveAttribute('role', 'status')
    expect(region).toHaveFocus()

    // ...and it is ABOVE the list. It used to render below every card, where nobody saw it appear.
    const firstCard = screen.getAllByRole('button', { name: /^compare /i })[0].closest('section')!
    expect(region.compareDocumentPosition(firstCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows a failed comparison instead of silently doing nothing', async () => {
    const client = createMockClient()
    const user = userEvent.setup()
    client.getPlaces = async () => ROMANIA
    client.relocate = async () => {
      throw new Error('the service is unreachable')
    }
    renderWithProviders(<RelocatePage />, { profile: HOME_PROFILE, client })

    await screen.findByText('Brasov')
    await user.click(screen.getByRole('button', { name: 'Compare Brasov' }))

    // The whole defect: with no branch here the button just stopped responding.
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/could not compare Brasov/i)
    expect(alert).toHaveTextContent(/the service is unreachable/i)
    // And the reader is not left with a dead button afterwards.
    expect(screen.getByRole('button', { name: 'Compare Brasov' })).toBeEnabled()
  })

  it('shows the answer to the last place clicked, even when an earlier one replies after it', async () => {
    const client = createMockClient()
    const user = userEvent.setup()
    const { relocate, waiting } = pendingCompares()
    client.getPlaces = async () => ROMANIA
    client.relocate = relocate
    renderWithProviders(<RelocatePage />, { profile: HOME_PROFILE, client })

    await screen.findByText('Brasov')
    // Only the clicked card goes busy, so changing your mind is a click a reader can really make, and
    // both requests are on the wire at once.
    await user.click(screen.getByRole('button', { name: 'Compare Brasov' }))
    await user.click(screen.getByRole('button', { name: 'Compare Bucuresti' }))

    await act(async () => waiting.get('Bucuresti')!.answer(answerFor('Bucuresti', -0.4)))
    const region = screen.getByTestId('relocate-result')
    expect(within(region).getByText(/your current area → Bucuresti/)).toBeInTheDocument()

    // The abandoned comparison replies last. It used to win purely by being slower, leaving the reader
    // looking at an answer for a place they had already moved on from.
    await act(async () => waiting.get('Brasov')!.answer(answerFor('Brasov', 0.9)))
    expect(within(region).getByText(/your current area → Bucuresti/)).toBeInTheDocument()
    expect(within(region).queryByText(/→ Brasov/)).not.toBeInTheDocument()
  })

  it('keeps the answer on screen when an abandoned comparison fails later', async () => {
    const client = createMockClient()
    const user = userEvent.setup()
    const { relocate, waiting } = pendingCompares()
    client.getPlaces = async () => ROMANIA
    client.relocate = relocate
    renderWithProviders(<RelocatePage />, { profile: HOME_PROFILE, client })

    await screen.findByText('Brasov')
    await user.click(screen.getByRole('button', { name: 'Compare Brasov' }))
    await user.click(screen.getByRole('button', { name: 'Compare Bucuresti' }))

    await act(async () => waiting.get('Bucuresti')!.answer(answerFor('Bucuresti', -0.4)))
    const region = screen.getByTestId('relocate-result')
    expect(within(region).getByText(/your current area → Bucuresti/)).toBeInTheDocument()

    // The abandoned comparison fails after the good answer is already up. That failure used to clear
    // the result, so a stale error took a perfectly good answer off the screen.
    await act(async () => waiting.get('Brasov')!.fail(new Error('the service is unreachable')))
    expect(within(region).getByText(/your current area → Bucuresti/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('explains itself when the service says the country has no measured settlement (404)', async () => {
    const client = createMockClient()
    client.getPlaces = async () => {
      // Exactly what httpClient throws for this route: the service's own sentence, with the status
      // alongside it. The status is the whole signal — the message names no code.
      throw Object.assign(new Error('no measured settlements for ROU'), { status: 404 })
    }
    renderWithProviders(<RelocatePage />, { profile: HOME_PROFILE, client })

    // 152 of the 237 countries have no measurement since 2020: a fact about the measurement rather
    // than a fault of ours, and never a fabricated list.
    expect(await screen.findByText(/has had its air measured since 2020/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^compare /i })).not.toBeInTheDocument()
    // A fact about the world, not a breakage: nothing here is reported as something going wrong.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not claim the country is unmeasured when the request simply failed', async () => {
    const client = createMockClient()
    client.getPlaces = async () => {
      throw Object.assign(new Error('database connection lost'), { status: 500 })
    }
    renderWithProviders(<RelocatePage />, { profile: HOME_PROFILE, client })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/could not load the list of places in Romania right now/i)
    expect(alert).toHaveTextContent(/database connection lost/i)
    // The defect: every failure produced the 404's confident claim that nobody has measured this
    // country — a statement about the world made on the strength of one broken request, and with
    // `retry: false` it was the first and only word the reader got.
    expect(screen.queryByText(/has had its air measured since 2020/i)).not.toBeInTheDocument()
  })

  it('refuses honestly when the reader’s country is not in the served list', async () => {
    const client = createMockClient()
    let asked = 0
    client.getPlaces = async () => {
      asked++
      return ROMANIA
    }
    renderWithProviders(<RelocatePage />, { profile: { ...HOME_PROFILE, country: 'ZZ' }, client })

    expect(await screen.findByText(/Your profile records ZZ as your country/i)).toBeInTheDocument()
    // No country, no guessed ISO3, no request — rather than a list belonging to somebody else.
    expect(asked).toBe(0)
  })
})
