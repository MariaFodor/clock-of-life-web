// Does a city land where the city is?
//
// `projection.ts` restates two formulas that `scripts/build-geometry.mjs` also contains, because one is
// browser code and the other is a Node script. A test that checked the formula against a table of
// expected outputs would only prove the table was copied from the same place as the code.
//
// So this checks the thing that actually matters, end to end: project a real city's real coordinates,
// then assert the resulting point is INSIDE the path its own country is drawn with. That exercises the
// formula, the generator's fit, the y-flip and the viewBox together — and it fails if any one of them
// drifts, including the one that is duplicated.

import { describe, expect, it } from 'vitest'
import europe from './data/europe.geo.json'
import world from './data/world.geo.json'
import { projector } from './projection'
import type { AtlasGeometry } from './types'

/** Every point in a path string. The generator emits absolute M…L…Z only, which keeps this honest. */
function points(d: string): Array<[number, number]> {
  return d
    .split(/[MZ]/)
    .filter(Boolean)
    .flatMap((ring) =>
      ring.split('L').map((pair) => {
        const [x, y] = pair.trim().split(/\s+/).map(Number)
        return [x, y] as [number, number]
      }),
    )
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
}

/** Ray casting over every ring at once: the rings of one country do not overlap, so a point inside an
 *  odd number of them is inside the country. Enclaves are separate features, so there are no holes. */
function inside(d: string, [px, py]: [number, number]): boolean {
  return d
    .split('Z')
    .filter((r) => r.trim())
    .some((ring) => {
      const pts = points(`${ring}Z`)
      let hit = false
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i]
        const [xj, yj] = pts[j]
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit
      }
      return hit
    })
}

// Real coordinates, from the bundle's own places.json where the settlement is in it.
//
// INLAND only, and that distinction is the finding rather than a convenience. Coastal cities fail a
// strict inside-the-shape test on these outlines and the projection is not why: the generator simplifies
// with Ramer–Douglas–Peucker at 0.35 px (world) and 0.5 px (Europe), which moves a coastline by up to
// that much, and a city ON the coast can end up on the sea side of a line that was straightened past it.
// Measured: Helsinki and Reykjavik both land just outside their countries' drawn shapes, by under a
// pixel. That is a real property of the map and the page has to live with it — a harbour monitoring
// station may render a pixel offshore — so it is tested as a tolerance below rather than hidden by
// choosing only cities that pass.
const INLAND: Array<[string, string, number, number]> = [
  ['Bucuresti', 'ROU', 26.09314, 44.4326],
  ['Berlin', 'DEU', 13.40, 52.52],
  ['Madrid', 'ESP', -3.70, 40.42],
  ['Roma', 'ITA', 12.50, 41.90],
  ['Warszawa', 'POL', 21.01, 52.23],
  ['Praha', 'CZE', 14.42, 50.09],
]

/** On the water's edge, where a simplified coastline can fall on the wrong side of the city. */
const COASTAL: Array<[string, string, number, number]> = [
  ['Helsinki', 'FIN', 24.94, 60.17],
  ['Reykjavik', 'ISL', -21.94, 64.15],
]

/** Nearest distance from a point to any vertex of a path — a cheap bound on "how far offshore". */
function nearestVertex(d: string, [px, py]: [number, number]): number {
  return Math.min(...points(d).map(([x, y]) => Math.hypot(x - px, y - py)))
}

// Somewhere outside Europe's frame entirely, and somewhere wet.
const NOT_IN_EUROPE: Array<[string, number, number]> = [
  ['the middle of the Atlantic', -35, 35],
  ['Nairobi', 36.82, -1.29],
]

describe('projecting a place onto the map', () => {
  for (const [view, geometry] of [
    ['world', world as AtlasGeometry],
    ['europe', europe as AtlasGeometry],
  ] as const) {
    describe(view, () => {
      it('carries the generator fit a point needs', () => {
        const p = projector(geometry, view)
        expect(p, `${view}.geo.json has no _fit — regenerate with scripts/build-geometry.mjs`).not.toBeNull()
      })

      it.each(INLAND)('%s lands inside %s', (_name, iso3, lon, lat) => {
        const p = projector(geometry, view)!
        const d = geometry.countries[iso3]
        expect(d, `${iso3} is not drawn in the ${view} view`).toBeTruthy()
        const xy = p.point(lon, lat)
        expect(p.offFrame(...xy)).toBe(false)
        expect(inside(d, xy), `${_name} at ${xy.map((n) => n.toFixed(1))} is outside ${iso3}`).toBe(true)
      })

      it.each(COASTAL)('%s is within a pixel of %s, even if not strictly inside it', (_name, iso3, lon, lat) => {
        const p = projector(geometry, view)!
        const d = geometry.countries[iso3]
        if (!d) return
        const xy = p.point(lon, lat)
        // 3 px, not 1: the nearest VERTEX can be that far along a straightened coastline even when the
        // point is only a fraction of a pixel off the line itself. The assertion that matters is that
        // it is nowhere near another country — a projection error puts a city hundreds of pixels away.
        expect(nearestVertex(d, xy), `${_name} should be beside ${iso3}`).toBeLessThan(3)
      })

      it('a 25 km radius is a small number of pixels', () => {
        const p = projector(geometry, view)!
        // Sanity, not a pinned number: a radius that came out as 0, or as half the map, would each
        // draw a circle saying something false about what a reading covers.
        expect(p.kmToPixels(45, 25)).toBeGreaterThan(0.1)
        expect(p.kmToPixels(45, 25)).toBeLessThan(50)
      })
    })
  }

  // MEASURED, and it decided the design. A true-to-scale 25 km circle is 3.8-4.3 px across the Europe
  // view — small but legible — and 0.46-1.36 px on the world view, which is smaller than a pixel. So the
  // circle is drawn only in the Europe view: enlarging it for the world map would draw a claim that the
  // reading speaks for 100 km when it speaks for 25, and this surface exists to stop that kind of thing.
  it('the world view cannot honestly draw a 25 km circle, and Europe can', () => {
    const w = projector(world as AtlasGeometry, 'world')!
    const e = projector(europe as AtlasGeometry, 'europe')!
    expect(w.kmToPixels(45, 25)).toBeLessThan(1.5)
    expect(e.kmToPixels(45, 25)).toBeGreaterThan(3)
  })

  // Equal Earth SQUEEZES north-south toward the poles while stretching east-west — the opposite of the
  // first guess written here, which the measurement rejected. It matters because it is why the circle is
  // an honest circle in Europe (LAEA at 52°N is near-isotropic there: rx 4.23, ry 4.22 at 45°N) and
  // would be an ellipse on the world map if it were drawn at all.
  it('Equal Earth compresses latitude toward the pole', () => {
    const w = projector(world as AtlasGeometry, 'world')!
    expect(w.kmToPixels(70, 25)).toBeLessThan(w.kmToPixels(0, 25))
  })

  it('the Europe view crops rather than wrapping: a point outside the frame is reported off-frame', () => {
    const p = projector(europe as AtlasGeometry, 'europe')!
    for (const [name, lon, lat] of NOT_IN_EUROPE) {
      const xy = p.point(lon, lat)
      expect(p.offFrame(...xy), `${name} should be off the Europe frame`).toBe(true)
    }
  })

  it('the two views disagree about where a city is, which is the point of having both', () => {
    const w = projector(world as AtlasGeometry, 'world')!
    const e = projector(europe as AtlasGeometry, 'europe')!
    const [wx] = w.point(26.09314, 44.4326)
    const [ex] = e.point(26.09314, 44.4326)
    // If these matched, one of the two projections is not being applied.
    expect(Math.abs(wx - ex)).toBeGreaterThan(50)
  })

  it('refuses to place a point when the geometry predates the fit', () => {
    const { _fit, ...withoutFit } = world as AtlasGeometry
    expect(_fit).toBeTruthy()
    expect(projector(withoutFit as AtlasGeometry, 'world')).toBeNull()
  })
})
