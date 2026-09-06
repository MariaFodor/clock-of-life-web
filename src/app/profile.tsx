// Holds the current scored Profile and the latest Estimate in memory, populated by the interview and
// read by every surface (Life Clock, Why?, What-If, Improve, Relocate). This is ephemeral client state;
// the durable record is the persisted `calculation` rows on the server.

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Estimate, Profile } from '../api/types'

interface ProfileContextValue {
  profile: Profile | null
  estimate: Estimate | null
  setProfile: (p: Profile) => void
  setEstimate: (e: Estimate) => void
  reset: () => void
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

export function ProfileProvider({
  children,
  initialProfile = null,
  initialEstimate = null,
}: {
  children: ReactNode
  initialProfile?: Profile | null
  initialEstimate?: Estimate | null
}) {
  const [profile, setProfile] = useState<Profile | null>(initialProfile)
  const [estimate, setEstimate] = useState<Estimate | null>(initialEstimate)

  const value = useMemo<ProfileContextValue>(
    () => ({
      profile,
      estimate,
      setProfile,
      setEstimate,
      reset: () => {
        setProfile(null)
        setEstimate(null)
      },
    }),
    [profile, estimate],
  )
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider')
  return ctx
}
