// Times the server and the screens agree on: the Working phase's length (Settings, `.nexus/local.json` `phase`) and a
// chunk's estimate from its size (the repo's own progress.mjs hours table: S 1 h, M 2.5 h, L 5 h in the kit). Pure.

const H = 3600000;

/**
 * The Working phase each Settings choice means: the label the phase track shows and the span (ms) its bar and marks
 * are drawn against, the top of the range. "All night" is drawn against 8 hours.
 */
export const PHASE_BUDGETS = {
  short: { label: '2–3h', ms: 3 * H },
  std: { label: '3–4h', ms: 4 * H },
  night: { label: 'all night', ms: 8 * H },
};

/** The budget for a Settings phase (`short`, `std`, `night`), or null for anything else. */
export function phaseBudget(phase) {
  return PHASE_BUDGETS[phase] ? { ...PHASE_BUDGETS[phase] } : null;
}

/** A chunk's estimate in minutes from its size and the plan's hours table, or null when either is unknown. */
export function estimateMinutes(size, hours) {
  const h = hours && size ? hours[size] : null;
  return typeof h === 'number' && h > 0 ? Math.round(h * 60) : null;
}
