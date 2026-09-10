// The mock's fixture must be what the service actually serves.
//
// This repo has been here before: `mockScoring.parity.test.ts` exists because a mock that drifts from
// the service is a second source of truth nobody notices until a number is wrong on screen. The
// fixture is GENERATED from a running service's own `GET /api/atlas` — never hand-written — and this
// pins it against the bundle the service loads, so the next bundle bump fails here rather than in a
// reader's browser.

import { readdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import fixture from './atlas.fixture.json'

// Resolved relative to THIS file. Four levels up, not three: this file sits at
// src/features/atlas, one deeper than src/api/mockScoring.parity.test.ts, whose three-level idiom was
// copied here without adjusting. Three landed on clock-of-life-web/clock-of-life-service — a path that
// exists in no checkout — so `manifest()` returned null and every assertion below it silently
// returned. Proven by tamper: a fixture declaring model_version "9.9.9" and an invented country code
// passed 4/4 for as long as the guard has existed.
const here = dirname(fileURLToPath(import.meta.url))
const serviceDir = join(here, '..', '..', '..', '..', 'clock-of-life-service')

/** SHA-256/16 of the manifest's checksum map — changes whenever any file in the bundle does. */
function bundleStamp(manifest: { checksums: Record<string, string> }): string {
  const ordered = Object.fromEntries(Object.entries(manifest.checksums).sort(([a], [b]) => a.localeCompare(b)))
  return createHash('sha256').update(JSON.stringify(ordered)).digest('hex').slice(0, 16)
}

function manifest(): { version: string; countries: string[]; reference_countries: string[]; checksums: Record<string, string> } {
  const bundles = join(serviceDir, 'bundle')
  // THROWS rather than returning null. The sibling guard states the principle this file failed to
  // copy: "a drift guard that needs manual updating to keep working is a drift guard that stops
  // working." A missing service checkout must be a loud failure, not a quiet pass.
  const dir = readdirSync(bundles).filter((d) => d.startsWith('model-v')).sort().pop()
  if (!dir) throw new Error(`no model bundle under ${bundles}`)
  return JSON.parse(readFileSync(join(bundles, dir, 'manifest.json'), 'utf8'))
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
    expect(fixture.model_version).toBe(m.version)
    expect(new Set(fixture.countries.map((c) => c.iso2)))
      .toEqual(new Set(m.reference_countries))
    expect(new Set(fixture.countries.filter((c) => c.scoreable).map((c) => c.iso2)))
      .toEqual(new Set(m.countries))
  })

  it('was generated from the bundle that is vendored right now', () => {
    // The set comparisons above catch a country appearing or disappearing. They cannot catch the
    // numbers moving: an auditor shifted 235 countries by +0.4 yr and the whole suite stayed green.
    // Stamping the fixture with a digest of the bundle's own checksum map closes that — any change to
    // any file in the bundle turns this red until someone regenerates from the service.
    expect(fixture._bundle?.version).toBe(manifest().version)
    expect(fixture._bundle?.checksums_sha256_16).toBe(bundleStamp(manifest()))
  })

  it('has not been edited by hand since it was generated', () => {
    // The stamp above catches "the bundle moved and nobody regenerated". This catches the other
    // direction: a number changed in this file while the bundle stood still. Together they mean the
    // fixture is either what the service served, or red.
    const own = createHash('sha256')
      .update(JSON.stringify({ model_version: fixture.model_version, derived_by: fixture.derived_by,
                               sources: fixture.sources, countries: fixture.countries }))
      .digest('hex')
      .slice(0, 16)
    expect(fixture._bundle?.fixture_sha256_16).toBe(own)
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
