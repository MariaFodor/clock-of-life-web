import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { MobileTopBar } from './MobileTopBar'
import { useDrawer } from './drawer'
import { useMeta } from '../api/hooks'

/** The hamburger's `aria-controls` and the nav's `id` have to be the same string; it lives here. */
const PRIMARY_NAV_ID = 'primary-nav'

/*
  Which shape the sidebar takes is decided by the stylesheet, not by JavaScript, so that md and up
  is byte-for-byte the layout it has always been and no measurement has to happen before first
  paint. Below md the same <nav> is taken out of the flow (`fixed`) and parked off the left edge;
  the state below only slides it back in.

  `invisible` when closed is not decoration: the panel stays mounted (one nav, see Sidebar), and
  something merely translated off-screen is still in the tab order and still read out. visibility
  takes it out of both, and `md:visible` hands it straight back at desktop width.

  `md:transform-none` rather than a translate of zero, because a transform would make the permanent
  sidebar a stacking context it is not today — "unchanged on desktop" includes how it paints.
*/
const DRAWER_PLACEMENT =
  'fixed inset-y-0 left-0 z-40 transition-[transform,visibility] duration-200 ease-out ' +
  'motion-reduce:transition-none md:static md:z-auto md:visible md:transform-none md:transition-none'

export function AppLayout({ children }: { children: ReactNode }) {
  const { data: meta } = useMeta()
  const drawer = useDrawer()

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        id={PRIMARY_NAV_ID}
        navRef={drawer.panelRef}
        onNavigate={drawer.close}
        className={`${DRAWER_PLACEMENT} ${drawer.open ? 'translate-x-0' : '-translate-x-full invisible'}`}
      />

      {/*
        The backdrop dims and swallows everything the drawer does not cover — including the top bar,
        so a tap on the hamburger's own spot closes the menu, which is where a thumb goes for it.
        Presentational, hence aria-hidden: Escape and the button are the accessible ways out.
      */}
      {drawer.open && (
        <div
          data-testid="menu-backdrop"
          aria-hidden
          onClick={drawer.close}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        {/*
          In the flow, above <main>, never over it: the interview pins a Calculate bar to the bottom
          of the scrollport (features/interview/InterviewPage.tsx), and a bar that floated over the
          top would have to be paid for in padding by every page. Here it simply makes the scrollport
          shorter, which nothing else has to know about.
        */}
        <MobileTopBar
          open={drawer.open}
          onToggle={drawer.toggle}
          navId={PRIMARY_NAV_ID}
          buttonRef={drawer.buttonRef}
        />
        {/*
          `scroll-pb-24` — bottom padding for whatever the browser SCROLLS TO in here, because this
          <main> is the app's scrollport. The interview pins a ~66px Calculate bar to the bottom of
          it (features/interview/InterviewPage.tsx); without this, tabbing lands a focused field
          exactly where that bar covers it (WCAG 2.4.11, Focus Not Obscured). It has to be set on the
          scroll container itself, which is why a shared shell carries a reason from one feature; it
          changes nothing on the other pages, since it only moves scroll destinations.

          The overflow swap is the scroll lock for the open drawer. It goes here and not on <body>
          because the shell is `h-screen overflow-hidden`: the body never scrolls, this does.

          `md:overflow-y-auto` unconditionally, for the same reason the sidebar's desktop shape is
          all `md:` classes: the stylesheet decides what desktop is, not the state. The drawer only
          exists below md, so at md and up this scrollport scrolls whatever JavaScript believes —
          a stand-down that failed to run can leave a stale `open`, and a stale `open` must not be
          able to make the desktop page unscrollable with no way back.
        */}
        <main
          className={`flex-1 scroll-pb-24 md:overflow-y-auto ${drawer.open ? 'overflow-hidden' : 'overflow-y-auto'}`}
        >
          <div className="mx-auto max-w-4xl px-6 py-8">{children}</div>
        </main>
        <footer className="border-t border-clock-line bg-clock-surface px-6 py-2 text-[11px] text-clock-muted">
          {meta ? (
            <>
              <p>
                Model {meta.model_version}
                {/*
                  Provenance, not content. On a phone the thirty country codes wrapped into a column
                  several times taller than the sentence they qualify, so below md the sentence keeps
                  only what it cannot be honest without — which model produced the number, and that
                  it is an estimate. The codes are one tap away underneath rather than gone: a title
                  attribute would have been cheaper, but a phone has no hover to reveal it with, so
                  it would have amounted to deleting them.
                */}
                <span data-testid="footer-provenance" className="hidden md:inline">
                  {' '}
                  · {meta.algorithm} · reference population {meta.countries.join(', ')}
                </span>{' '}
                — a statistical estimate, not a prediction.
              </p>
              <details className="md:hidden">
                <summary className="cursor-pointer">Reference population</summary>
                <p className="mt-1">{meta.countries.join(', ')}</p>
              </details>
            </>
          ) : (
            <>A statistical estimate, not a prediction.</>
          )}
        </footer>
      </div>
    </div>
  )
}
