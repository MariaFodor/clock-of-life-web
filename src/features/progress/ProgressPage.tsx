import { useCalculations } from '../../api/hooks'
import { PageHeader, Card, Loading, ErrorState } from '../../components/ui'
import { IntervalBadge, StatisticalEstimateNote } from '../../components/framing'
import { Sparkline } from '../../components/Sparkline'
import { fmtYears, fmtDate, fmtDelta, deltaTone } from '../../components/format'

export function ProgressPage() {
  const query = useCalculations()

  return (
    <div>
      <PageHeader
        title="My Progress"
        subtitle="Every calculation you've run, newest first. Each is a saved snapshot on your account."
      />

      {query.isLoading && <Loading label="Loading your history…" />}
      {query.isError && <ErrorState message={(query.error as Error).message} />}

      {query.data && (
        query.data.length === 0 ? (
          <Card>
            <p className="text-sm text-clock-muted">
              No calculations yet. Run the interview to create your first snapshot.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {query.data.length > 1 &&
              (() => {
                // History is newest-first; plot chronologically (oldest → newest).
                const chrono = query.data.slice().reverse()
                const points = chrono.map((r) => ({
                  value: r.estimate_years,
                  low: r.interval_low,
                  high: r.interval_high,
                }))
                const first = chrono[0].estimate_years
                const last = chrono[chrono.length - 1].estimate_years
                const trend = Math.round((last - first) * 10) / 10
                const tone = deltaTone(trend)
                return (
                  <Card>
                    <div className="mb-2 flex items-baseline justify-between">
                      <h2 className="text-sm font-semibold text-clock-ink">Your estimate over time</h2>
                      <span
                        className={`text-sm font-medium ${
                          tone === 'good' ? 'text-clock-good' : tone === 'bad' ? 'text-clock-bad' : 'text-clock-muted'
                        }`}
                      >
                        {fmtDelta(trend)} since first
                      </span>
                    </div>
                    <Sparkline points={points} />
                  </Card>
                )
              })()}
            {query.data.map((row) => (
              <Card key={row.id} className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-clock-ink">{fmtYears(row.estimate_years)}</div>
                  <div className="text-xs text-clock-muted">
                    {/* "RR" is the model's shorthand for a comparison, and a history row is no
                        place to learn it. Short enough for a compact row, spelled out enough to
                        read: the same figure the Life Clock explains in full. */}
                    {fmtDate(row.created_at)} · reaches age {row.reaches_age.toFixed(0)} · risk vs
                    average {row.relative_risk.toFixed(2)}×
                  </div>
                </div>
                <IntervalBadge low={row.interval_low} high={row.interval_high} />
              </Card>
            ))}
            <StatisticalEstimateNote>
              History lets you see how your estimate moves as your answers change — not a measurement of
              your life, only of the model's view given what you told it.
            </StatisticalEstimateNote>
          </div>
        )
      )}
    </div>
  )
}
