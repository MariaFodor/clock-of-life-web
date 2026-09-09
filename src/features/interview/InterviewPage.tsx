import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEstimate, useSaveAnswers } from '../../api/hooks'
import { useProfile } from '../../app/profile'
import { PageHeader, Card, ErrorState } from '../../components/ui'
import { StatisticalEstimateNote } from '../../components/framing'
import {
  SECTIONS,
  DEFAULT_ANSWERS,
  buildProfile,
  answersForApi,
  isVisible,
  type Answers,
  type Question,
} from './questionnaire'

function Field({
  q,
  value,
  onChange,
}: {
  q: Question
  value: Answers[string]
  onChange: (v: Answers[string]) => void
}) {
  if (q.type === 'number') {
    return (
      <input
        type="number"
        className="field max-w-[12rem]"
        aria-label={q.prompt}
        value={value === undefined ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      />
    )
  }
  if (q.type === 'radio') {
    return (
      <div role="radiogroup" aria-label={q.prompt} className="flex flex-wrap gap-2">
        {q.options!.map((o) => {
          const selected = value === o.value
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(o.value)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                selected
                  ? 'border-clock-brand bg-clock-brandsoft text-clock-brand'
                  : 'border-clock-line bg-clock-canvas text-clock-ink hover:border-clock-brand/40'
              }`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    )
  }
  // checkboxes
  const arr = Array.isArray(value) ? value : []
  return (
    <div className="flex flex-col gap-2">
      {q.options!.map((o) => {
        const checked = arr.includes(o.value)
        return (
          <label key={o.value} className="flex items-center gap-2 text-sm text-clock-ink">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => onChange(e.target.checked ? [...arr, o.value] : arr.filter((v) => v !== o.value))}
            />
            {o.label}
          </label>
        )
      })}
    </div>
  )
}

export function InterviewPage() {
  const [answers, setAnswers] = useState<Answers>(DEFAULT_ANSWERS)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { setProfile, setEstimate } = useProfile()
  const estimate = useEstimate()
  const saveAnswers = useSaveAnswers()

  const lastEstimated = useRef<string | null>(null)
  const set = (code: string) => (v: Answers[string]) => setAnswers((prev) => ({ ...prev, [code]: v }))
  const { profile, errors } = useMemo(() => buildProfile(answers), [answers])

  const onSubmit = async () => {
    setSubmitError(null)
    if (errors.length) return
    // Every /api/estimate call persists a calculation row, so a save-only retry must not re-score
    // an unchanged profile — that would append one duplicate history row per click.
    const profileKey = JSON.stringify(profile)
    if (lastEstimated.current !== profileKey) {
      try {
        const est = await estimate.mutateAsync(profile)
        setProfile(profile)
        setEstimate(est)
        lastEstimated.current = profileKey
      } catch (e) {
        setSubmitError(e instanceof Error ? e.message : 'Could not calculate your estimate.')
        return
      }
    }
    // The estimate is ready either way; a failed answer-save must be visible, never silent
    // (REVIEW-2026-09-09 W1: it failed silently for every user).
    try {
      await saveAnswers.mutateAsync(answersForApi(answers))
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error'
      const authHint = /401|token|unauthori[sz]|expired/i.test(msg)
        ? ' Your session may have expired — sign out, sign back in, and press the button again.'
        : ''
      setSubmitError(
        `Your Life Clock was calculated, but your answers could not be saved to your profile (${msg}).${authHint} Press the button to try again, or open "My Life Clock" to continue without saving.`,
      )
      return
    }
    navigate('/')
  }

  return (
    <div>
      <PageHeader
        title="Your interview"
        subtitle="A few questions about you. You can change any answer and recalculate at any time."
      />

      <div className="space-y-5">
        {SECTIONS.map((section) => (
          <Card key={section.title}>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold text-clock-ink">{section.title}</h2>
              {section.confidence && (
                <span className="text-[11px] uppercase tracking-wide text-clock-muted">
                  confidence: {section.confidence}
                </span>
              )}
            </div>
            <p className="mb-4 text-sm italic text-clock-muted">Why we ask: {section.whyWeAsk}</p>

            <div className="space-y-5">
              {section.questions
                .filter((q) => isVisible(q, answers))
                .map((q) => (
                  <div key={q.code}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="label">{q.prompt}</span>
                      {q.unit && <span className="text-xs text-clock-muted">({q.unit})</span>}
                      {!q.scored && (
                        <span
                          className="rounded bg-clock-canvas px-1.5 py-0.5 text-[10px] text-clock-muted"
                          title="Recorded for your profile, but the v1 estimate does not use it yet."
                        >
                          not in v1 estimate
                        </span>
                      )}
                    </div>
                    <Field q={q} value={answers[q.code]} onChange={set(q.code)} />
                  </div>
                ))}
            </div>
          </Card>
        ))}
      </div>

      {errors.length > 0 && (
        <ul className="mt-5 space-y-1">
          {errors.map((e) => (
            <li key={e} className="text-sm text-clock-bad">
              • {e}
            </li>
          ))}
        </ul>
      )}
      {submitError && (
        <div className="mt-5">
          <ErrorState message={submitError} />
        </div>
      )}

      <div className="mt-6 flex items-center gap-4">
        <button
          type="button"
          className="btn-primary"
          onClick={onSubmit}
          disabled={errors.length > 0 || estimate.isPending || saveAnswers.isPending}
        >
          {estimate.isPending ? 'Calculating…' : saveAnswers.isPending ? 'Saving…' : 'Calculate my Life Clock'}
        </button>
        <StatisticalEstimateNote />
      </div>
    </div>
  )
}
