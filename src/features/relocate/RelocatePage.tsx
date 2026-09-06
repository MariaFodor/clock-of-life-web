import { useState } from 'react'
import { useProfile } from '../../app/profile'
import { useLocations } from '../../api/hooks'
import { getClient } from '../../api/client'
import type { RelocateResult } from '../../api/types'
import { PageHeader, Card, NeedsProfile, Loading, ErrorState } from '../../components/ui'
import { StatisticalEstimateNote } from '../../components/framing'
import { fmtDelta, deltaTone } from '../../components/format'

export function RelocatePage() {
  const { profile } = useProfile()
  const locations = useLocations()
  const [result, setResult] = useState<RelocateResult | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  if (!profile) {
    return (
      <div>
        <PageHeader title="Where Should I Live?" subtitle="Compare places on air quality and greenspace." />
        <NeedsProfile />
      </div>
    )
  }

  const compare = async (id: string) => {
    setBusyId(id)
    try {
      setResult(await getClient().relocate(profile, id))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Where Should I Live?"
        subtitle="Air quality (PM2.5) and greenspace (NDVI) are the levers here. Moving is the only way this factor changes."
      />

      {locations.isLoading && <Loading label="Loading places…" />}
      {locations.isError && <ErrorState message={(locations.error as Error).message} />}

      {locations.data && (
        <div className="grid gap-3 sm:grid-cols-2">
          {locations.data.map((loc) => (
            <Card key={loc.id} className="flex items-center justify-between gap-4">
              <div>
                <div className="font-medium text-clock-ink">{loc.name}</div>
                <div className="text-xs text-clock-muted">
                  PM2.5 {loc.pm25} µg/m³ · greenspace {loc.ndvi.toFixed(2)} · {loc.kind}
                </div>
              </div>
              <button
                type="button"
                className="btn-ghost border border-clock-line"
                onClick={() => compare(loc.id)}
                disabled={busyId === loc.id}
              >
                {busyId === loc.id ? '…' : 'Compare'}
              </button>
            </Card>
          ))}
        </div>
      )}

      {result && (
        <Card className="mt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold text-clock-ink">
              {result.current.name} → {result.candidate.name}
            </h3>
            <span
              className={`text-lg font-bold ${
                deltaTone(result.delta_years) === 'good'
                  ? 'text-clock-good'
                  : deltaTone(result.delta_years) === 'bad'
                    ? 'text-clock-bad'
                    : 'text-clock-muted'
              }`}
            >
              {fmtDelta(result.delta_years)}
            </span>
          </div>
          <p className="mt-2 text-sm text-clock-muted">{result.explanation}</p>
          <div className="mt-3">
            <StatisticalEstimateNote>
              A statistical scenario from environmental averages — it does not account for the many other
              things a move changes.
            </StatisticalEstimateNote>
          </div>
        </Card>
      )}
    </div>
  )
}
