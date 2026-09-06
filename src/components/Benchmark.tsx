// Compares the user's estimate against the average person of the same age & sex — turning the bare
// number into a comparison. Two scaled bars plus a plain-language delta sentence.

import { fmtYears, fmtDelta, deltaTone } from './format'

export function Benchmark({
  estimateYears,
  nationalAvgYears,
  deltaYears,
}: {
  estimateYears: number
  nationalAvgYears: number
  deltaYears: number
}) {
  const max = Math.max(estimateYears, nationalAvgYears, 1)
  const tone = deltaTone(deltaYears)
  const toneText = tone === 'good' ? 'text-clock-good' : tone === 'bad' ? 'text-clock-bad' : 'text-clock-muted'
  const word = deltaYears > 0 ? 'above' : deltaYears < 0 ? 'below' : 'right at'

  const Row = ({ label, value, color }: { label: string; value: number; color: string }) => (
    <div className="grid grid-cols-[7rem_1fr_4rem] items-center gap-3">
      <span className="text-sm text-clock-muted">{label}</span>
      <div className="h-3 rounded bg-clock-canvas">
        <div className={`h-3 rounded ${color}`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="text-right text-sm font-medium text-clock-ink">{fmtYears(value)}</span>
    </div>
  )

  return (
    <div>
      <div className="space-y-2">
        <Row label="You" value={estimateYears} color="bg-clock-brand" />
        <Row label="Average" value={nationalAvgYears} color="bg-clock-muted/50" />
      </div>
      <p className="mt-3 text-sm text-clock-ink">
        You’re <span className={`font-semibold ${toneText}`}>{fmtDelta(deltaYears)}</span> {word} the average
        person of your age and sex.
      </p>
    </div>
  )
}
