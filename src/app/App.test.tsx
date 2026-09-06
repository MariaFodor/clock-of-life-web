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

  it('toggles between light and dark themes', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />)
    await user.type(screen.getByLabelText(/choose a handle/i), 'blue-heron-42')
    await user.click(screen.getByRole('button', { name: /enter/i }))

    const toggle = await screen.findByRole('button', { name: /dark mode/i })
    await user.click(toggle)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    // The control now offers switching back to light.
    expect(screen.getByRole('button', { name: /light mode/i })).toBeInTheDocument()
  })
})
