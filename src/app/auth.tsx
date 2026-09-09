// Pseudonymous accounts (A5, ADR-002). The backend hashes the email server-side and returns a bearer
// token; we hold the token (see api/token.ts) and a light session marker so a reload stays signed in.
// No password is ever stored client-side.

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getClient } from '../api/client'
import { getToken, setToken } from '../api/token'
import { useProfile } from './profile'

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
  const queryClient = useQueryClient()
  const { reset: resetProfile } = useProfile()
  // Mirror of `session` so persist() can read the current account without re-creating callbacks.
  const sessionRef = useRef<Session | null>(session)
  sessionRef.current = session

  // Account boundaries wipe all per-account client state — the cached queries (history, answers)
  // and the in-memory profile/estimate — so a following sign-in can never see the previous
  // account's data (REVIEW-2026-09-09 W2).
  const clearAccountState = useCallback(() => {
    queryClient.clear()
    resetProfile()
  }, [queryClient, resetProfile])

  const persist = useCallback(
    (s: Session, token: string) => {
      // Token first, so nothing refetched by the wipe below can go out under the old identity;
      // and a same-account re-login (e.g. after token expiry) keeps its state — the wipe is only
      // for an actual account change.
      setToken(token)
      if (sessionRef.current && sessionRef.current.accountId !== s.accountId) clearAccountState()
      setSession(s)
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(s))
      } catch {
        /* storage may be unavailable — session still works in-memory */
      }
    },
    [clearAccountState],
  )

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
    clearAccountState()
    try {
      localStorage.removeItem(SESSION_KEY)
    } catch {
      /* ignore */
    }
  }, [clearAccountState])

  const value = useMemo(() => ({ session, register, login, logout }), [session, register, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
