import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useProfile } from '../../app/profile'
import { useMeta, usePlaces } from '../../api/hooks'
import { getClient } from '../../api/client'
import type { HttpError } from '../../api/httpClient'
import type { Place, RelocateResult } from '../../api/types'
import { PageHeader, Card, NeedsProfile, Loading, ErrorState } from '../../components/ui'
import { StatisticalEstimateNote } from '../../components/framing'
import { fmtDelta, deltaTone } from '../../components/format'

/**
 * Fold case and accents so "Timisoara" finds "Timișoara" and "brasov" finds "Brasov". The settlement
 * names arrive as WHO wrote them, diacritics included; the reader types on whatever keyboard they have.
 */
const fold = (s: string): string => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/**
 * The status of a failed request, when the thrown error carries one (see `HttpError`). An error with no
 * status — a request that never reached the service, or a client that throws a plain Error — reads as
 * undefined, which is not 404, so it can never be mistaken for the service's refusal.
 */
const statusOf = (e: unknown): number | undefined => {
  const status = (e as Partial<HttpError> | null)?.status
  return typeof status === 'number' ? status : undefined
}

/**
 * A row the list must not offer, because it does not name anywhere.
 *
 * The bundle's places.json carries five settlements whose city is the literal string "Unknown" (in
 * Colombia, France, India, Israel and the United States); the French one sits at -6.5, 5.7 — the Gulf of
 * Guinea, not France. They are served by `/api/places/{iso3}` like any other row AND seeded into the
 * service's location table under that name, so each rendered a card whose Compare button really did
 * answer, pricing a move to a place that does not exist. The same five are in this repo's environment
 * fixture, which is generated from the service, so the mock shows them too.
 *
 * Dropping them here is a screen fix, not the honest one: the rows should not be in the seeds. That is an
 * owner observation logged against the service's data (UX-REVIEW-2026-09-10, "Unknown settlements"), and
 * nothing this page can repair from where it sits.
 */
const isUnnamedPlace = (city: string): boolean => city === 'Unknown'

/**
 * One place's greenness, with its basis when the two differ.
 *
 * The basis is not decoration: 3,066 of the 3,521 settlements carry their COUNTRY's figure because
 * nobody measured the settlement, and a bare number reads as a measurement of that city.
 */
function greennessLine(p: Place, countryName: string): string {
  if (p.ndvi === null) return 'greenness not measured'
  return p.ndvi_basis === 'country'
    ? `greenness ${p.ndvi.toFixed(2)} (${countryName}’s figure, not this place’s)`
    : `greenness ${p.ndvi.toFixed(2)}`
}

export function RelocatePage() {
  const { profile } = useProfile()
  const meta = useMeta()

  // A profile stores ISO2; the settlement list is keyed on ISO3. The pairing is served with the country
  // list rather than kept here, exactly as the interview's city question resolves it.
  const options = meta.data?.country_options
  const option = options?.find((c) => c.iso2 === profile?.country)
  const iso3 = option?.iso3 ?? null
  // Never print a bare country code into a sentence: "places inside RO" is the jargon this page is
  // being cleaned of, and the name is unknown for the moment the country list takes to arrive. The
  // code does appear in the refusal below, where saying what the profile stores is the point.
  const countryName = option?.name ?? 'your country'
  const places = usePlaces(iso3)

  const [query, setQuery] = useState('')
  const [result, setResult] = useState<RelocateResult | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [busyCity, setBusyCity] = useState<string | null>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  /**
   * The ticket of the comparison the reader is currently owed. Only the clicked card goes busy, so N
   * clicks put N requests on the wire — deliberately: a reader who changes their mind must be able to
   * click the next place, and greying out sixty buttons behind one slow answer leaves them no way out.
   * The ticket is what makes that safe. Only the newest one may write to the screen; an older answer
   * arriving late is dropped whole, success or failure alike, because a stale failure wiping a newer
   * good answer is the same defect as a stale success overwriting it.
   */
  const latestCompare = useRef(0)

  // A result the reader never sees is not an answer. This card used to render BELOW every settlement,
  // so the page moves to it and hands it focus instead of leaving it to be scrolled for.
  useEffect(() => {
    if (!result) return
    resultRef.current?.scrollIntoView?.({ block: 'nearest' })
    resultRef.current?.focus()
  }, [result])

  const served = places.data?.places
  const offered = useMemo(() => (served ?? []).filter((p) => !isUnnamedPlace(p.city)), [served])
  const matches = useMemo(() => {
    const q = fold(query.trim())
    return q === '' ? offered : offered.filter((p) => fold(p.city).includes(q))
  }, [offered, query])

  // Two different failures, told apart rather than merged. The service answers 404 for a country with no
  // measurement since 2020 — a fact about 152 of the 237 countries the atlas draws, and the ONLY case
  // that earns the sentence below. Anything else is a fault: saying "nobody has measured here" about a
  // 500 or a dropped connection states a fact about the world on the strength of a broken request.
  const notMeasured = places.isError && statusOf(places.error) === 404
  const loadFailed = places.isError && !notMeasured
  // An empty list never comes off the wire — a country appears in the served map only because a row put
  // it there — so an empty offering can only mean the filter above took every row this country had. The
  // shipped data has no such country, but the reason is stated separately anyway: "nobody measured here
  // since 2020" would be false about a country that WAS measured, under rows that carry no name.
  const nothingToOffer = notMeasured || Boolean(served && offered.length === 0)

  if (!profile) {
    return (
      <div>
        <PageHeader
          title="Where Should I Live?"
          subtitle="Compare the measured places in your own country on their air and how green they are."
        />
        <NeedsProfile />
      </div>
    )
  }

  // The interview's location question is optional, so a profile can arrive carrying no home exposure at
  // all. The service does not refuse that comparison: a missing exposure contributes 0 to the
  // environmental term, and 0 is exactly where the country's own average sits, so the reader's home is
  // priced AS the national average and a definite signed number comes back. Said once here, because the
  // strip and the answer must not describe two different things.
  const homeUnmeasured = profile.pm25 === undefined && profile.ndvi === undefined

  const compare = async (city: string) => {
    const ticket = ++latestCompare.current
    setBusyCity(city)
    setFailure(null)
    try {
      // The candidate travels as the place NAME alongside the reader's own country, which is the only
      // pair the service can resolve: it looks the name up within that country and answers "unknown
      // location" for anything else. Scoping the list to one country is what makes that hold.
      const answer = await getClient().relocate(profile, city)
      if (ticket !== latestCompare.current) return
      setResult(answer)
    } catch (e) {
      // Never a silent stop. With no branch here the button simply stopped responding, which was the
      // behaviour of nearly every card on this page. A superseded request stops silently on purpose:
      // the reader has already asked for something else, and clearing their newer answer to report a
      // comparison they abandoned would take the good answer off the screen.
      if (ticket !== latestCompare.current) return
      setResult(null)
      setFailure(`we could not compare ${city}. The service said: “${(e as Error).message}”.`)
    } finally {
      // The "…" belongs to the click that started it: a superseded request must not take it off the
      // card the reader is now waiting on.
      if (ticket === latestCompare.current) setBusyCity(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Where Should I Live?"
        subtitle="Compare the measured places in your own country on their air and how green they are."
      />

      <div
        data-testid="measure-explainer"
        className="mb-5 space-y-2 text-sm leading-relaxed text-clock-muted"
      >
        <p>
          Every place below carries two measurements.{' '}
          <span className="font-medium text-clock-ink">Fine-particle air pollution</span> is the soot
          and dust small enough to be breathed deep into the lungs, counted in micrograms per cubic
          metre of air (written µg/m³, and commonly called PM2.5) — lower is better.{' '}
          <span className="font-medium text-clock-ink">Greenness</span> is how much living plant cover
          a satellite sees around the place, from 0 (bare ground) to 1 (dense vegetation) — higher is
          greener.
        </p>
        <p>
          This page compares places inside {countryName} only. Moving to another country changes far
          more than the air — the health service, the income, the food and the country’s own death
          rates all move with you, and none of that is in this comparison. To see how whole countries
          differ, open <Link to="/world" className="text-clock-brand underline">The World</Link>.
        </p>
      </div>

      <Card className="mb-4" testId="home-exposure">
        <h2 className="text-sm font-semibold text-clock-ink">Your home</h2>
        {homeUnmeasured ? (
          <p className="mt-1 text-sm text-clock-muted">
            No air measurement is recorded for your home. You can still compare, and you will get a
            number — but every comparison below starts from {countryName}’s average air and greenness
            instead of a reading from where you actually live, so what it measures is the place you pick
            against your country, not against your street.
          </p>
        ) : (
          <p className="mt-1 text-sm text-clock-muted">
            {profile.pm25 === undefined ? 'Air not recorded' : `Air ${profile.pm25.toFixed(1)} µg/m³`}{' '}
            ·{' '}
            {profile.ndvi === undefined
              ? 'greenness not recorded'
              : `greenness ${profile.ndvi.toFixed(2)}`}
            . Every comparison below is measured against this.
          </p>
        )}
      </Card>

      {failure && (
        <div className="mb-5">
          <ErrorState message={failure} />
        </div>
      )}

      {/* Announced as well as scrolled to: a reader who is not watching this part of the page is told
          the answer arrived. Mounted even when empty so the live region is there to be updated. */}
      <div
        ref={resultRef}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        data-testid="relocate-result"
        className={`outline-none ${result ? 'mb-5' : ''}`}
      >
        {result && (
          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold text-clock-ink">
                {result.current.name} → {result.candidate.name}
              </h3>
              <span
                className={`text-lg font-bold ${
                  deltaTone(result.delta_years) === 'good'
                    ? 'text-clock-good'
                    : deltaTone(result.delta_years) === 'bad'
                      ? 'text-clock-bad'
                      : 'text-clock-muted'
                }`}
              >
                {fmtDelta(result.delta_years)}
              </span>
            </div>
            <p className="mt-2 text-sm text-clock-muted">{result.explanation}</p>
            {/* The number above is real, and it is not the number the reader assumes: with nothing
                recorded for their home, the comparison started from the country's average. Said on the
                answer itself, where the number is, and not only on the strip further up the page. */}
            {homeUnmeasured && (
              <p data-testid="home-average-caveat" className="mt-2 text-sm text-clock-muted">
                Read this against your country, not your home: no air measurement is recorded for where
                you live, so the comparison starts from {countryName}’s average air and greenness.
              </p>
            )}
            <div className="mt-3">
              <StatisticalEstimateNote>
                A statistical scenario from environmental averages — it does not account for the many
                other things a move changes.
              </StatisticalEstimateNote>
            </div>
          </Card>
        )}
      </div>

      {meta.isLoading && <Loading label="Loading the list of countries…" />}
      {meta.isError && <ErrorState message={(meta.error as Error).message} />}

      {/* Two different absences, told apart rather than merged: no country list at all, and a country
          list that has no measured settlements for this reader. */}
      {meta.data && !options?.length && (
        <Card>
          <p className="text-sm text-clock-ink">
            We could not load the list of countries, so this page cannot tell which country’s places to
            offer you. It will not fall back to a list from somewhere else.
          </p>
        </Card>
      )}
      {meta.data && Boolean(options?.length) && !iso3 && (
        <Card>
          <p className="text-sm text-clock-ink">
            Your profile records {profile.country} as your country, and we have no list of measured
            settlements for it — so there is nothing to compare here yet.
          </p>
        </Card>
      )}

      {iso3 && places.isLoading && <Loading label={`Loading places in ${countryName}…`} />}
      {iso3 && loadFailed && (
        <ErrorState
          message={`we could not load the list of places in ${countryName} right now. The service said: “${(places.error as Error).message}”.`}
        />
      )}
      {iso3 && nothingToOffer && (
        <Card>
          <p className="text-sm text-clock-ink">
            {notMeasured
              ? `No settlement in ${countryName} has had its air measured since 2020, so this page has nothing to compare.`
              : `Every settlement recorded for ${countryName} is missing its name, so this page has nothing to compare.`}{' '}
            It offers no list rather than a list of guessed readings.
          </p>
        </Card>
      )}

      {offered.length > 0 && (
        <>
          <div className="mb-3">
            <label htmlFor="place-search" className="block text-sm text-clock-ink">
              Search the {offered.length} measured places in {countryName}
            </label>
            <input
              id="place-search"
              type="search"
              className="field mt-1 max-w-[18rem]"
              placeholder="Type part of a name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {matches.length === 0 ? (
            <p className="text-sm text-clock-muted">
              No place in {countryName} matches “{query.trim()}”.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Keyed on the name: settlement names are unique WITHIN one country, which the
                  worldwide list they replaced could not claim — "Madrid" and "Vila Real" exist in
                  several countries, and the duplicate keys dropped cards. */}
              {matches.map((p) => (
                <Card key={p.city} className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium text-clock-ink">{p.city}</div>
                    <div className="text-xs text-clock-muted">
                      Air {p.pm25.toFixed(1)} µg/m³ ({p.pm25_year}) · {greennessLine(p, countryName)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost border border-clock-line"
                    // Named per card: sixty buttons all called "Compare" tell a screen reader nothing.
                    aria-label={`Compare ${p.city}`}
                    onClick={() => compare(p.city)}
                    disabled={busyCity === p.city}
                  >
                    {busyCity === p.city ? '…' : 'Compare'}
                  </button>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
