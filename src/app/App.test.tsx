import { describe, expect, it, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './App'
import { renderWithProviders } from '../test/harness'
import { setToken } from '../api/token'

async function signIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/email/i), 'a@example.com')
  await user.type(screen.getByLabelText(/password/i), 'hunter2hunter2')
  await user.click(screen.getByRole('button', { name: /^sign in$/i }))
}

describe('<App/> auth gate + shell', () => {
  beforeEach(() => {
    setToken(null)
    try {
      localStorage.clear()
    } catch {
      /* ignore */
    }
  })

  it('shows the login screen when there is no session', () => {
    renderWithProviders(<App />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument()
  })

  it('enters the app and shows the side menu after signing in', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />)
    await signIn(user)

    expect(await screen.findByRole('navigation', { name: /primary/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /my life clock/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /where to live/i })).toBeInTheDocument()
  })

  it('toggles between light and dark themes', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />)
    await signIn(user)

    const toggle = await screen.findByRole('button', { name: /dark mode/i })
    await user.click(toggle)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(screen.getByRole('button', { name: /light mode/i })).toBeInTheDocument()
  })
})
