// Facts about the shipped model that the UI has to know, kept out of the mock scorer so that
// importing one of them does not drag the whole dev-mode scoring engine into the production bundle.
//
// Everything here is pinned against the service's vendored bundle by mockScoring.parity.test.ts.

import type { Profile } from './types'

/** The bundle's `conditional_defaults.cigs_day_when_current_smoker` (model-v3.0.1).
 *
 *  A CURRENT smoker who never answered the dose question is scored at the cohort's smoker mean, not
 *  at zero — since the smoking contrast was corrected, `smk_current` no longer carries the dose, so
 *  zero would describe a smoker who smokes nothing. */
export const SMOKER_MEAN_CIGS = 12.180940083564199

/** The dose the score actually uses, imputation included (scoring.rs `effective_cigs_day`).
 *
 *  Anything reasoning about a dose CHANGE has to compare like with like: an undeclared smoker's raw
 *  `cigs_day` is 0 while the number reaching the model is the cohort mean, so comparing raw fields
 *  reads a real reduction as an increase. */
export function effectiveCigsDay(p: Pick<Profile, 'smoke' | 'cigs_day'>): number {
  if (p.smoke !== 2) return 0
  return p.cigs_day && p.cigs_day > 0 ? p.cigs_day : SMOKER_MEAN_CIGS
}
