// The slim bar that stands in for the sidebar below md: the app's name, and the one button that
// opens the menu. Hidden from md up, where the sidebar itself is on screen and a second copy of the
// app's name would be noise.

import type { RefObject } from 'react'

export function MobileTopBar({
  open,
  onToggle,
  navId,
  buttonRef,
}: {
  open: boolean
  onToggle: () => void
  /** id of the nav the button opens, so `aria-controls` points at something real */
  navId: string
  buttonRef: RefObject<HTMLButtonElement>
}) {
  return (
    <header
      data-testid="app-top-bar"
      className="flex shrink-0 items-center justify-between border-b border-clock-line bg-clock-surface px-4 py-2 md:hidden"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-xl text-clock-brand">
          ◷
        </span>
        <span className="text-sm font-semibold text-clock-ink">The Clock of Life</span>
      </div>
      {/*
        The name says what the press will do, and it changes with the state, because that is what a
        reader who cannot see the drawer needs to hear. `aria-expanded` says which state it is in.
        The glyph is text, not an icon font — the same choice the nav items make (app/nav.ts).
      */}
      <button
        type="button"
        ref={buttonRef}
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={navId}
        aria-label={open ? 'Close menu' : 'Open menu'}
        className="btn-ghost px-3 text-lg leading-none"
      >
        <span aria-hidden>{open ? '✕' : '☰'}</span>
      </button>
    </header>
  )
}
