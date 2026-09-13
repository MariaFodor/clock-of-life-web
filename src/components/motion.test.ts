// The count-up must REACH its target even when it never animates.
//
// `requestAnimationFrame` does not run in a hidden or heavily throttled tab, and this hook drives the
// Life Clock's centre number and every arc on the dial. A reader who tabbed away while their estimate
// was calculating came back to a blank dial reading "0.0 more years" — permanently, because the effect
// only re-runs when `target` changes. Nine seconds after landing, in a real browser, it still read 0.0.
//
// So these tests do not check the easing curve. They check the only property that matters: whatever
// happens to the frame clock, the value ends up at the target.

import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCountUp } from './motion'

const realRaf = globalThis.requestAnimationFrame
const realCancel = globalThis.cancelAnimationFrame

/** A frame clock that never serves a frame — what a backgrounded tab actually does. */
function starveFrames() {
  globalThis.requestAnimationFrame = (() => 1) as unknown as typeof requestAnimationFrame
  globalThis.cancelAnimationFrame = (() => {}) as unknown as typeof cancelAnimationFrame
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
}

beforeEach(() => {
  vi.useFakeTimers()
  setHidden(false)
  // The animation path is the one under test, so motion must not read as reduced. `useReducedMotion`
  // defaults to TRUE when `window.matchMedia` is absent — a deliberate fail-safe — and jsdom has no
  // matchMedia, so without this stub every test here would silently exercise the short-circuit and
  // prove nothing about the bug.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  globalThis.requestAnimationFrame = realRaf
  globalThis.cancelAnimationFrame = realCancel
  setHidden(false)
})

describe('useCountUp', () => {
  it('reaches the target even if not one frame is ever served', () => {
    starveFrames()
    const { result } = renderHook(() => useCountUp(42, 900))
    // This is the state a backgrounded tab was stuck in — forever.
    expect(result.current).toBe(0)
    act(() => {
      vi.advanceTimersByTime(1400)
    })
    expect(result.current).toBe(42)
  })

  it('does not animate at all when the document is already hidden', () => {
    setHidden(true)
    starveFrames()
    const { result } = renderHook(() => useCountUp(42, 900))
    // Nobody is looking, and the value must be right the moment they do.
    expect(result.current).toBe(42)
  })

  it('snaps to the target when the tab is hidden mid-animation', () => {
    starveFrames()
    const { result } = renderHook(() => useCountUp(42, 900))
    expect(result.current).toBe(0)
    act(() => {
      setHidden(true)
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current).toBe(42)
  })

  it('never paints NaN when the target is not a number', () => {
    starveFrames()
    // An estimate that failed to parse would otherwise ease toward NaN and render "NaN more years"
    // in 46px type in the middle of the dial.
    const { result } = renderHook(() => useCountUp(Number.NaN, 900))
    expect(Number.isNaN(result.current)).toBe(true)
    expect(result.current).not.toBe(0)
  })

  it('still animates normally when frames are served', () => {
    let cb: FrameRequestCallback | null = null
    globalThis.requestAnimationFrame = ((fn: FrameRequestCallback) => {
      cb = fn
      return 1
    }) as unknown as typeof requestAnimationFrame
    const { result } = renderHook(() => useCountUp(100, 900))
    expect(result.current).toBe(0)
    act(() => {
      cb?.(performance.now() + 450)
    })
    // Part-way, eased — the point is that it moved without the backstop firing.
    expect(result.current).toBeGreaterThan(0)
    expect(result.current).toBeLessThanOrEqual(100)
  })
})
