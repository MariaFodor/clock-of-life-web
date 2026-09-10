// Compares the user's estimate against the average person of the same age & sex — turning the bare
// number into a comparison. Two scaled bars plus a plain-language delta sentence.

import { fmtYears, deltaTone, shownYears } from './format'

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
  // The sentence carries the magnitude as a plain number and the direction as a word. It used to
  // print the signed delta — "−0.1 yr below" — which says the same thing twice, once in a minus
  // sign the reader has to decode and once in a word, and reads as a double negative on the way in.
  //
  // Both the words and the colour come from the magnitude AS SHOWN rather than from the raw delta:
  // rounding is what the reader sees, so a difference of four hundredths must not be announced as
  // "0.0 years below" in red. Rounding cannot flip a sign, so the two can never disagree about
  // direction — only about whether there is one at all.
  const shown = Math.abs(shownYears(deltaYears))
  const tone = shown === 0 ? 'neutral' : deltaTone(deltaYears)
  const toneText = tone === 'good' ? 'text-clock-good' : tone === 'bad' ? 'text-clock-bad' : 'text-clock-muted'
  const comparison =
    shown === 0 ? 'about the same as' : `${shown.toFixed(1)} years ${deltaYears > 0 ? 'above' : 'below'}`

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
        You’re <span className={`font-semibold ${toneText}`}>{comparison}</span> the average person of
        your age and sex.
      </p>
    </div>
  )
}
