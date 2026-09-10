import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WhyPage } from './WhyPage'
import { createMockClient } from '../../api/mockClient'
import type { Attribution } from '../../api/types'
import { renderWithProviders, SAMPLE_PROFILE } from '../../test/harness'

/** Opens the graph disclosure and hands back the card, so a test asserts on the graph, not the page. */
async function openGraph() {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: /how these factors reach each other/i }))
  return screen.getByTestId('why-graph')
}

/**
 * A breakdown whose biggest factor is neither first in the list nor the largest signed number.
 *
 * Those are the two wrong rules that would look right against the real mock, which happens to sort
 * biggest-first: taking row one gives Activity, and so does taking the largest signed delta, since
 * +0.4 is greater than −3.7. Only "largest either way" gives Smoking.
 */
const BIGGEST_IS_NEITHER_FIRST_NOR_POSITIVE: Attribution[] = [
  { key: 'activity', factor: 'Activity', delta_years: 0.4, evidence: 'strong', role: 'lever',
    citation: 'Arem 2015', doi: '10.1001/jamainternmed.2015.0533', first_author: 'Arem', year: 2015 },
  { key: 'smk_current', factor: 'Smoking', delta_years: -3.7, evidence: 'strong', role: 'lever',
    citation: 'Jha 2013', doi: '10.1056/NEJMsa1211128', first_author: 'Jha', year: 2013 },
  { key: 'waist', factor: 'Waist', delta_years: -1.2, evidence: 'strong', role: 'lever',
    citation: 'Jayedi 2020', doi: '10.1136/bmj.m3324', first_author: 'Jayedi', year: 2020 },
]

const whyClient = (rows: Attribution[]) => ({ ...createMockClient(), getWhy: async () => rows })

/**
 * A breakdown the test hands over by hand, to hold the page in the state a reader actually arrives
 * in: the ontology is cached for the session and answers at once, the breakdown is a fresh request
 * for this profile and does not. Every other test here resolves both before the first assertion,
 * which is the one window in which the graph could be opened on no numbers at all.
 */
function pendingWhyClient() {
  let land!: (rows: Attribution[]) => void
  const breakdown = new Promise<Attribution[]>((resolve) => { land = resolve })
  return { client: { ...createMockClient(), getWhy: () => breakdown }, land }
}

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
    await openGraph()
    expect(screen.getByRole('group', { name: /causal graph/i })).toBeInTheDocument()
    // Not just present — populated. An empty <svg> would pass a bare presence check.
    expect(screen.getByLabelText(/^Waist:/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Diabetes:/)).toBeInTheDocument()
  })

  it('answers with the bars first and puts the graph below them', async () => {
    // Ordering is the finding, not a formatting choice: the graph used to be the first thing a
    // reader met on "why is it this number?", and the answer they came for sat below the fold.
    renderWithProviders(<WhyPage />, { profile: SAMPLE_PROFILE })
    const bars = await screen.findByTestId('why-breakdown')
    const graph = screen.getByTestId('why-graph')
    expect(bars.compareDocumentPosition(graph) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps the graph shut until it is asked for, and builds nothing until then', async () => {
    renderWithProviders(<WhyPage />, { profile: SAMPLE_PROFILE })
    const toggle = await screen.findByRole('button', { name: /how these factors reach each other/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    // Absent from the card, not merely invisible inside it. jsdom does not apply `hidden` to
    // queries, so a check that only asked "is it in the accessibility tree" would pass on a graph
    // that is fully rendered and 1180px wide — the cost this change exists to stop paying on arrival.
    expect(screen.getByTestId('why-graph').querySelector('svg')).toBeNull()
    expect(screen.queryByRole('group', { name: /causal graph/i })).toBeNull()

    await openGraph()
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('group', { name: /causal graph/i })).toBeInTheDocument()
  })

  it('opens the graph focused on the factor with the most years at stake', async () => {
    renderWithProviders(<WhyPage />, {
      profile: SAMPLE_PROFILE,
      client: whyClient(BIGGEST_IS_NEITHER_FIRST_NOR_POSITIVE),
    })
    await screen.findByTestId('why-breakdown')
    const graph = await openGraph()

    // Opening on the hairball was the finding. The detail region is where the graph says which
    // factor it is showing, so it is where "it opened on one" is provable.
    const detail = within(graph).getByRole('status')
    expect(detail).toHaveTextContent(/^Smoking/)
    expect(detail).toHaveTextContent('costing you 3.7 years')
    // Not the first row, and not the largest signed one: both would read "Activity" here.
    expect(detail).not.toHaveTextContent('Activity')
  })

  it('builds no graph while the breakdown is still on its way', async () => {
    // Opened in this window the graph would get an empty `impact`, focus nothing, and stay on the
    // ~40-edge hairball for the whole visit, because the focus is read once at mount and the
    // numbers landing afterwards do not re-apply it. So the panel says what it is waiting for.
    const { client } = pendingWhyClient()
    renderWithProviders(<WhyPage />, { profile: SAMPLE_PROFILE, client })

    const graph = await openGraph()
    expect(within(graph).getByText(/working out the breakdown/i)).toBeInTheDocument()
    expect(graph.querySelector('svg')).toBeNull()
  })

  it('opens focused the moment the breakdown lands, without being closed and reopened', async () => {
    const { client, land } = pendingWhyClient()
    renderWithProviders(<WhyPage />, { profile: SAMPLE_PROFILE, client })

    const graph = await openGraph()
    expect(graph.querySelector('svg')).toBeNull()

    land(BIGGEST_IS_NEITHER_FIRST_NOR_POSITIVE)

    // The same panel the reader already opened: nothing here touches the toggle. The graph mounts
    // once there are numbers to open it on, so the mount-time focus has its factor.
    const detail = await within(graph).findByRole('status')
    await waitFor(() => expect(detail).toHaveTextContent(/^Smoking/))
    expect(detail).toHaveTextContent('costing you 3.7 years')
    expect(within(graph).queryByText(/working out the breakdown/i)).toBeNull()
  })

  it('opens the graph unfocused when there is no breakdown to open it on', async () => {
    // A reader who sits at the average across the board has no biggest factor. The graph is still
    // a truthful drawing of the model, so it opens — just in the resting state it always had.
    renderWithProviders(<WhyPage />, { profile: SAMPLE_PROFILE, client: whyClient([]) })
    await screen.findByTestId('why-breakdown')
    const graph = await openGraph()

    expect(within(graph).getByRole('group', { name: /causal graph/i })).toBeInTheDocument()
    expect(within(graph).getByRole('status')).toBeEmptyDOMElement()
  })

  it('never labels a marker as something you can change', async () => {
    // sleep 10 makes long sleep appear in the breakdown. With SAMPLE_PROFILE's 7.5 it never does,
    // so the assertion below would never run — the test would pass with the marker role deleted.
    renderWithProviders(<WhyPage />, { profile: { ...SAMPLE_PROFILE, sleep: 10 } })
    const breakdown = await screen.findByTestId('why-breakdown')
    await within(breakdown).findByText('Long sleep')
    // The role label sits in the factor's row; assert within the breakdown card, since the row
    // wrapper is a grid whose closest ancestor div is only part of it.
    expect(within(breakdown).getByText(/a sign, not a cause/i)).toBeInTheDocument()
    // And long sleep must not be advertised as changeable anywhere in the breakdown.
    const sleepRow = within(breakdown).getByText('Long sleep').parentElement as HTMLElement
    expect(within(sleepRow).queryByText(/you can change this/i)).toBeNull()
  })
})
