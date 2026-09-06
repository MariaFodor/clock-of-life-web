// Small formatting helpers shared across surfaces.

export const fmtYears = (y: number): string => `${y.toFixed(1)} yr`

/** Signed delta in years, e.g. "+2.3 yr" / "−1.1 yr" (true minus sign). */
export const fmtDelta = (y: number): string => {
  const sign = y > 0 ? '+' : y < 0 ? '−' : '±'
  return `${sign}${Math.abs(y).toFixed(1)} yr`
}

export const fmtDate = (iso: string): string => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/** Direction class for a delta: gains are good (green), losses bad (red). */
export const deltaTone = (y: number): 'good' | 'bad' | 'neutral' => (y > 0 ? 'good' : y < 0 ? 'bad' : 'neutral')
