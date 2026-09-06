// A tiny hand-authored SVG trend chart (no charting library, matching the LifeClock philosophy).
// Plots a series of estimate values over time, with the uncertainty interval drawn as a soft band.

export interface SparkPoint {
  value: number
  low?: number
  high?: number
}

export function Sparkline({
  points,
  width = 520,
  height = 120,
  padding = 12,
}: {
  points: SparkPoint[]
  width?: number
  height?: number
  padding?: number
}) {
  if (points.length === 0) return null

  const lows = points.map((p) => p.low ?? p.value)
  const highs = points.map((p) => p.high ?? p.value)
  const min = Math.min(...lows)
  const max = Math.max(...highs)
  const span = max - min || 1

  const innerW = width - padding * 2
  const innerH = height - padding * 2
  const x = (i: number) => padding + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
  const y = (v: number) => padding + innerH - ((v - min) / span) * innerH

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ')

  const hasBand = points.some((p) => p.low !== undefined && p.high !== undefined)
  const band = hasBand
    ? [
        ...points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.high ?? p.value).toFixed(1)}`),
        ...points
          .slice()
          .reverse()
          .map((p, j) => {
            const i = points.length - 1 - j
            return `L ${x(i).toFixed(1)} ${y(p.low ?? p.value).toFixed(1)}`
          }),
        'Z',
      ].join(' ')
    : null

  return (
    // Uniform scaling (default preserveAspectRatio) keeps the markers round and the stroke even; the SVG
    // sizes to its container width via CSS while preserving aspect ratio.
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Estimate trend over time"
      style={{ width: '100%', height: 'auto' }}
    >
      {band && <path d={band} fill="rgb(var(--clock-brand))" fillOpacity={0.12} />}
      <path d={line} fill="none" stroke="rgb(var(--clock-brand))" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.value)} r={i === points.length - 1 ? 4 : 2.5} fill="rgb(var(--clock-brand))" />
      ))}
    </svg>
  )
}
