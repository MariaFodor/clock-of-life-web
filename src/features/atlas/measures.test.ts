import { describe, expect, it } from 'vitest'
import { countryByIso2, keyOf, measureById, ranked, rankOf, valueOf } from './measures'
import type { AtlasCountry } from '../../api/types'

const country = (iso2: string, iso3: string, f: number, m: number, am = 100): AtlasCountry => ({
  iso2,
  iso3,
  name: iso3,
  region: 'Test',
  lifetable_year: 2023,
  scoreable: iso2 === 'RO',
  le0: { f, m, b: (f + m) / 2 },
  le60: { f: f - 55, m: m - 55, b: (f + m) / 2 - 55 },
  am: { f: am - 30, m: am + 30, b: am },
})

const world = [country('JP', 'JPN', 87.2, 81.7, 50), country('RO', 'ROU', 79.6, 72.4, 128),
                country('NG', 'NGA', 54.8, 54.2, 349)]

describe('reading a measure', () => {
  it('reads the sex asked for', () => {
    expect(valueOf(world[1], 'le0', 'f')).toBe(79.6)
    expect(valueOf(world[1], 'le0', 'm')).toBe(72.4)
    expect(valueOf(world[1], 'am', 'm')).toBe(158)
  })

  it('derives the gap rather than trusting a served one, and ignores the sex selector', () => {
    // Women minus men, so it is positive where women outlive men — which is almost everywhere.
    expect(valueOf(world[0], 'gap', 'b')).toBeCloseTo(5.5, 5)
    expect(valueOf(world[0], 'gap', 'm')).toBe(valueOf(world[0], 'gap', 'f'))
    expect(measureById('gap').bySex).toBe(false)
  })

  it('returns undefined rather than zero when a figure is missing', () => {
    const partial = { ...world[1], le60: {} }
    expect(valueOf(partial, 'le60', 'f')).toBeUndefined()
  })
})

describe('ranking', () => {
  it('puts the longest lives first, whichever direction the measure runs', () => {
    expect(ranked(world, 'le0', 'f').map((r) => r.country.iso3)).toEqual(['JPN', 'ROU', 'NGA'])
    // Fewer deaths is better, so the ordering must invert against the raw number.
    expect(ranked(world, 'am', 'f').map((r) => r.country.iso3)).toEqual(['JPN', 'ROU', 'NGA'])
  })

  it('reports a country’s position out of those with a figure', () => {
    expect(rankOf(world, 'ROU', 'le0', 'f')).toEqual({ rank: 2, of: 3 })
    expect(rankOf(world, 'XXX', 'le0', 'f')).toBeNull()
  })

  it('drops a country with no figure instead of ranking it at zero', () => {
    const blank = { ...country('XX', 'XXX', 0, 0), le0: {} }
    expect(ranked([...world, blank], 'le0', 'f')).toHaveLength(3)
  })
})

describe('finding the reader’s own country', () => {
  it('matches the two-letter code the profile carries, case-insensitively', () => {
    expect(countryByIso2(world, 'ro')?.iso3).toBe('ROU')
    expect(countryByIso2(world, undefined)).toBeUndefined()
  })

  it('keys on ISO3, which is what the boundaries are keyed on', () => {
    expect(keyOf(world[1])).toBe('ROU')
    // A country the service sent without an ISO3 stays selectable rather than becoming invisible.
    expect(keyOf({ ...world[1], iso3: null })).toBe('RO')
  })
})
