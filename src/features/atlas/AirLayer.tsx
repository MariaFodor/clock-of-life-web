// Where the air has actually been measured — and, drawn just as deliberately, where it has not.
//
// Two claims on one map, and the second is the harder one to make honestly. A choropleth that greys out
// a country with no monitoring station reads as CLEAN AIR, because grey sits at the pale end of every
// ramp a reader has ever seen. 152 of the 237 countries this map draws have no PM2.5 measurement since
// 2020 — most of Africa, most of central Asia — so the absence is not a footnote here, it is the larger
// half of the picture. It gets hatching of its own, its own legend entry, and a count the page reads off
// the payload rather than printing from memory.
//
// THE CIRCLE. Each reading is a dot at the monitoring settlement plus a circle at the radius the
// reading is being claimed to speak for — 25 km, which is the same tolerance the greenness match used,
// and which arrives FROM the service so the two cannot drift. It says: this is a metropolitan area's
// air, not a country's, and not this street's.
//
// It is drawn only in the Europe view, and that is measured rather than chosen. A true-to-scale 25 km
// radius is 3.8–4.3 px across the Europe projection and 0.46–1.36 px on the world one — smaller than a
// pixel. Enlarging it to make it visible on the world map would draw a claim that each reading speaks
// for 100 km when it speaks for 25, which is the exact class of overstatement this surface exists to
// avoid. So the world view gets dots, and the legend says why there are no circles.

import { useMemo } from 'react'
import type { AtlasEnvironment, EnvPoint } from '../../api/types'
import { projector } from './projection'
import type { AtlasGeometry, ViewKey } from './types'

/** Below this many pixels a circle is indistinguishable from the dot inside it, so it is not drawn. */
const MIN_HONEST_RADIUS_PX = 2.5

/**
 * The air ramp, light to dark. Deliberately not the mortality ramp's colours: two layers on one map
 * that share a palette are two layers a reader merges. WHO's own 2021 guideline for annual PM2.5 is
 * 5 µg/m³ and its interim targets run 10 / 15 / 25 / 35, so these are the published steps rather than
 * quantiles of whatever happens to be measured — a quantile ramp would redraw itself every time a new
 * country started monitoring.
 */
const BANDS: Array<{ max: number; fill: string; label: string }> = [
  { max: 5, fill: '#bfdbf7', label: '≤5' },
  { max: 10, fill: '#8ec3ee', label: '5–10' },
  { max: 15, fill: '#f6c667', label: '10–15' },
  { max: 25, fill: '#ef9b52', label: '15–25' },
  { max: 35, fill: '#d9644a', label: '25–35' },
  { max: Infinity, fill: '#9d2f43', label: '>35' },
]

export const bandOf = (pm25: number): number => BANDS.findIndex((b) => pm25 <= b.max)
export const fillOfPm25 = (pm25: number): string => BANDS[bandOf(pm25)].fill

export function AirLayer({
  environment,
  geometry,
  view,
  /** Only this country's points, when a reader has pinned one; all of them otherwise. */
  focus,
  onHoverPlace,
}: {
  environment: AtlasEnvironment
  geometry: AtlasGeometry
  view: ViewKey
  focus?: string | null
  onHoverPlace?: (point: EnvPoint | null) => void
}) {
  const project = useMemo(() => projector(geometry, view), [geometry, view])

  const drawn = useMemo(() => {
    if (!project) return []
    const wanted = focus ? environment.points.filter((p) => p.iso3 === focus) : environment.points
    return wanted
      .map((point) => {
        const [x, y] = project.point(point.lon, point.lat)
        return { point, x, y }
      })
      // A point outside the frame is not clipped by the SVG in a useful way — it would still be a DOM
      // node and a hover target sitting on the frame's edge. The Europe view crops two thirds of these.
      .filter(({ x, y }) => !project.offFrame(x, y))
      // Dirtiest last, so the worst readings are the ones not hidden under a neighbour. Cities overlap
      // heavily in the Ruhr and the Po valley, and whichever is painted last is the one a reader sees.
      .sort((a, b) => a.point.pm25 - b.point.pm25)
  }, [environment.points, focus, project])

  if (!project) return null

  // One radius for the whole layer, taken at the middle of what is actually drawn rather than per point:
  // circles of visibly different sizes would read as a magnitude, and the radius is not one.
  const medianLat = drawn.length
    ? drawn.map((d) => d.point.lat).sort((a, b) => a - b)[Math.floor(drawn.length / 2)]
    : 45
  const radius = project.kmToPixels(medianLat, environment.speaks_for_km)
  const showCircles = radius >= MIN_HONEST_RADIUS_PX

  return (
    <g data-testid="air-layer" data-circles={showCircles ? 'true' : 'false'} data-points={drawn.length}>
      {showCircles && (
        <g fill="none" className="stroke-clock-ink/25" strokeWidth={0.5} pointerEvents="none">
          {drawn.map(({ point, x, y }) => (
            <circle key={`r-${point.iso3}-${point.city}`} cx={x} cy={y} r={radius} />
          ))}
        </g>
      )}
      {drawn.map(({ point, x, y }) => (
        <circle
          key={`${point.iso3}-${point.city}`}
          cx={x}
          cy={y}
          r={1.6}
          fill={fillOfPm25(point.pm25)}
          className="stroke-clock-ink/50"
          strokeWidth={0.4}
          data-city={point.city}
          data-pm25={point.pm25}
          onMouseEnter={onHoverPlace ? () => onHoverPlace(point) : undefined}
          onMouseLeave={onHoverPlace ? () => onHoverPlace(null) : undefined}
        />
      ))}
    </g>
  )
}

/**
 * The hatch every unmeasured country is filled with, and the pattern definition behind it.
 *
 * A pattern rather than a colour, because a colour — any colour — is a position on the air ramp, and
 * "not measured" has no position on it. Diagonal lines read as "no information here" in a way grey
 * cannot, and they survive the reader's screen being dark or light.
 */
export const UNMEASURED_PATTERN_ID = 'air-unmeasured'

export function AirPatternDefs() {
  return (
    <defs>
      <pattern id={UNMEASURED_PATTERN_ID} width={6} height={6} patternTransform="rotate(45)"
               patternUnits="userSpaceOnUse">
        <rect width={6} height={6} className="fill-clock-canvas" />
        <line x1={0} y1={0} x2={0} y2={6} className="stroke-clock-muted/50" strokeWidth={1.2} />
      </pattern>
    </defs>
  )
}

/** The layer's own legend: the bands, the hatch, and what the circle is claiming. */
export function AirLegend({
  environment,
  view,
  drawnCountries,
}: {
  environment: AtlasEnvironment
  view: ViewKey
  /** ISO3 codes the current view actually draws, so the unmeasured count is about THIS map. */
  drawnCountries: Set<string>
}) {
  // Counted from the payload against the shapes on screen. The world view draws 176 of 237 countries,
  // so "152 unmeasured" would be wrong for the Europe view and wrong for the world one too.
  const unmeasuredHere = environment.unmeasured_iso3.filter((iso3) => drawnCountries.has(iso3)).length
  const measuredHere = drawnCountries.size - unmeasuredHere
  const circles = view === 'europe'

  return (
    <div className="mt-3" data-testid="air-legend">
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2 text-[11px] text-clock-muted">
        {BANDS.map((b) => (
          <span key={b.label} className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-6 rounded-sm border border-clock-line"
                  style={{ background: b.fill }} aria-hidden="true" />
            <span>{b.label}</span>
          </span>
        ))}
        <span className="inline-flex items-center gap-1 pl-2">
          <svg width={24} height={12} aria-hidden="true" className="rounded-sm border border-clock-line">
            <AirPatternDefs />
            <rect width={24} height={12} fill={`url(#${UNMEASURED_PATTERN_ID})`} />
          </svg>
          <span>no measurement since {environment.window[0]}</span>
        </span>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-clock-muted">
        {environment.pollutant}. Each dot is a settlement with monitoring data
        {circles ? (
          <>
            ; the ring around it is <strong>{environment.speaks_for_km} km</strong> — what that reading
            is taken to speak for. A city's air, not a country's, and not one street's.
          </>
        ) : (
          <>
            . No rings at this scale: {environment.speaks_for_km} km is under a pixel on a world map, and
            drawing a visible circle would claim each reading speaks for four times the area it does.
            Switch to Europe to see them.
          </>
        )}{' '}
        <strong>{unmeasuredHere}</strong> of the {drawnCountries.size} countries drawn here are hatched
        because nobody has published a measurement for any settlement in them since{' '}
        {environment.window[0]} — that is a gap in the monitoring, not a clean result. {measuredHere}{' '}
        {measuredHere === 1 ? 'country has' : 'countries have'} at least one.
      </p>
      {environment.licences?.some((l) => l.share_alike || l.non_commercial) && (
        <p className="mt-1 text-[11px] text-clock-muted">
          {environment.licences
            .filter((l) => l.share_alike || l.non_commercial)
            .map((l) => `${l.licence}${l.non_commercial ? ' — non-commercial' : ''}${l.share_alike ? ', share-alike' : ''}`)
            .join('; ')}
          .
        </p>
      )}
    </div>
  )
}
