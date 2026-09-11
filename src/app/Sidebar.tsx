import { NavLink } from 'react-router-dom'
import type { Ref } from 'react'
import { NAV_ITEMS } from './nav'
import { useAuth } from './auth'
import { useTheme } from './theme'

interface SidebarProps {
  /** what the hamburger's `aria-controls` points at; AppLayout owns the id */
  id?: string
  /** where the shell puts it: permanent column at md and up, overlay drawer below (see AppLayout) */
  className?: string
  /** so the drawer can take focus when it opens — the nav carries tabIndex -1 to be able to */
  navRef?: Ref<HTMLElement>
  /** below md the drawer covers the page, so following a link has to close it behind you */
  onNavigate?: () => void
}

// One nav, rendered once, in whichever of the two places the width calls for. Two copies would mean
// two "Primary" landmarks and two of every link in the accessibility tree, and a theme toggle whose
// pressed state a reader could find twice.
export function Sidebar({ id, className = '', navRef, onNavigate }: SidebarProps) {
  const { session, logout } = useAuth()
  const { theme, toggle } = useTheme()
  return (
    <nav
      id={id}
      ref={navRef}
      tabIndex={-1}
      aria-label="Primary"
      className={`flex h-full w-64 shrink-0 flex-col border-r border-clock-line bg-clock-surface ${className}`}
    >
      <div className="flex items-center gap-2 px-5 py-5">
        <span aria-hidden className="text-2xl text-clock-brand">
          ◷
        </span>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-clock-ink">The Clock of Life</div>
          <div className="text-[11px] text-clock-muted">a statistical estimate</div>
        </div>
      </div>

      {/*
        The links scroll if they have to. On a phone held sideways the panel is barely 375px tall,
        and without this the theme toggle and Sign out below the list are simply off the end of it
        with no way to reach them. Nothing changes where the list fits, which is every desktop.
      */}
      <ul className="flex-1 space-y-1 overflow-y-auto px-3">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === '/'}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-clock-brandsoft font-medium text-clock-brand'
                    : 'text-clock-ink hover:bg-clock-canvas'
                }`
              }
            >
              <span aria-hidden className="w-4 text-center text-clock-muted">
                {item.glyph}
              </span>
              <span className="flex-1">{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="border-t border-clock-line px-5 py-4">
        <button
          type="button"
          onClick={toggle}
          aria-pressed={theme === 'dark'}
          className="mb-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-clock-ink hover:bg-clock-canvas"
        >
          <span aria-hidden className="w-4 text-center">
            {theme === 'dark' ? '☀' : '☾'}
          </span>
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        {session && (
          <div className="mb-2 truncate text-xs text-clock-muted" title={session.email}>
            Signed in as <span className="font-medium text-clock-ink">{session.email}</span>
          </div>
        )}
        <button type="button" onClick={logout} className="btn-ghost w-full justify-start px-0 text-clock-muted">
          Sign out
        </button>
      </div>
    </nav>
  )
}
