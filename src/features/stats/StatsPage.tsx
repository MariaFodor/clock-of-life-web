import { useStats } from '../../api/hooks'
import { PageHeader, Card, Loading, ErrorState } from '../../components/ui'
import { StatisticalEstimateNote } from '../../components/framing'
import { fmtYears } from '../../components/format'

export function StatsPage() {
  const query = useStats()

  return (
    <div>
      <PageHeader
        title="Statistics"
        subtitle="How estimates vary across groups of users. Small cohorts (fewer than 20 people) are hidden to protect privacy."
      />

      {query.isLoading && <Loading label="Loading cohort figures…" />}
      {query.isError && <ErrorState message={(query.error as Error).message} />}

      {query.data && (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-clock-line text-left text-clock-muted">
                <th className="py-2 font-medium">Cohort</th>
                <th className="py-2 font-medium">People</th>
                <th className="py-2 text-right font-medium">Mean estimate</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((s) => (
                <tr key={s.label} className="border-b border-clock-line last:border-0">
                  <td className="py-2 text-clock-ink">{s.label}</td>
                  <td className="py-2 text-clock-muted">{s.cohort_size}</td>
                  <td className="py-2 text-right">
                    {s.suppressed ? (
                      <span className="text-clock-muted" title="Hidden: fewer than 20 people (k-anonymity)">
                        hidden (k &lt; 20)
                      </span>
                    ) : (
                      <span className="font-medium text-clock-ink">{fmtYears(s.mean_estimate_years!)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4">
            <StatisticalEstimateNote>
              These are distributions of the model's estimates across users — the platform never observes
              actual mortality, so it never claims to.
            </StatisticalEstimateNote>
          </div>
        </Card>
      )}
    </div>
  )
}
