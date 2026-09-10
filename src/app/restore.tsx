// Putting back what the server already holds (UX-3).
//
// The scored Profile and its Estimate live in memory (app/profile.tsx), so until this every reload
// told the reader they had never calculated anything — while their calculations sat in the database
// the whole time. This restores the newest persisted one on an authenticated load, for every surface
// at once.
//
// It never re-scores to do it. POST /api/estimate appends a history row, so rehydrating through it
// would grow "My Progress" by one identical entry per reload. The stored row already carries the
// inputs that were scored and the numbers they produced, which is everything a surface reads.

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useCalculations } from '../api/hooks'
import type { CalcRow, Estimate, Profile } from '../api/types'
import { useAuth } from './auth'
import { useProfile } from './profile'

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * `CalcRow.inputs` is `unknown`: it is whatever was submitted, by whatever version of the
 * questionnaire was live when it was submitted. Accept it only if it carries the fields the surfaces
 * dereference — one missing `age` draws a clock around "NaN", which is worse than the empty state
 * because it looks like an answer. A hand-written guard over exactly those fields on purpose: the
 * contract lives in api/types.ts and the service validates on the way in, so this is a last line,
 * not a schema.
 *
 * The accepted object is then stripped of its nulls, because a stored row is NOT shaped like the
 * profile that was submitted. `buildProfile` spreads an unanswered optional in only when it has a
 * value, so `pm25` is absent; the service stores `serde_json::to_value(&profile)` over a struct with
 * no `skip_serializing_if` (scoring.rs `Profile`, lib.rs), which writes every `None` back out as
 * `"pm25": null`. Casting that to `Profile` laundered nulls into fields the whole app tests with
 * `=== undefined`: "Where Should I Live?" read a null as a recorded measurement, and then called
 * `.toFixed(1)` on it — a blank page after every reload, for every reader who skipped the location
 * question. Dropping the keys restores the shape the surfaces were written against, and the required
 * fields above cannot be lost to it: a null never satisfied any of them.
 */
function profileFromInputs(inputs: unknown): Profile | null {
  if (!isRecord(inputs)) return null
  const p = inputs
  if (typeof p.country !== 'string' || p.country === '') return null
  if (!['age', 'pa_min', 'sleep', 'waist', 'bmi'].every((k) => Number.isFinite(p[k]))) return null
  if (p.sex !== 'M' && p.sex !== 'F') return null
  if (p.smoke !== 0 && p.smoke !== 1 && p.smoke !== 2) return null
  const answered = Object.entries(p).filter(([, v]) => v !== null)
  return Object.fromEntries(answered) as unknown as Profile
}

/** One stored row as the surfaces want it: the profile that was scored, and what it scored. */
function restoreRow(row: CalcRow): { profile: Profile; estimate: Estimate } | null {
  const profile = profileFromInputs(row.inputs)
  if (!profile) return null
  return {
    profile,
    estimate: {
      estimate_years: row.estimate_years,
      interval: [row.interval_low, row.interval_high],
      reaches_age: row.reaches_age,
      relative_risk: row.relative_risk,
      country: profile.country,
      calculation_id: row.id,
    },
  }
}

/**
 * True while a saved Life Clock is still being looked for. Defaults to false, so a component rendered
 * outside this provider behaves exactly as it did before.
 */
const RestoringContext = createContext(false)

export function useRestoring(): boolean {
  return useContext(RestoringContext)
}

/**
 * Restores the newest saved calculation into the profile context, and tells the surfaces below when
 * it is still looking. Sits inside AuthProvider (it needs the session) and inside ProfileProvider
 * (it writes what it finds) — both of which wrap the whole app.
 */
export function ProfileRestore({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const { profile, setProfile, setEstimate } = useProfile()
  const signedIn = Boolean(session)
  const calculations = useCalculations(signedIn)
  const rows = calculations.data

  // The newest row and only the newest: the service orders `created_at DESC` (db.rs
  // `list_calculations`) and so does the mock. A malformed newest row falls through to the empty
  // state rather than to the one before it — presenting an older calculation as the reader's current
  // Life Clock is a different untruth, and a quieter one.
  const restored = useMemo(() => (rows && rows.length > 0 ? restoreRow(rows[0]) : null), [rows])

  // An in-memory profile is always the fresher one — the interview has just produced it — so a
  // stored row never overwrites it. Held in a ref so installing one does not re-run this effect.
  const hasProfile = profile !== null
  const hasProfileRef = useRef(hasProfile)
  hasProfileRef.current = hasProfile

  useEffect(() => {
    if (!restored || hasProfileRef.current) return
    setProfile(restored.profile)
    setEstimate(restored.estimate)
  }, [restored, setProfile, setEstimate])

  // "Still looking" has to cover the gap between the rows arriving and the effect installing them:
  // that is one commit the reader would otherwise spend being told they have no Life Clock.
  const restoring = signedIn && (calculations.isPending || (restored !== null && !hasProfile))

  return <RestoringContext.Provider value={restoring}>{children}</RestoringContext.Provider>
}
