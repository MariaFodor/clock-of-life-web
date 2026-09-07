// Account entry (A5 / ADR-002). Email + password; the backend stores only a hash of the email and an
// argon2 hash of the password. Toggle between signing in and creating an account.

import { useState, type FormEvent } from 'react'
import { useAuth } from '../app/auth'

export function Login() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'register') await register(email, password)
      else await login(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-clock-canvas px-4">
      <div className="card w-full max-w-sm p-8">
        <div className="mb-6 flex items-center gap-2">
          <span aria-hidden className="text-3xl text-clock-brand">
            ◷
          </span>
          <h1 className="text-lg font-semibold text-clock-ink">The Clock of Life</h1>
        </div>
        <p className="mb-6 text-sm text-clock-muted">
          A private, statistical view of your life expectancy — explained, and yours to explore. We store
          only a hashed form of your email; never your name or address.
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="label mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              className="field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="label mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              placeholder={mode === 'register' ? 'At least 8 characters' : ''}
            />
          </div>

          {error && (
            <div role="alert" className="rounded-lg border border-clock-bad/30 bg-clock-bad/5 p-2 text-sm text-clock-ink">
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={busy || !email.trim() || !password}>
            {busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <button
          type="button"
          className="mt-4 w-full text-center text-sm text-clock-brand hover:underline"
          onClick={() => {
            setMode((m) => (m === 'login' ? 'register' : 'login'))
            setError(null)
          }}
        >
          {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  )
}
