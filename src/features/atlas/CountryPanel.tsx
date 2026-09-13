// One country, close up — where its air was measured, and where its greenness was not.
//
// The world map answers "how does my country compare". This answers "where in my country", which is a
// different question and needs a different frame: the continent outlines are simplified for a 1000px
// CONTINENT and do not survive magnification (Romania 94 points, Malta six — a triangle), so each
// country is projected and framed for itself in `data/countries.geo.json`.
//
// ONE PANEL, TWO READINGS, ONE SWITCH — and the switch exists because of a hard asymmetry in the data
// rather than for tidiness. Air is genuinely per-city: Romania has 60 measured settlements. Greenness
// is not: it has ONE, and 22 of the 30 scoreable countries are in the same position. Two permanent maps
// side by side would ship one that works beside one that looks broken — and it is not broken, it is
// honest. So the greenness view washes the whole country at its national figure, draws the cities that
// do have their own, and says the coverage in words. That is the same move the big map makes with its
// hatch: an absence drawn as an absence rather than left as empty space.

import { useMemo } from 'react'
import { Card } from '../../components/ui'
import { fillOfPm25 } from './AirLayer'
import type { CountryOutline } from './types'
import type { CountryPlaces, Place } from '../../api/types'

export type PanelLayer = 'air' | 'green'

const rad = (deg: number): number => (deg * Math.PI) / 180

/**
 * Lambert azimuthal equal-area about this country's own centre — the same formula the generator used,
 * fed the same centre it recorded, so a settlement lands where the outline says it should.
 */
function project(outline: CountryOutline, lon: number, lat: number): [number, number] {
  const [lon0, lat0] = outline.centre
  const p1 = rad(lat0), l0 = rad(lon0)
  const p = rad(lat), dl = rad(lon) - l0
  const denom = 1 + Math.sin(p1) * Math.sin(p) + Math.cos(p1) * Math.cos(p) * Math.cos(dl)
  const k = Math.sqrt(2 / Math.max(denom, 1e-9))
  const x = k * Math.cos(p) * Math.sin(dl)
  const y = k * (Math.cos(p1) * Math.sin(p) - Math.sin(p1) * Math.cos(p) * Math.cos(dl))
  const { minX, maxY, scale, offX, offY } = outline.fit
  return [(x - minX) * scale + offX, (maxY - y) * scale + offY]
}

/**
 * The greenness ramp. NDVI in these cities runs 0.07 to 0.47, so a 0–1 ramp would put every European
 * city in the bottom half of it and make them all look alike; this spans the range the data occupies.
 */
const GREEN_LOW = 0.1
const GREEN_HIGH = 0.45
export function greenFill(ndvi: number): string {
  const t = Math.max(0, Math.min(1, (ndvi - GREEN_LOW) / (GREEN_HIGH - GREEN_LOW)))
  // A single hue at rising saturation and falling lightness: greener really does read as greener, and
  // it stays legible in both themes because it never approaches the background at either end.
  return `hsl(122 ${Math.round(18 + t * 40)}% ${Math.round(78 - t * 40)}%)`
}

export function CountryPanel({
  outline,
  data,
  layer,
  onLayerChange,
  homeCity,
}: {
  outline: CountryOutline
  data: CountryPlaces
  layer: PanelLayer
  onLayerChange: (l: PanelLayer) => void
  /**
   * The reader's own settlement, drawn larger so they can find themselves.
   *
   * Not wired yet: `Profile` carries the exposure VALUES a location produced (`pm25`, `ndvi`) but not
   * its name, and matching a city back by its reading would be guessing. The prop is here because the
   * panel is the right place to show it once the profile carries the name.
   */
  homeCity?: string
}) {
  const dots = useMemo(() => {
    const wanted: Place[] =
      layer === 'air' ? data.places : data.places.filter((p) => p.ndvi_basis === 'city')
    return wanted
      .map((place) => {
        const [x, y] = project(outline, place.lon, place.lat)
        return { place, x, y }
      })
      // Dirtiest and greenest last: where cities overlap, the reading that matters most is the one not
      // hidden underneath a neighbour.
      .sort((a, b) =>
        layer === 'air'
          ? a.place.pm25 - b.place.pm25
          : (a.place.ndvi ?? 0) - (b.place.ndvi ?? 0),
      )
  }, [data.places, layer, outline])

  const countryName = data.name ?? data.iso3
  const withOwnGreen = data.coverage.with_city_greenness
  const total = data.coverage.settlements
  const nationalNdvi = data.reference?.ndvi ?? null

  return (
    <Card testId="country-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-clock-ink">{countryName}, close up</h3>
        <div role="radiogroup" aria-label="Which measurement" className="flex gap-1">
          {([['air', 'Air'], ['green', 'Greenness']] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={layer === id}
              onClick={() => onLayerChange(id)}
              data-testid={`panel-layer-${id}`}
              className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                layer === id
                  ? 'border-clock-brand bg-clock-brandsoft text-clock-brand'
                  : 'border-clock-line bg-clock-canvas text-clock-ink hover:border-clock-brand/40'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Map and words side by side from md up, stacked below it. The map is CAPPED rather than
          fluid: this is the secondary view — the big map above answers "how does my country compare",
          and a close-up that fills the page as completely as that one did would be claiming equal
          weight. At 320px a country is legible and its settlements are distinct, which is all it owes.
          The square viewBox means every country gets the same footprint, so switching from Romania to
          Chile does not reflow the page. */}
      <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-start">
      <svg
        viewBox={outline.viewBox}
        role="img"
        className="w-full max-w-[320px] shrink-0 self-center md:self-start"
        data-testid="country-panel-map"
        data-layer={layer}
        data-dots={dots.length}
        aria-label={
          layer === 'air'
            ? `${countryName}: ${total} settlements with a measured air reading.`
            : `${countryName}: ${withOwnGreen} of ${total} settlements have their own greenness ` +
              `measurement; the rest of the country is shown at its national figure.`
        }
      >
        {/* On the greenness view the whole country is WASHED at its national figure, because that is
            what the product actually uses for every settlement without its own reading — the fallback
            drawn rather than described. On the air view the fill is neutral: every settlement there
            has its own reading, so a national wash would be inventing a surface between them. */}
        <path
          d={outline.d}
          fill={layer === 'green' && nationalNdvi !== null ? greenFill(nationalNdvi) : 'rgb(var(--clock-line))'}
          fillOpacity={layer === 'green' ? 1 : 0.55}
          className="stroke-clock-muted"
          strokeWidth={1.2}
        />
        {dots.map(({ place, x, y }) => (
          <circle
            key={place.city}
            cx={x}
            cy={y}
            r={place.city === homeCity ? 6 : 4}
            fill={layer === 'air' ? fillOfPm25(place.pm25) : greenFill(place.ndvi ?? 0)}
            className={place.city === homeCity ? 'stroke-clock-ink' : 'stroke-clock-ink/50'}
            strokeWidth={place.city === homeCity ? 1.8 : 0.6}
            data-city={place.city}
          >
            <title>
              {layer === 'air'
                ? `${place.city} — ${place.pm25.toFixed(1)} µg/m³, measured ${place.pm25_year}`
                : `${place.city} — greenness ${(place.ndvi ?? 0).toFixed(2)}, measured here`}
            </title>
          </circle>
        ))}
      </svg>

      <p className="text-[11px] leading-relaxed text-clock-muted md:pt-1" data-testid="country-panel-note">
        {layer === 'air' ? (
          <>
            Every dot is a settlement with its own monitoring data — <strong>{total}</strong> in{' '}
            {countryName}. Colour is fine-particle pollution (PM2.5); the years differ, and each dot
            names its own.
          </>
        ) : withOwnGreen === 0 ? (
          <>
            <strong>No settlement in {countryName} has its own greenness measurement.</strong> The
            whole country is shown at its national figure
            {nationalNdvi !== null ? <> of {nationalNdvi.toFixed(2)}</> : null}, which is what every
            estimate here uses. That is a gap in the measurement, not a bare country.
          </>
        ) : (
          <>
            <strong>
              {withOwnGreen} of {total}
            </strong>{' '}
            {withOwnGreen === 1 ? 'place has' : 'places have'} its own greenness measurement
            {withOwnGreen === 1 ? '' : ''}. The wash behind them is {countryName}’s national figure
            {nationalNdvi !== null ? <> of {nationalNdvi.toFixed(2)}</> : null} — what every other
            settlement here is scored against, because nobody has measured them.
          </>
        )}
      </p>
      </div>
    </Card>
  )
}
