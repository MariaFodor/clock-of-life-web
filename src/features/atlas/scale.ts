// The colour scale behind the choropleth.
//
// Two decisions worth knowing about:
//
// 1. QUANTILE classes, not equal-width ones. Adult mortality runs from 35 per 1,000 to over 600; on
//    a linear ramp 150 countries share the palest two shades and Lesotho is the only country you can
//    see. Equal-count classes always differentiate — the price is that the classes are unequal in
//    value, so the legend prints the actual boundaries and never leaves the reader guessing.
//
// 2. DARKER ALWAYS MEANS PEOPLE LIVE LONGER, including on the mortality map, where that means the
//    ramp runs backwards against the number. Keeping the colour's meaning fixed across measures is
//    worth more than keeping its direction fixed against the value: a reader who learns "dark = good
//    news" on one map and carries it to the next is right, instead of exactly wrong.

import type { Measure } from './measures'

export const CLASSES = 6

export interface ColorScale {
  /** class boundaries in value space, ascending, CLASSES + 1 of them */
  breaks: number[]
  /** which class a value falls in, 0 … CLASSES-1 */
  classOf: (value: number) => number
  /** css colour of a class */
  fillOfClass: (cls: number) => string
  /** css colour of a value; `undefined` (no figure for this country) gets the neutral grey */
  fillOf: (value: number | undefined) => string
  /** true when the ramp runs against the number (mortality: more deaths = paler) */
  inverted: boolean
}

// A different HUE, not a paler one. Against the brand ramp's blue this grey is distinguishable at a
// glance; a paler blue measured 1.16:1 against the lightest data class and 1.23:1 against the sea,
// which meant the countries the map most exists to show — Nigeria, Chad, Lesotho, South Sudan — were
// the ones a reader could not see.
export const NO_DATA_FILL = 'rgb(var(--clock-muted) / 0.38)'

/** Linear interpolation between order statistics — the same quantile definition d3 uses. */
function quantileBreaks(values: number[], classes: number): number[] {
  const sorted = [...values].sort((a, b) => a - b)
  const breaks = [sorted[0]]
  for (let i = 1; i < classes; i++) {
    const pos = (i / classes) * (sorted.length - 1)
    const lo = Math.floor(pos)
    const hi = Math.ceil(pos)
    breaks.push(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo))
  }
  breaks.push(sorted[sorted.length - 1])
  return breaks
}

export function buildScale(values: number[], measure: Pick<Measure, 'higherIsBetter'>): ColorScale {
  const usable = values.filter((v) => Number.isFinite(v))
  const breaks = usable.length > 0 ? quantileBreaks(usable, CLASSES) : new Array(CLASSES + 1).fill(0)
  const inverted = !measure.higherIsBetter

  const classOf = (value: number): number => {
    // Upper-inclusive at the top so the single darkest country is not pushed out of its own class.
    for (let cls = CLASSES - 1; cls > 0; cls--) if (value >= breaks[cls]) return cls
    return 0
  }

  const fillOfClass = (cls: number): string => {
    const t = cls / (CLASSES - 1)
    // Floor at 0.30, not 0.16: below that the palest class is indistinguishable from the sea and
    // from "no figure" in both themes, and colour is the only channel carrying the value.
    const alpha = 0.3 + 0.7 * (inverted ? 1 - t : t)
    // A single hue at varying strength, expressed through the theme token: the map re-tints itself
    // in dark mode with the rest of the app instead of carrying its own hardcoded palette.
    return `rgb(var(--clock-brand) / ${alpha.toFixed(2)})`
  }

  return {
    breaks,
    classOf,
    fillOfClass,
    fillOf: (value) => (value === undefined ? NO_DATA_FILL : fillOfClass(classOf(value))),
    inverted,
  }
}
