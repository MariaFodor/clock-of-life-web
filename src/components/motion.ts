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

/** Animate a number from 0 → target over `durationMs`. Returns target immediately if motion is reduced. */
export function useCountUp(target: number, durationMs = 900): number {
  const reduced = useReducedMotion()
  const [value, setValue] = useState(reduced ? target : 0)
  const frame = useRef<number>()

  useEffect(() => {
    if (reduced) {
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
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current)
    }
  }, [target, durationMs, reduced])

  return value
}
