import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WhatIfPage } from './WhatIfPage'
import { renderWithProviders, SAMPLE_PROFILE } from '../../test/harness'

describe('<WhatIfPage/>', () => {
  it('asks for the interview when there is no profile', () => {
    renderWithProviders(<WhatIfPage />)
    expect(screen.getByRole('link', { name: /start the interview/i })).toBeInTheDocument()
  })

  it('simulates quitting smoking and reports a positive change', async () => {
    const user = userEvent.setup()
    renderWithProviders(<WhatIfPage />, { profile: SAMPLE_PROFILE })

    // SAMPLE_PROFILE smokes currently; switch the lever to "Never".
    await user.click(screen.getByRole('button', { name: 'Never' }))
    await user.click(screen.getByRole('button', { name: /see the effect/i }))

    // A positive delta (e.g. "+6.3 yr") is shown.
    expect(await screen.findByText(/\+\d+\.\d+ yr/)).toBeInTheDocument()
    // The cessation caveat note appears when reducing smoking.
    expect(await screen.findByText(/cessation benefit accrues/i)).toBeInTheDocument()
  })

  it('saves scenarios to a comparison board and marks the best', async () => {
    const user = userEvent.setup()
    renderWithProviders(<WhatIfPage />, { profile: SAMPLE_PROFILE })

    // Simulate quitting smoking, then save it to compare.
    await user.click(screen.getByRole('button', { name: 'Never' }))
    await user.click(screen.getByRole('button', { name: /see the effect/i }))
    await user.click(await screen.findByRole('button', { name: /save to compare/i }))

    expect(await screen.findByText(/compare scenarios/i)).toBeInTheDocument()
    expect(screen.getByText(/smoking → Never/i)).toBeInTheDocument()
    // A single positive scenario is the best.
    expect(screen.getByText('best')).toBeInTheDocument()
  })

  it('exposes only the modifiable levers as controls', () => {
    renderWithProviders(<WhatIfPage />, { profile: SAMPLE_PROFILE })
    expect(screen.getByRole('slider', { name: /active minutes/i })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: /sleep/i })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: /waist/i })).toBeInTheDocument()
  })
})
