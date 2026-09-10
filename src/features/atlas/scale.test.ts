import { describe, expect, it } from 'vitest'
import { CLASSES, NO_DATA_FILL, buildScale } from './scale'

/** The alpha the ramp produced, dug back out of the css string. */
const alphaOf = (fill: string): number => Number(/\/ ([\d.]+)\)/.exec(fill)![1])

describe('choropleth scale', () => {
  const oneToTwelve = Array.from({ length: 12 }, (_, i) => i + 1)

  it('spans the data exactly: first break is the minimum, last is the maximum', () => {
    const s = buildScale(oneToTwelve, { higherIsBetter: true })
    expect(s.breaks).toHaveLength(CLASSES + 1)
    expect(s.breaks[0]).toBe(1)
    expect(s.breaks[CLASSES]).toBe(12)
    expect([...s.breaks].sort((a, b) => a - b)).toEqual(s.breaks)
  })

  it('assigns the extremes to the end classes', () => {
    const s = buildScale(oneToTwelve, { higherIsBetter: true })
    expect(s.classOf(1)).toBe(0)
    expect(s.classOf(12)).toBe(CLASSES - 1)
  })

  it('still differentiates a heavily skewed measure (the adult-mortality shape)', () => {
    // 50 countries in a narrow band and one far outlier: a linear scale would paint the 50
    // identically. Quantile classes must spread the band across the palette.
    const skewed = [...Array.from({ length: 50 }, (_, i) => 40 + i), 600]
    const s = buildScale(skewed, { higherIsBetter: false })
    expect(s.classOf(600)).toBe(CLASSES - 1)
    const used = new Set(skewed.map((v) => s.classOf(v)))
    expect(used.size).toBe(CLASSES)
  })

  it('the strongest colour always means longer lives, so the mortality ramp runs backwards', () => {
    const up = buildScale(oneToTwelve, { higherIsBetter: true })
    const down = buildScale(oneToTwelve, { higherIsBetter: false })
    expect(alphaOf(up.fillOfClass(CLASSES - 1))).toBeGreaterThan(alphaOf(up.fillOfClass(0)))
    expect(alphaOf(down.fillOfClass(CLASSES - 1))).toBeLessThan(alphaOf(down.fillOfClass(0)))
    expect(down.inverted).toBe(true)
  })

  it('says it in ALPHA, which is the only channel that rises in both themes', () => {
    // The invariant is strength, not darkness: alpha rising over a white sea reads as darker and
    // over a near-black one as lighter, and the legend used to promise "darker" on both. Whatever
    // the ramp is called, every class must differ from its neighbour in alpha and in nothing else —
    // one hue, one channel, monotonic — because that is the only claim the copy can make honestly.
    const s = buildScale(oneToTwelve, { higherIsBetter: true })
    const fills = Array.from({ length: CLASSES }, (_, cls) => s.fillOfClass(cls))
    expect(new Set(fills.map((f) => f.replace(/\/ [\d.]+\)/, '')))).toEqual(
      new Set(['rgb(var(--clock-brand) ']),
    )
    const alphas = fills.map(alphaOf)
    expect([...alphas].sort((a, b) => a - b)).toEqual(alphas)
    expect(new Set(alphas).size).toBe(CLASSES)
  })

  it('renders missing data as the neutral fill, never as a value', () => {
    const s = buildScale(oneToTwelve, { higherIsBetter: true })
    expect(s.fillOf(undefined)).toBe(NO_DATA_FILL)
    expect(s.fillOf(1)).not.toBe(NO_DATA_FILL)
  })
})
