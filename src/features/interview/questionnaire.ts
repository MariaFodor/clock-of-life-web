// The onboarding questionnaire (THE_QUESTIONNAIRE.md, DES-01) as data.
//
// Every question carries its user-facing wording, its "why we ask", and how it maps into the Profile.
// Since LEV-02..04 every lever moves the estimate: diet (Mediterranean score), alcohol, sitting time,
// stress (PSS-4) and location (ENV) are scored via the bundle's literature coefficients; mood (PHQ-2)
// stays deliberately OUT of the risk score (EXP-12 artifact) and drives the support note instead.
// Only YEARS_QUIT (pending the cessation-decay research) and AREA remain unscored context.

import type { CountryOption, Profile } from '../../api/types'

export type QuestionType = 'number' | 'radio' | 'checkboxes' | 'battery' | 'location' | 'country'

export interface Option {
  value: string
  label: string
}

export interface Question {
  /** internal key for UI state (answers map, DEFAULT_ANSWERS, buildProfile) */
  code: string
  /**
   * Canonical question code in the service's seed (`seeds/questions.json`, THE_QUESTIONNAIRE.md
   * numbering) — the only codes `/api/answers` accepts. Questions without one (HEIGHT/WEIGHT/SBP,
   * which have no seeded row yet — REVIEW-2026-09-09 W1/S8) are not persisted.
   */
  apiCode?: string
  prompt: string
  type: QuestionType
  options?: Option[]
  /** battery questions: one prompt per sub-item, all sharing `options`; the answer is an array */
  items?: string[]
  unit?: string
  /** shown only when this predicate over the current answers holds */
  showWhen?: (a: Answers) => boolean
  /** does the v1 model score this? (affects an honest UI hint, not persistence) */
  scored: boolean
}

export interface Section {
  title: string
  whyWeAsk: string
  confidence?: 'high' | 'medium' | 'low'
  questions: Question[]
}

/** A location answer carries the looked-up exposure values captured at selection time. */
export interface LocationAnswer {
  name: string
  country: string
  pm25?: number
  ndvi?: number
  /** The year the reading was taken; 2020-2025 across the database, so it is never assumed. */
  pm25_year?: number
  /** Whether the greenness is this city's own measurement or its country's figure. */
  ndvi_basis?: 'city' | 'country' | null
}

/** The answer to Q0_country: both codes, because scoring keys on ISO2 and the city list on ISO3. */
export interface CountryAnswer {
  iso2: string
  iso3: string | null
  name: string | null
}

export type Answers = Record<
  string,
  string | string[] | number | number[] | LocationAnswer | CountryAnswer | undefined
>

const FREQ: Option[] = [
  { value: 'never', label: 'Never / rarely' },
  { value: 'weekly', label: 'About once a week' },
  { value: 'few', label: '2–4 times a week' },
  { value: 'most', label: '5–6 times a week' },
  { value: 'daily', label: 'Daily or more' },
]

/**
 * The service's code for Q0, named because the interview has to know BEFORE it mounts the form
 * whether a country was saved: that is the one answer it cannot restore without the served country
 * list (see `answersFromApi`).
 */
export const COUNTRY_API_CODE = 'Q0_country'

export const SECTIONS: Section[] = [
  {
    title: 'About you',
    whyWeAsk:
      'Your country decides WHICH national life table the estimate counts down from, and who counts as ' +
      'an average person to compare you with. Your age and sex set your starting point on that table; ' +
      'the rest gives context.',
    questions: [
      // FIRST, and required. It chooses the life table and the reference population, so there is no
      // sensible default — which is exactly why the previous default was wrong: every profile was sent
      // as `country: 'RO'`, so a German reader was scored against Romanian death rates and centred on
      // Romanian smoking and weight rates, and then told Romania was the country on their profile.
      { code: 'COUNTRY', apiCode: COUNTRY_API_CODE, prompt: 'Which country do you live in?', type: 'country', scored: true },
      { code: 'AGE', apiCode: 'Q1_age', prompt: 'What is your age?', type: 'number', unit: 'years', scored: true },
      { code: 'SEX', apiCode: 'Q2_sex', prompt: 'What is your sex?', type: 'radio', scored: true, options: [
        { value: 'F', label: 'Female' },
        { value: 'M', label: 'Male' },
      ] },
      { code: 'EDU', apiCode: 'Q3_education', prompt: 'Highest level of education completed?', type: 'radio', scored: true, options: [
        { value: 'primary', label: 'Primary / secondary school' },
        { value: 'vocational', label: 'Vocational / some college' },
        { value: 'university', label: 'University degree or higher' },
      ] },
      { code: 'INCOME', apiCode: 'Q4_income', prompt: "Which range best describes your household's yearly income?", type: 'radio', scored: true, options: [
        { value: 'lower', label: 'Lower' },
        { value: 'lower-middle', label: 'Lower-middle' },
        { value: 'middle', label: 'Middle' },
        { value: 'upper-middle', label: 'Upper-middle' },
        { value: 'higher', label: 'Higher' },
      ] },
    ],
  },
  {
    title: 'Smoking',
    whyWeAsk: 'Smoking is one of the strongest and most changeable influences on lifespan.',
    confidence: 'high',
    questions: [
      { code: 'SMK', apiCode: 'Q5_smoking', prompt: 'Do you smoke cigarettes?', type: 'radio', scored: true, options: [
        { value: 'never', label: 'No, never' },
        { value: 'former', label: "I used to, but I've quit" },
        { value: 'current', label: 'Yes, currently' },
      ] },
      { code: 'YEARS_QUIT', apiCode: 'Q6_quit_year', prompt: 'In what year did you quit?', type: 'number', unit: 'year', scored: false,
        showWhen: (a) => a.SMK === 'former' },
      { code: 'CIGS', apiCode: 'Q7_cigs_per_day', prompt: 'On the days you smoked, about how many cigarettes per day?', type: 'number', scored: true,
        showWhen: (a) => a.SMK === 'former' || a.SMK === 'current' },
    ],
  },
  {
    title: 'Movement',
    whyWeAsk: 'How much you move — and how much you sit — both matter, and both are things you can change.',
    questions: [
      { code: 'ACT_DAYS', apiCode: 'Q8_activity_days', prompt: 'In a typical week, how many days do you do at least moderate physical activity — enough to raise your breathing or heart rate (brisk walking, cycling, sport, hard housework)?', type: 'radio', scored: true,
        options: [0, 1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: String(n) })) },
      { code: 'ACT_MIN', apiCode: 'Q9_activity_minutes', prompt: 'On those days, about how many minutes each time?', type: 'radio', scored: true, options: [
        { value: 'u15', label: 'Under 15' },
        { value: '15-29', label: '15–29' },
        { value: '30-44', label: '30–44' },
        { value: '45-59', label: '45–59' },
        { value: '60+', label: '60+ minutes' },
      ] },
      { code: 'SEDENTARY', apiCode: 'Q10_sedentary', prompt: 'On a typical day, about how many hours do you spend sitting or looking at a screen (outside of sleep)?', type: 'radio', scored: true, options: [
        { value: 'u4', label: 'Under 4' },
        { value: '4-6', label: '4–6' },
        { value: '6-8', label: '6–8' },
        { value: '8-10', label: '8–10' },
        { value: '10+', label: '10+ hours' },
      ] },
    ],
  },
  {
    title: 'Sleep',
    whyWeAsk: 'Both too little and too much sleep are linked with poorer outcomes.',
    confidence: 'medium',
    questions: [
      { code: 'SLEEP', apiCode: 'Q11_sleep', prompt: 'On a typical night, how many hours do you sleep?', type: 'radio', scored: true, options: [
        { value: 'u5', label: 'Under 5' },
        { value: '5-6', label: '5–6' },
        { value: '7-8', label: '7–8' },
        { value: '9', label: '9' },
        { value: '10+', label: '10+ hours' },
      ] },
    ],
  },
  {
    title: 'Body',
    whyWeAsk: 'Your waistline shows where you carry weight; height and weight together (your BMI) add a separate signal — a low BMI with a high waist can flag frailty.',
    confidence: 'high',
    questions: [
      { code: 'WAIST', apiCode: 'Q12_waist', prompt: 'What is your waist measurement, taken around the belly button?', type: 'number', unit: 'cm', scored: true },
      { code: 'HEIGHT', prompt: 'How tall are you?', type: 'number', unit: 'cm', scored: true },
      { code: 'WEIGHT', prompt: 'What is your weight?', type: 'number', unit: 'kg', scored: true },
    ],
  },
  {
    title: 'Diet',
    whyWeAsk: 'A more Mediterranean-style pattern is one of the best-evidenced dietary links to longevity.',
    confidence: 'high',
    questions: [
      { code: 'DIET_VEG', apiCode: 'Q13_veg', prompt: 'How often do you eat vegetables?', type: 'radio', scored: true, options: FREQ },
      { code: 'DIET_FRUIT', apiCode: 'Q14_fruit_nuts', prompt: 'How often do you eat fruit or nuts?', type: 'radio', scored: true, options: FREQ },
      { code: 'DIET_GRAIN', apiCode: 'Q15_whole_grains', prompt: 'How often do you eat whole grains (whole-grain bread, brown rice, oats, whole-grain pasta)?', type: 'radio', scored: true, options: FREQ },
      { code: 'DIET_FISH', apiCode: 'Q16_fish', prompt: 'How often do you eat fish or seafood?', type: 'radio', scored: true, options: FREQ },
      { code: 'DIET_MEAT', apiCode: 'Q17_red_meat', prompt: 'How often do you eat red or processed meat (beef, pork, sausages, ham, salami)?', type: 'radio', scored: true, options: FREQ },
    ],
  },
  {
    title: 'Alcohol',
    whyWeAsk: 'Current evidence finds no safe level — so we treat any reduction as helpful.',
    questions: [
      { code: 'ALC', apiCode: 'Q18_alcohol', prompt: 'Which best describes your drinking? (One drink ≈ a small beer, a glass of wine, or a shot of spirits.)', type: 'radio', scored: true, options: [
        { value: 'none', label: "I don't drink" },
        { value: 'light', label: 'Light (up to ~1 drink/day)' },
        { value: 'moderate', label: 'Moderate (~1–2/day)' },
        { value: 'heavy', label: 'Heavy (3+/day)' },
      ] },
    ],
  },
  {
    title: 'Stress & mood',
    whyWeAsk: 'How you have been feeling lately affects wellbeing and, for stress, longevity.',
    questions: [
      // PSS-4 (Cohen 1983): items b and c are reverse-scored; STRESS = z(sum 0-16).
      { code: 'STRESS', apiCode: 'Q19_stress', type: 'battery', scored: true,
        prompt: 'Perceived stress — in the last month, how often have you…',
        items: [
          '…felt unable to control the important things in your life?',
          '…felt confident about your ability to handle your problems?',
          '…felt that things were going your way?',
          '…felt difficulties were piling up so high you could not overcome them?',
        ],
        options: [
          { value: '0', label: 'Never' },
          { value: '1', label: 'Almost never' },
          { value: '2', label: 'Sometimes' },
          { value: '3', label: 'Fairly often' },
          { value: '4', label: 'Very often' },
        ] },
      // PHQ-2 (public domain): a wellbeing/manage signal, deliberately NOT in the risk score
      // (EXP-12 artifact) — a score >= 3 shows the support note instead.
      { code: 'MOOD', apiCode: 'Q20_mood', type: 'battery', scored: false,
        prompt: 'Mood — over the last 2 weeks, how often have you been bothered by…',
        items: [
          '…little interest or pleasure in doing things?',
          '…feeling down, depressed, or hopeless?',
        ],
        options: [
          { value: '0', label: 'Not at all' },
          { value: '1', label: 'Several days' },
          { value: '2', label: 'More than half the days' },
          { value: '3', label: 'Nearly every day' },
        ] },
    ],
  },
  {
    title: 'Health history',
    whyWeAsk: 'Existing conditions help the estimate and shape what we suggest managing — we never tell you to "undo" a diagnosis.',
    questions: [
      { code: 'COND', apiCode: 'Q21_conditions', prompt: 'Has a doctor ever told you that you have any of these?', type: 'checkboxes', scored: true, options: [
        { value: 'diabetes', label: 'Diabetes' },
        { value: 'hbp', label: 'High blood pressure' },
        { value: 'chol', label: 'High cholesterol' },
        { value: 'resp', label: 'COPD, chronic bronchitis, or emphysema' },
      ] },
      { code: 'HIST', apiCode: 'Q22_history', prompt: 'Do any of these apply to you?', type: 'checkboxes', scored: true, options: [
        { value: 'mobility', label: 'Difficulty walking or climbing stairs' },
        { value: 'cvd', label: 'Heart attack, stroke, or heart failure' },
        { value: 'cancer', label: 'I have had cancer' },
      ] },
      { code: 'SBP', prompt: 'If you know it, what is your systolic (top) blood pressure? Leave blank if unsure.', type: 'number', unit: 'mmHg', scored: true },
    ],
  },
  {
    title: 'Where you live',
    whyWeAsk: 'Air quality and green surroundings are linked with longevity, and this powers the "Where Should I Live?" comparison.',
    confidence: 'medium',
    questions: [
      { code: 'LOCATION', apiCode: 'Q23_location', prompt: 'Where do you live?', type: 'location', scored: true },
      { code: 'AREA', apiCode: 'Q24_area_type', prompt: 'What kind of area do you live in?', type: 'radio', scored: false, options: [
        { value: 'city', label: 'City' },
        { value: 'suburb', label: 'Suburb / town' },
        { value: 'rural', label: 'Rural' },
      ] },
    ],
  },
]

/** Every question flattened, in order. */
export const ALL_QUESTIONS: Question[] = SECTIONS.flatMap((s) => s.questions)

// ── Aggregation formulas (LEV-04) ─────────────────────────────────────────────

const FREQ_RANK: Record<string, number> = { never: 0, weekly: 1, few: 2, most: 3, daily: 4 }

/**
 * Mediterranean-style diet score 0–5 (RES-03): +1 each for vegetables, fruit/nuts, whole grains and
 * fish at/above their healthy threshold, +1 for red/processed meat BELOW its threshold.
 * DECLARED ASSUMPTION (the doc's "finalize the thresholds" note): vegetables & fruit count from
 * 5–6×/week, grains & fish from 2–4×/week, meat counts when at most ~1×/week.
 */
export function dietScore(a: Answers): number | undefined {
  const rank = (code: string) => {
    const v = a[code]
    return typeof v === 'string' ? FREQ_RANK[v] : undefined
  }
  const [veg, fruit, grain, fish, meat] =
    ['DIET_VEG', 'DIET_FRUIT', 'DIET_GRAIN', 'DIET_FISH', 'DIET_MEAT'].map(rank)
  if ([veg, fruit, grain, fish, meat].some((r) => r === undefined)) return undefined
  return (
    (veg! >= 3 ? 1 : 0) + (fruit! >= 3 ? 1 : 0) + (grain! >= 2 ? 1 : 0) +
    (fish! >= 2 ? 1 : 0) + (meat! <= 1 ? 1 : 0)
  )
}

/** PSS-4 sum 0–16 (Cohen 1983): items b and c are reverse-scored (4 − value). */
export function stressScore(a: Answers): number | undefined {
  const items = a.STRESS
  if (!Array.isArray(items) || items.length !== 4 || items.some((v) => typeof v !== 'number')) return undefined
  const [ia, ib, ic, id] = items as number[]
  return ia + (4 - ib) + (4 - ic) + id
}

/** PHQ-2 sum 0–6 — a wellbeing signal only, never in the risk score (EXP-12). ≥3 → support note. */
export function moodScore(a: Answers): number | undefined {
  const items = a.MOOD
  if (!Array.isArray(items) || items.length !== 2 || items.some((v) => typeof v !== 'number')) return undefined
  return (items as number[])[0] + (items as number[])[1]
}

// ── Answer → Profile mapping ──────────────────────────────────────────────────
const INCOME_MID: Record<string, number> = { lower: 1.0, 'lower-middle': 1.8, middle: 2.5, 'upper-middle': 3.5, higher: 5.0 }
const ACT_MIN_MID: Record<string, number> = { u15: 10, '15-29': 22, '30-44': 37, '45-59': 52, '60+': 70 }
const SLEEP_HOURS: Record<string, number> = { u5: 4.5, '5-6': 5.5, '7-8': 7.5, '9': 9, '10+': 10.5 }
const SITTING_MID: Record<string, number> = { u4: 3, '4-6': 5, '6-8': 7, '8-10': 9, '10+': 11 }
const ALC_LEVELS = ['none', 'light', 'moderate', 'heavy'] as const

export const DEFAULT_ANSWERS: Answers = {
  AGE: 45,
  SEX: 'F',
  EDU: 'vocational',
  INCOME: 'middle',
  SMK: 'never',
  ACT_DAYS: '3',
  ACT_MIN: '30-44',
  SLEEP: '7-8',
  WAIST: 88,
  HEIGHT: 170,
  WEIGHT: 75,
  AREA: 'city',
  COND: [],
  HIST: [],
}

export interface ProfileDraft {
  profile: Profile
  errors: string[]
}

/** Build the scored Profile from the answers, collecting validation errors (mirrors Profile::validate). */
export function buildProfile(a: Answers): ProfileDraft {
  const errors: string[] = []
  const num = (v: unknown) => (typeof v === 'number' ? v : Number(v))

  const age = num(a.AGE)
  if (!Number.isFinite(age) || age < 18 || age > 110) errors.push('Age must be between 18 and 110.')

  const waist = num(a.WAIST)
  if (!Number.isFinite(waist) || waist < 40 || waist > 250) errors.push('Waist must be between 40 and 250 cm.')

  const height = num(a.HEIGHT)
  if (!Number.isFinite(height) || height < 120 || height > 230) errors.push('Height must be between 120 and 230 cm.')
  const weight = num(a.WEIGHT)
  if (!Number.isFinite(weight) || weight < 30 || weight > 300) errors.push('Weight must be between 30 and 300 kg.')
  const bmi = weight / ((height / 100) ** 2)

  const smoke = a.SMK === 'current' ? 2 : a.SMK === 'former' ? 1 : 0
  // Current-smoker dose only: former/never smoke 0/day now (matches the model's cigs_day encoding).
  // 80, matching what the service validates a profile at AND what its What-If lever now accepts.
  // This briefly clamped to 60 to match the lever, which resolved the contradiction by discarding
  // what a 75-a-day smoker actually told us — silently, and it changed their estimate. The lever
  // moved to 80 instead.
  // And it SAYS so rather than clamping quietly: six lines below, an out-of-range blood pressure
  // gets a visible error, while this discarded a "100 a day" answer without a word. Whatever we
  // think of the number, silently rewriting what someone told us about themselves is the habit this
  // whole change set has been arguing against.
  const cigsRaw = smoke === 2 ? Math.max(num(a.CIGS) || 0, 0) : 0

  if (cigsRaw > 80) errors.push('Cigarettes per day must be 80 or fewer.')
  const cigs_day = Math.min(cigsRaw, 80)

  // Systolic BP is optional: only sent when the user gives a plausible reading; otherwise the service
  // derives it from the high-blood-pressure answer, so a blank field is never a wasted question.
  const sbpRaw = a.SBP
  const sbp = (sbpRaw !== undefined && sbpRaw !== '' && Number.isFinite(num(sbpRaw))) ? num(sbpRaw) : undefined
  if (sbp !== undefined && (sbp < 70 || sbp > 240)) errors.push('Blood pressure must be between 70 and 240 mmHg.')

  const days = num(a.ACT_DAYS) || 0
  const perDay = ACT_MIN_MID[String(a.ACT_MIN)] ?? 30
  const pa_min = 4.0 * perDay * days

  const cond = Array.isArray(a.COND) ? (a.COND as string[]) : []
  const hist = Array.isArray(a.HIST) ? (a.HIST as string[]) : []

  // Literature levers: only mapped when actually answered — an omitted field means "assume the
  // average person" server-side and contributes 0 (never a guess promoted to a fact).
  const diet_score = dietScore(a)
  const alcohol = typeof a.ALC === 'string' && (ALC_LEVELS as readonly string[]).includes(a.ALC)
    ? (a.ALC as Profile['alcohol'])
    : undefined
  const sitting_hours = typeof a.SEDENTARY === 'string' ? SITTING_MID[a.SEDENTARY] : undefined
  const stress_score = stressScore(a)
  // The Q22 checkbox is binary; the service scores the fitted any-difficulty encoding either way.
  const mobility = hist.includes('mobility') ? (1 as const) : undefined
  const loc = a.LOCATION as LocationAnswer | undefined
  const answeredCountry = (a.COUNTRY as CountryAnswer | undefined)?.iso2

  if (!answeredCountry) {
    // This BLOCKS the calculate button (`errors.length` disables it), and that is deliberate rather
    // than incidental: without a country the estimate would be counted down from somebody else's
    // national death rates and centred on somebody else's average person. A number about the wrong
    // country is worse than no number.
    errors.push(
      'Choose the country you live in — the first question. It decides which national life table your ' +
        'years are counted from and who counts as an average person to compare you with, so an ' +
        'estimate without it would be about somewhere else.',
    )
  }

  const profile: Profile = {
    // The answer, not a constant. `'RO'` was hardcoded here and it was not a placeholder that only
    // affected a label: `country` selects the qx table the years are counted from AND the reference
    // person the relative risk is centred on, so it moved every non-Romanian reader's number.
    //
    // The fallback stays RO only so a profile answered before this question existed keeps scoring
    // rather than 400ing; `errors` says so, and the interview marks the question required, so a
    // reader who reaches the end has answered it.
    country: answeredCountry ?? 'RO',
    age,
    sex: a.SEX === 'M' ? 'M' : 'F',
    smoke: smoke as Profile['smoke'],
    pa_min,
    sleep: SLEEP_HOURS[String(a.SLEEP)] ?? 7.5,
    waist,
    bmi,
    cigs_day,
    ...(sbp !== undefined ? { sbp } : {}),
    diabetes: cond.includes('diabetes'),
    high_bp: cond.includes('hbp'),
    respiratory: cond.includes('resp'),
    cvd_hx: hist.includes('cvd'),
    cancer_hx: hist.includes('cancer'),
    higher_educ: a.EDU === 'university',
    income: INCOME_MID[String(a.INCOME)] ?? 2.5,
    ...(diet_score !== undefined ? { diet_score } : {}),
    ...(alcohol !== undefined ? { alcohol } : {}),
    ...(sitting_hours !== undefined ? { sitting_hours } : {}),
    ...(stress_score !== undefined ? { stress_score } : {}),
    ...(mobility !== undefined ? { mobility } : {}),
    ...(loc?.pm25 !== undefined ? { pm25: loc.pm25 } : {}),
    ...(loc?.ndvi !== undefined ? { ndvi: loc.ndvi } : {}),
  }
  return { profile, errors }
}

/** Single visibility predicate — the interview render and the persistence payload must agree. */
export function isVisible(q: Question, a: Answers): boolean {
  return !q.showWhen || q.showWhen(a)
}

/** Answered means a real value: not blank; checkbox groups need ≥1 tick; batteries every item. */
function isAnswered(v: Answers[string]): boolean {
  if (v === undefined || v === '') return false
  if (Array.isArray(v)) return v.length > 0 && v.every((x) => x !== undefined)
  // Two object answers now, and they identify themselves differently: a location by its `name`, a
  // country by its `iso2` (whose `name` can legitimately be null when the bundle has no display name).
  // Checking only `name` would have read a chosen country as unanswered.
  if (typeof v === 'object') {
    const o = v as Partial<LocationAnswer> & Partial<CountryAnswer>
    return o.name !== undefined || o.iso2 !== undefined
  }
  return true
}

/**
 * The answers to persist via /api/answers, keyed by the service's canonical question codes.
 * Included only when the question (1) has a seeded `apiCode`, (2) is currently visible — a hidden
 * conditional's stale value (e.g. quit-year after switching back to "never") must not be persisted —
 * and (3) was actually answered.
 */
export function answersForApi(a: Answers): Array<{ question_code: string; value: unknown }> {
  return ALL_QUESTIONS.filter(
    (q) => q.apiCode !== undefined && isVisible(q, a) && isAnswered(a[q.code]),
  ).map((q) => ({
    question_code: q.apiCode!,
    value: a[q.code],
  }))
}

const BY_API_CODE = new Map(
  ALL_QUESTIONS.filter((q) => q.apiCode !== undefined).map((q) => [q.apiCode!, q]),
)

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Does a saved value still fit this question as the question stands NOW? A stored answer was written
 * against whatever version of the questionnaire was live then, so an option can have been dropped or
 * a battery grown an item since.
 *
 * Membership of `options` is checked, not just the type: a value the field cannot show as chosen
 * would sit there invisible while `buildProfile` scored it — an answer the reader can neither see
 * nor correct, which is the failure mode this whole change is about.
 */
function fitsQuestion(q: Question, v: unknown): boolean {
  const isOption = (x: unknown) => (q.options ?? []).some((o) => o.value === String(x))
  if (q.type === 'number') return typeof v === 'number' && Number.isFinite(v)
  if (q.type === 'radio') return typeof v === 'string' && isOption(v)
  if (q.type === 'battery') {
    return (
      Array.isArray(v) &&
      v.length === (q.items?.length ?? 0) &&
      v.every((x) => typeof x === 'number' && isOption(x))
    )
  }
  // The two object answers keep the codes and the readings captured when they were chosen, so they
  // are restored as they were saved.
  if (q.type === 'country') return isRecord(v) && typeof v.iso2 === 'string' && v.iso2 !== ''
  if (q.type === 'location') return isRecord(v) && typeof v.name === 'string' && v.name !== ''
  // checkboxes
  return Array.isArray(v) && v.every((x) => typeof x === 'string' && isOption(x))
}

/** What a saved country is restored against: the options the picker will show, and `/api/meta`'s
 *  map of codes that used to be valid and now resolve to one of them. */
export interface CountryList {
  options: CountryOption[]
  aliases?: Record<string, string>
}

/**
 * A saved country as the picker can show it TODAY, or nothing at all.
 *
 * `fitsQuestion` only asks whether the stored value LOOKS like a country, and that is not enough for
 * this one question: the options are served, not listed here, so a code can be well-formed and still
 * have no option. The bundle's own `country_aliases` ships `{"EL": "GR"}` and `country_options` omits
 * the alias keys, so a profile saved as "EL" left the select on "Choose your country…" while
 * `buildProfile` read a country and enabled Calculate — the reader submitting a country the screen
 * was showing as unchosen. A retired code is therefore restored as the country it resolves to, and a
 * code that resolves to nothing is dropped, which puts the reader exactly where a first visit does:
 * the required-country error, above a picker that can answer it.
 *
 * With no list to check against — an older service, or `/api/meta` down — nothing can be healed or
 * refuted, so the saved answer stands. It is the country that was scored, and the field says for
 * itself that it cannot be answered right now.
 */
function healCountry(saved: CountryAnswer, countries?: CountryList): CountryAnswer | undefined {
  const options = countries?.options ?? []
  if (options.length === 0) return saved
  if (options.some((o) => o.iso2 === saved.iso2)) return saved
  const resolved = countries?.aliases?.[saved.iso2]
  const option = resolved === undefined ? undefined : options.find((o) => o.iso2 === resolved)
  return option ? { iso2: option.iso2, iso3: option.iso3, name: option.name } : undefined
}

/**
 * The inverse of `answersForApi`: the saved rows from GET /api/answers back into interview state.
 *
 * All-or-nothing per row — either the saved value still fits its question or that question falls
 * back to its default. A questionnaire that has changed since the answer was written must degrade to
 * defaults, never crash the interview, so a row whose code no current question claims is dropped too.
 *
 * `countries` is what the country question is restored against; see `healCountry` for why that one
 * answer needs more than its own stored shape to be trusted.
 */
export function answersFromApi(
  rows: Array<{ question_code: string; value: unknown }>,
  countries?: CountryList,
): Answers {
  const restored: Answers = {}
  for (const row of rows) {
    const q = BY_API_CODE.get(row.question_code)
    if (!q || !fitsQuestion(q, row.value)) continue
    if (q.type === 'country') {
      const healed = healCountry(row.value as CountryAnswer, countries)
      if (healed) restored[q.code] = healed
      continue
    }
    restored[q.code] = row.value as Answers[string]
  }
  return restored
}
