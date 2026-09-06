// A diverging bar for a single factor's contribution in years. Gains extend right (green), costs left
// (red), from a shared centre — so the Why? surface reads at a glance.

import { deltaTone, fmtDelta } from './format'

export function FactorBar({
  label,
  deltaYears,
  max,
}: {
  label: string
  deltaYears: number
  /** the largest |delta| in the set, for scaling the bars to a common axis */
  max: number
}) {
  const tone = deltaTone(deltaYears)
  const pct = max > 0 ? (Math.abs(deltaYears) / max) * 50 : 0 // half-width each side of centre
  const color = tone === 'good' ? 'bg-clock-good' : tone === 'bad' ? 'bg-clock-bad' : 'bg-clock-muted'
  return (
    <div className="grid grid-cols-[10rem_1fr_4rem] items-center gap-3">
      <span className="truncate text-sm text-clock-ink" title={label}>
        {label}
      </span>
      <div className="relative h-3 rounded bg-clock-canvas" aria-hidden>
        <div className="absolute inset-y-0 left-1/2 w-px bg-clock-line" />
        <div
          className={`absolute inset-y-0 rounded ${color}`}
          style={
            deltaYears >= 0
              ? { left: '50%', width: `${pct}%` }
              : { right: '50%', width: `${pct}%` }
          }
        />
      </div>
      <span className={`text-right text-sm font-medium ${tone === 'good' ? 'text-clock-good' : tone === 'bad' ? 'text-clock-bad' : 'text-clock-muted'}`}>
        {fmtDelta(deltaYears)}
      </span>
    </div>
  )
}
