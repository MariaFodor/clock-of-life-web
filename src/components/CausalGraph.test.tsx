// The graph had no test at all, which is how its arrows shipped invisible: at rest they were drawn
// with the hairline token used for card borders, which in dark mode composites to roughly
// rgb(22,28,37) on a rgb(15,20,27) canvas. The drawing rendered as a list of chips in columns and
// nothing failed. Colour is asserted here as a token choice rather than a pixel — jsdom does not
// composite — but the structural invariants below are the ones that make the picture mean anything.
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
  diabetes: { role: 'manage', causes: [] },
  high_bp: { role: 'manage', causes: [] },
  sleep_long: { role: 'marker', causes: [] },
}

describe('<CausalGraph/>', () => {
  it('draws every declared edge, and every one of them points forward', () => {
    const { container } = render(<CausalGraph ontology={ONTOLOGY} />)
    const edges = [...container.querySelectorAll('path[marker-end]')]
    expect(edges).toHaveLength(4) // diet->waist, activity->waist, waist->diabetes, waist->high_bp

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
                              ['waist', 'diabetes'], ['waist', 'high_bp']]) {
      expect(xOf(to)).toBeGreaterThan(xOf(from))
    }
  })

  it('draws its resting edges in a colour meant to be read on the canvas', () => {
    const { container } = render(<CausalGraph ontology={ONTOLOGY} />)
    for (const edge of container.querySelectorAll('path[marker-end]')) {
      // `clock-muted` is a TEXT token, so it is legible on the canvas in both themes by definition.
      // `clock-line` is a hairline for borders and is not.
      expect(edge.getAttribute('class')).toContain('stroke-clock-muted')
      expect(edge.getAttribute('class')).not.toContain('stroke-clock-line')
      expect(Number(edge.getAttribute('stroke-width'))).toBeGreaterThanOrEqual(1)
    }
  })

  it('isolates one factor s path on hover, and says what it acts through', () => {
    const { container } = render(<CausalGraph ontology={ONTOLOGY} />)
    const waist = screen.getByLabelText('Waist: lever')
    fireEvent.mouseEnter(waist)

    // Only edges TOUCHING the focus light up. Lighting every edge between two neighbours of the
    // focus drowns the one path being asked about, which is the whole reason for hovering.
    const lit = [...container.querySelectorAll('path[marker-end]')]
      .filter((p) => p.getAttribute('class')?.includes('stroke-clock-brand'))
    expect(lit).toHaveLength(4) // all four touch waist in this slice

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
