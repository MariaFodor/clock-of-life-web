// Putting a PLACE on the map.
//
// The country outlines are projected offline (`scripts/build-geometry.mjs`) and arrive as finished SVG
// path strings. A settlement arrives as a latitude and longitude, so it has to be projected in the
// browser — with the same formula and the same fit, or it lands in the sea next to the country it
// belongs to.
//
// Two halves make that true rather than hoped-for:
//   * the FIT (`minX`, `maxY`, `scale`) is emitted into each geometry file by the generator, so it is
//     the generator's own arithmetic rather than a second derivation of it;
//   * the FORMULAS are restated here, because the generator is a Node script and this is browser code.
//     That duplication is the risk, so `projection.test.ts` does not check the formula against itself:
//     it projects real cities and asserts each one lands inside its own country's drawn shape.
//
// Both projections are equal-area, which is why this file is not `d3-geo`: a choropleth colours areas,
// and the whole surface is built on not inflating them.

import type { AtlasGeometry, ViewKey } from './types'

const rad = (deg: number): number => (deg * Math.PI) / 180

/** Equal Earth (Šavrič, Patterson & Jenny 2018) — the world view. */
export function equalEarth([lon, lat]: [number, number]): [number, number] {
  const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796
  const M = Math.sqrt(3) / 2
  const t = Math.asin(M * Math.sin(rad(lat)))
  const t2 = t * t, t6 = t2 * t2 * t2, t8 = t6 * t2
  const x = (rad(lon) * Math.cos(t)) / (M * (A1 + 3 * A2 * t2 + 7 * A3 * t6 + 9 * A4 * t8))
  const y = t * (A1 + A2 * t2 + A3 * t6 + A4 * t8)
  return [x, y]
}

/** Lambert azimuthal equal-area at 52°N 10°E — the ETRS89-LAEA grid Europe is normally drawn on. */
export function laeaEurope([lon, lat]: [number, number]): [number, number] {
  const p1 = rad(52), l0 = rad(10)
  const p = rad(lat), dl = rad(lon) - l0
  const denom = 1 + Math.sin(p1) * Math.sin(p) + Math.cos(p1) * Math.cos(p) * Math.cos(dl)
  const k = Math.sqrt(2 / Math.max(denom, 1e-9))
  return [
    k * Math.cos(p) * Math.sin(dl),
    k * (Math.cos(p1) * Math.sin(p) - Math.sin(p1) * Math.cos(p) * Math.cos(dl)),
  ]
}

export const PROJECTIONS: Record<ViewKey, (lonLat: [number, number]) => [number, number]> = {
  world: equalEarth,
  europe: laeaEurope,
}

export interface Projector {
  /** lon/lat → viewBox pixels. */
  point: (lon: number, lat: number) => [number, number]
  /**
   * How many viewBox pixels a distance in kilometres spans, measured AT that latitude.
   *
   * Not a constant, and that matters for the circle this draws. Equal-area projections preserve area,
   * not shape: a 25 km radius is a wider ellipse near the poles than at the equator, and one global
   * pixels-per-km would draw Tromsø's circle at Nairobi's size. Measured by projecting two points
   * 1° of latitude apart around the place itself, which is the honest local scale.
   */
  kmToPixels: (lat: number, km: number) => number
  /** true when the point falls outside the drawn frame — Europe crops, the world does not. */
  offFrame: (x: number, y: number) => boolean
}

/** One kilometre of latitude, in degrees. Meridional, so it is the same everywhere on the ellipsoid. */
const KM_PER_DEGREE_LAT = 110.574

/**
 * Build a projector for a geometry file.
 *
 * Returns `null` for a geometry with no `_fit` — a pre-2026-09 generated file. The caller then draws no
 * points at all rather than drawing them in the wrong place, which is the only safe failure here: a
 * monitoring station shown 200 km from where it is is worse than one not shown.
 */
export function projector(geometry: AtlasGeometry, view: ViewKey): Projector | null {
  const fit = geometry._fit
  if (!fit) return null
  const project = PROJECTIONS[view]
  const point = (lon: number, lat: number): [number, number] => {
    const [x, y] = project([lon, lat])
    return [(x - fit.minX) * fit.scale, (fit.maxY - y) * fit.scale]
  }
  return {
    point,
    kmToPixels: (lat, km) => {
      const degrees = km / KM_PER_DEGREE_LAT
      // Clamped so a place above 89°N does not sample past the pole, where the formula stops meaning
      // anything. Nothing WHO measures is up there, but an unclamped asin is a NaN waiting to happen.
      const safe = Math.max(-89, Math.min(89, lat))
      const [, y0] = point(0, safe)
      const [, y1] = point(0, safe + (safe > 0 ? -degrees : degrees))
      return Math.abs(y1 - y0)
    },
    offFrame: (x, y) => x < 0 || y < 0 || x > fit.width || y > fit.height,
  }
}
