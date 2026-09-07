// The bearer token for the real backend. Kept in one place so both the HTTP client (reads it for the
// Authorization header) and the auth provider (sets it on login/logout) agree, and it survives reloads.

const STORAGE_KEY = 'clock-of-life.token'

let current: string | null = readStored()

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function getToken(): string | null {
  return current
}

export function setToken(token: string | null): void {
  current = token
  try {
    if (token) localStorage.setItem(STORAGE_KEY, token)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* storage may be unavailable (private mode) — in-memory value still applies */
  }
}
