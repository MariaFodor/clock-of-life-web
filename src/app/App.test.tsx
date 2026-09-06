import { describe, expect, it, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './App'
import { renderWithProviders } from '../test/harness'

describe('<App/> auth gate + shell', () => {
  beforeEach(() => {
    try {
      localStorage.clear()
    } catch {
      /* ignore */
    }
  })

  it('shows the login screen when there is no session', () => {
    renderWithProviders(<App />)
    expect(screen.getByText(/choose a handle/i)).toBeInTheDocument()
  })

  it('enters the app and shows the side menu after signing in', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />)

    await user.type(screen.getByLabelText(/choose a handle/i), 'blue-heron-42')
    await user.click(screen.getByRole('button', { name: /enter/i }))

    // Side-menu surfaces are now present.
    expect(await screen.findByRole('navigation', { name: /primary/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /my life clock/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /where to live/i })).toBeInTheDocument()
  })
})
