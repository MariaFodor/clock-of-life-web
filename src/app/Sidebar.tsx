import { NavLink } from 'react-router-dom'
import { NAV_ITEMS } from './nav'
import { useAuth } from './auth'

export function Sidebar() {
  const { session, logout } = useAuth()
  return (
    <nav
      aria-label="Primary"
      className="flex h-full w-64 shrink-0 flex-col border-r border-clock-line bg-clock-surface"
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

      <ul className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === '/'}
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
        {session && (
          <div className="mb-2 truncate text-xs text-clock-muted" title={session.handle}>
            Signed in as <span className="font-medium text-clock-ink">{session.handle}</span>
          </div>
        )}
        <button type="button" onClick={logout} className="btn-ghost w-full justify-start px-0 text-clock-muted">
          Sign out
        </button>
      </div>
    </nav>
  )
}
