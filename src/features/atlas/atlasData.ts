// Loading the boundaries.
//
// The NUMBERS come from `GET /api/atlas` (see `useAtlas`). Only the shapes live here, and they are
// ~180 KB that most sessions never open — so they are pulled in through a dynamic import, which Vite
// splits into its own chunk, and cached by the query client like anything else. Nothing map-shaped
// lands in the initial bundle.

import { useQuery } from '@tanstack/react-query'
import type { AtlasGeometry, CountryOutlines, ViewKey } from './types'

async function loadGeometry(view: ViewKey): Promise<AtlasGeometry> {
  const mod = view === 'europe' ? await import('./data/europe.geo.json') : await import('./data/world.geo.json')
  return mod.default as AtlasGeometry
}

/** The projected boundaries for one view. Fetched per view, kept once fetched. */
export function useAtlasGeometry(view: ViewKey) {
  return useQuery({ queryKey: ['atlas', 'geometry', view], queryFn: () => loadGeometry(view), staleTime: Infinity })
}

/**
 * One country's own outline, projected and framed for itself.
 *
 * A separate artifact from the two continent views, because those are simplified for a 1000px-wide
 * CONTINENT and do not survive being magnified to a single country: Romania arrives as 94 points and
 * Malta as six — a triangle. These are 228 and 16.
 *
 * Covers the 85 countries that have measured settlements, which is exactly the set the panel has
 * anything to draw for. Dynamically imported like the rest, so it costs nothing until a reader opens
 * the panel.
 */
async function loadCountryOutlines(): Promise<CountryOutlines> {
  const mod = await import('./data/countries.geo.json')
  return (mod.default as unknown as { countries: CountryOutlines }).countries
}

export function useCountryOutlines() {
  return useQuery({
    queryKey: ['atlas', 'geometry', 'countries'],
    queryFn: loadCountryOutlines,
    staleTime: Infinity,
  })
}
