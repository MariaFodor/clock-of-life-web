// The mock's fixture must be what the service actually serves.
//
// This repo has been here before: `mockScoring.parity.test.ts` exists because a mock that drifts from
// the service is a second source of truth nobody notices until a number is wrong on screen. The
// fixture is GENERATED from a running service's own `GET /api/atlas` — never hand-written — and this
// pins it against the bundle the service loads, so the next bundle bump fails here rather than in a
// reader's browser.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import fixture from './atlas.fixture.json'

// Resolved relative to this file, not from a hardcoded version literal — the sibling parity test
// documents why: a pinned version string rots at the next bundle.
const here = dirname(fileURLToPath(import.meta.url))
const serviceDir = join(here, '..', '..', '..', 'clock-of-life-service')

function manifest(): { version: string; countries: string[]; reference_countries: string[] } | null {
  const bundles = join(serviceDir, 'bundle')
  try {
    const { readdirSync } = require('node:fs') as typeof import('node:fs')
    const dir = readdirSync(bundles).filter((d) => d.startsWith('model-v')).sort().pop()
    if (!dir) return null
    return JSON.parse(readFileSync(join(bundles, dir, 'manifest.json'), 'utf8'))
  } catch {
    return null // the service repo is not checked out beside this one
  }
}

describe('the atlas fixture', () => {
  it('carries the whole world and marks the scoreable subset', () => {
    expect(fixture.countries.length).toBeGreaterThanOrEqual(230)
    expect(fixture.countries.filter((c) => c.scoreable).length).toBe(30)
    expect(new Set(fixture.countries.map((c) => c.iso2)).size).toBe(fixture.countries.length)
  })

  it('says where its numbers came from, with a licence and a retrieval date', () => {
    const src = fixture.sources[0]
    expect(src.dataset).toMatch(/World Population Prospects/)
    expect(src.licence).toBe('CC BY 3.0 IGO')
    expect(src.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(fixture.derived_by).toMatch(/remaining_le/)
  })

  it('matches the bundle the service loads', () => {
    const m = manifest()
    if (!m) return // nothing to compare against; the checks above still hold
    expect(fixture.model_version).toBe(m.version)
    expect(new Set(fixture.countries.map((c) => c.iso2)))
      .toEqual(new Set(m.reference_countries))
    expect(new Set(fixture.countries.filter((c) => c.scoreable).map((c) => c.iso2)))
      .toEqual(new Set(m.countries))
  })

  it('agrees with the boundaries on which countries can be drawn', async () => {
    const world = (await import('./data/world.geo.json')).default
    const europe = (await import('./data/europe.geo.json')).default
    const known = new Set(fixture.countries.map((c) => c.iso3))

    // A drawn shape with no row is a country coloured by nothing. The four the UN does not report on
    // separately are named here rather than tolerated by a wildcard, so a fifth has to be justified.
    expect(Object.keys(world.countries).filter((iso) => !known.has(iso)).sort())
      .toEqual(['ATF', 'CYN', 'KOS', 'SOL'])   // French Southern Terrs., N. Cyprus, Kosovo, Somaliland
    expect(Object.keys(europe.countries).filter((iso) => !known.has(iso)).sort())
      .toEqual(['ALA', 'CYN', 'KOS'])          // + Åland, which Finland reports for

    // The reverse is expected and is the reason the table is not decoration: 59 countries have a
    // life table and no polygon at this scale — Singapore, Hong Kong, Monaco, Bahrain, Barbados,
    // most of the Caribbean and the Pacific. A reader who cannot find them on the map must still be
    // able to find them at all.
    const drawn = new Set([...Object.keys(world.countries), ...Object.keys(europe.countries)])
    const shapeless = fixture.countries.filter((c) => !drawn.has(c.iso3!))
    expect(shapeless.length).toBe(59)
    for (const iso of ['SGP', 'HKG', 'MCO', 'BHR', 'MUS', 'MDV']) {
      expect(shapeless.some((c) => c.iso3 === iso), `${iso} should be table-only`).toBe(true)
    }
  })
})
