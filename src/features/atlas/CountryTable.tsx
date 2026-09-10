// Every country as text, ordered by whatever the map is currently showing.
//
// This is not a fallback nobody looks at: it is the only way to read the 18 countries too small to
// have a shape at this scale (Malta, Singapore, Mauritius, the island states), the only way through
// the data without a mouse, and the fastest way to answer "where does my country come".

import { keyOf, formatValue, ranked, valueOf } from './measures'
import type { Measure } from './measures'
import type { AtlasCountry, SexKey } from '../../api/types'

export function CountryTable({
  countries,
  measure,
  sex,
  selected,
  onSelect,
}: {
  countries: AtlasCountry[]
  measure: Measure
  sex: SexKey
  selected: string | null
  onSelect: (iso3: string) => void
}) {
  const rows = ranked(countries, measure.id, sex)
  const missing = countries.filter((c) => valueOf(c, measure.id, sex) === undefined)

  return (
    <details className="group">
      <summary className="cursor-pointer text-sm font-medium text-clock-ink">
        All {countries.length} countries, ranked by {measure.label.toLowerCase()}
      </summary>

      <div className="mt-3 max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">
            {measure.label}
            {measure.bySex ? `, ${sex === 'f' ? 'women' : sex === 'm' ? 'men' : 'both sexes'}` : ''}, by country,
            longest lives first
          </caption>
          <thead className="sticky top-0 bg-clock-surface">
            <tr className="border-b border-clock-line text-left text-clock-muted">
              <th className="py-2 font-medium">#</th>
              <th className="py-2 font-medium">Country</th>
              <th className="py-2 font-medium">Region</th>
              <th className="py-2 text-right font-medium">{measure.label}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.country.iso3}
                className={`border-b border-clock-line last:border-0 ${
                  row.country.iso3 === selected ? 'bg-clock-brandsoft' : ''
                }`}
              >
                <td className="py-1.5 text-clock-muted">{i + 1}</td>
                <td className="py-1.5">
                  <button
                    type="button"
                    className="text-left text-clock-ink hover:text-clock-brand hover:underline"
                    aria-current={keyOf(row.country) === selected ? 'true' : undefined}
                    onClick={() => onSelect(keyOf(row.country))}
                  >
                    {row.country.name}
                  </button>
                </td>
                <td className="py-1.5 text-clock-muted">{row.country.region}</td>
                <td className="py-1.5 text-right font-medium text-clock-ink">
                  {formatValue(row.value, measure)}
                </td>
              </tr>
            ))}
            {missing.map((c) => (
              <tr key={keyOf(c)} className="border-b border-clock-line last:border-0">
                <td className="py-1.5 text-clock-muted">—</td>
                <td className="py-1.5 text-clock-ink">{c.name}</td>
                <td className="py-1.5 text-clock-muted">{c.region}</td>
                <td className="py-1.5 text-right text-clock-muted">no figure</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
