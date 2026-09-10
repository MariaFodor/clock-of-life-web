// What the model's role tokens mean, in the reader's words rather than the model's.
//
// `lever`, `manage`, `marker` are the ontology's own vocabulary, and they reach the screen on three
// surfaces: the Why? breakdown, the Improve list, and the causal graph. Each surface used to decide
// for itself, so the same factor could read "you can change this" on one page and "lever" on the
// next — a word the reader has never been told the meaning of. One mapping, used by all three, is
// what makes that impossible rather than merely unlikely.

export const ROLE_LABEL: Record<string, string> = {
  lever: 'you can change this',
  manage: 'manage the condition',
  context: 'context — explained, not a target',
  marker: 'a sign, not a cause — explained, never recommended',
  baseline: 'baseline',
}

/**
 * The plain words for a role token.
 *
 * An unknown token falls back to itself: the ontology ships with the model, so a role added to a
 * bundle before it is added here must still show SOMETHING, and the token is at least true. It is
 * the one case where jargon may reach the screen, and it is visible enough to be reported.
 */
export const roleLabel = (role: string): string => ROLE_LABEL[role] ?? role
