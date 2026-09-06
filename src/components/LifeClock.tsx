// The Life Clock — a hand-authored SVG dial (web-architecture.md: a charting library would fight this).
//
// The ring is an age axis from 0 to MAX_AGE. The muted arc is life already lived (current age); the
// brand arc is the estimated remaining years; the translucent band at the frontier is the uncertainty
// interval — so the interval is *always* visible, per the framing rules. Nothing here is a promise.

import { fmtYears } from './format'

const SIZE = 240
const C = SIZE / 2
const R = 96
const TRACK_W = 16
const BAND_W = 22

function niceMax(reachesHigh: number): number {
  return Math.max(100, Math.ceil(reachesHigh / 10) * 10)
}

/** A ring arc drawn with a unit-length circle (pathLength=1), rotated so 0 starts at 12 o'clock. */
function Arc({
  from,
  to,
  color,
  width,
  opacity = 1,
  radius = R,
  rounded = true,
}: {
  from: number
  to: number
  color: string
  width: number
  opacity?: number
  radius?: number
  rounded?: boolean
}) {
  const len = Math.max(0, to - from)
  return (
    <circle
      cx={C}
      cy={C}
      r={radius}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeOpacity={opacity}
      strokeLinecap={rounded ? 'round' : 'butt'}
      pathLength={1}
      strokeDasharray={`${len} ${1 - len}`}
      strokeDashoffset={-from}
      transform={`rotate(-90 ${C} ${C})`}
    />
  )
}

export interface LifeClockProps {
  age: number
  estimateYears: number
  reachesAge: number
  interval: [number, number]
  /** compact renders a smaller dial for cards */
  compact?: boolean
}

export function LifeClock({ age, estimateYears, reachesAge, interval, compact = false }: LifeClockProps) {
  const reachHigh = age + interval[1]
  const max = niceMax(reachHigh)

  const fLived = Math.min(1, age / max)
  const fReaches = Math.min(1, reachesAge / max)
  const fIntLow = Math.min(1, (age + interval[0]) / max)
  const fIntHigh = Math.min(1, (age + interval[1]) / max)

  const dim = compact ? 168 : 240
  const belowCurrentAge = reachesAge <= age

  return (
    <figure className="flex flex-col items-center">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={dim}
        height={dim}
        role="img"
        aria-label={`Estimated ${estimateYears.toFixed(1)} more years, reaching about age ${reachesAge.toFixed(0)}. Uncertainty range ${fmtYears(interval[0])} to ${fmtYears(interval[1])}.`}
      >
        {/* full track */}
        <Arc from={0} to={1} color="#e3e8ee" width={TRACK_W} rounded={false} />
        {/* uncertainty band at the frontier (always shown) */}
        <Arc from={fIntLow} to={fIntHigh} color="#2b6cb0" width={BAND_W} opacity={0.18} rounded={false} />
        {/* life lived */}
        <Arc from={0} to={fLived} color="#9aa8b8" width={TRACK_W} />
        {/* estimated remaining */}
        <Arc from={fLived} to={fReaches} color={belowCurrentAge ? '#c05621' : '#2b6cb0'} width={TRACK_W} />

        {/* centre readout */}
        <text x={C} y={C - 14} textAnchor="middle" className="fill-clock-muted" style={{ fontSize: 13 }}>
          estimated
        </text>
        <text x={C} y={C + 20} textAnchor="middle" className="fill-clock-ink" style={{ fontSize: 46, fontWeight: 700 }}>
          {estimateYears.toFixed(1)}
        </text>
        <text x={C} y={C + 42} textAnchor="middle" className="fill-clock-muted" style={{ fontSize: 13 }}>
          more years
        </text>
      </svg>
      <figcaption className="mt-1 text-center text-sm text-clock-muted">
        reaches about <span className="font-semibold text-clock-ink">age {reachesAge.toFixed(0)}</span>
      </figcaption>
    </figure>
  )
}
