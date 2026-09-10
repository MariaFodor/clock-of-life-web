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
    expect(screen.getByRole('slider', { name: /activity per week/i })).toBeInTheDocument()
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

  // The companion to the test above, and the one that was missing: nothing in the suite could tell
  // "the round-trip is a no-op" apart from "the dose lever does nothing at all", so a guard that
  // dropped EVERY dose change passed 85 tests while the slider was inert for every undeclared
  // smoker — the exact people this page added it for.
  it('still sends a real dose change from an undeclared smoker', async () => {
    const user = userEvent.setup()
    renderWithProviders(<WhatIfPage />, {
      profile: { ...SAMPLE_PROFILE, smoke: 2, cigs_day: 0 },
    })
    fireEvent.change(screen.getByRole('slider', { name: /cigarettes per day/i }),
                     { target: { value: '5' } })
    await user.click(screen.getByRole('button', { name: /see the effect/i }))

    expect(await screen.findByText(/\+\d+\.\d+ yr/)).toBeInTheDocument()
    expect(await screen.findByText(/Quitting is worth much more/i)).toBeInTheDocument()
  })

  it('shows a resuming smoker the dose the model will actually use', () => {
    // A former smoker who switches to Current is scored at the smokers' mean from that moment.
    // Seeding off the PROFILE's status showed them a dose of 0 while the model used 12.18.
    renderWithProviders(<WhatIfPage />, { profile: { ...SAMPLE_PROFILE, smoke: 1, cigs_day: 0 } })
    expect(screen.queryByRole('slider', { name: /cigarettes per day/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Current' }))
    const dose = screen.getByRole('slider', { name: /cigarettes per day/i })
    expect(dose).toHaveValue('13')
    expect(screen.getByText(/13 \(assumed\)/)).toBeInTheDocument()
  })

  // The fifth entry point for the same defect, and the one that showed the precondition was never
  // "the dose is imputed" but "the integer seed is not the effective dose". A DECLARED 12.5 gets
  // there too — the interview's number field takes decimals — and it has no "(assumed)" tag to warn
  // anyone, so the row silently disagrees with the model before the user touches anything.
  it('prices a round-trip on a fractional declared dose as no change either', async () => {
    const user = userEvent.setup()
    renderWithProviders(<WhatIfPage />, { profile: { ...SAMPLE_PROFILE, smoke: 2, cigs_day: 12.5 } })
    const dose = screen.getByRole('slider', { name: /cigarettes per day/i })
    expect(dose).toHaveValue('13')
    // Not "(assumed)": they did tell us, we only rounded the control.
    expect(screen.queryByText(/assumed/)).not.toBeInTheDocument()

    fireEvent.change(dose, { target: { value: '20' } })
    fireEvent.change(dose, { target: { value: '13' } })
    await user.click(screen.getByRole('button', { name: /see the effect/i }))
    expect(await screen.findByText(/±0\.0 yr|\+0\.0 yr/)).toBeInTheDocument()

    // And a real cut from that same profile is still priced.
    fireEvent.change(dose, { target: { value: '5' } })
    await user.click(screen.getByRole('button', { name: /see the effect/i }))
    expect(await screen.findByText(/\+\d+\.\d+ yr/)).toBeInTheDocument()
  })

  it('scores someone taking up smoking at the dose the model will use', () => {
    // A never-smoker clicking Current reaches the imputed seed by the same door as the former
    // smoker, and had no test of its own.
    renderWithProviders(<WhatIfPage />, { profile: { ...SAMPLE_PROFILE, smoke: 0, cigs_day: 0 } })
    fireEvent.click(screen.getByRole('button', { name: 'Current' }))
    expect(screen.getByRole('slider', { name: /cigarettes per day/i })).toHaveValue('13')
    expect(screen.getByText(/13 \(assumed\)/)).toBeInTheDocument()
  })

  // The sixth entry point for this branch's defect class, and the one that could assert the
  // opposite of the truth: the board paired the CURRENT slider text with the LAST run's number.
  it('saves the scenario that was priced, not wherever the sliders now sit', async () => {
    const user = userEvent.setup()
    renderWithProviders(<WhatIfPage />, { profile: SAMPLE_PROFILE })
    const dose = screen.getByRole('slider', { name: /cigarettes per day/i })

    // Price a real cut, then move the slider the OTHER WAY without re-running, then save.
    fireEvent.change(dose, { target: { value: '5' } })
    await user.click(screen.getByRole('button', { name: /see the effect/i }))
    const priced = (await screen.findByText(/\+\d+\.\d+ yr/)).textContent
    fireEvent.change(dose, { target: { value: '20' } })
    await user.click(await screen.findByRole('button', { name: /save to compare/i }))

    // The row must describe the 5 that was priced. Labelling it "20 cigarettes/day" next to a gain
    // told a 15-a-day smoker that smoking MORE was their best scenario.
    const row = screen.getByText(/cigarettes\/day/).closest('tr') ?? screen.getByText(/cigarettes\/day/)
    expect(row).toHaveTextContent('5 cigarettes/day')
    expect(row).not.toHaveTextContent('20 cigarettes/day')
    expect(row).toHaveTextContent(priced!.trim())
  })

  it('says so when the sliders have moved on from the result on screen', async () => {
    const user = userEvent.setup()
    renderWithProviders(<WhatIfPage />, { profile: SAMPLE_PROFILE })
    const dose = screen.getByRole('slider', { name: /cigarettes per day/i })
    fireEvent.change(dose, { target: { value: '5' } })
    await user.click(screen.getByRole('button', { name: /see the effect/i }))
    await screen.findByText(/\+\d+\.\d+ yr/)
    expect(screen.queryByText(/not the one on the sliders now/i)).not.toBeInTheDocument()

    fireEvent.change(dose, { target: { value: '20' } })
    expect(await screen.findByText(/not the one on the sliders now/i)).toBeInTheDocument()

    // Back to what was priced: no longer stale.
    fireEvent.change(dose, { target: { value: '5' } })
    expect(screen.queryByText(/not the one on the sliders now/i)).not.toBeInTheDocument()
  })

  it('keeps saying "(assumed)" for as long as the number is still ours', async () => {
    renderWithProviders(<WhatIfPage />, {
      profile: { ...SAMPLE_PROFILE, smoke: 2, cigs_day: 0 },
    })
    const dose = screen.getByRole('slider', { name: /cigarettes per day/i })
    expect(screen.getByText(/13 \(assumed\)/)).toBeInTheDocument()
    // Their number now: no longer ours to disclaim.
    fireEvent.change(dose, { target: { value: '20' } })
    expect(screen.queryByText(/assumed/)).not.toBeInTheDocument()
    // Back on our seed: it is ours again, and the row has to keep saying so. This asked whether the
    // user had TOUCHED the slider, which is not the same question.
    fireEvent.change(dose, { target: { value: '13' } })
    expect(screen.getByText(/13 \(assumed\)/)).toBeInTheDocument()
  })

  it('never labels a saved scenario as both quitting and still smoking', async () => {
    const user = userEvent.setup()
    renderWithProviders(<WhatIfPage />, { profile: SAMPLE_PROFILE })
    fireEvent.change(screen.getByRole('slider', { name: /cigarettes per day/i }),
                     { target: { value: '5' } })
    await user.click(screen.getByRole('button', { name: 'Never' }))
    await user.click(screen.getByRole('button', { name: /see the effect/i }))
    await screen.findByText(/\+\d+\.\d+ yr/)
    await user.click(await screen.findByRole('button', { name: /save to compare/i }))

    expect(screen.getByText(/smoking → Never/i)).toBeInTheDocument()
    expect(screen.queryByText(/cigarettes\/day/)).not.toBeInTheDocument()
  })

  // The "best" badge is the one claim on this board that carries the round-7 harm — it is what
  // turned a mislabelled row into "smoking more is your best option". A single token (max for min,
  // > for >=) reproduces that, and nothing tested it: the only board test saved one scenario, so
  // ranking across rows was entirely unpinned.
  it('badges the better of two saved scenarios, and only that one', async () => {
    const user = userEvent.setup()
    renderWithProviders(<WhatIfPage />, { profile: SAMPLE_PROFILE })
    const dose = screen.getByRole('slider', { name: /cigarettes per day/i })

    const priceAndSave = async (v: string) => {
      fireEvent.change(dose, { target: { value: v } })
      await user.click(screen.getByRole('button', { name: /see the effect/i }))
      await screen.findByRole('button', { name: /save to compare/i })
      await user.click(screen.getByRole('button', { name: /save to compare/i }))
    }
    await priceAndSave('5')   // a real cut: a gain
    await priceAndSave('30')  // smoking more: a loss

    const rowOf = (text: RegExp) => screen.getByText(text).closest('tr')!
    expect(rowOf(/^5 cigarettes\/day$/)).toHaveTextContent('best')
    expect(rowOf(/^30 cigarettes\/day$/)).not.toHaveTextContent('best')
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

  // UX-4: the interview asks for days and minutes, and this page then asked for MET-minutes with no
  // bridge — a unit the reader met for the first time at the moment they were asked to move it.
  describe('the activity lever in a reader s units', () => {
    it('names the lever plainly and defines its unit once, under the label', () => {
      renderWithProviders(<WhatIfPage />, { profile: SAMPLE_PROFILE })
      expect(screen.getByRole('slider', { name: /activity per week/i })).toBeInTheDocument()
      expect(screen.getByText(/brisk walking is about 4 per minute/i)).toBeInTheDocument()
    })

    it('shows the model s number and what it is worth in walking', () => {
      renderWithProviders(<WhatIfPage />, { profile: SAMPLE_PROFILE })
      // 400 MET-minutes ÷ 4 per minute = 100 minutes of brisk walking.
      expect(screen.getByText(/400 MET-minutes/))
        .toHaveTextContent(/roughly 100 minutes of brisk walking/)
    })

    it('keeps the value the model scores while the words change with it', () => {
      renderWithProviders(<WhatIfPage />, { profile: SAMPLE_PROFILE })
      const activity = screen.getByRole('slider', { name: /activity per week/i })
      fireEvent.change(activity, { target: { value: '1000' } })
      // The number sent to the service is untouched — converting it here would price a scenario
      // the reader never asked for.
      expect(activity).toHaveValue('1000')
      expect(screen.getByText(/1000 MET-minutes/))
        .toHaveTextContent(/roughly 250 minutes of brisk walking/)
    })

    it('rounds the walking equivalent coarsely, because it is a bridge and not a measurement', () => {
      renderWithProviders(<WhatIfPage />, { profile: { ...SAMPLE_PROFILE, pa_min: 444 } })
      // 444 ÷ 4 = 111 minutes, shown as 110.
      expect(screen.getByText(/444 MET-minutes/))
        .toHaveTextContent(/roughly 110 minutes of brisk walking/)
    })

    it('drops the bridge when there is no walking to describe', () => {
      renderWithProviders(<WhatIfPage />, { profile: { ...SAMPLE_PROFILE, pa_min: 0 } })
      expect(screen.getByText('0 MET-minutes')).toBeInTheDocument()
      expect(screen.queryByText(/minutes of brisk walking/)).toBeNull()
    })
  })

  // UX-4: the row's three numbers were rounded independently, so they could contradict each other
  // in front of the reader: "now 40.7 / change +0.1 / changed 40.7".
  describe('a result row that cannot argue with itself', () => {
    /** A client that answers every scenario with one fixed result, contradictions included. */
    const answering = (result: { current_years: number; scenario_years: number; delta_years: number }) => {
      const client = createMockClient()
      client.whatif = async () => result
      return client
    }
    const seeTheEffect = async () => {
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: /see the effect/i }))
    }

    it('never prints a change the two years beside it do not support', async () => {
      renderWithProviders(<WhatIfPage />, {
        profile: SAMPLE_PROFILE,
        // What the wire can actually carry for a scenario that moved 40.68 → 40.74. The service
        // rounds current, scenario and delta each on its own, so the two endpoints arrive equal
        // while the delta field still claims a tenth.
        client: answering({ current_years: 40.7, scenario_years: 40.7, delta_years: 0.1 }),
      })
      await seeTheEffect()
      // Both endpoints show 40.7, and 40.7 to 40.7 is not "+0.1 yr" to anyone who can subtract.
      expect(await screen.findByText('±0.0 yr')).toBeInTheDocument()
      expect(screen.queryByText('+0.1 yr')).toBeNull()
      expect(screen.getAllByText('40.7 yr')).toHaveLength(2)
      // And it is not hedged in words either. Saying "it moved, but by less than 0.1 yr" would
      // mean believing the delta field over both endpoints, and this payload is exactly what a
      // scenario that moved NOTHING also looks like once the service has rounded it. The client
      // cannot tell the two apart, so it does not pretend to.
      expect(screen.queryByText(/less than 0\.1/i)).toBeNull()
    })

    it('still says nothing changed when nothing did', async () => {
      renderWithProviders(<WhatIfPage />, {
        profile: SAMPLE_PROFILE,
        client: answering({ current_years: 40.7, scenario_years: 40.7, delta_years: 0 }),
      })
      await seeTheEffect()
      expect(await screen.findByText('±0.0 yr')).toBeInTheDocument()
      expect(screen.queryByText(/less than 0\.1/i)).toBeNull()
    })

    it('derives the change from the years it prints, not from the answer s own rounding', async () => {
      renderWithProviders(<WhatIfPage />, {
        profile: SAMPLE_PROFILE,
        client: answering({ current_years: 40.0, scenario_years: 41.0, delta_years: 0.94 }),
      })
      await seeTheEffect()
      // 41.0 − 40.0 is what the row shows, so it is what the row must say.
      expect(await screen.findByText('+1.0 yr')).toBeInTheDocument()
      expect(screen.queryByText('+0.9 yr')).toBeNull()
    })

    // The card was fixed to derive its change from the two years it prints; the saved rows and the
    // "best" badge kept reading the delta field. That put two contradictory descriptions of ONE
    // scenario on screen at the same time, a few centimetres apart.
    it('gives the card, the saved row and the badge one answer for one scenario', async () => {
      const user = userEvent.setup()
      renderWithProviders(<WhatIfPage />, {
        profile: SAMPLE_PROFILE,
        // Endpoints a tenth apart, with a delta that rounded the other way — reachable, because
        // the service rounds all three fields independently.
        client: answering({ current_years: 40.0, scenario_years: 40.1, delta_years: 0.0 }),
      })
      await user.click(screen.getByRole('button', { name: 'Never' }))
      await user.click(screen.getByRole('button', { name: /see the effect/i }))
      await user.click(await screen.findByRole('button', { name: /save to compare/i }))

      // The card said "+0.1 yr" and the saved row said "±0.0 yr" about the same saved scenario.
      expect(screen.getAllByText('+0.1 yr')).toHaveLength(2)
      expect(screen.queryByText('±0.0 yr')).toBeNull()
      // The badge ranked on the delta field, which is 0.0 here — so the only gain on the board,
      // shown to the reader as "+0.1 yr", went unbadged by a rule they could not see.
      expect(screen.getByText(/smoking → Never/i).closest('tr')).toHaveTextContent('best')
    })
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
