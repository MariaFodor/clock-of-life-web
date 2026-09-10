// Shared test harness: renders a component inside the real providers with a fresh in-memory mock API,
// an optional signed-in session, and an optional pre-seeded profile/estimate.

import type { ReactElement, ReactNode } from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { provideClient, type ApiClient } from '../api/client'
import { createMockClient } from '../api/mockClient'
import { setToken } from '../api/token'
import { AuthProvider, SESSION_KEY } from '../app/auth'
import { ProfileProvider } from '../app/profile'
import { ProfileRestore } from '../app/restore'
import { ThemeProvider } from '../app/theme'
import type { CalcRow, Estimate, Profile } from '../api/types'

export const SAMPLE_PROFILE: Profile = {
  country: 'RO',
  age: 45,
  sex: 'F',
  smoke: 2,
  pa_min: 400,
  sleep: 7.5,
  waist: 102,
  bmi: 29.4,
  cigs_day: 15,
  diabetes: true,
  high_bp: false,
  respiratory: false,
  cvd_hx: false,
  cancer_hx: false,
  higher_educ: false,
  income: 2.5,
}

export const SAMPLE_ESTIMATE: Estimate = {
  estimate_years: 31.2,
  interval: [29.3, 33.1],
  reaches_age: 76.2,
  relative_risk: 1.28,
  country: 'RO',
  calculation_id: 'mock-abc',
}

/** The same calculation as the server stores and serves it back (db.rs `CalcRow`). */
export const SAMPLE_CALC_ROW: CalcRow = {
  id: SAMPLE_ESTIMATE.calculation_id,
  input_hash: 'abc123',
  estimate_years: SAMPLE_ESTIMATE.estimate_years,
  interval_low: SAMPLE_ESTIMATE.interval[0],
  interval_high: SAMPLE_ESTIMATE.interval[1],
  reaches_age: SAMPLE_ESTIMATE.reaches_age,
  relative_risk: SAMPLE_ESTIMATE.relative_risk,
  inputs: SAMPLE_PROFILE,
  attributions: [],
  created_at: '2026-09-09T10:00:00.000Z',
}

/** A signed-in account, described the way the test wants to see it identified. */
export interface TestSession {
  email: string
  accountId?: string
  /** The bearer token a fake client can key its per-account answers off, as the real one does. */
  token?: string
}

export const sessionToken = (email: string) => `token-${email}`
export const sessionAccountId = (email: string) => `acct-${email}`

interface Options {
  route?: string
  /** initial router location state (e.g. a notice handed over by another page) */
  routerState?: unknown
  profile?: Profile | null
  estimate?: Estimate | null
  client?: ApiClient
  /** Seed a signed-in session before the providers mount, exactly as a reload would find one. */
  session?: TestSession
}

/** Storage is the only place a session survives a reload, so that is where the harness puts one. */
function seedSession(session: TestSession | undefined) {
  const stored = session
    ? {
        accountId: session.accountId ?? sessionAccountId(session.email),
        email: session.email,
      }
    : null
  setToken(session ? (session.token ?? sessionToken(session.email)) : null)
  try {
    if (stored) localStorage.setItem(SESSION_KEY, JSON.stringify(stored))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    /* storage may be unavailable — the token alone still drives the client */
  }
}

export function renderWithProviders(ui: ReactElement, opts: Options = {}) {
  const client = opts.client ?? createMockClient()
  provideClient(client)
  seedSession(opts.session)

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[{ pathname: opts.route ?? '/', state: opts.routerState ?? null }]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <ThemeProvider>
          <ProfileProvider initialProfile={opts.profile ?? null} initialEstimate={opts.estimate ?? null}>
            <AuthProvider>
              <ProfileRestore>{children}</ProfileRestore>
            </AuthProvider>
          </ProfileProvider>
        </ThemeProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )

  return { client, queryClient, ...render(ui, { wrapper: Wrapper }) }
}
