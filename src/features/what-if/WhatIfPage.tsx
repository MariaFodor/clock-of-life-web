import { useState } from 'react'
import { useProfile } from '../../app/profile'
import { useWhatIf } from '../../api/hooks'
import { effectiveCigsDay } from '../../api/modelRules'
import type { SmokeStatus, WhatIf, WhatIfChanges } from '../../api/types'
import { PageHeader, Card, NeedsProfile, ErrorState } from '../../components/ui'
import { StatisticalEstimateNote } from '../../components/framing'
import { fmtDelta, fmtYears, deltaTone } from '../../components/format'

const SMOKE_LABEL: Record<SmokeStatus, string> = { 0: 'Never', 1: 'Former', 2: 'Current' }

interface SavedScenario {
  id: number
  summary: string
  result: WhatIf
}

/** A short human summary of which levers a scenario changed. */
function summarizeChanges(changes: WhatIfChanges, baseSmoke: SmokeStatus): string {
  const parts: string[] = []
  if (changes.smoke !== undefined) parts.push(`smoking → ${SMOKE_LABEL[changes.smoke]}`)
  if (changes.pa_min !== undefined) parts.push(`activity → ${changes.pa_min.toFixed(0)} MET-min`)
  // Only while the scenario still smokes: "smoking → Never, 5 cigarettes/day" describes nobody, and
  // the service zeroes the dose on quitting anyway. The base status is passed in rather than
  // defaulted to "current": defaulting is only correct while the dose slider renders exclusively
  // for smokers, which is a fact about another function.
  if (changes.cigs_day !== undefined && (changes.smoke ?? baseSmoke) === 2) {
    parts.push(`${changes.cigs_day.toFixed(0)} cigarettes/day`)
  }
  if (changes.waist !== undefined) parts.push(`waist → ${changes.waist.toFixed(0)} cm`)
  return parts.length ? parts.join(', ') : 'no change'
}

export function WhatIfPage() {
  const { profile } = useProfile()
  const whatif = useWhatIf()
  const [changes, setChanges] = useState<WhatIfChanges>({})
  const [scenarios, setScenarios] = useState<SavedScenario[]>([])

  if (!profile) {
    return (
      <div>
        <PageHeader title="What If?" subtitle="Simulate a lifestyle change." />
        <NeedsProfile />
      </div>
    )
  }

  const smoke = changes.smoke ?? profile.smoke
  const pa = changes.pa_min ?? profile.pa_min
  const waist = changes.waist ?? profile.waist
  // Seeded from the EFFECTIVE dose, not the raw field. A current smoker who never answered the dose
  // question stores 0, and the model scores them at the cohort's smoker mean — so seeding from the
  // field left the row reading "0" while the slider's floor pinned the thumb to 1, and then
  // congratulated them for "cutting down" when they dragged it up to 5. The service compares
  // effective doses for exactly this reason; the control has to start from the same number, or it
  // argues with the answer it produces.
  const imputedDose = profile.smoke === 2 && !profile.cigs_day
  const cigs = changes.cigs_day ?? Math.round(effectiveCigsDay(profile))

  const run = () => whatif.mutate({ base: profile, changes })
  const reset = () => {
    setChanges({})
    whatif.reset()
  }
  const save = () => {
    if (!whatif.data) return
    setScenarios((prev) => [...prev, { id: Date.now(), summary: summarizeChanges(changes, profile.smoke), result: whatif.data! }])
  }

  // Best = the largest gain in years (ties broken by insertion order).
  const bestDelta = scenarios.length ? Math.max(...scenarios.map((s) => s.result.delta_years)) : null

  return (
    <div>
      <PageHeader
        title="What If?"
        subtitle="Only modifiable levers can change here. Nothing is saved — this is an overlay to explore."
      />

      <Card>
        <div className="space-y-6">
          <div>
            <label className="label mb-2">Smoking</label>
            <div className="flex gap-2">
              {([0, 1, 2] as SmokeStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={smoke === s}
                  onClick={() => setChanges((c) => ({ ...c, smoke: s }))}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${
                    smoke === s ? 'border-clock-brand bg-clock-brandsoft text-clock-brand' : 'border-clock-line'
                  }`}
                >
                  {SMOKE_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          <SliderRow
            label="Weekly active minutes (MET-min)"
            min={0}
            max={4000}
            step={100}
            value={pa}
            display={`${pa.toFixed(0)}`}
            onChange={(v) => setChanges((c) => ({ ...c, pa_min: v }))}
          />
          {/* Only a current smoker has a dose to change, and only then does the model score one.
              Showing the slider to a never-smoker would invite a question whose answer is always
              zero. */}
          {smoke === 2 && (
            <SliderRow
              label="Cigarettes per day"
              // Not zero: the service refuses a zero dose from a current smoker, because the model
              // reads it as "did not answer" and scores it at the average smoker's consumption —
              // which made cutting to zero worth LESS than cutting to one. Quitting is the smoking
              // button above, and it is the honest way to ask that question.
              min={1}
              max={60}
              step={1}
              value={cigs}
              // Say so when the number is ours rather than theirs: this person never told us, and a
              // bare "12" would read back as something they had reported.
              display={imputedDose && changes.cigs_day === undefined
                ? `${cigs.toFixed(0)} (assumed)`
                : `${cigs.toFixed(0)}`}
              onChange={(v) => setChanges((c) => ({ ...c, cigs_day: v }))}
            />
          )}
          {/* Sleep was a slider here until the model demoted long sleep to a MARKER: illness causes
              long sleep far more than the reverse, so "sleep less" is advice with no evidence behind
              it, and the service now refuses the change. Deleting the row outright would have been
              the easy fix and the wrong one — sleep still moves the estimate and still appears in
              the breakdown, so hiding it here would look like the model stopped caring. It stays
              visible and says why it cannot be simulated. */}
          <MarkerRow
            label="Sleep (hours/night)"
            display={`${profile.sleep.toFixed(1)} h`}
            reason={
              'Long sleep is a marker of illness rather than a cause of it, so there is no ' +
              'evidenced effect of changing it to simulate. It still counts in your breakdown.'
            }
          />
          <SliderRow
            label="Waist (cm)"
            min={50}
            max={160}
            step={1}
            value={waist}
            display={`${waist.toFixed(0)} cm`}
            onChange={(v) => setChanges((c) => ({ ...c, waist: v }))}
          />

          <div className="flex items-center gap-3">
            <button type="button" className="btn-primary" onClick={run} disabled={whatif.isPending}>
              {whatif.isPending ? 'Simulating…' : 'See the effect'}
            </button>
            <button type="button" className="btn-ghost text-clock-muted" onClick={reset}>
              Reset
            </button>
          </div>
        </div>
      </Card>

      {/* The service refuses some scenarios with a reason — a sleep change, an implausible dose.
          Until now the page had no error branch at all: a rejection just flipped the button back
          from "Simulating…" and showed nothing, which is why the sleep slider could 400 for
          however long without anyone noticing. A refusal is an answer and belongs on screen. */}
      {whatif.isError && <ErrorState message={(whatif.error as Error).message} />}

      {whatif.data && (
        <Card className="mt-5">
          <div className="grid grid-cols-3 items-center gap-4 text-center">
            <div>
              <div className="text-xs text-clock-muted">now</div>
              <div className="text-xl font-semibold text-clock-ink">{fmtYears(whatif.data.current_years)}</div>
            </div>
            <div>
              <div className="text-xs text-clock-muted">change</div>
              <div
                className={`text-2xl font-bold ${
                  deltaTone(whatif.data.delta_years) === 'good'
                    ? 'text-clock-good'
                    : deltaTone(whatif.data.delta_years) === 'bad'
                      ? 'text-clock-bad'
                      : 'text-clock-muted'
                }`}
              >
                {fmtDelta(whatif.data.delta_years)}
              </div>
            </div>
            <div>
              <div className="text-xs text-clock-muted">changed</div>
              <div className="text-xl font-semibold text-clock-ink">{fmtYears(whatif.data.scenario_years)}</div>
            </div>
          </div>
          {whatif.data.note && (
            <p className="mt-3 rounded-lg bg-clock-warn/5 p-2 text-xs text-clock-warn">{whatif.data.note}</p>
          )}
          <div className="mt-3 flex items-center justify-between gap-3">
            <StatisticalEstimateNote>
              A statistical scenario, not a promise — and never saved to your record.
            </StatisticalEstimateNote>
            <button type="button" className="btn-ghost shrink-0 border border-clock-line" onClick={save}>
              + Save to compare
            </button>
          </div>
        </Card>
      )}

      {scenarios.length > 0 && (
        <Card className="mt-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-clock-ink">Compare scenarios</h2>
            <button type="button" className="btn-ghost text-clock-muted" onClick={() => setScenarios([])}>
              Clear all
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-clock-line text-left text-clock-muted">
                <th className="py-2 font-medium">Change</th>
                <th className="py-2 text-right font-medium">Effect</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((s) => {
                const isBest = s.result.delta_years === bestDelta && bestDelta! > 0
                const tone = deltaTone(s.result.delta_years)
                return (
                  <tr key={s.id} className={`border-b border-clock-line last:border-0 ${isBest ? 'bg-clock-good/5' : ''}`}>
                    <td className="py-2 text-clock-ink">
                      {s.summary}
                      {isBest && (
                        <span className="ml-2 rounded bg-clock-good/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-clock-good">
                          best
                        </span>
                      )}
                    </td>
                    <td
                      className={`py-2 text-right font-medium ${
                        tone === 'good' ? 'text-clock-good' : tone === 'bad' ? 'text-clock-bad' : 'text-clock-muted'
                      }`}
                    >
                      {fmtDelta(s.result.delta_years)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

/** A factor the estimate uses but What-If must not offer: shown, valued, and explained. */
function MarkerRow({ label, display, reason }: { label: string; display: string; reason: string }) {
  // Deliberately not a disabled input: a dimmed control announces itself as something you failed to
  // use. This is text. The group + label ties the three nodes together so the reason is heard as
  // belonging to the value, since the dashed border that conveys that visually says nothing at all.
  const labelId = `marker-${label.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <div role="group" aria-labelledby={labelId}
         className="rounded-lg border border-dashed border-clock-line p-3">
      <div className="mb-1 flex items-center justify-between">
        <span id={labelId} className="label text-clock-muted">{label}</span>
        <span className="text-sm font-medium text-clock-muted">{display}</span>
      </div>
      <p className="text-xs text-clock-muted">{reason}</p>
    </div>
  )
}

function SliderRow({
  label,
  min,
  max,
  step,
  value,
  display,
  onChange,
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  display: string
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="label">{label}</label>
        <span className="text-sm font-medium text-clock-ink">{display}</span>
      </div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-clock-brand"
      />
    </div>
  )
}
