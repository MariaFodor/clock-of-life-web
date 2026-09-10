import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import { AppLayout } from './AppLayout'
import { Login } from '../features/Login'
import { InterviewPage } from '../features/interview/InterviewPage'
import { LifeClockPage } from '../features/life-clock/LifeClockPage'
import { WhyPage } from '../features/why/WhyPage'
import { ImprovePage } from '../features/improve/ImprovePage'
import { WhatIfPage } from '../features/what-if/WhatIfPage'
import { RelocatePage } from '../features/relocate/RelocatePage'
import { ProgressPage } from '../features/progress/ProgressPage'
import { StatsPage } from '../features/stats/StatsPage'
import { AtlasPage } from '../features/atlas/AtlasPage'

export function App() {
  const { session } = useAuth()

  if (!session) return <Login />

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<LifeClockPage />} />
        <Route path="/interview" element={<InterviewPage />} />
        <Route path="/why" element={<WhyPage />} />
        <Route path="/improve" element={<ImprovePage />} />
        <Route path="/what-if" element={<WhatIfPage />} />
        <Route path="/relocate" element={<RelocatePage />} />
        <Route path="/progress" element={<ProgressPage />} />
        <Route path="/world" element={<AtlasPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  )
}
