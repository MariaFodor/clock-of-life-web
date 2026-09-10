import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { useMeta } from '../api/hooks'

export function AppLayout({ children }: { children: ReactNode }) {
  const { data: meta } = useMeta()
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/*
          `scroll-pb-24` — bottom padding for whatever the browser SCROLLS TO in here, because this
          <main> is the app's scrollport. The interview pins a ~66px Calculate bar to the bottom of
          it (features/interview/InterviewPage.tsx); without this, tabbing lands a focused field
          exactly where that bar covers it (WCAG 2.4.11, Focus Not Obscured). It has to be set on the
          scroll container itself, which is why a shared shell carries a reason from one feature; it
          changes nothing on the other pages, since it only moves scroll destinations.
        */}
        <main className="flex-1 overflow-y-auto scroll-pb-24">
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
