// The mobile menu drawer's behaviour, in one place: what opens and closes it, where the keyboard's
// focus goes when it does, and how far Tab may travel while it is open. The *shape* of the sidebar
// (permanent column at md and up, overlay drawer below it) is Tailwind's job — see AppLayout — so
// nothing here decides layout.

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Tailwind's `md` breakpoint, written out because JavaScript cannot read the stylesheet. It is used
 * for one thing only: noticing a crossing INTO desktop width. Keep it in step with the `screens`
 * defaults in tailwind.config.js — if that file ever redefines `md`, this string has to follow.
 */
export const DESKTOP_QUERY = '(min-width: 768px)'

/**
 * Where Tab may stop inside the panel, taken in document order. Deliberately the plain list rather
 * than a "is it really on screen" filter: everything the drawer contains is a link or a button (see
 * Sidebar), and jsdom reports no layout at all (offsetParent is always null there), so such a filter
 * would be a no-op in the browser and a lie in the tests. The panel's own `tabIndex={-1}` keeps it
 * out of this — it is the container, not a stop.
 */
const FOCUS_STOPS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface Drawer {
  open: boolean
  close: () => void
  toggle: () => void
  /** the drawer panel — takes focus when it opens, and bounds Tab while it is open */
  panelRef: RefObject<HTMLElement>
  /** the hamburger — gets focus back when a dismissal closes the drawer */
  buttonRef: RefObject<HTMLButtonElement>
}

export function useDrawer(): Drawer {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  // True while a close still owes the opener its focus back. Without the flag the first render
  // (open === false, nothing opened yet) would yank focus to the hamburger from wherever it was.
  // The two paths that close the drawer without the reader dismissing it — a location change, and
  // the stand-down at desktop width — drop the claim before closing; see each for why.
  const owesFocus = useRef(false)
  const { pathname } = useLocation()
  const lastPath = useRef(pathname)

  const close = useCallback(() => setOpen(false), [])
  const toggle = useCallback(() => setOpen((wasOpen) => !wasOpen), [])

  useEffect(() => {
    if (open) {
      owesFocus.current = true
      // Focus has to land inside the panel: it now covers the page, so leaving focus on the page
      // behind means the next Tab moves through things the reader cannot see (WCAG 2.4.3).
      panelRef.current?.focus()

      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          setOpen(false)
          return
        }
        if (event.key !== 'Tab') return
        const panel = panelRef.current
        if (!panel) return

        // Landing focus in the panel is only half of WCAG 2.4.3: without this, Tab off the last
        // control walks straight into the hamburger and on into the dimmed page behind the
        // backdrop, and because <main> is `overflow-hidden` while the drawer is open the scrollport
        // scrolls to chase a control the reader cannot see. So Tab cycles within the panel and the
        // reader leaves the way the drawer advertises: Escape, the ✕, or a tap on the backdrop.
        //
        // The hamburger is NOT part of the cycle, on purpose. The backdrop (z-30) covers the top
        // bar, so a pointer cannot reach the button either — a tap on its spot hits the backdrop
        // and closes the menu. Keeping it tabbable would give the keyboard a control the screen
        // says is behind the dimming, and focusing it is the scroll-chase above. It stays
        // `aria-expanded`/`aria-controls`-correct for a reader browsing the page structure; what
        // changes is only where sequential Tab may stop.
        //
        // Behavioural only: no `aria-modal` and no `role="dialog"`, because this element is also
        // the permanent desktop sidebar and must stay a plain `nav` landmark there.
        const stops = Array.from(panel.querySelectorAll<HTMLElement>(FOCUS_STOPS))
        if (stops.length === 0) {
          // Never true of today's Sidebar, but an empty panel must not become an open door.
          event.preventDefault()
          panel.focus()
          return
        }
        const first = stops[0]
        const last = stops[stops.length - 1]
        const active = document.activeElement
        const inside = active instanceof Node && panel.contains(active)

        if (!inside) {
          // Focus got loose on the page behind (or fell to <body>) — take it back rather than let
          // this Tab continue from there.
          event.preventDefault()
          ;(event.shiftKey ? last : first).focus()
          return
        }
        if (!event.shiftKey && active === last) {
          event.preventDefault()
          first.focus()
          return
        }
        // `active === panel` is the state the drawer opens in: the panel holds focus and nothing
        // precedes it inside, so Shift+Tab would leave the same way Tab off the last control does.
        if (event.shiftKey && (active === first || active === panel)) {
          event.preventDefault()
          last.focus()
        }
      }
      document.addEventListener('keydown', onKeyDown)
      return () => document.removeEventListener('keydown', onKeyDown)
    }
    if (owesFocus.current) {
      owesFocus.current = false
      buttonRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (lastPath.current === pathname) return
    lastPath.current = pathname
    if (!open) return
    // "The drawer closes on navigation" has to mean ANY navigation, not only a tap on a link inside
    // the panel: Android Back (and a redirect, and a deep link) changed the page underneath an open
    // drawer and left it sitting there with the scroll lock still on.
    //
    // Who owns focus, per close path. Escape, the backdrop and the ✕ are dismissals: the reader is
    // still in the drawer, focus is on the panel or on a control inside it, and both are about to
    // go `invisible` — so those hand it back to the hamburger (`close`, and the effect above). A
    // link inside the panel is the same case, which is why AppLayout still passes `close` as
    // `onNavigate`: the reader is standing on a link that is about to be hidden, so the hand-back
    // is what keeps focus off <body>. That close runs in the click handler, so by the time this
    // effect sees the new path the drawer is already shut and this is a no-op.
    // A location change from anywhere else is NOT that case: Back, a redirect or a deep link means
    // the new page owns focus by now, and dragging it onto a hamburger the reader has navigated
    // away from is the theft this avoids. So this path drops the claim first — the same thing the
    // stand-down below does, for the same reason: nobody asked for focus back.
    owesFocus.current = false
    setOpen(false)
  }, [pathname, open])

  useEffect(() => {
    // Same idiom as components/motion.ts: ask the browser, then listen for the answer changing.
    if (typeof window === 'undefined' || !window.matchMedia) return
    const desktop = window.matchMedia(DESKTOP_QUERY)
    const onChange = () => {
      if (!desktop.matches) return
      // At md and up the panel is the permanent sidebar again. An "open" left over from the narrow
      // layout would keep the page scroll locked and the backdrop up over a sidebar that is not a
      // drawer any more. No focus is handed back here: the hamburger is display:none at this width,
      // and focusing a hidden element drops focus to <body> instead of restoring it.
      owesFocus.current = false
      setOpen(false)
    }
    desktop.addEventListener?.('change', onChange)
    return () => desktop.removeEventListener?.('change', onChange)
  }, [])

  return { open, close, toggle, panelRef, buttonRef }
}
