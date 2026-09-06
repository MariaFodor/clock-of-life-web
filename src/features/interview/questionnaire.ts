// The onboarding questionnaire (THE_QUESTIONNAIRE.md, DES-01) as data.
//
// Every question carries its user-facing wording, its "why we ask", and — where the v1 model scores it —
// how it maps into the Profile. Questions the v1 model does not yet score (diet, alcohol, stress, mood,
// location) are still asked and persisted via /api/answers; they are flagged `scored: false` so the UI
// can be honest that they don't move the current estimate.

import type { Profile } from '../../api/types'

export type QuestionType = 'number' | 'radio' | 'checkboxes'

export interface Option {
  value: string
  label: string
}

export interface Question {
  /** stable code sent to /api/answers */
  code: string
  prompt: string
  type: QuestionType
  options?: Option[]
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

export type Answers = Record<string, string | string[] | number | undefined>

const FREQ: Option[] = [
  { value: 'never', label: 'Never / rarely' },
  { value: 'weekly', label: 'About once a week' },
  { value: 'few', label: '2–4 times a week' },
  { value: 'most', label: '5–6 times a week' },
  { value: 'daily', label: 'Daily or more' },
]

export const SECTIONS: Section[] = [
  {
    title: 'About you',
    whyWeAsk: 'Your age and sex set your starting point on the national life table; the rest gives context.',
    questions: [
      { code: 'AGE', prompt: 'What is your age?', type: 'number', unit: 'years', scored: true },
      { code: 'SEX', prompt: 'What is your sex?', type: 'radio', scored: true, options: [
        { value: 'F', label: 'Female' },
        { value: 'M', label: 'Male' },
      ] },
      { code: 'EDU', prompt: 'Highest level of education completed?', type: 'radio', scored: true, options: [
        { value: 'primary', label: 'Primary / secondary school' },
        { value: 'vocational', label: 'Vocational / some college' },
        { value: 'university', label: 'University degree or higher' },
      ] },
      { code: 'INCOME', prompt: "Which range best describes your household's yearly income?", type: 'radio', scored: true, options: [
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
      { code: 'SMK', prompt: 'Do you smoke cigarettes?', type: 'radio', scored: true, options: [
        { value: 'never', label: 'No, never' },
        { value: 'former', label: "I used to, but I've quit" },
        { value: 'current', label: 'Yes, currently' },
      ] },
      { code: 'YEARS_QUIT', prompt: 'In what year did you quit?', type: 'number', unit: 'year', scored: false,
        showWhen: (a) => a.SMK === 'former' },
      { code: 'CIGS', prompt: 'On the days you smoked, about how many cigarettes per day?', type: 'number', scored: false,
        showWhen: (a) => a.SMK === 'former' || a.SMK === 'current' },
    ],
  },
  {
    title: 'Movement',
    whyWeAsk: 'How much you move — and how much you sit — both matter, and both are things you can change.',
    questions: [
      { code: 'ACT_DAYS', prompt: 'In a typical week, how many days do you do at least moderate physical activity?', type: 'radio', scored: true,
        options: [0, 1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: String(n) })) },
      { code: 'ACT_MIN', prompt: 'On those days, about how many minutes each time?', type: 'radio', scored: true, options: [
        { value: 'u15', label: 'Under 15' },
        { value: '15-29', label: '15–29' },
        { value: '30-44', label: '30–44' },
        { value: '45-59', label: '45–59' },
        { value: '60+', label: '60+ minutes' },
      ] },
      { code: 'SEDENTARY', prompt: 'On a typical day, about how many hours do you spend sitting or looking at a screen?', type: 'radio', scored: false, options: [
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
      { code: 'SLEEP', prompt: 'On a typical night, how many hours do you sleep?', type: 'radio', scored: true, options: [
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
    whyWeAsk: 'Where you carry weight (your waistline) tracks health better than weight alone.',
    confidence: 'high',
    questions: [
      { code: 'WAIST', prompt: 'What is your waist measurement, taken around the belly button?', type: 'number', unit: 'cm', scored: true },
    ],
  },
  {
    title: 'Diet',
    whyWeAsk: 'A more Mediterranean-style pattern is one of the best-evidenced dietary links to longevity.',
    confidence: 'high',
    questions: [
      { code: 'DIET_VEG', prompt: 'How often do you eat vegetables?', type: 'radio', scored: false, options: FREQ },
      { code: 'DIET_FRUIT', prompt: 'How often do you eat fruit or nuts?', type: 'radio', scored: false, options: FREQ },
      { code: 'DIET_GRAIN', prompt: 'How often do you eat whole grains?', type: 'radio', scored: false, options: FREQ },
      { code: 'DIET_FISH', prompt: 'How often do you eat fish or seafood?', type: 'radio', scored: false, options: FREQ },
      { code: 'DIET_MEAT', prompt: 'How often do you eat red or processed meat?', type: 'radio', scored: false, options: FREQ },
    ],
  },
  {
    title: 'Alcohol',
    whyWeAsk: 'Current evidence finds no safe level — so we treat any reduction as helpful.',
    questions: [
      { code: 'ALC', prompt: 'Which best describes your drinking?', type: 'radio', scored: false, options: [
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
      { code: 'STRESS', prompt: 'In the last month, how often have you felt unable to control the important things in your life?', type: 'radio', scored: false, options: [
        { value: '0', label: 'Never' },
        { value: '1', label: 'Almost never' },
        { value: '2', label: 'Sometimes' },
        { value: '3', label: 'Fairly often' },
        { value: '4', label: 'Very often' },
      ] },
      { code: 'MOOD', prompt: 'Over the last 2 weeks, how often have you had little interest or pleasure in doing things?', type: 'radio', scored: false, options: [
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
      { code: 'COND', prompt: 'Has a doctor ever told you that you have any of these?', type: 'checkboxes', scored: true, options: [
        { value: 'diabetes', label: 'Diabetes' },
        { value: 'hbp', label: 'High blood pressure' },
        { value: 'chol', label: 'High cholesterol' },
        { value: 'resp', label: 'COPD, chronic bronchitis, or emphysema' },
      ] },
      { code: 'HIST', prompt: 'Do any of these apply to you?', type: 'checkboxes', scored: true, options: [
        { value: 'mobility', label: 'Difficulty walking or climbing stairs' },
        { value: 'cvd', label: 'Heart attack, stroke, or heart failure' },
        { value: 'cancer', label: 'I have had cancer' },
      ] },
    ],
  },
  {
    title: 'Where you live',
    whyWeAsk: 'Air quality and green surroundings are linked with longevity, and this powers the "Where Should I Live?" comparison.',
    confidence: 'medium',
    questions: [
      { code: 'AREA', prompt: 'What kind of area do you live in?', type: 'radio', scored: false, options: [
        { value: 'city', label: 'City' },
        { value: 'suburb', label: 'Suburb / town' },
        { value: 'rural', label: 'Rural' },
      ] },
    ],
  },
]

/** Every question flattened, in order. */
export const ALL_QUESTIONS: Question[] = SECTIONS.flatMap((s) => s.questions)

// ── Answer → Profile mapping ──────────────────────────────────────────────────
const INCOME_MID: Record<string, number> = { lower: 1.0, 'lower-middle': 1.8, middle: 2.5, 'upper-middle': 3.5, higher: 5.0 }
const ACT_MIN_MID: Record<string, number> = { u15: 10, '15-29': 22, '30-44': 37, '45-59': 52, '60+': 70 }
const SLEEP_HOURS: Record<string, number> = { u5: 4.5, '5-6': 5.5, '7-8': 7.5, '9': 9, '10+': 10.5 }

export const DEFAULT_ANSWERS: Answers = {
  AGE: 45,
  SEX: 'F',
  EDU: 'vocational',
  INCOME: 'middle',
  SMK: 'never',
  ACT_DAYS: '3',
  ACT_MIN: '30-44',
  SEDENTARY: '6-8',
  SLEEP: '7-8',
  WAIST: 88,
  ALC: 'light',
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

  const smoke = a.SMK === 'current' ? 2 : a.SMK === 'former' ? 1 : 0

  const days = num(a.ACT_DAYS) || 0
  const perDay = ACT_MIN_MID[String(a.ACT_MIN)] ?? 30
  const pa_min = 4.0 * perDay * days

  const cond = Array.isArray(a.COND) ? a.COND : []
  const hist = Array.isArray(a.HIST) ? a.HIST : []

  const profile: Profile = {
    country: 'RO',
    age,
    sex: a.SEX === 'M' ? 'M' : 'F',
    smoke: smoke as Profile['smoke'],
    pa_min,
    sleep: SLEEP_HOURS[String(a.SLEEP)] ?? 7.5,
    waist,
    diabetes: cond.includes('diabetes'),
    high_bp: cond.includes('hbp'),
    respiratory: cond.includes('resp'),
    cvd_hx: hist.includes('cvd'),
    cancer_hx: hist.includes('cancer'),
    higher_educ: a.EDU === 'university',
    income: INCOME_MID[String(a.INCOME)] ?? 2.5,
  }
  return { profile, errors }
}

/** The answers to persist via /api/answers (only questions that were actually answered). */
export function answersForApi(a: Answers): Array<{ question_code: string; value: unknown }> {
  return ALL_QUESTIONS.filter((q) => a[q.code] !== undefined && a[q.code] !== '').map((q) => ({
    question_code: q.code,
    value: a[q.code],
  }))
}
