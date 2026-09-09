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

  it('calculates and navigates to the Life Clock on submit', async () => {
    const user = userEvent.setup()
    renderWithProviders(<InterviewUnderRouter />, { route: '/interview' })

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

  it('offers the location picker from /api/locations', async () => {
    renderWithProviders(<InterviewUnderRouter />, { route: '/interview' })
    expect(await screen.findByLabelText(/where do you live/i)).toBeInTheDocument()
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

    const picker = await screen.findByLabelText(/where do you live/i)
    await user.selectOptions(picker, 'Cluj-Napoca')
    await user.click(screen.getByRole('button', { name: /calculate my life clock/i }))

    // The estimate still lands (the ENV term already reached it) — the failure must not trap the
    // user — and the honest message travels with them instead of vanishing.
    expect(await screen.findByText(/could not record Cluj-Napoca as your home location/i)).toBeInTheDocument()
  })

  it('explains itself when the location list cannot be loaded', async () => {
    const client = createMockClient()
    client.listLocations = async () => {
      throw new Error('offline')
    }
    renderWithProviders(<InterviewUnderRouter />, { route: '/interview', client })
    expect(await screen.findByText(/could not load the list of locations/i)).toBeInTheDocument()
    // and it never blocks the estimate
    expect(screen.getByRole('button', { name: /calculate my life clock/i })).toBeEnabled()
  })
})
