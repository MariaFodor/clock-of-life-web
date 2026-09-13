import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useProfile } from '../../app/profile'
import { useBenchmark, useMeta } from '../../api/hooks'
import { LifeClock } from '../../components/LifeClock'
import { Benchmark } from '../../components/Benchmark'
import { IntervalBadge, StatisticalEstimateNote, SafeguardNote } from '../../components/framing'
import { PageHeader, Card, NeedsProfile, NoticeState } from '../../components/ui'
import { fmtYears, riskVsAverage } from '../../components/format'

/**
 * The age at which the published life tables stop resolving individual years.
 *
 * UN WPP closes every table with one OPEN interval covering everyone 100 and over, so the estimate is
 * flat across it by construction. The service's `remaining_le` prices that interval at the publisher's
 * own figure for it; what it cannot do is tell a 104-year-old from a 110-year-old, because the source
 * does not.
 */
const OPEN_INTERVAL_AGE = 100

export function LifeClockPage() {
  const { profile, estimate } = useProfile()
  const benchmark = useBenchmark(profile)
  // Only for the country's NAME. A profile stores the two-letter code, and the name travels with the
  // country list, exactly as the relocate surface resolves it.
  const meta = useMeta()
  // A notice handed over by the interview (e.g. the home location could not be saved). Read once,
  // then cleared from history so a refresh or a back-navigation doesn't resurrect it.
  const routerLocation = useLocation()
  const navigate = useNavigate()
  const [notice, setNotice] = useState<string | null>(
    (routerLocation.state as { notice?: string } | null)?.notice ?? null,
  )
  useEffect(() => {
    if ((routerLocation.state as { notice?: string } | null)?.notice) {
      navigate(
        { pathname: routerLocation.pathname, search: routerLocation.search, hash: routerLocation.hash },
        { replace: true, state: null },
      )
    }
  }, [routerLocation.pathname, routerLocation.search, routerLocation.hash, routerLocation.state, navigate])

  if (!profile || !estimate) {
    return (
      <div>
        <PageHeader title="My Life Clock" subtitle="Your current statistical estimate." />
        <NeedsProfile />
      </div>
    )
  }

  const belowCurrentAge = estimate.reaches_age <= profile.age

  // "Relative risk 0.56×" is a statistic wearing a label only a statistician reads, and its only
  // explanation was a hover title — which a touch reader never sees at all. The number stays, since
  // it is the model's own, and the sentence beneath says what it means.
  const risk = riskVsAverage(estimate.relative_risk)
  // Never a bare country code in a sentence a person reads: the profile stores "RO", and "the
  // average person in RO" is the jargon this page is being cleaned of. The code is the fallback
  // rather than a guess, because a service too old to send the country list still has to produce a
  // sentence — and for the moment the list is in flight, the code is what is true.
  const countryName =
    meta.data?.country_options?.find((c) => c.iso2 === estimate.country)?.name ?? estimate.country
  // "Compared with X, your risk is …" rather than "your risk is … than X": the second compares a
  // risk to a person, which is the kind of sentence that makes a reader re-read a number.
  const riskSentence =
    `Compared with the average person in ${countryName}, your yearly risk of dying is about ` +
    (risk.direction === 'same' ? 'the same.' : `${risk.percent}% ${risk.direction}.`)

  return (
    <div>
      <PageHeader title="My Life Clock" subtitle="Your current statistical estimate — always shown with its range." />

      {notice && (
        <div className="mb-5">
          <NoticeState message={notice} />
          <button type="button" className="btn-ghost mt-1 text-xs" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-[auto_1fr]">
        <Card className="flex items-center justify-center">
          <LifeClock
            age={profile.age}
            estimateYears={estimate.estimate_years}
            reachesAge={estimate.reaches_age}
            interval={estimate.interval}
          />
        </Card>

        <Card className="flex flex-col justify-center gap-4">
          <div>
            <div className="text-sm text-clock-muted">Estimated remaining</div>
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-semibold text-clock-ink">{fmtYears(estimate.estimate_years)}</span>
              <IntervalBadge low={estimate.interval[0]} high={estimate.interval[1]} />
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-clock-muted">Reaches about</dt>
              <dd className="font-medium text-clock-ink">age {estimate.reaches_age.toFixed(0)}</dd>
            </div>
            <div>
              <dt className="text-clock-muted">Yearly risk vs the average</dt>
              <dd className="font-medium text-clock-ink">{estimate.relative_risk.toFixed(2)}×</dd>
            </div>
          </dl>
          {/* The comparison the figure above is against, said once and in full. It used to be a
              second sentence in the note below ("Centred on the average person in RO"), which named
              neither what was being compared nor the country. */}
          <p className="text-sm text-clock-ink">{riskSentence}</p>
          {/* Above 100 the published life table stops resolving. The UN reports a single OPEN interval
              for everyone aged 100 and over, so a reader of 104 and a reader of 110 are given the same
              figure — not because the model thinks they are alike, but because the source cannot tell
              them apart. Saying so beats letting someone conclude their age made no difference.
              (Until v4.2.0 this was worse and silent: every age from 100 to 110 was priced at exactly
              half a year, because the table's final interval was charged at the default half-year.) */}
          {profile.age >= OPEN_INTERVAL_AGE && (
            <p className="text-sm text-clock-muted">
              Above {OPEN_INTERVAL_AGE}, the national life tables stop counting year by year: the UN
              publishes one figure for everyone aged {OPEN_INTERVAL_AGE} and over. So this is the
              estimate for that whole group, and it will not change as you get older — the source
              cannot see the difference, so neither can this.
            </p>
          )}
          <StatisticalEstimateNote>
            This is a statistical estimate, not a prediction or diagnosis.
          </StatisticalEstimateNote>
        </Card>
      </div>

      {benchmark.data && (
        <Card className="mt-5">
          <h2 className="mb-3 text-sm font-semibold text-clock-ink">How you compare</h2>
          <Benchmark
            estimateYears={estimate.estimate_years}
            nationalAvgYears={benchmark.data.national_avg_years}
            deltaYears={benchmark.data.delta_years}
          />
          {/* Two comparisons sit on this page, both calling their yardstick "the average person",
              and a reader cannot tell whether they mean the same thing or why a large difference in
              risk goes with a small difference in years. Saying which people, and which quantity,
              is what stops them being read as one statement. */}
          <p className="mt-2 text-xs text-clock-muted">
            “Average” here means someone your age and sex in {countryName}. This compares years of
            life left; the risk figure above compares the chance of dying in a year.
          </p>
        </Card>
      )}

      {belowCurrentAge && (
        <div className="mt-5">
          <SafeguardNote />
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/why" className="btn-ghost border border-clock-line">
          Why is it this number?
        </Link>
        <Link to="/improve" className="btn-ghost border border-clock-line">
          What can I improve?
        </Link>
        <Link to="/what-if" className="btn-ghost border border-clock-line">
          Try a what-if
        </Link>
        <Link to="/interview" className="btn-ghost text-clock-muted">
          Edit my answers
        </Link>
      </div>
    </div>
  )
}
