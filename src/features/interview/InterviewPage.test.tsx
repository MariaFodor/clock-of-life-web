import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useLocation } from 'react-router-dom'
import { InterviewPage } from './InterviewPage'
import { renderWithProviders } from '../../test/harness'
import { createMockClient } from '../../api/mockClient'

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
    // Every option is a real settlement with its reading and the year it was taken — never a bare
    // name, because a value with no year is indistinguishable from an invented one.
    expect(options.length).toBeGreaterThan(10)
    expect(options.slice(1).every((o) => /µg\/m³ \(20\d\d\)/.test(o.textContent ?? ''))).toBe(true)
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
