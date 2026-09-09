// The framing rules from ADR-001 / requirements, made into components so every surface obeys them:
//   • always show the interval, never a bare number
//   • label everything a "statistical estimate", not a prediction
//   • present with care when the estimate lands at/below current age (safeguarding, A16)

import type { ReactNode } from 'react'
import type { EvidenceGrade } from '../api/types'
import { fmtYears } from './format'

/** The visible uncertainty interval — required companion to any point estimate. */
export function IntervalBadge({ low, high }: { low: number; high: number }) {
  return (
    <span
      className="inline-flex items-center rounded-full bg-clock-brandsoft px-2.5 py-1 text-xs font-medium text-clock-brand"
      title="Uncertainty interval — the plausible range around the estimate"
    >
      range {fmtYears(low)} – {fmtYears(high)}
    </span>
  )
}

/** The persistent reminder that this is a statistical estimate, not a prediction or diagnosis. */
export function StatisticalEstimateNote({ children }: { children?: ReactNode }) {
  return (
    <p className="text-xs leading-relaxed text-clock-muted">
      {children ?? 'A statistical estimate, not a prediction or diagnosis. Ranges reflect uncertainty.'}
    </p>
  )
}

/** Shown when reaches_age ≤ current age — presented with care, never alarmingly. */
export function SafeguardNote() {
  return (
    <div className="rounded-lg border border-clock-warn/30 bg-clock-warn/5 p-3 text-sm text-clock-ink">
      This estimate reflects statistical averages for people with similar answers — it is{' '}
      <strong>not a statement about you personally</strong>. If it feels worrying, that is understandable;
      consider talking it over with a clinician you trust.
    </div>
  )
}

const GRADE_STYLE: Record<EvidenceGrade, string> = {
  strong: 'bg-clock-good/10 text-clock-good',
  moderate: 'bg-clock-brand/10 text-clock-brand',
  weak: 'bg-clock-warn/10 text-clock-warn',
  na: 'bg-clock-canvas text-clock-muted',
}

const GRADE_LABEL: Record<EvidenceGrade, string> = {
  strong: 'strong evidence',
  moderate: 'moderate evidence',
  weak: 'weak evidence',
  na: 'ungraded',
}

/**
 * Shown when the PHQ-2 mood screener reads >= 3. The answer is deliberately NOT in the risk score
 * (EXP-12); asking about hopelessness and doing nothing with it would be the worst of both worlds.
 */
export function MoodSupportNote() {
  return (
    <div role="note" className="rounded-lg border border-clock-brand/30 bg-clock-brandsoft px-4 py-3 text-sm text-clock-ink">
      Your answers suggest you may have been feeling low lately. That doesn't change your estimate —
      but it matters. Talking to someone you trust or a professional can genuinely help, and if you
      are in crisis, please reach out to a local helpline now.
    </div>
  )
}

/** Evidence grade chip — every attributed factor carries its grade. */
export function EvidenceChip({ grade }: { grade: EvidenceGrade }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${GRADE_STYLE[grade]}`}>
      {GRADE_LABEL[grade]}
    </span>
  )
}
