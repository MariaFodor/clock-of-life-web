import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useProfile } from '../../app/profile'
import { useBenchmark } from '../../api/hooks'
import { LifeClock } from '../../components/LifeClock'
import { Benchmark } from '../../components/Benchmark'
import { IntervalBadge, StatisticalEstimateNote, SafeguardNote } from '../../components/framing'
import { PageHeader, Card, NeedsProfile, NoticeState } from '../../components/ui'
import { fmtYears } from '../../components/format'

export function LifeClockPage() {
  const { profile, estimate } = useProfile()
  const benchmark = useBenchmark(profile)
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
              <dt className="text-clock-muted">Relative risk</dt>
              <dd className="font-medium text-clock-ink" title="vs the country's average person (1.0)">
                {estimate.relative_risk.toFixed(2)}×
              </dd>
            </div>
          </dl>
          <StatisticalEstimateNote>
            Centred on the average person in {estimate.country}. This is a statistical estimate, not a
            prediction or diagnosis.
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
