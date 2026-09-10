// What the World map can show, and how to read it.
//
// Every measure here is a POPULATION average — a property of a country in a year, not a prediction
// about anyone in it. The wording throughout keeps that distinction visible: "people born in X live
// Y years on average", never "you will live".
//
// The numbers arrive from `GET /api/atlas`, derived by the service from the model bundle's own life
// tables. There is no copy of them in this repo, deliberately: a second dataset in the front end is
// how the first draft of this surface came to disagree with the Life Clock by 3.6 years.

import type { AtlasCountry, SexKey } from '../../api/types'

export type MeasureId = 'le0' | 'le60' | 'am' | 'gap'

export interface Measure {
  id: MeasureId
  label: string
  /** unit shown next to a value */
  unit: string
  /**
   * The unit spelled out, for the two places with room for a full phrase: the legend's own line and
   * the country card. `unit` is the short form, and it stays short because it has to fit beside a
   * number in a dense row — "128 per 1,000 alive at 15" in a table cell is unreadable, and "128"
   * with the unit nowhere on the card was the defect. Omitted where there is nothing to spell out.
   */
  unitLong?: string
  /** How the figure is produced, for the page to say plainly. */
  derivation: string
  /** true when the ramp should grow STRONGER as the number grows. Ramp DIRECTION only. */
  higherIsBetter: boolean
  /**
   * What a bigger number means for how long people live — and `'none'` when it means neither.
   *
   * These two came apart on the women-minus-men gap and had to be separated. The gap is a DIFFERENCE:
   * the widest ones (Russia, Ukraine, Belarus, at 10-13 years) are where male mortality is
   * catastrophic, and the narrowest include both Norway and Nigeria. Treating "bigger" as "better"
   * gave those countries the strongest colour under a legend promising the colour tracked how long
   * people live, and put Ukraine under a heading reading LONGEST LIVES. The colour promise is still
   * worth keeping on the three measures where it holds; it simply does not extend to a difference.
   */
  longevity: 'up' | 'down' | 'none'
  /**
   * The words at the two ends of the legend's value axis: what the SMALLEST numbers it prints mean,
   * and what the LARGEST ones mean. Written per measure rather than derived from `longevity`,
   * because "down" does not imply "deaths" — the next falling measure we add might be years lost,
   * and a derived pair would then say something false with no test able to notice.
   *
   * These label the numbers, not the colours, and that is the point: the colour ramp reads as
   * darkening on a light screen and lightening on a dark one, while the numbers run the same way in
   * both. See the note at the top of `scale.ts`.
   */
  legendEnds: { low: string; high: string }
  /** false for the women-minus-men gap, which is a comparison BETWEEN the sexes */
  bySex: boolean
  decimals: number
  /** one line under the map: what the number actually counts */
  note: string
}

export const MEASURES: Measure[] = [
  {
    id: 'le0',
    label: 'Life expectancy at birth',
    unit: 'years',
    derivation: 'remaining_le(qx, 0, rr=1) — the same integrator as your own Life Clock',
    higherIsBetter: true,
    longevity: 'up',
    legendEnds: { low: 'shorter lives', high: 'longer lives' },
    bySex: true,
    decimals: 1,
    note: 'How long a baby born here would live if this year’s death rates held for their whole life. It is a snapshot of the present, not a forecast of the future.',
  },
  {
    id: 'le60',
    label: 'Years still ahead at 60',
    unit: 'years',
    derivation: 'remaining_le(qx, 60, rr=1)',
    higherIsBetter: true,
    longevity: 'up',
    legendEnds: { low: 'shorter lives', high: 'longer lives' },
    bySex: true,
    decimals: 1,
    note: 'Life expectancy for someone who has already reached 60 — always more than "at birth" minus 60, because they have survived everything that happens before it.',
  },
  {
    id: 'am',
    label: 'Deaths between 15 and 60',
    unit: 'per 1,000',
    unitLong: 'per 1,000 alive at 15',
    derivation: '1000 × (1 − Π(1 − qx) over ages 15–59)',
    higherIsBetter: false,
    longevity: 'down',
    // The colour on this map runs backwards against the number, but the printed ranges do not: the
    // legend's left end is still its smallest figure. So the ends are said in DEATHS, the thing the
    // ranges count — "shorter lives" beside the fewest deaths would be exactly wrong.
    legendEnds: { low: 'fewer deaths', high: 'more deaths' },
    bySex: true,
    decimals: 0,
    note: 'Of 1,000 people alive at 15, how many would die before 60 if this year’s death rates held — the same synthetic snapshot as life expectancy at birth, and the working-age mortality that figure blends together with infant deaths and old age.',
  },
  {
    id: 'gap',
    label: 'Women’s advantage',
    unit: 'years',
    derivation: 'life expectancy at birth, women minus men',
    higherIsBetter: true,
    longevity: 'none',
    // Not "shorter/longer lives": a wide gap is not a long life, it is a short male one.
    legendEnds: { low: 'narrower gap', high: 'wider gap' },
    bySex: false,
    decimals: 1,
    note: 'Women’s life expectancy at birth minus men’s. It is positive almost everywhere, and it is not biology alone — the gap moves with smoking, drinking and violent death, which is why it varies so much between countries.',
  },
]

/**
 * The key the map, the table and the selection all agree on.
 *
 * The boundaries are keyed by ISO 3166-1 alpha-3 and the service sends one for every real country;
 * the fallback keeps a country that somehow lacks one selectable rather than silently invisible.
 */
export const keyOf = (c: AtlasCountry): string => c.iso3 ?? c.iso2

export const measureById = (id: MeasureId): Measure =>
  MEASURES.find((m) => m.id === id) ?? MEASURES[0]

export const SEXES: { id: SexKey; label: string }[] = [
  { id: 'f', label: 'Women' },
  { id: 'm', label: 'Men' },
  { id: 'b', label: 'Both' },
]

export const sexLabel = (sex: SexKey): string =>
  SEXES.find((s) => s.id === sex)?.label.toLowerCase() ?? sex

/**
 * The one number the map draws. Returns undefined when the atlas carries no value for that country and sex —
 * which the map must render as "no data" rather than as a zero.
 */
export function valueOf(country: AtlasCountry, measure: MeasureId, sex: SexKey): number | undefined {
  if (measure === 'gap') {
    const f = country.le0?.f
    const m = country.le0?.m
    return f === undefined || m === undefined ? undefined : Math.round((f - m) * 10) / 10
  }
  return country[measure]?.[sex]
}

export const formatValue = (v: number, measure: Measure): string =>
  `${v.toFixed(measure.decimals)} ${measure.unit}`

/** The unit for a place with room for the whole phrase; falls back to the short form. */
export const longUnitOf = (measure: Measure): string => measure.unitLong ?? measure.unit

/** The words for each end of the ranking, so nothing downstream has to guess what "first" means. */
export const endsOf = (measure: Measure): { first: string; last: string } =>
  measure.longevity === 'none'
    ? { first: 'Widest gap', last: 'Narrowest gap' }
    : { first: 'Longest lives', last: 'Shortest lives' }

/** Countries that have a value for this measure and sex, ordered so the first is `endsOf().first`.
 *
 *  Takes the country list rather than importing it: the data module is ~80 KB that only the World
 *  surface ever needs, and it can only stay in its own lazily-loaded chunk if nothing on the eager
 *  side of the app reaches into it. */
export function ranked(
  countries: AtlasCountry[],
  measure: MeasureId,
  sex: SexKey,
): { country: AtlasCountry; value: number }[] {
  const better = measureById(measure).higherIsBetter ? -1 : 1
  return countries
    .flatMap((country) => {
      const value = valueOf(country, measure, sex)
      return value === undefined ? [] : [{ country, value }]
    })
    .sort((a, b) => better * (a.value - b.value) || (a.country.name ?? a.country.iso2).localeCompare(b.country.name ?? b.country.iso2))
}

/** Where a country sits in that ranking, 1 = longest lives. */
export function rankOf(
  countries: AtlasCountry[],
  key: string,
  measure: MeasureId,
  sex: SexKey,
): { rank: number; of: number } | null {
  const list = ranked(countries, measure, sex)
  const i = list.findIndex((r) => keyOf(r.country) === key)
  return i === -1 ? null : { rank: i + 1, of: list.length }
}

/** The reader's own country, matched from the two-letter code their profile carries. */
export const countryByIso2 = (
  countries: AtlasCountry[],
  iso2: string | undefined,
): AtlasCountry | undefined =>
  iso2 ? countries.find((c) => c.iso2 === iso2.toUpperCase()) : undefined

export const countryByKey = (
  countries: AtlasCountry[],
  key: string | null,
): AtlasCountry | undefined => (key ? countries.find((c) => keyOf(c) === key) : undefined)
