// Shapes for the World surface's boundaries.
//
// Boundaries only. The numbers this map colours arrive from `GET /api/atlas`, derived by the service
// from the model bundle's own life tables — so the map and the Life Clock are the same integrator over
// the same table, and cannot drift apart. Their types live with the rest of the API contract in
// `src/api/types.ts`.

/** One projected view: SVG paths keyed by ISO 3166-1 alpha-3, already fitted to `viewBox`. */
export interface AtlasGeometry {
  viewBox: string
  countries: Record<string, string>
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
