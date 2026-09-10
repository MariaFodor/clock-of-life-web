// The generated boundaries are data, and data that nothing checks is data that quietly rots.
//
// These are not tests of the drawing code — there is none yet. They are invariants of the two files
// `scripts/build-geometry.mjs` writes, so that regenerating them (a new Natural Earth tag, a changed
// tolerance) has to show up as a failing assertion rather than as a map that looks slightly wrong to
// nobody in particular.

import { describe, expect, it } from 'vitest'
import world from './data/world.geo.json'
import europe from './data/europe.geo.json'
import type { AtlasGeometry } from './types'

const VIEWS: [string, AtlasGeometry][] = [
  ['world', world as AtlasGeometry],
  ['europe', europe as AtlasGeometry],
]

/** Every coordinate pair in a path, as numbers. */
function points(d: string): [number, number][] {
  return [...d.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])])
}

describe.each(VIEWS)('%s boundaries', (_name, geo) => {
  it('is keyed by ISO 3166-1 alpha-3 and nothing else', () => {
    const keys = Object.keys(geo.countries)
    expect(keys.length).toBeGreaterThan(60)
    expect(new Set(keys).size, 'a duplicate key means one country overwrote another').toBe(keys.length)
    expect(keys.filter((k) => !/^[A-Z]{3}$/.test(k))).toEqual([])
    // `-99` is Natural Earth's "no code" sentinel; letting it through would draw a country named -99.
    expect(keys).not.toContain('-99')
  })

  it('draws closed rings only', () => {
    for (const [iso, d] of Object.entries(geo.countries)) {
      expect(d.startsWith('M'), `${iso} does not start a path`).toBe(true)
      // Every subpath is emitted as M…L…Z; an unclosed ring fills as a wedge to the start point.
      const rings = d.split('M').slice(1)
      for (const ring of rings) {
        expect(ring.endsWith('Z'), `${iso} has an unclosed ring`).toBe(true)
        expect(points(ring).length, `${iso} has a degenerate ring`).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('contains coordinates and nothing else', () => {
    // This replaces a Number.isFinite() check that could never fail: `points()` extracts matches of a
    // decimal regex, so NaN, Infinity and 1e+21 were filtered out BEFORE the assertion saw them — and
    // worse, `1e+21 5` yields a plausible finite on-frame point from a garbage coordinate. Asserting
    // the alphabet of the string itself is the check that actually fires: a browser rejects an entire
    // path at the first invalid token, so one bad coordinate silently erases a whole country.
    for (const [iso, d] of Object.entries(geo.countries)) {
      expect(d, `${iso} has a token that is not a coordinate`).not.toMatch(/[^-.\d LMZ]/)
      expect(d, `${iso} has an exponent or a doubled sign`).not.toMatch(/\d[eE]|--|\.\./)
    }
  })

  it('ships nothing that falls entirely outside the frame', () => {
    const [, , w, h] = geo.viewBox.split(' ').map(Number)
    // Shapes may OVERFLOW the frame — the Europe view deliberately clips wide and frames narrow, so
    // Russia and Greenland run off the page and the SVG viewport crops them, the way an atlas crops
    // at the edge of the paper. What must never ship is a ring with no point on the page at all:
    // invisible, unhoverable, and pure weight in a file that is downloaded before it is read.
    for (const [iso, d] of Object.entries(geo.countries)) {
      for (const ring of d.split('M').slice(1)) {
        expect(points(ring).some(([x, y]) => x > -1 && x < w + 1 && y > -1 && y < h + 1),
               `${iso} has a ring entirely off-frame`).toBe(true)
      }
    }
  })

  it('carries the pinned source it was generated from', () => {
    // Un-pinning the tag is how a map silently redraws itself between two people's screenshots.
    expect(geo._source).toMatch(/Natural Earth .* v5\.1\.2/)
    expect(geo._source).toMatch(/public domain/)
    // A tag is a mutable pointer; the commit and the digest are what actually pin the boundaries.
    expect(geo._source).toMatch(/\(f1890d9f152c\)/)
    expect(geo._sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(geo._projection).toBeTruthy()
  })
})

describe('what each view is for', () => {
  it('the globe drops Antarctica, which has boundaries and no people', () => {
    expect(world.countries).not.toHaveProperty('ATA')
    // Exact, not a floor. A silent ISO3 collision upstream — two features claiming one code, so the
    // later one overwrites the earlier — drops the count by one and sails past `> 150`.
    expect(Object.keys(world.countries)).toHaveLength(176)
  })

  it('the Europe view exists because 110m loses EU member states', () => {
    // Malta and Luxembourg have no shape at 110m and are the reason for a second, finer view; if a
    // regeneration drops them, the Europe view has stopped earning its 90 KB.
    for (const iso of ['MLT', 'LUX', 'CYP', 'MNE']) {
      expect(europe.countries, `${iso} missing from the Europe view`).toHaveProperty(iso)
    }
    expect(world.countries).not.toHaveProperty('MLT')
  })

  it('the two views are different projections of the same world, not the same file twice', () => {
    expect(Object.keys(europe.countries)).toHaveLength(66)
    expect(world.viewBox).not.toEqual(europe.viewBox)
    expect(world.countries.ROU).not.toEqual(europe.countries.ROU)
  })
})

// The claims the header comments make — equal-area, north-up — were not gated until a review proved
// it by sabotage: removing the y-flip gives an upside-down world, and swapping Equal Earth for
// Mercator inflates Europe against Africa by 226%, and BOTH passed every test above. Shape invariants
// cannot catch either, because neither changes the shape of the file.

/** Signed-area magnitude of every ring in a path, in viewBox units. */
function drawnArea(d: string): number {
  let total = 0
  for (const ring of d.split('M').slice(1)) {
    const pts = points(ring)
    let s = 0
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i]
      const [x2, y2] = pts[(i + 1) % pts.length]
      s += x1 * y2 - x2 * y1
    }
    total += Math.abs(s / 2)
  }
  return total
}

/** Mean y of a country's vertices — a crude centroid, which is all a north/south test needs. */
function meanY(d: string): number {
  const ys = points(d).map(([, y]) => y)
  return ys.reduce((a, b) => a + b, 0) / ys.length
}

describe('the projection is what it says it is', () => {
  // The JSON import infers a literal type with one property per country, which cannot be indexed by
  // a variable; the declared shape can.
  const W = world as AtlasGeometry
  const E = europe as AtlasGeometry

  // km², CIA World Factbook. Chosen to span latitudes, because that is the axis an area-inflating
  // projection distorts along.
  const TRUE_AREA: Record<string, number> = {
    NOR: 323802, SWE: 450295, FIN: 338424, RUS: 17098242, CAN: 9984670,
    FRA: 551695, ESP: 505992, TUR: 783562, EGY: 1001450, IND: 3287263,
    KEN: 580367, NGA: 923768, BRA: 8515770, COD: 2344858, ZAF: 1219090,
    AUS: 7741220, ARG: 2780400, IDN: 1904569,
  }

  it('draws every country at the same scale, whatever its latitude', () => {
    const ratios = Object.entries(TRUE_AREA)
      .filter(([iso]) => iso in W.countries)
      .map(([iso, km2]) => drawnArea(W.countries[iso]) / km2)
    expect(ratios.length).toBeGreaterThan(12)
    // Measured on the shipped file: 1.35, and the spread is coastline simplification (Norway's
    // fjords), not the projection. Mercator would put Sweden against Kenya alone at roughly 5x.
    const spread = Math.max(...ratios) / Math.min(...ratios)
    expect(spread, `area-per-km² spread of ${spread.toFixed(2)}x — is this still equal-area?`)
      .toBeLessThan(1.8)
  })

  it('puts north at the top', () => {
    // SVG y grows downward, so a northern country must have the SMALLER mean y. Dropping the flip in
    // the generator inverts every one of these and changes nothing else about the file.
    for (const [north, south] of [['NOR', 'ZAF'], ['CAN', 'BRA'], ['SWE', 'EGY']]) {
      expect(meanY(W.countries[north]),
             `${north} should be drawn above ${south}`).toBeLessThan(meanY(W.countries[south]))
    }
    expect(meanY(E.countries.ISL)).toBeLessThan(meanY(E.countries.ESP))
  })

  it('paints an enclave after the country that surrounds it', () => {
    // Holes are discarded — every one is a genuine enclave owned by another country's feature, so
    // nothing paints water as land. But that makes visibility depend on PAINT ORDER: South Africa's
    // fill covers all 27 px² of Lesotho, so a consumer that reorders these keys erases a country's
    // data point. Insertion order is the contract, and this is where it is written down.
    const order = Object.keys(W.countries)
    expect(order.indexOf('LSO')).toBeGreaterThan(order.indexOf('ZAF'))
    const euro = Object.keys(E.countries)
    if (euro.includes('SMR')) expect(euro.indexOf('SMR')).toBeGreaterThan(euro.indexOf('ITA'))
  })
})
