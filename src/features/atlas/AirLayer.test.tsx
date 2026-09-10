// The air layer's two claims, tested as claims rather than as pixels.
//
// 1. A dot appears where there IS a measurement, with the 25 km ring only where a 25 km ring is bigger
//    than the dot it surrounds.
// 2. A country with NO measurement is hatched, not coloured — and is never coloured by the mortality
//    ramp while the layer is on, because a country whose air is unknown must not be painted as if it
//    were known.

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AirLayer, AirLegend, bandOf, fillOfPm25 } from './AirLayer'
import europe from './data/europe.geo.json'
import world from './data/world.geo.json'
import type { AtlasEnvironment, EnvPoint } from '../../api/types'
import type { AtlasGeometry } from './types'

const point = (over: Partial<EnvPoint> = {}): EnvPoint => ({
  iso3: 'ROU', city: 'Bucuresti', lat: 44.4326, lon: 26.09314, pm25: 16.27, year: 2024, ...over,
})

const env = (over: Partial<AtlasEnvironment> = {}): AtlasEnvironment => ({
  model_version: '4.1.1',
  pollutant: 'PM2.5, annual mean, µg/m³',
  speaks_for_km: 25,
  window: [2020, 2025],
  points: [point()],
  unmeasured_iso3: ['TCD', 'SSD'],
  licences: [{ licence: 'CC BY-NC-SA 3.0 IGO', url: null, applies_to: ['air_city'],
               share_alike: true, non_commercial: true }],
  ...over,
})

const draw = (environment: AtlasEnvironment, geometry: AtlasGeometry, view: 'world' | 'europe') =>
  render(<svg>{<AirLayer environment={environment} geometry={geometry} view={view} />}</svg>)

describe('the air bands', () => {
  it('follow WHO’s published steps, not quantiles of what happens to be measured', () => {
    // A quantile ramp would redraw itself every time a new country started monitoring, which makes the
    // same reading a different colour next year.
    expect(bandOf(4)).toBe(0)
    expect(bandOf(5)).toBe(0)
    expect(bandOf(5.1)).toBe(1)
    expect(bandOf(35)).toBe(4)
    expect(bandOf(120)).toBe(5)
    expect(fillOfPm25(4)).not.toBe(fillOfPm25(40))
  })
})

describe('drawing the measured settlements', () => {
  it('draws a dot per point, and the 25 km ring only in the Europe view', () => {
    const { container: eu } = draw(env(), europe as AtlasGeometry, 'europe')
    const layer = eu.querySelector('[data-testid="air-layer"]')!
    expect(layer.getAttribute('data-points')).toBe('1')
    expect(layer.getAttribute('data-circles')).toBe('true')

    // On the world map a true 25 km radius is about a pixel. Drawing a visible circle there would
    // claim each reading speaks for four times the area it does.
    const { container: wd } = draw(env(), world as AtlasGeometry, 'world')
    expect(wd.querySelector('[data-testid="air-layer"]')!.getAttribute('data-circles')).toBe('false')
  })

  it('drops a point that falls outside the view’s frame rather than pinning it to the edge', () => {
    const nairobi = point({ iso3: 'KEN', city: 'Nairobi', lat: -1.29, lon: 36.82 })
    const { container } = draw(env({ points: [point(), nairobi] }), europe as AtlasGeometry, 'europe')
    const layer = container.querySelector('[data-testid="air-layer"]')!
    expect(layer.getAttribute('data-points')).toBe('1')
    expect(container.querySelector('[data-city="Nairobi"]')).toBeNull()
    // …and the world view keeps both.
    const { container: wd } = draw(env({ points: [point(), nairobi] }), world as AtlasGeometry, 'world')
    expect(wd.querySelector('[data-testid="air-layer"]')!.getAttribute('data-points')).toBe('2')
  })

  it('paints the dirtiest readings last, so the worst are not hidden under a cleaner neighbour', () => {
    const clean = point({ city: 'Clean', pm25: 4 })
    const dirty = point({ city: 'Dirty', pm25: 40, lat: 45.5, lon: 26.5 })
    const { container } = draw(env({ points: [dirty, clean] }), europe as AtlasGeometry, 'europe')
    const cities = [...container.querySelectorAll('[data-city]')].map((n) => n.getAttribute('data-city'))
    expect(cities).toEqual(['Clean', 'Dirty'])
  })

  it('draws nothing at all when the geometry predates the projection fit', () => {
    const { _fit, ...stale } = europe as AtlasGeometry
    expect(_fit).toBeTruthy()
    const { container } = draw(env(), stale as AtlasGeometry, 'europe')
    // A station shown 200 km from where it is would be worse than one not shown.
    expect(container.querySelector('[data-testid="air-layer"]')).toBeNull()
  })
})

describe('the legend', () => {
  const drawn = new Set(Object.keys(europe.countries))

  it('counts the unmeasured countries in THIS view, from the payload', () => {
    render(<AirLegend environment={env()} view="europe" drawnCountries={drawn} />)
    // Chad and South Sudan are not in the Europe view, so neither is counted here — the honest number
    // for this map is zero of them, not "152".
    const text = screen.getByTestId('air-legend').textContent ?? ''
    expect(text).toContain(`of the ${drawn.size} countries drawn here`)
    expect(text).toMatch(/\b0\b.*of the/)
  })

  it('names the gap as a gap in the monitoring, not as a result', () => {
    render(<AirLegend environment={env()} view="europe" drawnCountries={drawn} />)
    const text = screen.getByTestId('air-legend').textContent ?? ''
    expect(text).toContain('no measurement since 2020')
    expect(text).toContain('gap in the monitoring, not a clean result')
  })

  // Two renders in one test need two containers: `screen` searches the whole document, so the second
  // render made getByTestId ambiguous rather than replacing the first.
  it('explains the ring in the Europe view and its absence on the world map', () => {
    const eu = render(<AirLegend environment={env()} view="europe" drawnCountries={drawn} />)
    expect(eu.getByTestId('air-legend').textContent).toContain('25 km')
    const wd = render(
      <AirLegend environment={env()} view="world" drawnCountries={new Set(Object.keys(world.countries))} />,
    )
    expect(wd.container.querySelector('[data-testid="air-legend"]')!.textContent)
      .toContain('under a pixel on a world map')
  })

  it('shows the share-alike licence the data obliges', () => {
    const { container } = render(<AirLegend environment={env()} view="europe" drawnCountries={drawn} />)
    const text = container.querySelector('[data-testid="air-legend"]')!.textContent ?? ''
    expect(text).toContain('CC BY-NC-SA 3.0 IGO')
    expect(text).toContain('share-alike')
  })

  it('reads the radius from the payload rather than printing 25 from memory', () => {
    render(<AirLegend environment={env({ speaks_for_km: 10 })} view="europe" drawnCountries={drawn} />)
    const text = screen.getByTestId('air-legend').textContent ?? ''
    expect(text).toContain('10 km')
    expect(text).not.toContain('25 km')
  })
})
