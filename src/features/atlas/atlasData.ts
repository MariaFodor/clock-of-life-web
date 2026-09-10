// Loading the boundaries.
//
// The NUMBERS come from `GET /api/atlas` (see `useAtlas`). Only the shapes live here, and they are
// ~180 KB that most sessions never open — so they are pulled in through a dynamic import, which Vite
// splits into its own chunk, and cached by the query client like anything else. Nothing map-shaped
// lands in the initial bundle.

import { useQuery } from '@tanstack/react-query'
import type { AtlasGeometry, ViewKey } from './types'

async function loadGeometry(view: ViewKey): Promise<AtlasGeometry> {
  const mod = view === 'europe' ? await import('./data/europe.geo.json') : await import('./data/world.geo.json')
  return mod.default as AtlasGeometry
}

/** The projected boundaries for one view. Fetched per view, kept once fetched. */
export function useAtlasGeometry(view: ViewKey) {
  return useQuery({ queryKey: ['atlas', 'geometry', view], queryFn: () => loadGeometry(view), staleTime: Infinity })
}
