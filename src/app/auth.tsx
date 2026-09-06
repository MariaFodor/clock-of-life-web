// Pseudonymous session (A5). The real backend hashes email-as-login server-side; here we only hold a
// display handle in localStorage to gate the app and stand in for the eventual bearer token.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

interface Session {
  handle: string
}

interface AuthContextValue {
  session: Session | null
  login: (handle: string) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)
const STORAGE_KEY = 'clock-of-life.session'

function readStored(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(readStored)

  const login = useCallback((handle: string) => {
    const s = { handle: handle.trim() }
    setSession(s)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    } catch {
      /* storage may be unavailable (private mode) — session still works in-memory */
    }
  }, [])

  const logout = useCallback(() => {
    setSession(null)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  const value = useMemo(() => ({ session, login, logout }), [session, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
