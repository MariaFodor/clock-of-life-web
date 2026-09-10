// One country, read out in full — every measure, for women and men side by side.
//
// The map can only ever show one number at a time; this is where a reader who has found a country
// gets the rest of it, including the comparison the whole surface exists to make visible: how far
// apart women and men are in the same place.

import { Card } from '../../components/ui'
import { keyOf, MEASURES, formatValue, measureById, rankOf, valueOf } from './measures'
import type { Measure } from './measures'
import type { AtlasCountry, SexKey } from '../../api/types'

const ordinal = (n: number): string => {
  const teens = n % 100
  if (teens >= 11 && teens <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

export function CountryCard({
  country,
  countries,
  measure,
  sex,
  isHome,
  year,
}: {
  country: AtlasCountry
  countries: AtlasCountry[]
  measure: Measure
  sex: SexKey
  isHome: boolean
  year: number
}) {
  const rank = rankOf(countries, keyOf(country), measure.id, sex)
  const gap = valueOf(country, 'gap', 'b')

  return (
    <Card testId="country-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold text-clock-ink">{country.name}</h3>
        <span className="text-xs text-clock-muted">{country.region}</span>
      </div>

      {rank && (
        <p className="mt-1 text-xs text-clock-muted">
          {ordinal(rank.rank)} of {rank.of} countries on {measure.label.toLowerCase()}
          {measure.bySex ? ` for ${sex === 'f' ? 'women' : sex === 'm' ? 'men' : 'both sexes'}` : ''}.
        </p>
      )}

      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b border-clock-line text-left text-clock-muted">
            <th className="py-2 font-medium">UN WPP {year}</th>
            <th className="py-2 text-right font-medium">Women</th>
            <th className="py-2 text-right font-medium">Men</th>
            <th className="py-2 text-right font-medium">Both</th>
          </tr>
        </thead>
        <tbody>
          {MEASURES.filter((m) => m.bySex).map((m) => (
            <tr key={m.id} className="border-b border-clock-line last:border-0">
              <td className={`py-2 ${m.id === measure.id ? 'font-medium text-clock-ink' : 'text-clock-muted'}`}>
                {m.label}
              </td>
              {(['f', 'm', 'b'] as SexKey[]).map((s) => {
                const v = valueOf(country, m.id, s)
                return (
                  <td key={s} className="py-2 text-right text-clock-ink">
                    {v === undefined ? <span className="text-clock-muted">—</span> : v.toFixed(m.decimals)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        {gap !== undefined && (
          <span className="text-clock-ink">
            {gap < 0 ? 'Men outlive women here by' : 'Women outlive men here by'}{' '}
            <strong>{formatValue(Math.abs(gap), measureById('gap'))}</strong>
            {gap < 0 && ' — genuinely unusual: women outlive men almost everywhere'}.
          </span>
        )}
      </div>

      {!country.scoreable && (
        <p className="mt-3 rounded-lg border border-clock-line bg-clock-canvas p-3 text-xs leading-relaxed text-clock-muted">
          Shown for comparison. This app cannot work out a personal estimate for someone living in{' '}
          {country.name} yet — the calculation needs national smoking and weight figures to know what
          an average person there looks like, and it only has those for Europe. The life table above
          is real; what is missing is the person to compare you with.
        </p>
      )}

      {isHome && (
        <p className="mt-3 rounded-lg border border-clock-line bg-clock-canvas p-3 text-xs leading-relaxed text-clock-muted">
          This is the country on your profile. Resist subtracting: your own estimate is the number of
          years ahead of <em>someone who has already reached your age</em>, while life expectancy at
          birth counts from zero and is dragged down by every death before it. The two answer
          different questions, and the gap between them is not a score.
        </p>
      )}
    </Card>
  )
}
