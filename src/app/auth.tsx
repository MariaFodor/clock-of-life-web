// Pseudonymous accounts (A5, ADR-002). The backend hashes the email server-side and returns a bearer
// token; we hold the token (see api/token.ts) and a light session marker so a reload stays signed in.
// No password is ever stored client-side.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { getClient } from '../api/client'
import { getToken, setToken } from '../api/token'

interface Session {
  accountId: string
  email: string
}

interface AuthContextValue {
  session: Session | null
  register: (email: string, password: string) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)
const SESSION_KEY = 'clock-of-life.session'

function readStored(): Session | null {
  try {
    // Only trust a stored session if we also still hold a token.
    if (!getToken()) return null
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(readStored)

  const persist = useCallback((s: Session, token: string) => {
    setToken(token)
    setSession(s)
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(s))
    } catch {
      /* storage may be unavailable — session still works in-memory */
    }
  }, [])

  const register = useCallback(
    async (email: string, password: string) => {
      const res = await getClient().register(email, password)
      persist({ accountId: res.account_id, email: email.trim() }, res.token)
    },
    [persist],
  )

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await getClient().login(email, password)
      persist({ accountId: res.account_id, email: email.trim() }, res.token)
    },
    [persist],
  )

  const logout = useCallback(() => {
    setToken(null)
    setSession(null)
    try {
      localStorage.removeItem(SESSION_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  const value = useMemo(() => ({ session, register, login, logout }), [session, register, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
