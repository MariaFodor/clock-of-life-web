// The map itself: one SVG path per country, filled by the measure on show.
//
// There is no map library here and no tile server — the boundaries are projected offline into path
// strings (scripts/build-atlas.mjs), which is why a whole world map costs one dynamic import and no
// third party learns which countries the reader looked at.
//
// The map is deliberately NOT the accessible interface to this data: 185 focusable paths is a tab
// trap, and "Chad" as a shape says nothing to a screen reader. It is marked as a single image with a
// summary, and the country selector and the table on the page carry the same numbers for anyone not
// using a mouse. Hover feeds a live region, so a sighted keyboard user still gets the readout.

import type { ReactNode } from 'react'

import { AirPatternDefs, UNMEASURED_PATTERN_ID } from './AirLayer'
import type { Measure } from './measures'
import { formatValue } from './measures'
import type { ColorScale } from './scale'
import { CLASSES, NO_DATA_FILL } from './scale'
import type { AtlasGeometry } from './types'

interface Props {
  geometry: AtlasGeometry
  /** iso3 → the value being drawn; a missing entry is "no figure for this country", not zero */
  values: Map<string, number>
  scale: ColorScale
  measure: Measure
  /** the pinned country */
  selected: string | null
  /** the country the reader lives in, from their profile */
  home?: string
  onSelect: (iso3: string) => void
  onHover: (iso3: string | null) => void
  label: string
  /**
   * ISO3 codes with no air measurement, filled with a hatch instead of a value colour.
   *
   * Only ever set while the air layer is on. A SET rather than a flag per country because the question
   * changes with the layer: under the mortality measures a country either has a life table or does not,
   * and whether anyone has measured its air has nothing to do with it.
   */
  unmeasured?: Set<string>
  /** The air layer, passed as a child so this component never learns what a monitoring station is. */
  overlay?: ReactNode
}

export function MortalityMap({
  geometry, values, scale, selected, home, onSelect, onHover, label, unmeasured, overlay,
}: Props) {
  const shapes = Object.entries(geometry.countries)
  const outline = (iso3: string | undefined | null) =>
    iso3 && geometry.countries[iso3] ? geometry.countries[iso3] : null

  return (
    <svg
      viewBox={geometry.viewBox}
      role="img"
      aria-label={label}
      className="w-full"
      onMouseLeave={() => onHover(null)}
      data-testid="mortality-map"
    >
      {unmeasured && <AirPatternDefs />}

      {/* The sea. Without it the land floats on the card and the coastlines stop reading as coasts. */}
      <rect x={0} y={0} width="100%" height="100%" className="fill-clock-canvas" />

      {shapes.map(([iso3, d]) => (
        <path
          key={iso3}
          d={d}
          data-iso3={iso3}
          data-class={values.has(iso3) ? scale.classOf(values.get(iso3)!) : 'none'}
          data-home={iso3 === home ? 'true' : undefined}
          data-unmeasured={unmeasured?.has(iso3) ? 'true' : undefined}
          style={{
            // The hatch WINS over the value colour while the air layer is on, and that is the point: a
            // country with a life-expectancy figure and no air measurement must not be painted as
            // though its air were known. Its mortality number is still on its card and in the table.
            fill: unmeasured?.has(iso3)
              ? `url(#${UNMEASURED_PATTERN_ID})`
              : values.has(iso3)
                ? scale.fillOf(values.get(iso3))
                : NO_DATA_FILL,
          }}
          className="stroke-clock-line/70"
          strokeWidth={0.5}
          onMouseEnter={() => onHover(iso3)}
          onClick={() => onSelect(iso3)}
        />
      ))}

      {/* The air layer sits above the fills and below the highlights: a reader's own country outline is
          the one thing that must never be obscured, and a dot over a border is still on its country. */}
      {overlay}

      {/* Highlights are drawn again on top rather than styled in place: a neighbour painted later
          would otherwise cover half the outline, and a country's own border is the thing being
          pointed at. Pointer events pass through to the shape underneath. */}
      <g fill="none" pointerEvents="none">
        {outline(home) && home !== selected && (
          <path d={outline(home)!} className="stroke-clock-ink" strokeWidth={1.4} strokeDasharray="3 2" />
        )}
        {outline(selected) && (
          <path d={outline(selected)!} className="stroke-clock-ink" strokeWidth={1.8} />
        )}
      </g>
    </svg>
  )
}

/** The classes, with the value boundaries printed — the honesty half of a quantile scale. */
export function MapLegend({ scale, measure }: { scale: ColorScale; measure: Measure }) {
  const round = (v: number) => v.toFixed(measure.decimals)
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2 text-[11px] text-clock-muted">
        {Array.from({ length: CLASSES }, (_, cls) => (
          <span key={cls} className="inline-flex items-center gap-1">
            <span
              className="inline-block h-3 w-6 rounded-sm border border-clock-line"
              style={{ background: scale.fillOfClass(cls) }}
              aria-hidden="true"
            />
            <span>
              {round(scale.breaks[cls])}–{round(scale.breaks[cls + 1])}
            </span>
          </span>
        ))}
        <span className="inline-flex items-center gap-1 pl-2">
          <span
            className="inline-block h-3 w-6 rounded-sm border border-clock-line"
            style={{ background: NO_DATA_FILL }}
            aria-hidden="true"
          />
          <span>no figure</span>
        </span>
      </div>
      <p className="mt-2 text-[11px] text-clock-muted">
        {measure.unit}, in six equal-sized groups of the countries drawn here.{' '}
        {measure.longevity === 'none' ? (
          <>
            Darker means a <em>wider</em> gap — which is not the same as better: the widest gaps are
            where men die young, and the narrowest include both the longest-lived countries and the
            shortest-lived.
          </>
        ) : (
          <>
            Darker always means people live longer
            {scale.inverted ? ' — so here the darkest countries are the ones with the fewest deaths' : ''}.
          </>
        )}{' '}
        A dashed outline is your country; a solid one is the country you picked.
      </p>
    </div>
  )
}

/** The hover/selection readout. Its own component so the live region is mounted before it has text. */
export function MapReadout({
  name,
  value,
  measure,
  sexNote,
  unreported = false,
  noAirMeasurement = false,
  nationalPm25,
}: {
  name?: string
  value?: number
  measure: Measure
  sexNote: string
  /** The shape is drawn but the UN publishes no life table for it — Kosovo, Northern Cyprus,
   *  Somaliland, the French Southern Territories. Saying so beats saying nothing at all. */
  unreported?: boolean
  /** Hatched on the air layer: no settlement here has been measured since 2020. */
  noAirMeasurement?: boolean
  /** The national figure, which usually EXISTS even where no city has been measured. */
  nationalPm25?: number
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="map-readout"
      className="min-h-[1.5rem] text-sm text-clock-ink"
    >
      {unreported ? (
        <span className="text-clock-muted">No life table is published for this territory.</span>
      ) : (
        name && (
          <>
            <strong>{name}</strong>{' '}
            <span className="text-clock-muted">
              · {value === undefined ? 'no figure' : `${formatValue(value, measure)} ${sexNote}`}
              {/* Said here as well as in the legend, because the legend explains the hatch in general
                  and this is the country the reader is actually pointing at. The national figure is
                  offered in the same breath: no city measured is not the same as nothing known. */}
              {noAirMeasurement && (
                <>
                  {' '}· no settlement here measured since 2020
                  {nationalPm25 !== undefined
                    ? ` — the national estimate is ${nationalPm25.toFixed(1)} µg/m³`
                    : ''}
                </>
              )}
            </span>
          </>
        )
      )}
    </div>
  )
}

/**
 * One monitoring settlement, read out while the pointer is on its dot.
 *
 * Prints the reading AGAINST its own country's average, because a PM2.5 number in isolation means
 * nothing to most readers — 16 µg/m³ is unremarkable in Kraków and would be the worst reading in
 * Finland. The year is always shown: these span 2020 to 2025 and a 2020 reading is five years of policy
 * away from a 2024 one.
 */
export function PlaceReadout({
  place,
  reference,
  countryName,
}: {
  place: { city: string; pm25: number; year: number }
  reference?: { pm25: number | null } | null
  countryName: string
}) {
  const national = reference?.pm25 ?? null
  const delta = national === null ? null : place.pm25 - national
  return (
    <div role="status" aria-live="polite" data-testid="place-readout" className="min-h-[1.5rem] text-sm text-clock-ink">
      <strong>{place.city}</strong>{' '}
      <span className="text-clock-muted">
        · {place.pm25.toFixed(1)} µg/m³ PM2.5, measured {place.year}
        {delta !== null && (
          <>
            {' '}
            · {Math.abs(delta) < 0.05 ? 'the same as' : `${Math.abs(delta).toFixed(1)} ${delta > 0 ? 'above' : 'below'}`}{' '}
            {countryName}’s average{Math.abs(delta) < 0.05 ? '' : ''}
          </>
        )}
      </span>
    </div>
  )
}
