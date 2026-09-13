// Motion helpers: respect the viewer's reduced-motion preference, and a small count-up animation used
// by the Life Clock. Both collapse to their final value immediately when motion is reduced.

import { useEffect, useRef, useState } from 'react'

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return true
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])

  return reduced
}

/**
 * Animate a number from 0 → target over `durationMs`. Returns target immediately if motion is reduced.
 *
 * IT MUST REACH `target` EVEN IF IT NEVER ANIMATES. `requestAnimationFrame` does not run in a hidden or
 * heavily throttled tab, and this hook drives the Life Clock's centre number AND every arc on the dial.
 * Without the guarantees below, a reader who tabbed away while their estimate was calculating came back
 * to a blank dial reading "0.0 more years" — permanently, because the effect only re-runs when `target`
 * changes. The screen-reader label was right the whole time, which is how it stayed invisible.
 *
 * Three things make the end state unconditional:
 *   1. a document that is already hidden skips the animation entirely — there is nobody to show it to,
 *      and the value must be correct the moment they look;
 *   2. a timeout backstop lands on `target` even if not one frame is served (background timers are
 *      clamped, not cancelled, so this fires where rAF does not);
 *   3. the tab going hidden mid-animation snaps to the end rather than freezing part-way.
 */
export function useCountUp(target: number, durationMs = 900): number {
  const reduced = useReducedMotion()
  const [value, setValue] = useState(reduced ? target : 0)
  const frame = useRef<number>()

  useEffect(() => {
    // An unusable target can never be animated TO, and easing it would paint NaN into the dial.
    if (reduced || !Number.isFinite(target) || typeof requestAnimationFrame !== 'function'
        || (typeof document !== 'undefined' && document.hidden)) {
      setValue(target)
      return
    }
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      // easeOutCubic for a natural settle
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(target * eased)
      if (t < 1) frame.current = requestAnimationFrame(tick)
      else setValue(target)
    }
    frame.current = requestAnimationFrame(tick)

    // The backstop. Deliberately generous: a slow first paint should finish the animation, not be
    // overruled by it. What it rules out is the animation never finishing at all.
    const settle = setTimeout(() => setValue(target), durationMs + 400)
    const onHidden = () => {
      if (document.hidden) setValue(target)
    }
    document.addEventListener?.('visibilitychange', onHidden)

    return () => {
      if (frame.current) cancelAnimationFrame(frame.current)
      clearTimeout(settle)
      document.removeEventListener?.('visibilitychange', onHidden)
    }
  }, [target, durationMs, reduced])

  return value
}
