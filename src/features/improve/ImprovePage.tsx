import { Link } from 'react-router-dom'
import { useProfile } from '../../app/profile'
import { useRecommendations } from '../../api/hooks'
import { EvidenceChip, StatisticalEstimateNote } from '../../components/framing'
import { ArticleLink } from '../../components/ArticleLink'
import { useOntology } from '../../api/hooks'
import type { Ontology } from '../../api/types'
import { PageHeader, Card, NeedsProfile, Loading, ErrorState } from '../../components/ui'
import { fmtDelta } from '../../components/format'
import { roleLabel } from '../../components/roles'

/** The article behind a recommendation, looked up by the feature key the service returns. */
function factorLink(ontology: Ontology | undefined, factor: string) {
  const prior = ontology?.[factor]?.prior
  if (!prior?.doi && !prior?.url) return null
  return (
    <ArticleLink url={prior.url} doi={prior.doi} firstAuthor={prior.first_author} year={prior.year}
                 citation={prior.title} />
  )
}

// A difficulty chip used to sit next to the evidence one, reading a bare "moderate" with nothing to
// say what was moderate about it. It is not shown any more, and the reason is not the missing label:
// the service does not send a difficulty at all, so `httpClient` fills in 2 for every recommendation
// it maps. A chip that reads "moderate" for everything is not information about this recommendation,
// and labelling it "effort: moderate" would only have made a constant sound like a finding. The
// field itself stays — the mock ranks with it — and the display can come back the day the service
// has something to put in it.

export function ImprovePage() {
  const { profile } = useProfile()
  const query = useRecommendations(profile)
  const ontology = useOntology()

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
                    {/* The model's own word for the role ("lever") meant nothing to a reader who
                        had never been told it. Why? already says these in plain words; this is the
                        same mapping, so the two surfaces cannot describe one factor differently. */}
                    <span className="rounded bg-clock-canvas px-1.5 py-0.5 text-[11px] text-clock-muted">
                      {roleLabel(rec.role)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-clock-muted">{rec.detail}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                    <span className="font-medium text-clock-good">up to {fmtDelta(rec.potential_years)}</span>
                    <EvidenceChip grade={rec.evidence} />
                    {/* The advice and the paper it rests on, side by side — a recommendation the
                        reader cannot check is just an assertion. */}
                    {factorLink(ontology.data, rec.factor)}
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
