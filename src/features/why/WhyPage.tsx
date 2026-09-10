import { useState } from 'react'
import { useProfile } from '../../app/profile'
import { useWhy } from '../../api/hooks'
import { FactorBar } from '../../components/FactorBar'
import { EvidenceChip, StatisticalEstimateNote } from '../../components/framing'
import { PageHeader, Card, NeedsProfile, Loading, ErrorState } from '../../components/ui'
import { ArticleLink } from '../../components/ArticleLink'
import { CausalGraph } from '../../components/CausalGraph'
import { roleLabel } from '../../components/roles'
import { useOntology } from '../../api/hooks'
import type { Ontology } from '../../api/types'

/** Said in two places — the page while the breakdown loads, and the graph panel when it is opened
 *  in that window. One string, so the two can never drift into telling the reader different things. */
const BREAKDOWN_LOADING = 'Working out the breakdown…'

/**
 * The factor with the most years at stake either way, among the ones the graph actually draws.
 *
 * The graph opens on it, so the reader's first sight is one factor's paths lit rather than every
 * arrow at once. Picked by size, not by the order the breakdown arrived in — it happens to arrive
 * biggest-first today, and a page that quietly depended on that would be wrong the day it stops.
 * "Among the ones it draws" is the other constraint: the ontology is a slice of the model, so a
 * breakdown row can name a factor that has no node, and focusing a node that is not drawn dims
 * every node and shows no detail card. Null when the reader sits at the average across the board —
 * the graph then opens unfocused, as it always did. "Still loading" is not one of the cases it has
 * to answer for: the panel does not build the graph until the breakdown has settled.
 */
function biggestDrawnFactor(impact: Record<string, number>, ontology: Ontology): string | null {
  let biggest: string | null = null
  for (const [key, years] of Object.entries(impact)) {
    if (!ontology[key]) continue
    if (biggest === null || Math.abs(years) > Math.abs(impact[biggest]!)) biggest = key
  }
  return biggest
}

export function WhyPage() {
  const { profile } = useProfile()
  const ontology = useOntology()
  const query = useWhy(profile)
  // Collapsed on every visit, deliberately not remembered: the graph is the densest thing on the
  // page and the bars above it are the answer most readers came for.
  const [graphOpen, setGraphOpen] = useState(false)

  if (!profile) {
    return (
      <div>
        <PageHeader title="Why?" subtitle="What drives your estimate, factor by factor." />
        <NeedsProfile />
      </div>
    )
  }

  // The reader's own breakdown, so the drawing is about them rather than about the model.
  const impact = Object.fromEntries((query.data ?? []).map((a) => [a.key, a.delta_years]))

  return (
    <div>
      <PageHeader
        title="Why?"
        subtitle="Each factor's contribution in years, versus the average person. These are statistical scenarios, not promises."
      />

      {query.isLoading && <Loading label={BREAKDOWN_LOADING} />}
      {query.isError && <ErrorState message={(query.error as Error).message} />}

      {query.data && (
        <Card testId="why-breakdown">
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
                        <span className="text-[11px] text-clock-muted">{roleLabel(a.role)}</span>
                        <span className="text-[11px] text-clock-muted">·</span>
                        <ArticleLink url={a.url} doi={a.doi} firstAuthor={a.first_author}
                                     year={a.year} citation={a.citation} />
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

      {/* Below the bars and shut until asked for. The ontology is cached for the session and the
          breakdown is not, so this card is on screen before the numbers are — which is exactly the
          state a reader lands in on the way out of the interview, and why the panel below waits. */}
      {ontology.data && (
        <Card testId="why-graph" className="mt-5">
          <h2 className="text-lg font-semibold text-clock-ink">
            <button
              type="button"
              id="why-graph-toggle"
              aria-expanded={graphOpen}
              // Unconditional: the panel is always in the DOM and merely `hidden` while shut, so
              // this never points at nothing. Referencing a hidden element is what the APG
              // disclosure pattern asks for — the button has to name what it opens before it opens.
              aria-controls="why-graph-panel"
              onClick={() => setGraphOpen((open) => !open)}
              className="flex w-full items-center gap-2 rounded-lg text-left hover:text-clock-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-clock-brand/50"
            >
              <span aria-hidden="true" className="text-sm text-clock-muted">{graphOpen ? '▾' : '▸'}</span>
              How these factors reach each other
            </button>
          </h2>
          <p className="mt-1 text-sm text-clock-muted">
            A picture of which factors act through which: the roads your own factors travel to reach
            your clock, and why one can matter a great deal and still add little on its own.
          </p>

          <div id="why-graph-panel" hidden={!graphOpen}>
            {graphOpen && (
              <div className="mt-3">
                <p className="mb-3 text-sm text-clock-muted">
                  Most factors act <em>through</em> others. That is why a bigger waist matters a great deal
                  and yet, once we already know your blood pressure and blood sugar, adds little on its own —
                  those are the road it travels by.
                </p>
                {/* Not built until the numbers are in. The graph reads its opening factor once, as
                    it mounts, so one mounted while the breakdown is still in flight opens on
                    nothing — and nothing re-opens it when the numbers land, which leaves the reader
                    on the ~40-edge resting state for the rest of the visit. Waiting keeps that
                    focus where it belongs, on mount, where it cannot fight a reader who has already
                    started hovering. A breakdown that settles empty, or fails, still mounts the
                    graph unfocused: the resting state is what those two cases have to show. */}
                {query.isPending ? (
                  // The page is already announcing this sentence in a live region above; a second
                  // one here would say it twice, so the panel borrows the words and not the region.
                  <p className="text-sm text-clock-muted">{BREAKDOWN_LOADING}</p>
                ) : (
                  <CausalGraph
                    ontology={ontology.data}
                    impact={impact}
                    initialFocus={biggestDrawnFactor(impact, ontology.data)}
                  />
                )}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
