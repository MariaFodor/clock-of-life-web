// The graph had no test at all, which is how its arrows shipped invisible: at rest they were drawn
// with the hairline token used for card borders, which over the Card's own `clock-surface`
// (rgb(23,30,39) in dark mode) composites to rgb(28,35,45) — a contrast ratio of 1.06:1. The drawing
// rendered as a list of chips in columns and nothing failed. Colour is asserted here as an exact
// class rather than a pixel — jsdom does not composite — but pinning the token alone is not enough:
// the defect was never the wrong token, it was an alpha too low to see.
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { CausalGraph } from './CausalGraph'
import type { Ontology } from '../api/types'

/** A slice of the real ontology, edge for edge: two mediation chains, a shared mediator, an edge
 *  between two of that mediator's neighbours, and a pure marker. Every edge here is one the shipped
 *  model declares — a fixture for a graph of causal claims does not get to invent one. */
const ONTOLOGY: Ontology = {
  diet: { role: 'lever', causes: ['waist'] },
  // activity -> diabetes exists so that hovering `waist` has an edge between two of its OWN
  // neighbours. Without one, "only edges touching the focus light up" and "every edge lights up"
  // are the same assertion, and the real ontology has 32 such edges around waist alone. It is a
  // REAL edge of that ontology — an invented one would make this fixture assert a causal claim the
  // model does not make, which is the one thing a graph of causal claims must never do.
  activity: { role: 'lever', causes: ['waist', 'diabetes'] },
  waist: { role: 'lever', causes: ['diabetes', 'high_bp'],
           prior: { doi: '10.1136/bmj.m3324', first_author: 'Jayedi', year: 2020,
                    title: 'Central fatness and risk of all cause mortality' } },
  diabetes: { role: 'manage', causes: [] },
  high_bp: { role: 'manage', causes: [] },
  sleep_long: { role: 'marker', causes: [] },
}

describe('<CausalGraph/>', () => {
  it('draws every declared edge, and every one of them points forward', () => {
    const { container } = render(<CausalGraph ontology={ONTOLOGY} />)
    const edges = [...container.querySelectorAll('path[marker-end]')]
    expect(edges).toHaveLength(5) // diet/activity->waist, activity->diabetes, waist->diabetes/high_bp

    // The layout claims a node sits one column right of its furthest-upstream cause. Grouping by
    // ROLE instead looked tidier and buried 10 edges inside a single column while sending 11
    // backwards — including smoking to heart history, which are the exact mediation paths this
    // drawing exists to show. Assert the invariant, not the coordinates.
    const xOf = (key: string) => {
      const label = { diet: 'Diet', activity: 'Activity', waist: 'Waist',
                      diabetes: 'Diabetes', high_bp: 'Hypertension' }[key]!
      const text = [...container.querySelectorAll('text')].find((t) => t.textContent === label)!
      return Number(text.getAttribute('x'))
    }
    for (const [from, to] of [['diet', 'waist'], ['activity', 'waist'],
                              ['waist', 'diabetes'], ['waist', 'high_bp'],
                              ['activity', 'diabetes']]) {
      expect(xOf(to)).toBeGreaterThan(xOf(from))
    }
  })

  it('draws its resting edges, and their heads, at a contrast you can actually read', () => {
    const { container } = render(<CausalGraph ontology={ONTOLOGY} />)
    for (const edge of container.querySelectorAll('path[marker-end]')) {
      // The EXACT class, not a substring: `stroke-clock-muted/5` contains "stroke-clock-muted" and
      // is invisible. Muted at full opacity is 6.93:1 dark and 5.25:1 light on the card; every
      // diluted value tested fell under WCAG 1.4.11's 3:1 in at least one theme.
      const classes = edge.getAttribute('class')?.split(/\s+/) ?? []
      expect(classes).toContain('stroke-clock-muted')
      expect(edge.getAttribute('class')).not.toContain('stroke-clock-line')
      // A sibling `opacity-5` dilutes the stroke just as thoroughly as `stroke-clock-muted/5` and
      // leaves the exact token intact, so pinning the token alone is not the whole guard.
      expect(classes.filter((c) => /^opacity-/.test(c))).toEqual([])
      expect(Number(edge.getAttribute('stroke-width'))).toBeGreaterThanOrEqual(1)
    }
    // The arrowhead is half of what makes an arrow an arrow. A head fainter than its own line reads
    // as a fading stroke, and nothing checked it while the commit claimed it was matched.
    const head = container.querySelector('marker#cg-arrow path')
    expect(head?.getAttribute('class')?.split(/\s+/)).toContain('fill-clock-muted')
  })

  it('isolates one factor s path on hover, and says what it acts through', () => {
    const { container } = render(<CausalGraph ontology={ONTOLOGY} />)
    const waist = screen.getByLabelText('Waist: lever')
    fireEvent.mouseEnter(waist)

    // Only edges TOUCHING the focus light up. Lighting every edge between two neighbours of the
    // focus drowns the one path being asked about, which is the whole reason for hovering.
    const lit = [...container.querySelectorAll('path[marker-end]')]
      .filter((p) => p.getAttribute('class')?.includes('stroke-clock-brand'))
    // 4 of the 5: activity->diabetes runs between two of waist's neighbours and must stay dark.
    expect(lit).toHaveLength(4)
    const dark = [...container.querySelectorAll('path[marker-end]')]
      .filter((p) => p.getAttribute('class')?.includes('stroke-clock-line/20'))
    expect(dark).toHaveLength(1)

    const status = container.querySelector('[role="status"]')!
    expect(status).toHaveTextContent('Acts through: Diabetes, Hypertension')
    // And the evidence for the hovered factor is a link the reader can actually open.
    const link = within(status as HTMLElement).getByRole('link')
    // ArticleLink percent-encodes the DOI, so the slash arrives as %2F. doi.org normalises that
    // back — both forms resolve to the same paper (checked against doi.org/api/handles) — so the
    // assertion decodes rather than pinning one spelling of a working link.
    expect(decodeURIComponent(link.getAttribute('href')!)).toBe('https://doi.org/10.1136/bmj.m3324')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
  })

  // Without `impact` this is a diagram of the model, identical for everyone. Nobody asked how the
  // model works; they asked why THEIR number is what it is, and the answer is which of these roads
  // their own factors are travelling.
  describe('with the reader\'s own numbers', () => {
    const IMPACT = { waist: -1.2, diet: -0.4, activity: 0.3 }

    it('shows each factor s own years, signed, and sizes its bar against the largest', () => {
      const { container } = render(<CausalGraph ontology={ONTOLOGY} impact={IMPACT} />)
      const texts = [...container.querySelectorAll('text')].map((t) => t.textContent)
      expect(texts).toContain('−1.2')
      expect(texts).toContain('−0.4')
      expect(texts).toContain('+0.3') // a factor that ADDS years reads as a gain, not a smaller loss

      // Bars are a share of the reader's biggest factor, so the picture is scaled to them. Found by
      // node, not by DOM index: nodes are emitted column by column, so index order is layout order.
      expect(container.querySelectorAll('rect[aria-hidden="true"]')).toHaveLength(3) // only the
      const barOf = (aria: string) =>                                               // three they
        Number(screen.getByLabelText(aria)                                          // deviate on
          .querySelector('rect[aria-hidden="true"]')!.getAttribute('width'))
      expect(barOf('Waist: lever, costing you 1.2 years')).toBeCloseTo(150, 5)
      expect(barOf('Diet: lever, costing you 0.4 years')).toBeCloseTo(150 * (0.4 / 1.2), 5)
      expect(barOf('Activity: lever, worth you 0.3 years')).toBeCloseTo(150 * (0.3 / 1.2), 5)
    })

    it('puts the reader s biggest factors where the eye lands', () => {
      const { container } = render(<CausalGraph ontology={ONTOLOGY} impact={IMPACT} />)
      // diet and activity share a column; diet costs more, so it sorts first. Alphabetically it
      // would too, which is why the assertion flips the numbers to prove the sort is on impact.
      const yOf = (label: string) =>
        Number([...container.querySelectorAll('text')]
          .find((t) => t.textContent === label)!.getAttribute('y'))
      expect(yOf('Diet')).toBeLessThan(yOf('Activity'))

      const { container: flipped } = render(
        <CausalGraph ontology={ONTOLOGY} impact={{ diet: -0.1, activity: 2.0 }} />)
      const yIn = (label: string) =>
        Number([...flipped.querySelectorAll('text')]
          .find((t) => t.textContent === label)!.getAttribute('y'))
      expect(yIn('Activity')).toBeLessThan(yIn('Diet'))
    })

    it('tells a screen reader the number, not just that a bar is there', () => {
      render(<CausalGraph ontology={ONTOLOGY} impact={IMPACT} />)
      expect(screen.getByLabelText('Waist: lever, costing you 1.2 years')).toBeInTheDocument()
      expect(screen.getByLabelText('Activity: lever, worth you 0.3 years')).toBeInTheDocument()
      // A factor they sit at the average on says nothing about years at all.
      expect(screen.getByLabelText('Long sleep: marker')).toBeInTheDocument()
    })

    it('is still a truthful drawing with no numbers at all', () => {
      const { container } = render(<CausalGraph ontology={ONTOLOGY} />)
      expect(container.querySelectorAll('rect[aria-hidden="true"]')).toHaveLength(0)
      expect(container.querySelectorAll('path[marker-end]')).toHaveLength(5)
      expect(screen.getByLabelText('Waist: lever')).toBeInTheDocument()
    })
  })

  it('mounts the live region empty, so a screen reader announces what lands in it', () => {
    const { container } = render(<CausalGraph ontology={ONTOLOGY} />)
    const status = container.querySelector('[role="status"]')
    // A live region inserted together with its text is routinely missed.
    expect(status).toBeInTheDocument()
    expect(status).toBeEmptyDOMElement()
  })
})
