import { Link } from 'react-router-dom'
import { useProfile } from '../../app/profile'
import { LifeClock } from '../../components/LifeClock'
import { IntervalBadge, StatisticalEstimateNote, SafeguardNote } from '../../components/framing'
import { PageHeader, Card, NeedsProfile } from '../../components/ui'
import { fmtYears } from '../../components/format'

export function LifeClockPage() {
  const { profile, estimate } = useProfile()

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
