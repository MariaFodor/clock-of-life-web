import { describe, expect, it } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WhatIfPage } from './WhatIfPage'
import { createMockClient } from '../../api/mockClient'
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

  // Every assertion here covers a fix that shipped untested and that a revert passed all 76 tests.
  it('starts the dose where the model scores it, not where the field is', () => {
    // A current smoker who never answered the dose question: stored 0, scored at the cohort mean.
    renderWithProviders(<WhatIfPage />, {
      profile: { ...SAMPLE_PROFILE, smoke: 2, cigs_day: 0 },
    })
    const dose = screen.getByRole('slider', { name: /cigarettes per day/i })
    // Seeding from the raw field showed "0" while the thumb sat at the slider's floor, and then
    // called dragging up to 5 "cutting down".
    // 13, not 12: ceil keeps the seed at or above the effective dose (12.18), so returning the
    // slider to where it started can never be priced as a reduction.
    expect(dose).toHaveValue('13')
    expect(screen.getByText(/13 \(assumed\)/)).toBeInTheDocument()
  })

  it('treats dragging the dose back to its start as no change at all', async () => {
    const user = userEvent.setup()
    renderWithProviders(<WhatIfPage />, {
      profile: { ...SAMPLE_PROFILE, smoke: 2, cigs_day: 0 },
    })
    const dose = screen.getByRole('slider', { name: /cigarettes per day/i })
    // Away, and back to the seed. The slider is integer and the imputed dose is 12.18, so the seed
    // is never exactly it — 12 priced a no-op as cutting down, 13 charged 0.1 years for it.
    fireEvent.change(dose, { target: { value: '20' } })
    fireEvent.change(dose, { target: { value: '13' } })
    await user.click(screen.getByRole('button', { name: /see the effect/i }))

    expect(await screen.findByText(/±0\.0 yr|\+0\.0 yr/)).toBeInTheDocument()
    expect(screen.queryByText(/Quitting is worth much more/i)).not.toBeInTheDocument()
  })

  it('never offers a zero dose, which the model reads as unanswered rather than as quitting', () => {
    renderWithProviders(<WhatIfPage />, { profile: SAMPLE_PROFILE })
    // min=1: the service refuses a zero dose from a smoker, because scoring it would impute the
    // cohort mean and make cutting to zero worth LESS than cutting to one.
    expect(screen.getByRole('slider', { name: /cigarettes per day/i })).toHaveAttribute('min', '1')
  })

  it('lets a very heavy smoker ask about cutting down', () => {
    // The lever bound and the profile bound disagreed at 60 vs 80, so a 75-a-day smoker had an
    // estimable profile and every lever except this one. Clamping the interview to 60 "fixed" that
    // by discarding what they told us; the lever moved to 80 instead.
    renderWithProviders(<WhatIfPage />, { profile: { ...SAMPLE_PROFILE, cigs_day: 75 } })
    const dose = screen.getByRole('slider', { name: /cigarettes per day/i })
    expect(dose).toHaveAttribute('max', '80')
    expect(dose).toHaveValue('75')
  })

  it('shows a declared dose as declared, with no assumption note', () => {
    renderWithProviders(<WhatIfPage />, { profile: SAMPLE_PROFILE })
    expect(screen.getByRole('slider', { name: /cigarettes per day/i })).toHaveValue('15')
    expect(screen.queryByText(/assumed/)).not.toBeInTheDocument()
  })

  it('groups the sleep marker so its reason is announced with its value', () => {
    renderWithProviders(<WhatIfPage />, { profile: SAMPLE_PROFILE })
    const group = screen.getByRole('group', { name: /sleep/i })
    expect(group).toHaveTextContent('7.5 h')
    expect(group).toHaveTextContent(/marker of illness/i)
  })

  it('hides the dose for a non-smoker, who has none to change', () => {
    renderWithProviders(<WhatIfPage />, { profile: { ...SAMPLE_PROFILE, smoke: 0 } })
    expect(screen.queryByRole('slider', { name: /cigarettes per day/i })).not.toBeInTheDocument()
  })

  // The page had no error branch at all until now: a refusal flipped the button back from
  // "Simulating…" and showed nothing. That is how the Sleep slider could 400 for however long
  // without anyone noticing, so the fix for that slider is only half a fix without this.
  it('shows the service\'s reason when a scenario is refused', async () => {
    const user = userEvent.setup()
    const client = createMockClient()
    client.whatif = () => Promise.reject(new Error('sleep is no longer a What-If lever'))
    renderWithProviders(<WhatIfPage />, { profile: SAMPLE_PROFILE, client })

    await user.click(screen.getByRole('button', { name: /see the effect/i }))
    expect(await screen.findByText(/no longer a What-If lever/i)).toBeInTheDocument()
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
    // The note the service returns, verbatim — including the two DOIs, because a claim the user
    // can read on screen is a claim they can go and check.
    expect(await screen.findByText(/Quitting is worth much more/i)).toBeInTheDocument()
    expect(screen.getByText(/doi\.org\/10\.1093\/aje\/kwf150/)).toBeInTheDocument()
  })
})
