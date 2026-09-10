import { describe, expect, it } from 'vitest'
import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useLocation } from 'react-router-dom'
import { InterviewPage } from './InterviewPage'
import { AppLayout } from '../../app/AppLayout'
import { renderWithProviders } from '../../test/harness'
import { createMockClient } from '../../api/mockClient'
import { queryKeys } from '../../api/hooks'
import type { AnswerRow, Estimate, Profile } from '../../api/types'

function InterviewUnderRouter() {
  return (
    <Routes>
      <Route path="/interview" element={<InterviewPage />} />
      <Route path="/" element={<div>LIFE CLOCK HOME</div>} />
    </Routes>
  )
}

describe('<InterviewPage/>', () => {
  it('renders the sectioned questionnaire with "why we ask"', () => {
    renderWithProviders(<InterviewUnderRouter />, { route: '/interview' })
    expect(screen.getByText('About you')).toBeInTheDocument()
    expect(screen.getByText('Smoking')).toBeInTheDocument()
    expect(screen.getAllByText(/why we ask/i).length).toBeGreaterThan(1)
  })

  it('flags an out-of-range age and disables submit', async () => {
    const user = userEvent.setup()
    renderWithProviders(<InterviewUnderRouter />, { route: '/interview' })

    const age = screen.getByLabelText('What is your age?')
    await user.clear(age)
    await user.type(age, '5')

    expect(await screen.findByText(/age must be between 18 and 110/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /calculate my life clock/i })).toBeDisabled()
  })

  it('will not calculate until it knows which country, and says why', async () => {
    const user = userEvent.setup()
    renderWithProviders(<InterviewUnderRouter />, { route: '/interview' })

    // Blocked, and the reason is on screen: without a country the estimate would count down from
    // somebody else's national death rates. It used to send `country: 'RO'` for everyone instead.
    const button = screen.getByRole('button', { name: /calculate my life clock/i })
    expect(button).toBeDisabled()
    expect(await screen.findByText(/would be about somewhere else/i)).toBeInTheDocument()

    await user.selectOptions(await screen.findByLabelText(/which country do you live in/i), 'DE')
    expect(screen.getByRole('button', { name: /calculate my life clock/i })).toBeEnabled()
  })

  it('calculates and navigates to the Life Clock on submit', async () => {
    const user = userEvent.setup()
    renderWithProviders(<InterviewUnderRouter />, { route: '/interview' })

    await user.selectOptions(await screen.findByLabelText(/which country do you live in/i), 'RO')
    await user.click(screen.getByRole('button', { name: /calculate my life clock/i }))
    expect(await screen.findByText('LIFE CLOCK HOME')).toBeInTheDocument()
  })

  it('reveals the conditional quit-year question only for former smokers', async () => {
    const user = userEvent.setup()
    renderWithProviders(<InterviewUnderRouter />, { route: '/interview' })

    expect(screen.queryByText(/in what year did you quit/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: "I used to, but I've quit" }))
    expect(await screen.findByText(/in what year did you quit/i)).toBeInTheDocument()
  })
})

describe('LEV-04 additions', () => {
  it('renders the PSS-4 and PHQ-2 batteries in full', () => {
    renderWithProviders(<InterviewUnderRouter />, { route: '/interview' })
    expect(screen.getByText(/felt unable to control the important things/i)).toBeInTheDocument()
    expect(screen.getByText(/confident about your ability to handle your problems/i)).toBeInTheDocument()
    expect(screen.getByText(/things were going your way/i)).toBeInTheDocument()
    expect(screen.getByText(/piling up so high/i)).toBeInTheDocument()
    expect(screen.getByText(/little interest or pleasure/i)).toBeInTheDocument()
    expect(screen.getByText(/down, depressed, or hopeless/i)).toBeInTheDocument()
  })

  it('shows the support note when the PHQ-2 screener reads high', async () => {
    const user = userEvent.setup()
    renderWithProviders(<InterviewUnderRouter />, { route: '/interview' })
    expect(screen.queryByText(/feeling low lately/i)).not.toBeInTheDocument()
    // Answer both mood items "More than half the days" (2 + 2 = 4 >= 3).
    const mood = screen.getByText(/little interest or pleasure/i).parentElement!
    await user.click(within(mood).getByRole('radio', { name: 'More than half the days' }))
    const mood2 = screen.getByText(/down, depressed, or hopeless/i).parentElement!
    await user.click(within(mood2).getByRole('radio', { name: 'More than half the days' }))
    expect(await screen.findByText(/feeling low lately/i)).toBeInTheDocument()
  })

  it('asks which country FIRST, from the model\'s own list', async () => {
    renderWithProviders(<InterviewUnderRouter />, { route: '/interview' })
    const picker = await screen.findByLabelText(/which country do you live in/i)
    expect(picker).toBeInTheDocument()
    // The options are the countries the model can SCORE, so the picker cannot offer one that will be
    // refused at the end. Until this shipped there was no country question at all and every profile
    // was sent as RO.
    expect(within(picker as HTMLSelectElement).getByRole('option', { name: 'Romania' })).toBeInTheDocument()
    expect(within(picker as HTMLSelectElement).getByRole('option', { name: 'Germany' })).toBeInTheDocument()
  })

  it('refuses to offer a city until a country is chosen', async () => {
    renderWithProviders(<InterviewUnderRouter />, { route: '/interview' })
    // The city list is a list of places IN a country. Offering it unfiltered is how the relocate
    // surface came to show a German reader seven Romanian cities.
    expect(await screen.findByText(/choose your country first/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/which city or town/i)).not.toBeInTheDocument()
  })

  it('offers only that country\'s measured settlements once one is chosen', async () => {
    const user = userEvent.setup()
    renderWithProviders(<InterviewUnderRouter />, { route: '/interview' })
    const picker = await screen.findByLabelText(/which country do you live in/i)
    await user.selectOptions(picker, 'RO')
    const cities = await screen.findByLabelText(/which city or town/i)
    const options = within(cities as HTMLSelectElement).getAllByRole('option')
    // Every option is a real measured settlement, offered by name (UX-6): picking where you live is
    // not a measurement comparison, and the reading is still on the page — see the test below.
    expect(options.length).toBeGreaterThan(10)
    expect(within(cities as HTMLSelectElement).getByRole('option', { name: 'Bucuresti' })).toBeInTheDocument()
    expect(options.some((o) => /µg\/m³/.test(o.textContent ?? ''))).toBe(false)
  })

  // The provenance is not dropped, it is moved: a value with no year is indistinguishable from an
  // invented one, so the line under the select still carries the reading, the year, and what the
  // greenness figure actually refers to.
  it('keeps the measurement story in words under the select', async () => {
    const user = userEvent.setup()
    renderWithProviders(<InterviewUnderRouter />, { route: '/interview' })
    await user.selectOptions(await screen.findByLabelText(/which country do you live in/i), 'RO')
    await user.selectOptions(await screen.findByLabelText(/which city or town/i), 'Bucuresti')

    const story = await screen.findByText(/air measured in Bucuresti in 20\d\d/i)
    expect(story).toHaveTextContent(/µg\/m³/)
    expect(story).toHaveTextContent(/national average/i)
  })
})

describe('LEV-04 failure paths', () => {
  it('carries a home-location failure to the Life Clock instead of blocking or vanishing', async () => {
    const user = userEvent.setup()
    const client = createMockClient()
    client.setHomeLocation = async () => {
      throw new Error('service unavailable')
    }
    // The probe renders whatever notice the interview hands over, so this test fails if the
    // hand-off regresses (a bare "did we navigate?" assertion would not — the seam has broken twice).
    const Probe = () => {
      const notice = (useLocation().state as { notice?: string } | null)?.notice
      return <div>{notice ?? 'LIFE CLOCK HOME'}</div>
    }
    renderWithProviders(
      <Routes>
        <Route path="/interview" element={<InterviewPage />} />
        <Route path="/" element={<Probe />} />
      </Routes>,
      { route: '/interview', client },
    )

    await user.selectOptions(await screen.findByLabelText(/which country do you live in/i), 'RO')
    const cities = await screen.findByLabelText(/which city or town/i)
    // A real WHO settlement, not the invented "Cluj-Napoca" row this test used to pick.
    await user.selectOptions(cities, 'Bucuresti')
    await user.click(screen.getByRole('button', { name: /calculate my life clock/i }))

    // The estimate still lands (the ENV term already reached it) — the failure must not trap the
    // user — and the honest message travels with them instead of vanishing.
    expect(await screen.findByText(/could not record Bucuresti as your home location/i)).toBeInTheDocument()
  })

  it('explains itself when the location list cannot be loaded', async () => {
    const client = createMockClient()
    const user = userEvent.setup()
    client.getPlaces = async () => {
      throw new Error('offline')
    }
    renderWithProviders(<InterviewUnderRouter />, { route: '/interview', client })
    const picker = await screen.findByLabelText(/which country do you live in/i)
    await user.selectOptions(picker, 'RO')
    // 152 of the 237 countries have no measurement since 2020, so this path is a fact about the data
    // as often as it is a fault — and it says which, rather than reading as a broken app.
    expect(await screen.findByText(/has had its air measured since 2020/i)).toBeInTheDocument()
    // and it never blocks the estimate
    expect(screen.getByRole('button', { name: /calculate my life clock/i })).toBeEnabled()
  })
})

// UX-3: the answers are on the server (GET /api/answers), so returning to the interview must not
// mean answering all 25 questions again to change one of them.
describe('starting from the answers already saved', () => {
  const SESSION = { email: 'a@example.com' }

  const savedRow = (question_code: string, value: unknown): AnswerRow => ({
    question_code,
    question_version: 1,
    value,
    created_at: '2026-09-09T10:00:00.000Z',
  })

  function clientWithSaved(rows: AnswerRow[]) {
    const client = createMockClient()
    client.getAnswers = async () => rows
    return client
  }

  it('prefills the saved answers, objects included, and leaves the rest at their defaults', async () => {
    const client = clientWithSaved([
      savedRow('Q1_age', 61),
      savedRow('Q2_sex', 'M'),
      savedRow('Q5_smoking', 'former'),
      savedRow('Q0_country', { iso2: 'DE', iso3: 'DEU', name: 'Germany' }),
      savedRow('Q23_location', {
        name: 'Berlin',
        country: 'DE',
        pm25: 11.32,
        pm25_year: 2024,
        ndvi_basis: 'country',
      }),
    ])
    renderWithProviders(<InterviewUnderRouter />, { route: '/interview', client, session: SESSION })

    expect(await screen.findByLabelText('What is your age?')).toHaveValue(61)
    const sex = screen.getByRole('radiogroup', { name: 'What is your sex?' })
    expect(within(sex).getByRole('radio', { name: 'Male' })).toBeChecked()
    expect(within(sex).getByRole('radio', { name: 'Female' })).not.toBeChecked()

    // A restored answer drives the conditional questions too, not just the field it belongs to.
    expect(screen.getByText(/in what year did you quit/i)).toBeInTheDocument()

    // The two object answers: the country the estimate is counted from, and the city whose air
    // reading was captured when it was chosen.
    expect(await screen.findByLabelText(/which country do you live in/i)).toHaveValue('DE')
    expect(await screen.findByLabelText(/which city or town/i)).toHaveValue('Berlin')

    // Never saved, so still the default rather than a blank or a guess.
    expect(screen.getByLabelText(/waist measurement/i)).toHaveValue(88)
    // Height and weight have no seeded question row at all yet, so they stay at their defaults too.
    expect(screen.getByLabelText(/how tall are you/i)).toHaveValue(170)
  })

  it('drops a saved answer the questionnaire no longer has, back to that question’s default', async () => {
    const client = clientWithSaved([
      savedRow('Q1_age', 61),
      savedRow('Q11_sleep', 'nine-ish'), // no longer one of the options
      savedRow('Q19_stress', [1, 2]), // the battery has four items, not two
      savedRow('Q97_retired', 'anything'), // no longer a question at all
    ])
    renderWithProviders(<InterviewUnderRouter />, { route: '/interview', client, session: SESSION })

    // The interview still renders — a changed questionnaire degrades to defaults, never a crash.
    expect(await screen.findByLabelText('What is your age?')).toHaveValue(61)
    const sleep = screen.getByRole('radiogroup', {
      name: 'On a typical night, how many hours do you sleep?',
    })
    expect(within(sleep).getByRole('radio', { name: '7–8' })).toBeChecked()
    // A value the field cannot show as chosen must not survive to be scored behind the reader's back.
    expect(within(sleep).getAllByRole('radio').filter((r) => r.getAttribute('aria-checked') === 'true')).toHaveLength(1)
  })

  it('waits for the saved answers instead of showing the standard ones first', async () => {
    let deliver: (rows: AnswerRow[]) => void = () => {}
    const client = createMockClient()
    client.getAnswers = () =>
      new Promise<AnswerRow[]>((resolve) => {
        deliver = resolve
      })
    renderWithProviders(<InterviewUnderRouter />, { route: '/interview', client, session: SESSION })

    // A prefill applied after mount would land on top of whatever the reader had started typing.
    expect(screen.getByRole('status')).toHaveTextContent(/loading your saved answers/i)
    expect(screen.queryByLabelText('What is your age?')).not.toBeInTheDocument()

    deliver([savedRow('Q1_age', 61)])
    expect(await screen.findByLabelText('What is your age?')).toHaveValue(61)
  })

  it('says nothing extra to someone answering for the first time', async () => {
    renderWithProviders(<InterviewUnderRouter />, {
      route: '/interview',
      client: clientWithSaved([]),
      session: SESSION,
    })

    expect(await screen.findByLabelText('What is your age?')).toHaveValue(45)
    expect(screen.queryByText(/could not load the answers you saved/i)).not.toBeInTheDocument()
  })

  it('says so when the saved answers cannot be loaded, rather than passing defaults off as yours', async () => {
    const client = createMockClient()
    client.getAnswers = async () => {
      throw new Error('offline')
    }
    renderWithProviders(<InterviewUnderRouter />, { route: '/interview', client, session: SESSION })

    // Silence here would invite a recalculation from the standard answers — a new history row, with
    // a different number, that the reader never chose.
    expect(await screen.findByText(/could not load the answers you saved/i)).toBeInTheDocument()
    expect(screen.getByLabelText('What is your age?')).toHaveValue(45)
  })

  // The notice above describes the FIELDS, which were decided once, at mount. It used to be rendered
  // from the live query state instead, so a later background refetch moved it while they stood still.
  it('keeps that notice up when a later refetch succeeds, because the fields have not moved', async () => {
    let calls = 0
    const client = createMockClient()
    client.getAnswers = async () => {
      calls += 1
      if (calls === 1) throw new Error('offline')
      return [savedRow('Q1_age', 61)]
    }
    const { queryClient } = renderWithProviders(<InterviewUnderRouter />, {
      route: '/interview',
      client,
      session: SESSION,
    })

    expect(await screen.findByText(/could not load the answers you saved/i)).toBeInTheDocument()
    expect(screen.getByLabelText('What is your age?')).toHaveValue(45)

    await act(async () => {
      await queryClient.refetchQueries({ queryKey: queryKeys.answers })
    })

    // The prefill is not re-applied after mount, so the age is still the standard 45 and not the
    // saved 61 — and a reader looking at 45 with no notice would calculate from answers that were
    // never theirs, believing they were.
    expect(screen.getByLabelText('What is your age?')).toHaveValue(45)
    expect(screen.getByText(/could not load the answers you saved/i)).toBeInTheDocument()
  })

  it('never raises that notice over answers that did load', async () => {
    let calls = 0
    const client = createMockClient()
    client.getAnswers = async () => {
      calls += 1
      if (calls === 1) return [savedRow('Q1_age', 61)]
      throw new Error('offline')
    }
    const { queryClient } = renderWithProviders(<InterviewUnderRouter />, {
      route: '/interview',
      client,
      session: SESSION,
    })

    expect(await screen.findByLabelText('What is your age?')).toHaveValue(61)
    expect(screen.queryByText(/could not load the answers you saved/i)).not.toBeInTheDocument()

    await act(async () => {
      await queryClient.refetchQueries({ queryKey: queryKeys.answers })
    })

    // The reader's own answer is in the field. A failed refetch says nothing about how it got there,
    // and a banner over it claiming otherwise is a false alarm about their own data.
    expect(screen.getByLabelText('What is your age?')).toHaveValue(61)
    expect(screen.queryByText(/could not load the answers you saved/i)).not.toBeInTheDocument()
  })

  // A stored country the picker has no option for reads as unanswered on screen while `buildProfile`
  // still sees it — the required-country guard passes and the reader submits a country the select
  // says they never chose.
  it('restores a country saved under a retired code as the one it now resolves to', async () => {
    const user = userEvent.setup()
    const client = clientWithSaved([savedRow('Q0_country', { iso2: 'EL', iso3: 'GRC', name: 'Greece' })])
    const base = await createMockClient().getMeta()
    client.getMeta = async () => ({
      ...base,
      // The picker offers what the model can score, and never the retired codes; the map from one to
      // the other is served alongside it.
      country_options: [...(base.country_options ?? []), { iso2: 'GR', iso3: 'GRC', name: 'Greece', settlements: 40 }],
      country_aliases: { EL: 'GR' },
    })
    const scored: Profile[] = []
    const score = client.estimate
    client.estimate = async (p) => {
      scored.push(p)
      return score(p)
    }
    renderWithProviders(<InterviewUnderRouter />, { route: '/interview', client, session: SESSION })

    expect(await screen.findByLabelText(/which country do you live in/i)).toHaveValue('GR')

    // And what the picker shows is what gets scored: the same country, under the code the model uses.
    await user.click(screen.getByRole('button', { name: /calculate my life clock/i }))
    expect(await screen.findByText('LIFE CLOCK HOME')).toBeInTheDocument()
    expect(scored[0].country).toBe('GR')
  })

  it('drops a saved country the picker cannot show, leaving the question genuinely unanswered', async () => {
    const client = clientWithSaved([
      savedRow('Q1_age', 61),
      savedRow('Q0_country', { iso2: 'XX', iso3: 'XXX', name: 'Nowhere' }),
    ])
    renderWithProviders(<InterviewUnderRouter />, { route: '/interview', client, session: SESSION })

    // The rest of the prefill still lands — only the answer the list cannot show is dropped.
    expect(await screen.findByLabelText('What is your age?')).toHaveValue(61)
    expect(await screen.findByLabelText(/which country do you live in/i)).toHaveValue('')
    // Blocked exactly as a first visit is, with the same reason, rather than quietly submitting a
    // country the reader is being shown as unchosen.
    expect(screen.getByRole('button', { name: /calculate my life clock/i })).toBeDisabled()
    expect(screen.getByText(/would be about somewhere else/i)).toBeInTheDocument()
  })
})

// UX-6: ten sections on one page (the single-page structure is decided and unchanged), with the
// Calculate button previously reachable only past the last question and no sense of what remained.
describe('the bottom bar', () => {
  /** The phrase as a reader sees it, read back as numbers so the tests can talk about movement. */
  function progress() {
    const [, answered, total] = screen
      .getByText(/^\d+ of \d+ answered$/)
      .textContent!.match(/^(\d+) of (\d+) answered$/)!
    return { answered: Number(answered), total: Number(total) }
  }

  it('carries the progress, the framing note and the only Calculate button', async () => {
    renderWithProviders(<InterviewUnderRouter />, { route: '/interview' })
    const bar = screen.getByTestId('interview-bar')

    expect(within(bar).getByText(/^\d+ of \d+ answered$/)).toBeInTheDocument()
    // The framing rule follows the button wherever the button goes (ADR-001).
    expect(within(bar).getByText(/statistical estimate, not a prediction or diagnosis/i)).toBeInTheDocument()
    // One control, not two: a second Calculate at the foot of the page would leave the reader
    // guessing whether the two do the same thing.
    expect(screen.getAllByRole('button', { name: /calculate my life clock/i })).toHaveLength(1)
    expect(within(bar).getByRole('button', { name: /calculate my life clock/i })).toBeInTheDocument()
  })

  it('counts the questions on screen, and recounts when an answer reveals more', async () => {
    const user = userEvent.setup()
    renderWithProviders(<InterviewUnderRouter />, { route: '/interview' })

    const start = progress()
    expect(start.answered).toBeLessThan(start.total)

    // The country is the one question with no default, and it is counted like any other.
    await user.selectOptions(await screen.findByLabelText(/which country do you live in/i), 'DE')
    expect(progress()).toEqual({ answered: start.answered + 1, total: start.total })

    // "I used to smoke" puts two more questions on the page, so there is more left, not less.
    await user.click(screen.getByRole('radio', { name: "I used to, but I've quit" }))
    const revealed = progress()
    expect(revealed).toEqual({ answered: start.answered + 1, total: start.total + 2 })

    await user.type(await screen.findByLabelText(/in what year did you quit/i), '2015')
    expect(progress()).toEqual({ answered: revealed.answered + 1, total: revealed.total })
  })

  it('counts a scale once it is fully answered, and never a tick-box question', async () => {
    const user = userEvent.setup()
    renderWithProviders(<InterviewUnderRouter />, { route: '/interview' })
    const start = progress()

    // Half of the mood scale is not an answer to it. (Both items "Several days" = 2, which stays
    // under the support note's threshold, so only the counting moves here.)
    const first = screen.getByText(/little interest or pleasure/i).parentElement!
    await user.click(within(first).getByRole('radio', { name: 'Several days' }))
    expect(progress()).toEqual(start)

    const second = screen.getByText(/down, depressed, or hopeless/i).parentElement!
    await user.click(within(second).getByRole('radio', { name: 'Several days' }))
    expect(progress()).toEqual({ answered: start.answered + 1, total: start.total })

    // Ticking a condition moves neither count: an empty tick-box set is a complete answer for a
    // healthy person and indistinguishable from an untouched one, so the phrase stays out of it.
    await user.click(screen.getByRole('checkbox', { name: 'Diabetes' }))
    expect(progress()).toEqual({ answered: start.answered + 1, total: start.total })
  })

  it('is blocked and says something is unfinished while an answer is wrong', async () => {
    const user = userEvent.setup()
    renderWithProviders(<InterviewUnderRouter />, { route: '/interview' })
    const bar = screen.getByTestId('interview-bar')
    const button = within(bar).getByRole('button', { name: /calculate my life clock/i })

    // No country yet: the same condition that disabled the button at the foot of the page. The
    // reasons live with their questions, which can be a screen away while the bar is pinned.
    //
    // The line covers both of the states that block the button, and this is the one where the
    // wording matters most: on a pristine first visit nothing is WRONG — the one entry is the
    // country question the reader has not scrolled to yet.
    expect(button).toBeDisabled()
    expect(within(bar).getByText(/some answers are still missing or need a fix/i)).toBeInTheDocument()

    await user.selectOptions(await screen.findByLabelText(/which country do you live in/i), 'RO')
    expect(button).toBeEnabled()
    expect(within(bar).queryByText(/still missing or need a fix/i)).not.toBeInTheDocument()

    // The other state the same line has to cover: an answer that is present and wrong.
    const age = screen.getByLabelText('What is your age?')
    await user.clear(age)
    await user.type(age, '5')
    expect(button).toBeDisabled()
    expect(within(bar).getByText(/some answers are still missing or need a fix/i)).toBeInTheDocument()
  })

  it('says which of the two things it is doing, and cannot be pressed again while it does it', async () => {
    const user = userEvent.setup()
    const client = createMockClient()
    const scoring = client.estimate
    let finishScoring: () => void = () => {}
    client.estimate = (p) =>
      new Promise<Estimate>((resolve) => {
        finishScoring = () => resolve(scoring(p))
      })
    // The save is the second half of the same press, and it has its own label.
    client.saveAnswers = () => new Promise(() => {})

    renderWithProviders(<InterviewUnderRouter />, { route: '/interview', client })
    await user.selectOptions(await screen.findByLabelText(/which country do you live in/i), 'RO')
    await user.click(screen.getByRole('button', { name: /calculate my life clock/i }))

    const busy = screen.getByRole('button', { name: 'Calculating…' })
    expect(busy).toBeDisabled()

    await act(async () => {
      finishScoring()
    })
    // Every /api/estimate call writes a history row, so a button that stayed pressable here would
    // let a second press append one.
    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
  })

  it('reports a failed calculation at the bar, where the press happened', async () => {
    const user = userEvent.setup()
    const client = createMockClient()
    client.estimate = async () => {
      throw new Error('estimate service unavailable')
    }
    renderWithProviders(<InterviewUnderRouter />, { route: '/interview', client })
    await user.selectOptions(await screen.findByLabelText(/which country do you live in/i), 'RO')
    await user.click(screen.getByRole('button', { name: /calculate my life clock/i }))

    // The message used to render at the end of the document, which is ABOVE the pinned bar's own
    // place in the flow — so a 500 flickered "Calculating…" and returned the reader to a page that
    // showed nothing at all. Inside the bar it is on screen wherever they have scrolled to, and
    // role="alert" means it is announced rather than merely present in the DOM.
    const bar = screen.getByTestId('interview-bar')
    const alert = await within(bar).findByRole('alert')
    expect(alert).toHaveTextContent(/estimate service unavailable/i)
    // Once, at the bar — not also left behind off-screen at the foot of the page.
    expect(screen.getAllByRole('alert')).toHaveLength(1)

    // And the reader is still on the interview, with the button they can press again.
    expect(screen.queryByText('LIFE CLOCK HOME')).not.toBeInTheDocument()
    expect(within(bar).getByRole('button', { name: /calculate my life clock/i })).toBeEnabled()
  })

  // WCAG 2.4.11 (Focus Not Obscured). The bar is pinned over the bottom of the app's scrollport, so
  // the browser scrolls a Tab-focused field to exactly where the bar covers it unless the scrollport
  // carries bottom scroll padding. The utility therefore sits on the shared shell (app/AppLayout.tsx)
  // while the reason for it is this bar — so the bar's own tests are what guard it. jsdom does no
  // layout and no scrolling, so the class itself is the most that can be asserted here.
  it('leaves room under the app scrollport for a field the browser scrolls to', () => {
    renderWithProviders(<AppLayout>{null}</AppLayout>)
    const main = document.querySelector('main')!
    expect(main.className).toMatch(/\bscroll-pb-\d+\b/)
  })
})

describe('the interview in plain words', () => {
  it('grades the evidence, not the reader', () => {
    renderWithProviders(<InterviewUnderRouter />, { route: '/interview' })

    const smoking = screen.getByText('Smoking').closest('section')!
    expect(within(smoking).getByText('strong evidence')).toBeInTheDocument()
    // The app's one evidence scale — strong / moderate / weak, as components/framing.tsx already
    // grades every attributed factor. "medium evidence" here would be a second set of words for the
    // same rung, on the same reader's screen.
    const sleep = screen.getByText('Sleep').closest('section')!
    expect(within(sleep).getByText('moderate evidence')).toBeInTheDocument()

    // "CONFIDENCE: HIGH" is about the evidence behind the section, but in the margin of a health
    // questionnaire it reads as a verdict on the person answering it.
    expect(screen.queryByText(/confidence/i)).not.toBeInTheDocument()
  })

  it('tells an unscored question what it is, without release numbers', () => {
    renderWithProviders(<InterviewUnderRouter />, { route: '/interview' })

    // The mood scale is deliberately outside the risk score (EXP-12), and the chip sits with it.
    const mood = screen.getByText(/how often have you been bothered by/i).parentElement!
    const chip = within(mood).getByText('not used in your number yet')
    expect(chip).toHaveAttribute('title', 'Saved to your profile — not used in your number yet.')

    // A scored question carries no chip at all.
    const age = screen.getByText('What is your age?').parentElement!
    expect(within(age).queryByText(/not used in your number yet/i)).not.toBeInTheDocument()

    // "v1" is our word for our own release schedule; it told the reader nothing about their answer.
    expect(screen.queryByText(/not in v1 estimate/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/\bv1\b/i)).not.toBeInTheDocument()
  })
})
