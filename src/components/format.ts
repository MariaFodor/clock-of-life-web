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

/**
 * A year figure at the precision the surfaces actually print it — `fmtYears` and `fmtDelta` both
 * show one decimal.
 *
 * Words and colours are chosen from THIS value rather than from the raw one, so a sentence can never
 * describe a difference the page has already rounded away: "0.0 years below", in red, was a gap of
 * four hundredths of a year that the same line had just rounded to nothing.
 */
export const shownYears = (y: number): number => Math.round(y * 10) / 10

/**
 * A relative risk said in words: how much higher or lower this person's yearly risk of dying is than
 * the average person the model centres on (whose relative risk is 1.0).
 *
 * The percentage is rounded BEFORE the direction is chosen, so the two halves of the sentence cannot
 * disagree — a relative risk of 0.998 is "about the same", never "0% lower".
 */
export const riskVsAverage = (rr: number): { percent: number; direction: 'lower' | 'higher' | 'same' } => {
  const percent = Math.round(Math.abs(1 - rr) * 100)
  return { percent, direction: percent === 0 ? 'same' : rr < 1 ? 'lower' : 'higher' }
}
