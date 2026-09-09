// Shared test harness: renders a component inside the real providers with a fresh in-memory mock API,
// an authenticated session, and an optional pre-seeded profile/estimate.

import type { ReactElement, ReactNode } from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { provideClient, type ApiClient } from '../api/client'
import { createMockClient } from '../api/mockClient'
import { AuthProvider } from '../app/auth'
import { ProfileProvider } from '../app/profile'
import { ThemeProvider } from '../app/theme'
import type { Estimate, Profile } from '../api/types'

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

interface Options {
  route?: string
  profile?: Profile | null
  estimate?: Estimate | null
  client?: ApiClient
}

export function renderWithProviders(ui: ReactElement, opts: Options = {}) {
  const client = opts.client ?? createMockClient()
  provideClient(client)

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[opts.route ?? '/']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <ThemeProvider>
          <ProfileProvider initialProfile={opts.profile ?? null} initialEstimate={opts.estimate ?? null}>
            <AuthProvider>{children}</AuthProvider>
          </ProfileProvider>
        </ThemeProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )

  return { client, queryClient, ...render(ui, { wrapper: Wrapper }) }
}
