import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { InterviewPage } from './InterviewPage'
import { renderWithProviders } from '../../test/harness'

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
