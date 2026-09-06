import { useProfile } from '../../app/profile'
import { useWhy } from '../../api/hooks'
import { FactorBar } from '../../components/FactorBar'
import { EvidenceChip, StatisticalEstimateNote } from '../../components/framing'
import { PageHeader, Card, NeedsProfile, Loading, ErrorState } from '../../components/ui'

const ROLE_LABEL: Record<string, string> = {
  lever: 'you can change this',
  manage: 'manage the condition',
  context: 'context — explained, not a target',
  baseline: 'baseline',
}

export function WhyPage() {
  const { profile } = useProfile()
  const query = useWhy(profile)

  if (!profile) {
    return (
      <div>
        <PageHeader title="Why?" subtitle="What drives your estimate, factor by factor." />
        <NeedsProfile />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Why?"
        subtitle="Each factor's contribution in years, versus the average person. These are statistical scenarios, not promises."
      />

      {query.isLoading && <Loading label="Working out the breakdown…" />}
      {query.isError && <ErrorState message={(query.error as Error).message} />}

      {query.data && (
        <Card>
          {query.data.length === 0 ? (
            <p className="text-sm text-clock-muted">Your answers sit close to the average across the board.</p>
          ) : (
            <>
              <div className="space-y-3">
                {(() => {
                  const max = Math.max(...query.data.map((d) => Math.abs(d.delta_years)))
                  return query.data.map((a) => (
                    <div key={a.factor} className="border-b border-clock-line pb-3 last:border-0 last:pb-0">
                      <FactorBar label={a.factor} deltaYears={a.delta_years} max={max} />
                      <div className="ml-[10.75rem] mt-1 flex flex-wrap items-center gap-2">
                        <EvidenceChip grade={a.evidence} />
                        <span className="text-[11px] text-clock-muted">{ROLE_LABEL[a.role] ?? a.role}</span>
                        <span className="text-[11px] text-clock-muted">· {a.citation}</span>
                      </div>
                    </div>
                  ))
                })()}
              </div>
              <div className="mt-4">
                <StatisticalEstimateNote>
                  Green adds years, red subtracts, relative to someone average. Contributions use the
                  total-effect model so changeable factors read honestly.
                </StatisticalEstimateNote>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  )
}
