// Single source of truth for the side-menu surfaces and their routes (web-architecture.md §7).

export interface NavItem {
  to: string
  label: string
  /** short glyph for the rail (kept as text so there's no icon-font dependency) */
  glyph: string
  description: string
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'My Life Clock', glyph: '◷', description: 'Your current estimate' },
  { to: '/why', label: 'Why?', glyph: '≡', description: 'What drives it, factor by factor' },
  { to: '/improve', label: 'Improve', glyph: '↑', description: 'What you can change' },
  { to: '/what-if', label: 'What If?', glyph: '⇄', description: 'Simulate a change' },
  { to: '/relocate', label: 'Where to Live', glyph: '⌖', description: 'Compare places' },
  { to: '/progress', label: 'My Progress', glyph: '∿', description: 'Your history' },
  { to: '/stats', label: 'Statistics', glyph: '▤', description: 'Cohort comparisons' },
]
