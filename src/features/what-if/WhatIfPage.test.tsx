import { describe, expect, it } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
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
    expect(screen.getByRole('slider', { name: /waist/i })).toBeInTheDocument()
    // SAMPLE_PROFILE smokes, so the dose is a lever for this person.
    expect(screen.getByRole('slider', { name: /cigarettes per day/i })).toBeInTheDocument()
  })

  // This test asserted a Sleep slider existed until the model demoted long sleep to a marker and
  // the service began refusing the change with a 400. The page kept offering it, and nothing here
  // noticed, because the mock client honoured what the real backend rejects.
  it('offers no sleep control, but still shows sleep and says why', () => {
    renderWithProviders(<WhatIfPage />, { profile: SAMPLE_PROFILE })
    expect(screen.queryByRole('slider', { name: /sleep/i })).not.toBeInTheDocument()
    expect(screen.getByText(/7\.5 h/)).toBeInTheDocument()
    expect(screen.getByText(/marker of illness rather than a cause/i)).toBeInTheDocument()
  })

  it('hides the dose for a non-smoker, who has none to change', () => {
    renderWithProviders(<WhatIfPage />, { profile: { ...SAMPLE_PROFILE, smoke: 0 } })
    expect(screen.queryByRole('slider', { name: /cigarettes per day/i })).not.toBeInTheDocument()
  })

  it('prices cutting down below quitting, and says cutting down is not quitting', async () => {
    const user = userEvent.setup()
    renderWithProviders(<WhatIfPage />, { profile: SAMPLE_PROFILE })

    // 15 a day down to 5: a real gain, with the caveat attached.
    // fireEvent, not user.clear: clear() is for text inputs and throws on a range.
    fireEvent.change(screen.getByRole('slider', { name: /cigarettes per day/i }),
                     { target: { value: '5' } })
    await user.click(screen.getByRole('button', { name: /see the effect/i }))

    expect(await screen.findByText(/\+\d+\.\d+ yr/)).toBeInTheDocument()
    expect(await screen.findByText(/Quitting is worth more/i)).toBeInTheDocument()
  })
})
