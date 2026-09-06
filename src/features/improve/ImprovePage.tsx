import { Link } from 'react-router-dom'
import { useProfile } from '../../app/profile'
import { useRecommendations } from '../../api/hooks'
import { EvidenceChip, StatisticalEstimateNote } from '../../components/framing'
import { PageHeader, Card, NeedsProfile, Loading, ErrorState } from '../../components/ui'
import { fmtDelta } from '../../components/format'

const DIFFICULTY_LABEL = { 1: 'easier', 2: 'moderate', 3: 'harder' } as const

export function ImprovePage() {
  const { profile } = useProfile()
  const query = useRecommendations(profile)

  if (!profile) {
    return (
      <div>
        <PageHeader title="Improve My Clock" subtitle="What you can change — and roughly what it's worth." />
        <NeedsProfile />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Improve My Clock"
        subtitle="Only things you can act on — prioritised by impact, confidence, and effort. We never suggest 'undoing' a diagnosis."
      />

      {query.isLoading && <Loading label="Finding what helps most…" />}
      {query.isError && <ErrorState message={(query.error as Error).message} />}

      {query.data && (
        <div className="space-y-4">
          {query.data.length === 0 ? (
            <Card>
              <p className="text-sm text-clock-ink">
                Nothing stands out to change right now — your modifiable factors are already close to their
                healthy targets. Keep it up.
              </p>
            </Card>
          ) : (
            query.data.map((rec, i) => (
              <Card key={rec.factor} className="flex items-start gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-clock-brandsoft text-sm font-semibold text-clock-brand">
                  {i + 1}
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-clock-ink">{rec.headline}</h3>
                    <span className="rounded bg-clock-canvas px-1.5 py-0.5 text-[11px] text-clock-muted">
                      {rec.role === 'manage' ? 'manage' : 'lever'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-clock-muted">{rec.detail}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                    <span className="font-medium text-clock-good">up to {fmtDelta(rec.potential_years)}</span>
                    <EvidenceChip grade={rec.evidence} />
                    <span className="text-[11px] text-clock-muted">{DIFFICULTY_LABEL[rec.difficulty]}</span>
                  </div>
                </div>
              </Card>
            ))
          )}
          <StatisticalEstimateNote>
            Potential gains are statistical scenarios, not promises — explore them on{' '}
            <Link to="/what-if" className="underline">
              What If?
            </Link>
            .
          </StatisticalEstimateNote>
        </div>
      )}
    </div>
  )
}
