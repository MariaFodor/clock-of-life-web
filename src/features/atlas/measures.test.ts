import { describe, expect, it } from 'vitest'
import {
  MEASURES,
  countryByIso2,
  keyOf,
  longUnitOf,
  measureById,
  ranked,
  rankOf,
  valueOf,
} from './measures'
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

describe('the words at the two ends of the legend', () => {
  // The legend prints its class boundaries smallest-first for every measure. These labels hang off
  // THOSE numbers, not off the colours — the colour ramp reverses on the mortality measure and
  // reverses again between the light and the dark theme, and the numbers do neither.
  it('describes lives where a bigger number means longer ones', () => {
    expect(measureById('le0').legendEnds).toEqual({ low: 'shorter lives', high: 'longer lives' })
    expect(measureById('le60').legendEnds).toEqual({ low: 'shorter lives', high: 'longer lives' })
  })

  it('swaps to the measure’s own words where a bigger number means the opposite', () => {
    // "Deaths between 15 and 60" counts deaths, and its smallest numbers are its best news. Calling
    // its low end "shorter lives" — the pair that is right on the other two maps — would put the
    // words for the worst outcome next to the countries with the fewest deaths.
    expect(measureById('am').legendEnds).toEqual({ low: 'fewer deaths', high: 'more deaths' })
    expect(measureById('am').higherIsBetter).toBe(false)
  })

  it('never calls a wide women–men gap a long life', () => {
    expect(measureById('gap').legendEnds).toEqual({ low: 'narrower gap', high: 'wider gap' })
    for (const end of Object.values(measureById('gap').legendEnds)) {
      expect(end).not.toMatch(/lives/)
    }
  })

  it('gives every measure both ends, so a new one cannot ship with an unlabelled legend', () => {
    for (const m of MEASURES) {
      expect(m.legendEnds.low, m.id).toBeTruthy()
      expect(m.legendEnds.high, m.id).toBeTruthy()
      expect(m.legendEnds.low, m.id).not.toBe(m.legendEnds.high)
    }
  })
})

describe('units', () => {
  it('spells the unit out where there is room and keeps it short where there is not', () => {
    // "128" on a card next to "79.6 years" is the defect; "128 per 1,000 alive at 15" in a table
    // cell is the overcorrection. Both forms exist so each place can use the one that fits.
    expect(longUnitOf(measureById('am'))).toBe('per 1,000 alive at 15')
    expect(measureById('am').unit).toBe('per 1,000')
    // Nothing to spell out on the year measures: the long form falls back to the short one.
    expect(longUnitOf(measureById('le0'))).toBe('years')
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
