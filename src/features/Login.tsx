// Pseudonymous entry (A5). Real auth hashes email server-side and returns a bearer token; this screen
// only takes a handle to open a session. No password is handled in the client.

import { useState, type FormEvent } from 'react'
import { useAuth } from '../app/auth'

export function Login() {
  const { login } = useAuth()
  const [handle, setHandle] = useState('')

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (handle.trim()) login(handle)
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
          A private, statistical view of your life expectancy — explained, and yours to explore. Sign in
          with a pseudonymous handle; we never ask for identifying details.
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="handle" className="label mb-1">
              Choose a handle
            </label>
            <input
              id="handle"
              className="field"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="e.g. blue-heron-42"
              autoComplete="off"
            />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={!handle.trim()}>
            Enter
          </button>
        </form>
      </div>
    </div>
  )
}
