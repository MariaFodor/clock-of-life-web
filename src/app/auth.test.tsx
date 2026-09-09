// Logout must wipe per-account client state: the in-memory profile/estimate (and the query cache),
// so the next sign-in on a shared machine can never see the previous user's data (REVIEW-2026-09-09 W2).
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, SAMPLE_ESTIMATE, SAMPLE_PROFILE } from '../test/harness'
import { useAuth } from './auth'
import { useProfile } from './profile'

function Probe() {
  const { logout } = useAuth()
  const { profile, estimate } = useProfile()
  return (
    <div>
      <span>{profile ? `age:${profile.age}` : 'no-profile'}</span>
      <span>{estimate ? `years:${estimate.estimate_years}` : 'no-estimate'}</span>
      <button type="button" onClick={logout}>
        sign out
      </button>
    </div>
  )
}

describe('logout', () => {
  it('resets the in-memory profile and estimate', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Probe />, { profile: SAMPLE_PROFILE, estimate: SAMPLE_ESTIMATE })

    expect(screen.getByText('age:45')).toBeInTheDocument()
    expect(screen.getByText('years:31.2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /sign out/i }))

    expect(screen.getByText('no-profile')).toBeInTheDocument()
    expect(screen.getByText('no-estimate')).toBeInTheDocument()
  })
})
