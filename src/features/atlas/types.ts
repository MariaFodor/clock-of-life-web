// Shapes for the World surface's boundaries.
//
// Boundaries only. The numbers this map colours arrive from `GET /api/atlas`, derived by the service
// from the model bundle's own life tables — so the map and the Life Clock are the same integrator over
// the same table, and cannot drift apart. Their types live with the rest of the API contract in
// `src/api/types.ts`.

/** One projected view: SVG paths keyed by ISO 3166-1 alpha-3, already fitted to `viewBox`. */
export interface AtlasGeometry {
  viewBox: string
  /**
   * PAINT THESE IN KEY ORDER. Interior rings are discarded by the generator — every one is a genuine
   * enclave that another country's own feature draws — which makes an enclave's visibility depend on
   * what is painted after what. South Africa's fill covers all 27 px² of Lesotho, so a consumer that
   * sorts these keys (an alphabetical legend, a stable key list) silently erases a country's data
   * point. `Object.entries` preserves insertion order, so the default is correct; sorting is the
   * mistake. A test in geometry.data.test.ts pins the order that matters.
   */
  countries: Record<string, string>
  /**
   * The generator's own fit, so a lat/lon can be projected into the same space as `countries`.
   *
   * Optional because a geometry file generated before 2026-09 has no `_fit`; `projector()` returns
   * null for one of those and the page draws no points rather than points in the wrong place.
   */
  _fit?: { minX: number; maxY: number; scale: number; width: number; height: number }
  /** Provenance, carried in the generated file so the page can attribute what it draws. */
  _source?: string
  _projection?: string
  /** SHA-256 of the upstream Natural Earth file these shapes were projected from. */
  _sha256?: string
}

/**
 * `world` is Equal Earth; `europe` is the ETRS89-LAEA grid Europe is normally drawn on. Both are
 * EQUAL-AREA, because a choropleth colours areas and a projection that inflates them (Mercator, which
 * triples Europe against Africa) draws a different claim than the data makes.
 */
export type ViewKey = 'world' | 'europe'
