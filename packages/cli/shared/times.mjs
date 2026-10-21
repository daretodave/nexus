// Times the server and the screens agree on: the Working phase's length (Settings, `.nexus/local.json` `phase`), a
// chunk's estimate from its size (the repo's own progress.mjs hours table: S 1 h, M 2.5 h, L 5 h in the kit), and how
// long a live question waits before its session takes the default. Pure.

const H = 3600000;

/** The start of "tonight" (the cloud loop's stats): 18:00 local, today if it has passed, else yesterday. */
export function tonightStart(now = new Date()) {
  const d = new Date(now);
  d.setHours(18, 0, 0, 0);
  if (d > now) d.setDate(d.getDate() - 1);
  return d;
}

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

/**
 * How long a live question (AskUserQuestion in a session this server runs) waits before the session takes its
 * default: 6 minutes. The Tug board's countdown reads "default in 4:48" with its ring at 80%, which is 6 minutes.
 * The default is the option marked "(recommended)", else the first; a question with no options has no default and
 * waits for an answer.
 */
export const ASK_DEFAULT_MS = 6 * 60000;

const REC = /\s*\(recommended\)\s*$/i;

/** The answers taking every default gives, keyed by question text (labels without the mark), or null if one has none. */
export function askDefaults(questions = []) {
  const out = {};
  for (const q of questions) {
    const labels = (q?.options || []).map((o) => String(typeof o === 'string' ? o : o?.label || '')).filter(Boolean);
    if (!labels.length) return null;
    const pick = labels.find((l) => REC.test(l)) || labels[0];
    out[q.question] = pick.replace(REC, '');
  }
  return Object.keys(out).length ? out : null;
}

/** A countdown to a default: { left: "4:48", pct: 80 } (pct of the wait still to go), or null past it or without one. */
export function countdown(deadline, now, total = ASK_DEFAULT_MS) {
  const end = typeof deadline === 'number' ? deadline : Date.parse(deadline ?? '');
  if (!Number.isFinite(end) || !Number.isFinite(now)) return null;
  const ms = end - now;
  if (ms <= 0) return null;
  const s = Math.ceil(ms / 1000);
  return { left: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, pct: Math.max(0, Math.min(100, Math.round((ms / total) * 100))) };
}
