import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RelocatePage } from './RelocatePage'
import { renderWithProviders, SAMPLE_PROFILE } from '../../test/harness'

describe('<RelocatePage/>', () => {
  it('asks for the interview when there is no profile', () => {
    renderWithProviders(<RelocatePage />)
    expect(screen.getByRole('link', { name: /start the interview/i })).toBeInTheDocument()
  })

  it('lists places and compares a cleaner-air location favourably', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RelocatePage />, { profile: SAMPLE_PROFILE })

    const brasovName = await screen.findByText('Brașov')
    const card = brasovName.closest('section')!
    await user.click(within(card).getByRole('button', { name: /compare/i }))

    expect(await screen.findByText(/cleaner air/i)).toBeInTheDocument()
    expect(screen.getByText(/Bucharest → Brașov/)).toBeInTheDocument()
  })
})
