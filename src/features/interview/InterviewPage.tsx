import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAnswers, useEstimate, useMeta, usePlaces, useSaveAnswers } from '../../api/hooks'
import { getClient } from '../../api/client'
import { useAuth } from '../../app/auth'
import { useProfile } from '../../app/profile'
import { PageHeader, Card, ErrorState, Loading, NoticeState } from '../../components/ui'
import { MoodSupportNote, StatisticalEstimateNote } from '../../components/framing'
import {
  SECTIONS,
  COUNTRY_API_CODE,
  DEFAULT_ANSWERS,
  buildProfile,
  answersForApi,
  answersFromApi,
  isVisible,
  moodScore,
  type Answers,
  type CountryAnswer,
  type LocationAnswer,
  type Question,
} from './questionnaire'

const TITLE = 'Your interview'
const SUBTITLE = 'A few questions about you. You can change any answer and recalculate at any time.'

/** One sub-item per row, all sharing the question's response scale; the answer is a number array. */
function BatteryField({
  q,
  value,
  onChange,
}: {
  q: Question
  value: Answers[string]
  onChange: (v: Answers[string]) => void
}) {
  const arr: (number | undefined)[] = Array.isArray(value)
    ? (value as number[])
    : new Array(q.items!.length).fill(undefined)
  const setItem = (i: number, v: number) => {
    const next = [...arr]
    next[i] = v
    onChange(next as number[])
  }
  return (
    <div className="space-y-3">
      {q.items!.map((item, i) => (
        <div key={item}>
          <div className="mb-1 text-sm text-clock-ink">{item}</div>
          <div role="radiogroup" aria-label={item} className="flex flex-wrap gap-2">
            {q.options!.map((o) => {
              const selected = arr[i] === Number(o.value)
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setItem(i, Number(o.value))}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                    selected
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
      ))}
    </div>
  )
}

/**
 * Q0: which country. The first question, and the only one whose answer changes every other number.
 *
 * The options come from `/api/meta`, not from a list in this repo: they are exactly the countries the
 * model can score, so the picker cannot offer one that will be refused at the end.
 */
function CountryField({
  value,
  onChange,
}: {
  value: Answers[string]
  onChange: (v: Answers[string]) => void
}) {
  const { data: meta, isLoading, isError } = useMeta()
  const current = (value as CountryAnswer | undefined)?.iso2 ?? ''
  const options = meta?.country_options ?? []

  if (isLoading) return <p className="text-sm text-clock-muted">Loading countries…</p>
  if (isError || (meta && options.length === 0)) {
    return (
      <p role="alert" className="text-sm text-clock-bad">
        We could not load the list of countries, so this question can’t be answered right now. Without
        it the estimate cannot pick the right national life table, and the number would be about
        somebody else’s country.
      </p>
    )
  }
  return (
    <select
      className="field max-w-[18rem]"
      aria-label="Which country do you live in?"
      value={current}
      onChange={(e) => {
        const c = options.find((o) => o.iso2 === e.target.value)
        onChange(c ? { iso2: c.iso2, iso3: c.iso3, name: c.name } : undefined)
      }}
    >
      <option value="">Choose your country…</option>
      {[...options]
        .sort((a, b) => (a.name ?? a.iso2).localeCompare(b.name ?? b.iso2))
        .map((o) => (
          <option key={o.iso2} value={o.iso2}>
            {o.name ?? o.iso2}
          </option>
        ))}
    </select>
  )
}

/**
 * Q23: which settlement, from the ones actually measured IN THE ANSWERED COUNTRY.
 *
 * It used to read `/api/locations`, which has no country filter — so it offered every reader the seven
 * invented Romanian rows, and a German one could pick Bucharest. It now reads `/api/places/{iso3}`,
 * which cannot return a place outside the country asked for.
 *
 * The answer captures the reading AND its provenance at selection time: the year it was taken, and
 * whether the greenness is this city's own measurement or its country's figure. A stored value without
 * those is indistinguishable from an invented one the next time somebody asks where it came from.
 */
function LocationField({
  value,
  onChange,
  country,
}: {
  value: Answers[string]
  onChange: (v: Answers[string]) => void
  country?: CountryAnswer
}) {
  const { data, isLoading, isError } = usePlaces(country?.iso3 ?? null)
  const current = (value as LocationAnswer | undefined)?.name ?? ''

  if (!country) {
    return (
      <p className="text-sm text-clock-muted">
        Choose your country first — this list is the settlements measured in it.
      </p>
    )
  }
  if (isLoading) return <p className="text-sm text-clock-muted">Loading places in {country.name}…</p>
  if (isError) {
    // A 404 here is not a failure of ours: 152 of the 237 countries have no measurement since 2020.
    return (
      <p className="text-sm text-clock-muted">
        No settlement in {country.name ?? country.iso2} has had its air measured since 2020, so this
        question has nothing to offer. Your estimate is calculated without the air and greenspace term
        rather than with a guessed one.
      </p>
    )
  }
  const places = data?.places ?? []
  return (
    <>
      <select
        className="field max-w-[18rem]"
        aria-label="Which city or town do you live in or nearest to?"
        value={current}
        onChange={(e) => {
          const p = places.find((x) => x.city === e.target.value)
          onChange(
            p
              ? {
                  name: p.city,
                  country: country.iso2,
                  pm25: p.pm25,
                  ndvi: p.ndvi ?? undefined,
                  pm25_year: p.pm25_year,
                  ndvi_basis: p.ndvi_basis,
                }
              : undefined,
          )
        }}
      >
        <option value="">Choose your city or town…</option>
        {places.map((p) => (
          <option key={p.city} value={p.city}>
            {p.city} — {p.pm25.toFixed(1)} µg/m³ ({p.pm25_year})
          </option>
        ))}
      </select>
      {current && (
        <p className="mt-2 text-xs leading-relaxed text-clock-muted">
          {(() => {
            const p = places.find((x) => x.city === current)
            if (!p) return null
            const ref = data?.reference?.pm25 ?? null
            return (
              <>
                Air measured in {p.city} in {p.pm25_year}
                {ref !== null && (
                  <>
                    , {Math.abs(p.pm25 - ref) < 0.05
                      ? 'the same as'
                      : `${Math.abs(p.pm25 - ref).toFixed(1)} µg/m³ ${p.pm25 > ref ? 'above' : 'below'}`}{' '}
                    the national average of {ref.toFixed(1)}
                  </>
                )}
                .{' '}
                {p.ndvi === null
                  ? 'No greenness figure exists for anywhere in this country, so greenspace is not scored.'
                  : p.ndvi_basis === 'city'
                    ? `Greenness ${p.ndvi.toFixed(2)}, measured in ${p.city} itself.`
                    : `Greenness ${p.ndvi.toFixed(2)} — that is ${data?.name ?? 'the country'}’s figure, not ${p.city}’s: nobody has measured greenness here.`}
              </>
            )
          })()}
        </p>
      )}
    </>
  )
}

function Field({
  q,
  value,
  onChange,
  country,
}: {
  q: Question
  value: Answers[string]
  onChange: (v: Answers[string]) => void
  /** The answer to Q0, threaded down because the city list is a list of places IN that country. */
  country?: CountryAnswer
}) {
  if (q.type === 'number') {
    return (
      <input
        type="number"
        className="field max-w-[12rem]"
        aria-label={q.prompt}
        value={value === undefined ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      />
    )
  }
  if (q.type === 'battery') {
    return <BatteryField q={q} value={value} onChange={onChange} />
  }
  if (q.type === 'country') {
    return <CountryField value={value} onChange={onChange} />
  }
  if (q.type === 'location') {
    return <LocationField value={value} onChange={onChange} country={country} />
  }
  if (q.type === 'radio') {
    return (
      <div role="radiogroup" aria-label={q.prompt} className="flex flex-wrap gap-2">
        {q.options!.map((o) => {
          const selected = value === o.value
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(o.value)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                selected
                  ? 'border-clock-brand bg-clock-brandsoft text-clock-brand'
                  : 'border-clock-line bg-clock-canvas text-clock-ink hover:border-clock-brand/40'
              }`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    )
  }
  // checkboxes
  const arr = (Array.isArray(value) ? value : []) as string[]
  return (
    <div className="flex flex-col gap-2">
      {q.options!.map((o) => {
        const checked = arr.includes(o.value)
        return (
          <label key={o.value} className="flex items-center gap-2 text-sm text-clock-ink">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => onChange(e.target.checked ? [...arr, o.value] : arr.filter((v) => v !== o.value))}
            />
            {o.label}
          </label>
        )
      })}
    </div>
  )
}

/**
 * The interview itself, mounted only once its starting answers are known.
 *
 * Separate from the loading of those answers on purpose: a prefill applied after mount would land on
 * top of whatever the reader had already started typing.
 */
function InterviewForm({
  initialAnswers,
  initialLoadFailed,
}: {
  initialAnswers: Answers
  initialLoadFailed: boolean
}) {
  const [answers, setAnswers] = useState<Answers>(initialAnswers)
  // Frozen for the same reason as the answers above, and at the same instant. The notice describes
  // the fields as they were filled in, so it has to be settled when they are: rendered from the live
  // query it appeared over the reader's own restored answers when a background refetch failed, and
  // disappeared — leaving no warning at all — when a later one succeeded while every field still
  // held a standard answer, which is the reader calculating from somebody else's values unwarned.
  const [loadFailed] = useState(initialLoadFailed)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { setProfile, setEstimate } = useProfile()
  const estimate = useEstimate()
  const saveAnswers = useSaveAnswers()

  const lastEstimated = useRef<string | null>(null)
  const set = (code: string) => (v: Answers[string]) => setAnswers((prev) => ({ ...prev, [code]: v }))
  const { profile, errors } = useMemo(() => buildProfile(answers), [answers])

  const onSubmit = async () => {
    setSubmitError(null)
    if (errors.length) return
    // Every /api/estimate call persists a calculation row, so a save-only retry must not re-score
    // an unchanged profile — that would append one duplicate history row per click.
    const profileKey = JSON.stringify(profile)
    if (lastEstimated.current !== profileKey) {
      try {
        const est = await estimate.mutateAsync(profile)
        setProfile(profile)
        setEstimate(est)
        lastEstimated.current = profileKey
      } catch (e) {
        setSubmitError(e instanceof Error ? e.message : 'Could not calculate your estimate.')
        return
      }
    }
    // The estimate is ready either way; a failed answer-save must be visible, never silent
    // (REVIEW-2026-09-09 W1: it failed silently for every user).
    try {
      await saveAnswers.mutateAsync(answersForApi(answers))
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error'
      const authHint = /401|token|unauthori[sz]|expired/i.test(msg)
        ? ' Your session may have expired — sign out, sign back in, and press the button again.'
        : ''
      setSubmitError(
        `Your Life Clock was calculated, but your answers could not be saved to your profile (${msg}).${authHint} Press the button to try again, or open "My Life Clock" to continue without saving.`,
      )
      return
    }
    // The home location is a separate, lesser failure: the ENV term already reached this estimate
    // via the profile's pm25/ndvi, and the stored row only powers "Where Should I Live?" later —
    // so say what actually failed and let the user through (PR#1 B1).
    const loc = answers.LOCATION as LocationAnswer | undefined
    let locationError: string | undefined
    if (loc?.name) {
      try {
        await getClient().setHomeLocation(loc.name, loc.country)
      } catch (e) {
        // The message must survive the navigation — this component unmounts immediately, so local
        // state here would render nothing at all (PR#1 B1, round 2).
        locationError = `Your answers were saved, but we could not record ${loc.name} as your home location (${
          e instanceof Error ? e.message : 'unknown error'
        }). You can set it again later from "Where Should I Live?".`
      }
    }
    navigate('/', locationError ? { state: { notice: locationError } } : undefined)
  }

  return (
    <div>
      <PageHeader title={TITLE} subtitle={SUBTITLE} />

      {loadFailed && (
        <div className="mb-5">
          <NoticeState message="We could not load the answers you saved before, so the questions below start from the standard values instead of yours. Nothing you saved is lost — reload the page to try again." />
        </div>
      )}

      <div className="space-y-5">
        {SECTIONS.map((section) => (
          <Card key={section.title}>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold text-clock-ink">{section.title}</h2>
              {section.confidence && (
                <span className="text-[11px] uppercase tracking-wide text-clock-muted">
                  confidence: {section.confidence}
                </span>
              )}
            </div>
            <p className="mb-4 text-sm italic text-clock-muted">Why we ask: {section.whyWeAsk}</p>

            <div className="space-y-5">
              {section.questions
                .filter((q) => isVisible(q, answers))
                .map((q) => (
                  <div key={q.code}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="label">{q.prompt}</span>
                      {q.unit && <span className="text-xs text-clock-muted">({q.unit})</span>}
                      {!q.scored && (
                        <span
                          className="rounded bg-clock-canvas px-1.5 py-0.5 text-[10px] text-clock-muted"
                          title="Recorded for your profile, but the v1 estimate does not use it yet."
                        >
                          not in v1 estimate
                        </span>
                      )}
                    </div>
                    <Field
                      q={q}
                      value={answers[q.code]}
                      onChange={set(q.code)}
                      country={answers.COUNTRY as CountryAnswer | undefined}
                    />
                  </div>
                ))}
            </div>
            {section.questions.some((q) => q.code === 'MOOD') && (moodScore(answers) ?? 0) >= 3 && (
              <div className="mt-4">
                <MoodSupportNote />
              </div>
            )}
          </Card>
        ))}
      </div>

      {errors.length > 0 && (
        <ul className="mt-5 space-y-1">
          {errors.map((e) => (
            <li key={e} className="text-sm text-clock-bad">
              • {e}
            </li>
          ))}
        </ul>
      )}
      {submitError && (
        <div className="mt-5">
          <ErrorState message={submitError} />
        </div>
      )}

      <div className="mt-6 flex items-center gap-4">
        <button
          type="button"
          className="btn-primary"
          onClick={onSubmit}
          disabled={errors.length > 0 || estimate.isPending || saveAnswers.isPending}
        >
          {estimate.isPending ? 'Calculating…' : saveAnswers.isPending ? 'Saving…' : 'Calculate my Life Clock'}
        </button>
        <StatisticalEstimateNote />
      </div>
    </div>
  )
}

/**
 * Starts the interview from the answers already saved (UX-3), so editing one thing does not mean
 * answering everything again. `DEFAULT_ANSWERS` underlies whatever was never saved.
 */
export function InterviewPage() {
  const { session } = useAuth()
  const saved = useAnswers(Boolean(session))
  // The country list the saved country is restored against. Already on its way — the picker below
  // reads the same query — so asking for it here costs nothing but the wait.
  const meta = useMeta()
  const rows = saved.data
  // Height and weight have no seeded question row yet (REVIEW-2026-09-09 W1/S8), so they alone
  // cannot come back — they stay at their defaults. Harmless to the estimate: the service accepts
  // `bmi` and never scores it (scoring.rs `bmi_is_accepted_but_never_scored`, after REFIT-01).
  const restored = useMemo(
    () =>
      answersFromApi(rows ?? [], {
        options: meta.data?.country_options ?? [],
        aliases: meta.data?.country_aliases,
      }),
    [rows, meta.data],
  )

  // Wait for them rather than mounting on defaults and swapping underneath the reader. The country
  // list is waited for only when a country was actually saved, because that is the only answer that
  // needs it: a first-time visitor still gets the questions immediately, with the picker loading its
  // own options in place, exactly as before.
  const savedCountry = (rows ?? []).some((r) => r.question_code === COUNTRY_API_CODE)
  if ((session && saved.isPending) || (savedCountry && meta.isPending)) {
    return (
      <div>
        <PageHeader title={TITLE} subtitle={SUBTITLE} />
        <Loading label="Loading your saved answers…" />
      </div>
    )
  }

  return (
    <InterviewForm
      initialAnswers={{ ...DEFAULT_ANSWERS, ...restored }}
      initialLoadFailed={saved.isError}
    />
  )
}
