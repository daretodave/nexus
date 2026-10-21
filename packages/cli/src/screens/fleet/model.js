// What the fleet reads from GET /api/sessions, normalized once so the tile
// and the train never guess. The server's session shape (all optional
// except id and name):
//
//   { id, name, kind: 'local'|'terminal'|'other', repo, mode: 'owner'|'contributor',
//     state: 'live'|'asking'|'fallen'|'resuming'|'resumed'|'resume-failed'|'closed',
//     phase: 'questions'|'working'|'end'|'package', progress: { pct, done, total, label },
//     chunk: { id, title, first }, parked, questions: { answered, total },
//     orb: <orb state of the main agent>, agents: [{ state, workflow }],
//     event: { at, text }, beat, fell: { tool, chunk, at }, run: <workflow dir>,
//     resume: { chunk, steps, files, done, total, at, text, error, recap },
//     train: { state: 'pausing'|'paused', text },
//     git: { branch, worktree, up, down, behind, dirty, pr: { num, ci }, noPr, claims, commits: [{ sha, m, w }] } }

/** Phase track for a tile: Q Working Q P (contributor) or Q Working Q (owner). */
export function phaseItems(s) {
  const keys = s.mode === 'owner' ? ['q', 'w', 'q'] : ['q', 'w', 'q', 'p'];
  const labels = { q: 'Q', w: 'Working', p: 'P' };
  const at = { questions: 0, working: 1, end: 2, package: 3 }[s.phase] ?? (s.state === 'asking' ? 0 : 1);
  return keys.map((key, i) => ({
    key,
    label: labels[key],
    state: i < at ? 'done' : i === at ? (key === 'q' ? 'ask' : 'now') : undefined,
    p: i === at && key === 'w' && s.progress?.pct != null ? `${Math.round(s.progress.pct)}%` : undefined,
  }));
}

/** The ASCII bar: 17 cells for time, one cell per question while asking. */
export function bar(s) {
  if (s.state === 'asking' && s.questions?.total) {
    const { answered = 0, total } = s.questions;
    return { filled: answered, empty: Math.max(0, total - answered), label: `${answered} of ${total} answered` };
  }
  const p = s.progress;
  if (!p) return null;
  const frac = p.pct != null ? p.pct / 100 : p.total ? (p.done || 0) / p.total : 0;
  const filled = Math.max(0, Math.min(17, Math.round(frac * 17)));
  return { filled, empty: 17 - filled, label: p.label || `${Math.round(frac * 100)}%` };
}

export function norm(raw) {
  const s = { ...raw };
  s.kind = s.kind || 'local';
  // A terminal session is read-only (observing) while it runs; fallen, it offers Resume like any other.
  if (s.kind === 'terminal' && !['fallen', 'resuming', 'resumed', 'resume-failed'].includes(s.state)) s.state = 'observing';
  s.state = s.state || 'live';
  s.mode = s.mode || 'contributor';
  s.git = s.git || {};
  s.session = { name: s.name, kind: s.kind };
  return s;
}

/** Filters on the view head, and the counts the topbar line reads. */
export const FILTERS = [
  { value: 'all', label: 'All', test: () => true },
  { value: 'needs', label: 'Needs you', test: (s) => s.state === 'asking' },
  { value: 'working', label: 'Working', test: (s) => ['live', 'observing', 'resuming', 'resumed'].includes(s.state) },
  { value: 'fallen', label: 'Fell over', test: (s) => s.state === 'fallen' || s.state === 'resume-failed' },
];

export function counts(list) {
  const c = {};
  for (const f of FILTERS) c[f.value] = list.filter(f.test).length;
  return c;
}

/** The topbar line: "5 sessions · 3 working · 1 needs you · 1 fell over". */
export function summary(list) {
  if (!list.length) return 'no sessions yet';
  const c = counts(list);
  const parts = [`${list.length} ${list.length === 1 ? 'session' : 'sessions'}`];
  if (c.working) parts.push(`${c.working} working`);
  if (c.needs) parts.push(`${c.needs} needs you`);
  if (c.fallen) parts.push(`${c.fallen} fell over`);
  return parts.join(' · ');
}

/**
 * The reboot train. Every local session that is not fallen stops at its
 * next safe step; fallen and terminal sessions ride along as skipped cars.
 */
export function trainOf(list, on) {
  const local = list.filter((s) => s.kind === 'local');
  const riders = local.filter((s) => !['fallen', 'resume-failed', 'closed'].includes(s.state));
  const isPaused = (s) => s.train?.state === 'paused' || s.state === 'paused';
  const anyServer = riders.some((s) => s.train?.state);
  const active = on || anyServer;
  const paused = riders.filter(isPaused);
  const pending = riders.filter((s) => !isPaused(s));
  const all = active && riders.length > 0 && pending.length === 0;
  const cars = [
    ...riders.map((s) => ({ session: s.session, state: isPaused(s) ? 'paused' : 'pausing', text: s.train?.text || (isPaused(s) ? 'paused' : 'at its next safe step') })),
    ...local.filter((s) => !riders.includes(s)).map((s) => ({ session: s.session, state: 'skipped', text: 'fallen, nothing to stop' })),
    ...list.filter((s) => s.kind === 'terminal').map((s) => ({ session: s.session, state: 'skipped', text: 'terminal, pause it there' })),
  ];
  const names = pending.map((s) => s.name);
  const who = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] || '';
  const text = all
    ? `All ${riders.length} paused. Safe to restart this machine; each session resumes where it stopped.`
    : `${paused.length} of ${riders.length} paused. Safe to restart once ${who} ${names.length === 1 ? 'finishes its step' : 'finish their steps'}.`;
  return { active, all, cars, text, paused: paused.length, total: riders.length, isPaused };
}
