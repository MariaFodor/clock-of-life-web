// The shell at phone width (UX-7). At 375px the 256px sidebar took two thirds of the screen and
// there was no way to put it away; below md it is now an overlay drawer behind a hamburger, and at
// md and up it is the same permanent column it has always been.
//
// What this file can and cannot witness, said once so no test below overclaims. jsdom loads no
// stylesheet and does no layout, so a Tailwind class here does nothing: `md:hidden` hides nothing,
// `invisible` hides nothing, and there is no viewport width to cross. So:
//   - what the STYLESHEET decides — which of the two shapes is on screen at which width — is
//     asserted as the class that decides it, the same way the interview's sticky-bar test asserts
//     `scroll-pb-24` on the scrollport;
//   - what JAVASCRIPT decides — open and closed, where focus goes and how far Tab may take it, the
//     scroll lock, closing on navigation, and standing down when the window grows — is asserted as
//     behaviour.
// The first kind is only as good as a browser saying so, which is a debt this file cannot pay.

import { describe, expect, it } from 'vitest'
import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useNavigate, type NavigateFunction } from 'react-router-dom'
import { App } from './App'
import { AppLayout } from './AppLayout'
import { DESKTOP_QUERY } from './drawer'
import { renderWithProviders, SAMPLE_ESTIMATE, SAMPLE_PROFILE } from '../test/harness'

const SESSION = { email: 'a@example.com' }

// A handle on the router from outside the drawer. Android Back, a redirect and a deep link all
// change the location with no click inside the panel, so a link click cannot stand in for them.
let routerNavigate: NavigateFunction | null = null
function RouterHandle() {
  routerNavigate = useNavigate()
  return null
}

/** Move the router the way something other than the drawer would. */
async function routerGo(run: (navigate: NavigateFunction) => void) {
  await act(async () => {
    run(routerNavigate!)
  })
}

/** The signed-in app, as a phone would first meet it. */
function renderShell(route = '/') {
  return renderWithProviders(
    <>
      <App />
      <RouterHandle />
    </>,
    {
      route,
      session: SESSION,
      profile: SAMPLE_PROFILE,
      estimate: SAMPLE_ESTIMATE,
    },
  )
}

const menuButton = () => screen.getByRole('button', { name: /^(open|close) menu$/i })
const primaryNav = () => screen.getByRole('navigation', { name: /primary/i })
// By test id, not by the `banner` role: every page's own <header> (components/ui.tsx `PageHeader`)
// answers to that role in testing-library, so it does not pick out one element.
const topBar = () => screen.getByTestId('app-top-bar')

// The bare utility, not the `md:` guard that now sits beside it in the same attribute — a plain
// substring check would match either one and so could not tell the scroll lock from its absence.
const SCROLLS = /(?:^|\s)overflow-y-auto(?:\s|$)/

/**
 * Does the drawer's focus trap claim this Tab? Reads as "yes" only when the drawer answers the key
 * itself. Point focus somewhere OUTSIDE the panel before calling: that is the case an open drawer
 * always answers and a closed one never does, so it tells the two apart.
 */
function tabIntercepted() {
  const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
  ;(document.activeElement ?? document.body).dispatchEvent(event)
  return event.defaultPrevented
}

describe('the shell at phone width — which shape shows (Tailwind decides; the class is the claim)', () => {
  it('has one nav, placed permanently at md and up and as an overlay below it', () => {
    renderShell()
    const nav = primaryNav()

    // One nav in the document, not one per breakpoint: two copies would put two "Primary"
    // landmarks, two of every link and two theme toggles into the accessibility tree.
    expect(screen.getAllByRole('navigation', { name: /primary/i })).toHaveLength(1)

    // Below md: out of the flow, over the page, above the interview's pinned bar (z-10).
    expect(nav.className).toMatch(/\bfixed\b/)
    expect(nav.className).toMatch(/\bz-40\b/)
    // From md up: back in the flow, off the stacking order it was given for the overlay, no
    // transform (a transform would make the permanent sidebar a stacking context it is not
    // today), visible whatever the drawer state says.
    expect(nav.className).toContain('md:static')
    expect(nav.className).toContain('md:z-auto')
    expect(nav.className).toContain('md:visible')
    expect(nav.className).toContain('md:transform-none')

    // Same principle one element over: the scrollport's desktop shape is the stylesheet's to
    // decide, not the drawer state's. The drawer exists only below md, so at md and up <main>
    // scrolls whatever JavaScript believes — a stand-down that failed to run cannot strand a
    // desktop reader on a page that will not scroll.
    expect(screen.getByRole('main').className).toContain('md:overflow-y-auto')
  })

  it('shows the slim top bar only below md, where the sidebar is not on screen', () => {
    renderShell()

    expect(topBar()).toContainElement(menuButton())
    expect(topBar()).toHaveTextContent('The Clock of Life')
    // `md:hidden` is "and no hamburger at md and up" — the desktop half of the requirement.
    expect(topBar().className).toContain('md:hidden')
  })

  it('parks the closed drawer off the edge AND out of the tab order, below md only', async () => {
    const user = userEvent.setup()
    renderShell()

    // `invisible`, not just a translate: something merely pushed off-screen is still tabbable and
    // still read out, so a closed menu would hand a keyboard eight links to nowhere.
    expect(primaryNav().className).toContain('-translate-x-full')
    expect(primaryNav().className).toContain('invisible')
    expect(primaryNav().className).toContain('md:visible')

    await user.click(menuButton())
    expect(primaryNav().className).toContain('translate-x-0')
    expect(primaryNav().className).not.toContain('invisible')
  })
})

describe('the menu button and the drawer — behaviour', () => {
  it('names what it does, and points at what it opens', async () => {
    const user = userEvent.setup()
    renderShell()

    const button = menuButton()
    expect(button).toHaveAccessibleName('Open menu')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    // aria-controls has to name something that exists, or it tells a screen reader nothing.
    expect(button.getAttribute('aria-controls')).toBe(primaryNav().id)
    expect(primaryNav().id).toBeTruthy()

    await user.click(button)
    expect(menuButton()).toHaveAccessibleName('Close menu')
    expect(menuButton()).toHaveAttribute('aria-expanded', 'true')
  })

  it('moves focus into the menu when it opens, and hands it back when Escape closes it', async () => {
    const user = userEvent.setup()
    renderShell()

    await user.click(menuButton())
    // The drawer now covers the page. Focus left behind on the page would send the next Tab
    // through things the reader cannot see (WCAG 2.4.3, Focus Order).
    expect(primaryNav()).toHaveFocus()
    expect(screen.getByTestId('menu-backdrop')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('menu-backdrop')).toBeNull()
    // Focus goes back where the reader put it, not to <body>.
    expect(menuButton()).toHaveFocus()
  })

  it('keeps Tab inside the open drawer, at both ends of it', async () => {
    const user = userEvent.setup()
    renderShell()

    await user.click(menuButton())

    const links = within(primaryNav()).getAllByRole('link')
    const firstStop = links[0]
    const signOut = within(primaryNav()).getByRole('button', { name: /sign out/i })

    // Shift+Tab out of the panel it just opened into. Nothing inside precedes the panel, so
    // without the trap this leaves the drawer backwards.
    expect(primaryNav()).toHaveFocus()
    await user.tab({ shift: true })
    expect(signOut).toHaveFocus()

    // Forward off the last control. This is the review's failure: it used to land on the
    // hamburger and then walk into the dimmed page behind the backdrop, with the `overflow-hidden`
    // scrollport scrolling to chase a control the reader cannot see (WCAG 2.4.3).
    await user.tab()
    expect(firstStop).toHaveFocus()
    expect(menuButton()).not.toHaveFocus()

    // ...and backwards off the first, the other end of the same cycle.
    await user.tab({ shift: true })
    expect(signOut).toHaveFocus()

    // In the middle of the list, Tab is the browser's own again — the trap holds the two ends, it
    // does not walk the reader through the panel.
    links[1].focus()
    expect(tabIntercepted()).toBe(false)
  })

  it('pulls focus back in if it is loose outside the panel while the drawer is open', async () => {
    const user = userEvent.setup()
    renderShell()

    await user.click(menuButton())
    // The hamburger is deliberately not one of the cycle's stops — the backdrop covers it, so a
    // pointer cannot reach it either — but focus can still arrive there (a click that the backdrop
    // did not swallow, a browser restoring it). The next Tab belongs to the drawer, not the page.
    menuButton().focus()
    await user.tab()

    expect(primaryNav()).toContainElement(document.activeElement as HTMLElement)
    expect(within(primaryNav()).getAllByRole('link')[0]).toHaveFocus()
  })

  it('leaves Tab alone when there is no open drawer to stay inside', async () => {
    const user = userEvent.setup()
    renderShell()

    // Never opened: nothing is listening, and focus outside the panel is simply the page's.
    menuButton().focus()
    expect(tabIntercepted()).toBe(false)

    // Opened and closed again — the listener comes off with the drawer, same lifecycle as Escape's.
    await user.click(menuButton())
    await user.keyboard('{Escape}')
    expect(menuButton()).toHaveFocus()
    expect(tabIntercepted()).toBe(false)
  })

  it('closes when the backdrop is tapped, which is where a thumb goes to dismiss', async () => {
    const user = userEvent.setup()
    renderShell()

    await user.click(menuButton())
    await user.click(screen.getByTestId('menu-backdrop'))

    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
    expect(menuButton()).toHaveFocus()
  })

  it('closes itself behind you when you follow a link', async () => {
    const user = userEvent.setup()
    renderShell()

    await user.click(menuButton())
    await user.click(screen.getByRole('link', { name: 'Why?' }))

    // The route really changed (NavLink marks the current page), and the drawer is not still
    // sitting over the page you asked for.
    expect(screen.getByRole('link', { name: 'Why?' })).toHaveAttribute('aria-current', 'page')
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('menu-backdrop')).toBeNull()
    expect(menuButton()).toHaveFocus()
  })

  it('closes on any route change, not only on a tap inside itself', async () => {
    const user = userEvent.setup()
    renderShell()

    // A redirect, a deep link, a page that navigates for you: the location moves with no click in
    // the panel, so `onNavigate` never runs and the drawer has to notice the location itself.
    await user.click(menuButton())
    expect(screen.getByRole('main').className).toContain('overflow-hidden')
    await routerGo((navigate) => navigate('/why'))

    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('menu-backdrop')).toBeNull()
    // The lock has to come off with it. Leaving it on is the half-closed state the review found:
    // a new page underneath a drawer that is gone, and nothing scrolls.
    expect(screen.getByRole('main').className).toMatch(SCROLLS)
    // Focus is not dragged back onto the hamburger. The reader did not dismiss the menu — the page
    // changed under it — so whoever the new page gave focus to keeps it.
    expect(menuButton()).not.toHaveFocus()

    // And the case the review actually hit: Android Back. A history pop, not a push.
    await user.click(menuButton())
    expect(screen.getByTestId('menu-backdrop')).toBeInTheDocument()
    await routerGo((navigate) => navigate(-1))

    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('menu-backdrop')).toBeNull()
    expect(screen.getByRole('main').className).toMatch(SCROLLS)
    expect(menuButton()).not.toHaveFocus()
  })

  it('stops the page behind from scrolling while it is open, and lets it scroll again after', async () => {
    const user = userEvent.setup()
    renderShell()

    // The lock is on <main>, not <body>: the shell is `h-screen overflow-hidden`, so <main> is the
    // only thing that scrolls. The class is the mechanism (jsdom does not scroll).
    const main = screen.getByRole('main')
    expect(main.className).toMatch(SCROLLS)

    await user.click(menuButton())
    expect(screen.getByRole('main').className).toContain('overflow-hidden')
    expect(screen.getByRole('main').className).not.toMatch(SCROLLS)

    await user.keyboard('{Escape}')
    expect(screen.getByRole('main').className).toMatch(SCROLLS)
  })

  it('stands down when the window grows to desktop, where the panel is the sidebar again', async () => {
    // The one place JavaScript reads the breakpoint: an "open" carried across into desktop width
    // would leave the scroll locked and the backdrop up over a sidebar that is no longer a drawer.
    // The whole suite shares this window, so the stub is installed before the render and put back.
    const real = window.matchMedia
    const listeners = new Set<() => void>()
    let wide = false
    window.matchMedia = ((query: string) => ({
      get matches() {
        return query === DESKTOP_QUERY ? wide : false
      },
      media: query,
      onchange: null,
      addEventListener: (_: string, fn: () => void) => {
        if (query === DESKTOP_QUERY) listeners.add(fn)
      },
      removeEventListener: (_: string, fn: () => void) => {
        listeners.delete(fn)
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia

    try {
      const user = userEvent.setup()
      renderShell()
      await user.click(menuButton())
      expect(screen.getByTestId('menu-backdrop')).toBeInTheDocument()

      wide = true
      act(() => listeners.forEach((fn) => fn()))

      expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByTestId('menu-backdrop')).toBeNull()
      expect(screen.getByRole('main').className).toMatch(SCROLLS)
      // No focus handed back on this path: the hamburger is display:none at this width, and
      // focusing a hidden element drops focus to <body> rather than restoring it.
      expect(menuButton()).not.toHaveFocus()
      // The Tab trap stands down with it. At md the panel is the permanent sidebar, and holding
      // the keyboard inside the sidebar would be the bug, not the fix.
      menuButton().focus()
      expect(tabIntercepted()).toBe(false)
    } finally {
      window.matchMedia = real
    }
  })
})

describe('the top bar and the interview bar share the screen', () => {
  it('takes its own row rather than floating over the pinned Calculate bar', async () => {
    renderShell('/interview')

    const interviewBar = await screen.findByTestId('interview-bar')

    // The bar is in the normal flow above <main>, so it cannot overlap anything inside the
    // scrollport: it only makes the scrollport shorter. Nothing pins it.
    expect(topBar().className).not.toMatch(/\b(fixed|absolute|sticky)\b/)
    expect(interviewBar.className).toMatch(/\bsticky\b/)
    // What can overlap the pinned bar is the drawer and its backdrop, and both are meant to:
    // z-40 and z-30 against the bar's z-10.
    expect(primaryNav().className).toMatch(/\bz-40\b/)
  })
})

describe('the footer provenance line', () => {
  it('is the short honest sentence below md, with the reference population still one tap away', async () => {
    const { client } = renderWithProviders(<AppLayout>{null}</AppLayout>)
    const meta = await client.getMeta()

    // getByText matches an element's own text, so this is literally what is left on a phone once
    // the `hidden md:inline` middle is not rendering: the model version, and the honesty.
    expect(
      await screen.findByText(`Model ${meta.model_version} — a statistical estimate, not a prediction.`),
    ).toBeInTheDocument()

    // Not deleted, just folded away — and folded rather than hung on a `title`, because a phone has
    // no hover to reveal a title with.
    const disclosure = screen.getByText('Reference population').closest('details')!
    expect(disclosure.className).toContain('md:hidden')
    expect(disclosure).toHaveTextContent(meta.countries.join(', '))
  })

  it('is unchanged from md up, where the full line has always fitted', async () => {
    const { client } = renderWithProviders(<AppLayout>{null}</AppLayout>)
    const meta = await client.getMeta()

    const provenance = await screen.findByTestId('footer-provenance')
    // `hidden md:inline` is the whole mechanism: the codes are in the sentence at desktop width and
    // out of it below md.
    expect(provenance.className).toContain('hidden')
    expect(provenance.className).toContain('md:inline')
    expect(provenance.parentElement).toHaveTextContent(
      `Model ${meta.model_version} · ${meta.algorithm} · reference population ${meta.countries.join(', ')} — a statistical estimate, not a prediction.`,
    )
  })
})
