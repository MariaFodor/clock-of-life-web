// Facts about the shipped model that both the UI and the mock scorer need: ONE definition each,
// pinned against the service by mockScoring.parity.test.ts.
//
// (An earlier version of this comment claimed the split also kept the dev scoring engine out of the
// production bundle. It does not: Rollup tree-shakes per declaration, not per module, so importing
// one pure const from mockScoring never pulled scoreWhatIf with it, and main.tsx gates the mock
// behind an env flag that is folded away at build time. Measured, the counterfactual bundle is the
// same code in a different module order — same length and same characters, different hash. So the
// split changes nothing about what ships. The real reason is the one above, plus a duplicated rule
// that had already drifted twice.)

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

/** Why cutting down is not priced like quitting — the text the service returns, mirrored so the
 *  mock cannot tell a different story from production. Pinned character-for-character against
 *  `REDUCTION_NOTE` in the service's scoring.rs by the parity suite.
 *
 *  Two claims, two sources, both on the wire because a claim a user can read is a claim they can
 *  check: concavity of the dose-response (Bjartveit & Tverdal 2005) and the absence of a
 *  demonstrated all-cause mortality benefit from reducing without quitting (Godtfredsen 2002).
 *  COHORT evidence, deliberately not "trials" — reduction trials are powered for cessation, not
 *  mortality, and the mock said "trials" until the parity pin caught it. */
export const REDUCTION_NOTE =
  "cutting down is priced at the model's per-cigarette gradient, which is the optimistic reading. " +
  'Smoking risk is concave — the first few cigarettes a day carry far more than their share ' +
  '(Bjartveit & Tverdal 2005, https://doi.org/10.1136/tc.2005.011932) — and cohort studies of ' +
  'smokers who cut down have found little to no reduction in all-cause mortality ' +
  '(Godtfredsen 2002, https://doi.org/10.1093/aje/kwf150). Quitting is worth much more.'
