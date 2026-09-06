import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { useMeta } from '../api/hooks'

export function AppLayout({ children }: { children: ReactNode }) {
  const { data: meta } = useMeta()
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl px-6 py-8">{children}</div>
        </main>
        <footer className="border-t border-clock-line bg-clock-surface px-6 py-2 text-[11px] text-clock-muted">
          {meta ? (
            <>
              Model {meta.model_version} · {meta.algorithm} · reference population {meta.countries.join(', ')} — a
              statistical estimate, not a prediction.
            </>
          ) : (
            <>A statistical estimate, not a prediction.</>
          )}
        </footer>
      </div>
    </div>
  )
}
