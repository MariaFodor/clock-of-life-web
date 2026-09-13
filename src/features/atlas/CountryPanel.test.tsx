// The close-up panel, and the geometry it draws on.
//
// Two things are being protected here. The first is that each country's outline is the COUNTRY — a
// generated artifact keyed by ISO3 takes the last feature that claims the code, and Natural Earth files
// Australia alongside the Indian Ocean Territories and Ashmore and Cartier Islands under AUS. Australia
// came out as a four-point rectangle centred in the Timor Sea. The continent views escape that only by
// accident, because their absolute area filter drops the tiny features first.
//
// The second is the asymmetry the whole design turns on: air is per-city and greenness is not, so the
// panel has to state its coverage rather than let an empty map imply one.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CountryPanel, greenFill } from './CountryPanel'
import outlinesFile from './data/countries.geo.json'
import type { CountryOutline, CountryOutlines } from './types'
import type { CountryPlaces, Place } from '../../api/types'

const OUTLINES = (outlinesFile as unknown as { countries: CountryOutlines }).countries

const place = (over: Partial<Place> = {}): Place => ({
  iso3: 'ROU', city: 'Bucuresti', lat: 44.4326, lon: 26.09314, population: null,
  pm25: 16.27, pm25_year: 2024, pm25_stations: null, pm25_temporal_coverage: null,
  ndvi: 0.2539, ndvi_year: 2021, ndvi_basis: 'country', ndvi_matched_city: null,
  ndvi_distance_km: null, ...over,
})

const data = (over: Partial<CountryPlaces> = {}): CountryPlaces => ({
  iso3: 'ROU', iso2: 'RO', name: 'Romania', scoreable: true,
  reference: { settlements: 60, latest_year: 2024, pm25: 10.412, pm25_year: 2023, ndvi: 0.2539, ndvi_cities: 1 },
  places: [place(), place({ city: 'Brasov', lat: 45.64977, lon: 25.60993, pm25: 13.99 })],
  coverage: { settlements: 60, with_city_greenness: 1, with_country_greenness: 59, without_greenness: 0 },
  ...over,
})

const panel = (d: CountryPlaces, layer: 'air' | 'green' = 'air', outline?: CountryOutline) =>
  render(
    <CountryPanel outline={outline ?? OUTLINES.ROU} data={d} layer={layer} onLayerChange={vi.fn()} />,
  )

describe('the per-country outlines', () => {
  it('cover every country that has measured settlements', () => {
    expect(Object.keys(OUTLINES).length).toBe(85)
  })

  it('give Australia the continent, not the islands filed under the same code', () => {
    const aus = OUTLINES.AUS
    expect(aus, 'Australia must be drawn').toBeTruthy()
    // Centred on the mainland (roughly 133°E, 25°S), not the Timor Sea (124°E, 12°S), and made of
    // hundreds of points rather than the four a rectangle needs.
    expect(aus.centre[0]).toBeGreaterThan(130)
    expect(aus.centre[1]).toBeLessThan(-20)
    expect(aus.d.split(/[ML]/).length).toBeGreaterThan(100)
  })

  it('are detailed enough to magnify, including the ones a crop could not carry', () => {
    // The three that failed a crop of the Europe view: Malta had six points there, and a triangle is
    // not a country. Everything here is framed for a single country at 400px.
    for (const [iso3, min] of [['ROU', 100], ['MLT', 10], ['LUX', 10], ['CYP', 20]] as const) {
      expect(OUTLINES[iso3], `${iso3} must be drawn`).toBeTruthy()
      expect(OUTLINES[iso3].d.split(/[ML]/).length, `${iso3} point count`).toBeGreaterThan(min)
    }
  })

  it('carry the projection centre and fit a caller needs to place a settlement', () => {
    for (const o of Object.values(OUTLINES)) {
      expect(o.centre).toHaveLength(2)
      expect(Number.isFinite(o.fit.scale) && o.fit.scale > 0).toBe(true)
      expect(o.viewBox).toMatch(/^0 0 \d+ \d+$/)
    }
  })
})

describe('the country panel', () => {
  it('draws one dot per measured settlement on the air view', () => {
    const { container } = panel(data())
    const map = container.querySelector('[data-testid="country-panel-map"]')!
    expect(map.getAttribute('data-dots')).toBe('2')
    expect(container.querySelector('[data-city="Brasov"]')).not.toBeNull()
  })

  it('draws only the settlements with their OWN greenness on the green view', () => {
    // Romania has 60 measured places and one green one. A map that drew all 60 in green would be
    // claiming 59 measurements that do not exist.
    const { container } = panel(data(), 'green')
    expect(container.querySelector('[data-testid="country-panel-map"]')!.getAttribute('data-dots'))
      .toBe('0')
  })

  it('states the coverage instead of letting an empty map imply it', () => {
    panel(data(), 'green')
    const note = screen.getByTestId('country-panel-note').textContent ?? ''
    expect(note).toContain('1 of 60')
    expect(note).toMatch(/national figure/i)
    expect(note).toContain('0.25')
    expect(note).toMatch(/nobody has measured them/i)
  })

  it('says so plainly when a country has no greenness measurement at all', () => {
    panel(data({ coverage: { settlements: 8, with_city_greenness: 0, with_country_greenness: 8, without_greenness: 0 } }), 'green')
    const note = screen.getByTestId('country-panel-note').textContent ?? ''
    expect(note).toMatch(/no settlement in romania has its own greenness measurement/i)
    expect(note).toMatch(/gap in the measurement, not a bare country/i)
  })

  it('washes the country at its national figure on the green view, and not on the air view', () => {
    // The fallback DRAWN rather than described. On the air view every settlement has its own reading,
    // so a national wash would be inventing a surface between them.
    const green = panel(data(), 'green').container.querySelector('path')!
    expect(green.getAttribute('fill')).toBe(greenFill(0.2539))
    const air = panel(data(), 'air').container.querySelector('path')!
    expect(air.getAttribute('fill')).not.toBe(greenFill(0.2539))
  })

  it('switches between the two readings', async () => {
    const user = userEvent.setup()
    const onLayerChange = vi.fn()
    render(<CountryPanel outline={OUTLINES.ROU} data={data()} layer="air" onLayerChange={onLayerChange} />)
    await user.click(screen.getByTestId('panel-layer-green'))
    expect(onLayerChange).toHaveBeenCalledWith('green')
  })

  it('spans the range the greenness data actually occupies', () => {
    // NDVI in these cities runs 0.07 to 0.47. A 0-1 ramp would put every European city in the bottom
    // half of it and make them all look alike.
    expect(greenFill(0.1)).not.toBe(greenFill(0.45))
    expect(greenFill(0.2)).not.toBe(greenFill(0.3))
  })

  it('puts a settlement inside its own country', () => {
    // The panel projects lat/lon with the same formula and the same centre the generator recorded. If
    // those ever drift, Bucharest lands outside Romania — this is the end-to-end check of that pair.
    const { container } = panel(data())
    const buc = container.querySelector('[data-city="Bucuresti"]')!
    const [cx, cy] = [Number(buc.getAttribute('cx')), Number(buc.getAttribute('cy'))]
    const [, , w, h] = OUTLINES.ROU.viewBox.split(' ').map(Number)
    expect(cx).toBeGreaterThan(0)
    expect(cx).toBeLessThan(w)
    expect(cy).toBeGreaterThan(0)
    expect(cy).toBeLessThan(h)
    // And on the correct side of the country: Bucharest is in the south-east quadrant of Romania.
    expect(cx).toBeGreaterThan(w * 0.5)
    expect(cy).toBeGreaterThan(h * 0.5)
  })
})
