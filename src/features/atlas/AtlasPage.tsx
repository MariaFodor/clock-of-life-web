// "The World" — the one surface in this app that is not about the reader.
//
// Every other page answers "what about me". This one answers the question that comes right after
// the first estimate lands: compared with WHAT? A number like "76 years" means nothing until you
// know that women born in Japan average 87 and women born in Nigeria average 65, and that the men
// beside them in the same country average five to seven years less almost everywhere on earth.
//
// So: population averages, drawn honestly, with the reader's own country marked — and no arithmetic
// between these figures and their personal estimate, because the two are not the same quantity
// (see the note in CountryCard).

import { useMemo, useState } from 'react'
import { useProfile } from '../../app/profile'
import { Card, ErrorState, Loading, PageHeader } from '../../components/ui'
import { StatisticalEstimateNote } from '../../components/framing'
import { MapLegend, MapReadout, MortalityMap } from './MortalityMap'
import { CountryCard } from './CountryCard'
import { CountryTable } from './CountryTable'
import {
  MEASURES,
  SEXES,
  countryByIso2,
  countryByKey,
  formatValue,
  keyOf,
  measureById,
  ranked,
  sexLabel,
  valueOf,
} from './measures'
import type { MeasureId } from './measures'
import { buildScale } from './scale'
import { useAtlas } from '../../api/hooks'
import { useAtlasGeometry } from './atlasData'
import type { ViewKey } from './types'
import type { AtlasCountry, SexKey } from '../../api/types'

const VIEWS: { id: ViewKey; label: string }[] = [
  { id: 'world', label: 'The globe' },
  { id: 'europe', label: 'Europe' },
]

/** The repo's radiogroup idiom (see InterviewPage), pulled out because this page needs three. */
function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string
  options: { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
  disabled?: boolean
}) {
  return (
    <div>
      <span className="label mb-1">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = value === o.id
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => onChange(o.id)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:opacity-40 ${
                on
                  ? 'border-clock-brand bg-clock-brandsoft text-clock-brand'
                  : 'border-clock-line bg-clock-canvas text-clock-ink hover:border-clock-brand/40'
              }`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Extremes({
  countries,
  measure,
  sex,
  onSelect,
}: {
  countries: AtlasCountry[]
  measure: ReturnType<typeof measureById>
  sex: SexKey
  onSelect: (iso3: string) => void
}) {
  const list = ranked(countries, measure.id, sex)
  const ends: { title: string; rows: typeof list }[] = [
    { title: 'Longest lives', rows: list.slice(0, 5) },
    { title: 'Shortest lives', rows: list.slice(-5).reverse() },
  ]
  return (
    <Card testId="extremes">
      <h3 className="font-semibold text-clock-ink">The two ends</h3>
      <p className="mt-1 text-xs text-clock-muted">
        {measure.label}
        {measure.bySex ? `, ${sexLabel(sex)}` : ''}.
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {ends.map((end) => (
          <div key={end.title}>
            <div className="text-xs uppercase tracking-wide text-clock-muted">{end.title}</div>
            <ul className="mt-1 space-y-1 text-sm">
              {end.rows.map((r) => (
                <li key={keyOf(r.country)} className="flex items-baseline justify-between gap-2">
                  <button
                    type="button"
                    className="text-left text-clock-ink hover:text-clock-brand hover:underline"
                    onClick={() => onSelect(keyOf(r.country))}
                  >
                    {r.country.name}
                  </button>
                  <span className="whitespace-nowrap text-clock-muted">{formatValue(r.value, measure)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  )
}

export function AtlasPage() {
  const { profile } = useProfile()
  const [view, setView] = useState<ViewKey>('world')
  const [measureId, setMeasureId] = useState<MeasureId>('le0')
  // Opens on the reader's own sex when the profile knows it — the first country they look at is
  // almost always their own, and the first row they want is their own.
  const [sex, setSex] = useState<SexKey>(profile?.sex === 'M' ? 'm' : profile?.sex === 'F' ? 'f' : 'b')
  const [picked, setPicked] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  const atlas = useAtlas()
  const geo = useAtlasGeometry(view)

  const measure = measureById(measureId)
  // The women-minus-men gap has no single sex. Rather than letting the selector sit there lying
  // about what it controls, it is disabled and the value is pinned.
  const effectiveSex: SexKey = measure.bySex ? sex : 'b'

  const countries = atlas.data?.countries ?? []
  // Printed from the payload, never from a constant here: the page must attribute what it actually
  // drew. Change the artifact's retrieval date and this screen changes with it.
  const source = atlas.data?.sources?.[0]
  const atlasYear = countries[0]?.lifetable_year ?? source?.year ?? 0
  const home = countryByIso2(countries, profile?.country)
  const selected = picked ?? (home ? keyOf(home) : null)

  const values = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of countries) {
      const v = valueOf(c, measureId, effectiveSex)
      if (v !== undefined) map.set(keyOf(c), v)
    }
    return map
  }, [countries, measureId, effectiveSex])

  const scale = useMemo(() => buildScale([...values.values()], measure), [values, measure])

  const readoutIso = hovered ?? selected
  const readoutCountry = countryByKey(countries, readoutIso)

  return (
    <div>
      <PageHeader
        title="The World"
        subtitle={
          atlas.data
            ? `How long people live, country by country — and how far apart women and men are. UN World Population Prospects, ${atlasYear} estimates.`
            : 'How long people live, country by country — and how far apart women and men are.'
        }
      />

      {atlas.isLoading && <Loading label="Loading the world’s life tables…" />}
      {atlas.isError && <ErrorState message={(atlas.error as Error).message} />}

      {atlas.data && (
        <>
          <Card>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <Segmented label="View" options={VIEWS} value={view} onChange={setView} />
              <Segmented
                label="Show"
                options={MEASURES.map((m) => ({ id: m.id, label: m.label }))}
                value={measureId}
                onChange={setMeasureId}
              />
              <Segmented
                label="Who"
                options={SEXES}
                value={effectiveSex}
                onChange={setSex}
                disabled={!measure.bySex}
              />
              <div>
                <label className="label mb-1" htmlFor="atlas-country">
                  Find a country
                </label>
                <select
                  id="atlas-country"
                  className="field"
                  value={selected ?? ''}
                  onChange={(e) => setPicked(e.target.value || null)}
                >
                  <option value="">Choose a country…</option>
                  {[...countries]
                    .sort((a, b) => (a.name ?? a.iso2).localeCompare(b.name ?? b.iso2))
                    .map((c) => (
                      <option key={keyOf(c)} value={keyOf(c)}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-clock-muted">{measure.note}</p>
          </Card>

          <Card className="mt-4">
            {geo.isLoading && <Loading label="Drawing the map…" />}
            {geo.isError && <ErrorState message={(geo.error as Error).message} />}
            {geo.data && (
              <MortalityMap
                geometry={geo.data}
                values={values}
                scale={scale}
                measure={measure}
                selected={selected}
                home={home ? keyOf(home) : undefined}
                onSelect={(iso3) => setPicked(iso3)}
                onHover={setHovered}
                label={
                  `${measure.label}${measure.bySex ? `, ${sexLabel(effectiveSex)}` : ''}, by country. ` +
                  `${atlasYear}, ${values.size} countries with a figure. ` +
                  'The country selector above and the table below carry the same numbers as text.'
                }
              />
            )}
            <MapLegend scale={scale} measure={measure} />
            <div className="mt-2">
              <MapReadout
                name={readoutCountry?.name ?? undefined}
                value={readoutIso ? values.get(readoutIso) : undefined}
                measure={measure}
                sexNote={measure.bySex ? `(${sexLabel(effectiveSex)})` : ''}
              />
            </div>
          </Card>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {countryByKey(countries, selected) ? (
              <CountryCard
                country={countryByKey(countries, selected)!}
                countries={countries}
                measure={measure}
                sex={effectiveSex}
                isHome={!!home && selected === keyOf(home)}
                year={atlasYear}
              />
            ) : (
              <Card>
                <p className="text-sm text-clock-muted">
                  Pick a country — on the map, from the selector, or out of the table — to see its
                  full set of figures.
                </p>
              </Card>
            )}
            <Extremes
              countries={countries}
              measure={measure}
              sex={effectiveSex}
              onSelect={(iso3) => setPicked(iso3)}
            />
          </div>

          <Card className="mt-4">
            <CountryTable
              countries={countries}
              measure={measure}
              sex={effectiveSex}
              selected={selected}
              onSelect={(iso3) => setPicked(iso3)}
            />
          </Card>

          <div className="mt-4 space-y-2">
            <StatisticalEstimateNote>
              These are whole-population averages for a country in one year, not estimates about any
              person in it. Your own Life Clock is built from the SAME life tables — the number on this
              map is what this app computes for someone of average risk — but it is not a number to
              subtract from yours: life expectancy at birth counts from zero and is dragged down by
              every death before your age, while your estimate is conditional on the age you have
              already reached.
            </StatisticalEstimateNote>
            <p className="text-xs leading-relaxed text-clock-muted">
              {/* Printed from the served payload, not from a string in this file. The page cannot
                  misattribute what it drew, and changing the artifact changes this line. */}
              Source: {source?.url ? (
                <a className="text-clock-brand hover:underline" href={source.url}
                   target="_blank" rel="noreferrer noopener">{source.dataset}</a>
              ) : (source?.dataset ?? 'the model bundle')}
              {source?.variant ? `, ${source.variant}` : ''}
              {source?.retrieved ? `, retrieved ${source.retrieved}` : ''}
              {source?.licence ? (
                <>
                  , under{' '}
                  {source.licence_url ? (
                    <a className="text-clock-brand hover:underline" href={source.licence_url}
                       target="_blank" rel="noreferrer noopener">{source.licence}</a>
                  ) : source.licence}
                </>
              ) : null}
              . Figures derived by the service as{' '}
              <code className="rounded bg-clock-canvas px-1">{atlas.data.derived_by}</code>.
              Boundaries:{' '}
              <a
                className="text-clock-brand hover:underline"
                href="https://www.naturalearthdata.com/about/terms-of-use/"
                target="_blank"
                rel="noreferrer noopener"
              >
                Natural Earth
              </a>{' '}
              (public domain), drawn on equal-area projections so a country's colour covers an area
              proportional to its size.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
