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
//
// THE CURSOR TOOLTIP is a second copy of that same live region's sentence, drawn next to the pointer
// and hidden from screen readers. It exists because the live region sits below the legend, a long way
// from where the reader is looking: a reviewer hovering country after country concluded hover was
// simply dead. The live region is still the accessible channel — the tooltip is `aria-hidden` and
// adds nothing that is not already announced.

import { useCallback, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'

import { AirPatternDefs, UNMEASURED_PATTERN_ID } from './AirLayer'
import type { Measure } from './measures'
import { formatValue, longUnitOf } from './measures'
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
  /**
   * The one line the cursor tooltip says, or null when there is nothing under the pointer to say it
   * about. Assembled by the page rather than here — the readout below the map says the same sentence
   * from the same function (`readoutLine` for a country, `placeReadoutLine` for a monitoring dot),
   * and two places writing it separately is two places to drift.
   */
  tip?: string | null
}

/**
 * How far the tooltip sits from the cursor, and the box we allow it. Both are a ceiling we impose
 * rather than a measurement of the rendered tooltip: measuring it would mean a layout read on every
 * mouse move, and the only thing these numbers have to guarantee is that it stays inside the card.
 */
const TIP_GAP = 14
const TIP_MAX_W = 240
const TIP_MAX_H = 56

export function MortalityMap({
  geometry, values, scale, selected, home, onSelect, onHover, label, unmeasured, overlay, tip,
}: Props) {
  const frame = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  // A finger has no cursor to hang a tooltip off, and one drawn under it would cover the country it
  // names. Read once: a device does not change its pointer kind between renders.
  const [coarsePointer] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches,
  )

  // Measured against the frame, not the SVG's own user units: the tooltip is an HTML element
  // positioned in CSS pixels, and the viewBox is not in those.
  const trackPointer = useCallback((e: ReactMouseEvent) => {
    const box = frame.current?.getBoundingClientRect()
    if (!box) return
    setAt({ x: e.clientX - box.left, y: e.clientY - box.top, w: box.width, h: box.height })
  }, [])

  const outline = (iso3: string | undefined | null) =>
    iso3 && geometry.countries[iso3] ? geometry.countries[iso3] : null

  const shapes = useMemo(() => Object.entries(geometry.countries), [geometry])

  // Held apart from the render so that a mouse move — which changes only `at` — does not rebuild 185
  // path elements sixty times a second. React skips a child subtree whose element is unchanged.
  const paths = useMemo(
    () =>
      shapes.map(([iso3, d]) => (
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
          // The page invites the reader to "pick a country — on the map", and until now nothing on
          // the map said it was clickable.
          className="cursor-pointer stroke-clock-line/70"
          strokeWidth={0.5}
          // Positioned from the entering event too, not only from the moves that follow it: a reader
          // who lands on a country and stops moving would otherwise get the tooltip at wherever the
          // pointer last was.
          onMouseEnter={(e) => {
            onHover(iso3)
            trackPointer(e)
          }}
          onClick={() => onSelect(iso3)}
        />
      )),
    [shapes, values, scale, home, unmeasured, onHover, onSelect, trackPointer],
  )

  // Below-right of the cursor, flipped to the other side of it when that would cross the frame's
  // edge, and never negative — so the tooltip cannot push the card's own layout around.
  const tipAt = at && {
    left: at.x + TIP_GAP + TIP_MAX_W > at.w ? Math.max(0, at.x - TIP_GAP - TIP_MAX_W) : at.x + TIP_GAP,
    top: at.y + TIP_GAP + TIP_MAX_H > at.h ? Math.max(0, at.y - TIP_GAP - TIP_MAX_H) : at.y + TIP_GAP,
  }

  return (
    <div ref={frame} className="relative">
      <svg
        viewBox={geometry.viewBox}
        role="img"
        aria-label={label}
        className="w-full"
        onMouseMove={trackPointer}
        onMouseLeave={() => onHover(null)}
        data-testid="mortality-map"
      >
        {unmeasured && <AirPatternDefs />}

        {/* The sea. Without it the land floats on the card and the coastlines stop reading as coasts.
            It clears the hover as well: with a tooltip following the cursor, a pointer out in the
            Atlantic still naming the last country it crossed is a visible lie rather than a stale
            line of text below the fold. */}
        <rect
          x={0}
          y={0}
          width="100%"
          height="100%"
          className="fill-clock-canvas"
          onMouseEnter={() => onHover(null)}
        />

        {paths}

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

      {tip && tipAt && !coarsePointer && (
        <div
          data-testid="map-tooltip"
          // Hidden from screen readers on purpose: the readout below the map is a live region that
          // already announces this exact sentence, and a second copy would announce it twice.
          aria-hidden="true"
          // Transparent to the pointer, or it would sit under the cursor, take the hover off the
          // country it names, and flicker on every pixel.
          className="pointer-events-none absolute z-10 rounded-md border border-clock-line bg-clock-surface px-2 py-1 text-xs leading-snug text-clock-ink shadow-sm"
          style={{ left: tipAt.left, top: tipAt.top, maxWidth: TIP_MAX_W }}
        >
          {tip}
        </div>
      )}
    </div>
  )
}

/**
 * The classes, with the value boundaries printed — the honesty half of a quantile scale — and the
 * two ends said in words.
 *
 * The words are the part that does not depend on the theme. The ramp is one hue at rising strength,
 * which a light screen renders as darkening and a dark screen as lightening, so no sentence about
 * "darker" can be true on both; the caption speaks of a STRONGER colour, which rises either way. The
 * end labels then hang off the printed NUMBERS, smallest first in every measure, and say what the
 * small end and the large end mean — which is true no matter what the reader's screen does with the
 * colour, or how they read the word "stronger".
 */
export function MapLegend({ scale, measure }: { scale: ColorScale; measure: Measure }) {
  const round = (v: number) => v.toFixed(measure.decimals)
  const ends = measure.legendEnds
  return (
    <div className="mt-3" data-testid="map-legend">
      <div
        className="flex flex-wrap items-center gap-x-1 gap-y-2 text-[11px] text-clock-muted"
        data-testid="map-legend-row"
      >
        <span className="pr-1 italic">{ends.low}</span>
        {Array.from({ length: CLASSES }, (_, cls) => (
          <span key={cls} className="inline-flex items-center gap-1" data-legend-class={cls}>
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
        <span className="pl-1 italic">{ends.high}</span>
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
        {longUnitOf(measure)}, in six equal-sized groups of the countries drawn here.{' '}
        {measure.longevity === 'none' ? (
          <>
            The stronger the colour, the <em>wider</em> the gap — which is not the same as better:
            the widest gaps are where men die young, and the narrowest include both the
            longest-lived countries and the shortest-lived.
          </>
        ) : (
          <>
            The stronger the colour, the longer people live
            {scale.inverted
              ? ' — so here the strongest colours are the countries with the fewest deaths'
              : ''}
            .
          </>
        )}{' '}
        A dashed outline is your country; a solid one is the country you picked.
      </p>
    </div>
  )
}

export interface ReadoutInput {
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
}

/**
 * What the map has to say about the country under the pointer, in two parts so the live region can
 * bold the name. `null` when there is nothing to say at all.
 *
 * One function because two things now say this sentence — the live region below the map and the
 * tooltip at the cursor — and a reader looking at both at once must not be told two different
 * things about the same country.
 */
export function readoutParts(r: ReadoutInput): { name: string | null; detail: string } | null {
  if (r.unreported) return { name: null, detail: 'No life table is published for this territory.' }
  if (!r.name) return null
  const figure =
    r.value === undefined
      ? 'no figure'
      : `${formatValue(r.value, r.measure)}${r.sexNote ? ` ${r.sexNote}` : ''}`
  // Said on the country as well as in the legend, because the legend explains the hatch in general
  // and this is the country the reader is actually pointing at. The national figure comes in the
  // same breath: no city measured is not the same as nothing known.
  const air = r.noAirMeasurement
    ? ` · no settlement here measured since 2020${
        r.nationalPm25 !== undefined
          ? ` — the national estimate is ${r.nationalPm25.toFixed(1)} µg/m³`
          : ''
      }`
    : ''
  return { name: r.name, detail: `${figure}${air}` }
}

/** The same words on a single line, for the cursor tooltip. */
export function readoutLine(r: ReadoutInput): string | null {
  const parts = readoutParts(r)
  if (!parts) return null
  return parts.name === null ? parts.detail : `${parts.name} · ${parts.detail}`
}

/** The hover/selection readout. Its own component so the live region is mounted before it has text. */
export function MapReadout(props: ReadoutInput) {
  const parts = readoutParts(props)
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="map-readout"
      className="min-h-[1.5rem] text-sm text-clock-ink"
    >
      {parts &&
        (parts.name === null ? (
          <span className="text-clock-muted">{parts.detail}</span>
        ) : (
          <>
            <strong>{parts.name}</strong>{' '}
            <span className="text-clock-muted">· {parts.detail}</span>
          </>
        ))}
    </div>
  )
}

export interface PlaceReadoutInput {
  place: { city: string; pm25: number; year: number }
  /** That country's own average — what the reading is shown against. */
  reference?: { pm25: number | null } | null
  countryName: string
}

/**
 * What one monitoring settlement says, in the same two parts as `readoutParts` — and split out for
 * the same reason. Two things say this sentence too: the live region below the map, and the cursor
 * tooltip while the pointer is on the dot. Built here once so they cannot say different things
 * about the same dot; the tooltip used to be assembled from the hovered COUNTRY instead, and the
 * two channels then contradicted each other on screen.
 *
 * Prints the reading AGAINST its own country's average, because a PM2.5 number in isolation means
 * nothing to most readers — 16 µg/m³ is unremarkable in Kraków and would be the worst reading in
 * Finland. The year is always shown: these span 2020 to 2025 and a 2020 reading is five years of policy
 * away from a 2024 one.
 */
export function placeReadoutParts(r: PlaceReadoutInput): { name: string; detail: string } {
  const national = r.reference?.pm25 ?? null
  const delta = national === null ? null : r.place.pm25 - national
  // Under 0.05 the two figures round to the same printed number, and "0.0 above" beside them would
  // be a difference the reader can see is not there.
  const against =
    delta === null
      ? ''
      : ` · ${
          Math.abs(delta) < 0.05
            ? 'the same as'
            : `${Math.abs(delta).toFixed(1)} ${delta > 0 ? 'above' : 'below'}`
        } ${r.countryName}’s average`
  return {
    name: r.place.city,
    detail: `${r.place.pm25.toFixed(1)} µg/m³ PM2.5, measured ${r.place.year}${against}`,
  }
}

/** The same words on a single line, for the cursor tooltip. `readoutLine`'s counterpart. */
export function placeReadoutLine(r: PlaceReadoutInput): string {
  const parts = placeReadoutParts(r)
  return `${parts.name} · ${parts.detail}`
}

/** One monitoring settlement, read out while the pointer is on its dot. */
export function PlaceReadout(props: PlaceReadoutInput) {
  const parts = placeReadoutParts(props)
  return (
    <div role="status" aria-live="polite" data-testid="place-readout" className="min-h-[1.5rem] text-sm text-clock-ink">
      <strong>{parts.name}</strong>{' '}
      <span className="text-clock-muted">· {parts.detail}</span>
    </div>
  )
}
