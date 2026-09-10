// Small presentational primitives reused across surfaces. Deliberately tiny — no heavy component kit.

import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useRestoring } from '../app/restore'

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold text-clock-ink">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-clock-muted">{subtitle}</p>}
    </header>
  )
}

export function Card({
  children,
  className = '',
  testId,
}: {
  children: ReactNode
  className?: string
  testId?: string
}) {
  return (
    <section className={`card p-5 ${className}`} data-testid={testId}>
      {children}
    </section>
  )
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 py-8 text-sm text-clock-muted">
      <span className="h-3 w-3 animate-pulse rounded-full bg-clock-brand" />
      {label}
    </div>
  )
}

/** A neutral, non-alarming notice (something partially succeeded) — not an error banner. */
export function NoticeState({ message }: { message: string }) {
  return (
    <div role="status" aria-live="polite" className="rounded-lg border border-clock-line bg-clock-canvas px-4 py-3 text-sm text-clock-ink">
      {message}
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-lg border border-clock-bad/30 bg-clock-bad/5 p-4 text-sm text-clock-ink">
      Something went wrong: {message}
    </div>
  )
}

/** Shown on any surface reached before the interview has produced a profile. */
export function NeedsProfile() {
  // A saved Life Clock takes a moment to arrive. Saying "you haven't calculated one" while it is
  // still on its way is the reload bug itself (UX-3) — so every surface waits here, once, rather
  // than each remembering to.
  const restoring = useRestoring()
  if (restoring) return <Loading label="Looking for your saved Life Clock…" />
  return (
    <Card>
      <p className="text-sm text-clock-ink">
        You haven’t calculated your Life Clock yet.
      </p>
      <Link to="/interview" className="btn-primary mt-4">
        Start the interview
      </Link>
    </Card>
  )
}
