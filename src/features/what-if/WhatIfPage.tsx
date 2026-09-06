import { useState } from 'react'
import { useProfile } from '../../app/profile'
import { useWhatIf } from '../../api/hooks'
import type { SmokeStatus, WhatIfChanges } from '../../api/types'
import { PageHeader, Card, NeedsProfile } from '../../components/ui'
import { StatisticalEstimateNote } from '../../components/framing'
import { fmtDelta, fmtYears, deltaTone } from '../../components/format'

const SMOKE_LABEL: Record<SmokeStatus, string> = { 0: 'Never', 1: 'Former', 2: 'Current' }

export function WhatIfPage() {
  const { profile } = useProfile()
  const whatif = useWhatIf()
  const [changes, setChanges] = useState<WhatIfChanges>({})

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
  const sleep = changes.sleep ?? profile.sleep
  const waist = changes.waist ?? profile.waist

  const run = () => whatif.mutate({ base: profile, changes })
  const reset = () => {
    setChanges({})
    whatif.reset()
  }

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
          <SliderRow
            label="Sleep (hours/night)"
            min={3}
            max={12}
            step={0.5}
            value={sleep}
            display={`${sleep.toFixed(1)} h`}
            onChange={(v) => setChanges((c) => ({ ...c, sleep: v }))}
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
          <div className="mt-3">
            <StatisticalEstimateNote>
              A statistical scenario, not a promise — and never saved to your record.
            </StatisticalEstimateNote>
          </div>
        </Card>
      )}
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
