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

/** A structurally faithful slice: two mediation chains, a shared mediator, and a pure marker. */
const ONTOLOGY: Ontology = {
  diet: { role: 'lever', causes: ['waist'] },
  activity: { role: 'lever', causes: ['waist'] },
  waist: { role: 'lever', causes: ['diabetes', 'high_bp'],
           prior: { doi: '10.1136/bmj.m3324', first_author: 'Jayedi', year: 2020,
                    title: 'Central fatness and risk of all cause mortality' } },
  // diabetes -> high_bp exists so that hovering `waist` has an edge between two of its OWN
  // neighbours. Without one, "only edges touching the focus light up" and "every edge lights up"
  // are the same assertion, and the real ontology has 32 such edges around waist alone.
  diabetes: { role: 'manage', causes: ['high_bp'] },
  high_bp: { role: 'manage', causes: [] },
  sleep_long: { role: 'marker', causes: [] },
}

describe('<CausalGraph/>', () => {
  it('draws every declared edge, and every one of them points forward', () => {
    const { container } = render(<CausalGraph ontology={ONTOLOGY} />)
    const edges = [...container.querySelectorAll('path[marker-end]')]
    expect(edges).toHaveLength(5) // diet/activity->waist, waist->diabetes/high_bp, diabetes->high_bp

    // The layout claims a node sits one column right of its furthest-upstream cause. Grouping by
    // ROLE instead looked tidier and buried 14 edges inside a single column while sending 11
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
                              ['diabetes', 'high_bp']]) {
      expect(xOf(to)).toBeGreaterThan(xOf(from))
    }
  })

  it('draws its resting edges, and their heads, at a contrast you can actually read', () => {
    const { container } = render(<CausalGraph ontology={ONTOLOGY} />)
    for (const edge of container.querySelectorAll('path[marker-end]')) {
      // The EXACT class, not a substring: `stroke-clock-muted/5` contains "stroke-clock-muted" and
      // is invisible. Muted at full opacity is 6.93:1 dark and 5.25:1 light on the card; every
      // diluted value tested fell under WCAG 1.4.11's 3:1 in at least one theme.
      expect(edge.getAttribute('class')?.split(/\s+/)).toContain('stroke-clock-muted')
      expect(edge.getAttribute('class')).not.toContain('stroke-clock-line')
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
    // 4 of the 5: diabetes->high_bp runs between two of waist's neighbours and must stay dark.
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

  it('mounts the live region empty, so a screen reader announces what lands in it', () => {
    const { container } = render(<CausalGraph ontology={ONTOLOGY} />)
    const status = container.querySelector('[role="status"]')
    // A live region inserted together with its text is routinely missed.
    expect(status).toBeInTheDocument()
    expect(status).toBeEmptyDOMElement()
  })
})
