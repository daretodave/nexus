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
//     git: { branch, worktree, up, down, behind, dirty, pr: { num, ci }, noPr, claims, commits: [{ sha, m, w }] },
//     turn: 'working'|'idle' (absent: unknown), last: { kind: 'text', text, at } | { kind: 'tool', tool, arg, at },
//     lastPrompt, claimsSession, ended: <a hosted session that died with its server and left nothing behind> }
import { foldClaims, sessionOf } from '../board/model.js';
import { isProgressLine, progressLine } from '../../../shared/progress-line.mjs';
import { finishedJob } from './alive.js';

/** States a session runs in; an idle one (its turn ended, nothing queued) is shown idle, not working. */
const RUNNING = ['live', 'observing', 'resumed'];

/** Phase track for a tile: Q Working Q P (contributor) or Q Working Q (owner). */
export function phaseItems(s) {
  const keys = s.mode === 'owner' ? ['q', 'w', 'q'] : ['q', 'w', 'q', 'p'];
  const labels = { q: 'Q', w: 'Working', p: 'P' };
  // Only a phase the session reports is drawn as now; an idle session has none running, and a session that reports
  // none lights no segment rather than a made-up one.
  const reported = { questions: 0, working: 1, end: 2, package: 3 }[s.phase] ?? (s.state === 'asking' ? 0 : null);
  const at = s.idle && s.state !== 'asking' ? null : reported;
  return keys.map((key, i) => ({
    key,
    label: labels[key],
    state: at == null ? (reported != null && i < reported ? 'done' : undefined) : i < at ? 'done' : i === at ? (key === 'q' ? 'ask' : 'now') : undefined,
    // The working segment fills to the reported progress; with none reported it fills nothing (no fake fraction).
    p: at != null && i === at && key === 'w' ? (s.progress?.pct != null ? `${Math.round(s.progress.pct)}%` : '0%') : undefined,
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
  // Idle: its turn ended and nothing waits (the server says so); its orb rests.
  s.idle = s.turn === 'idle' && RUNNING.includes(s.state);
  // A session with no ledger progress that printed a progress bar (progress.mjs) as its last word: that bar is its
  // progress, drawn as the tile's bar, never as the raw `[####]` text (49.3).
  if (!s.progress && s.last?.kind === 'text') {
    const p = s.last.progress || progressLine(s.last.text);
    if (p) s.progress = p;
  }
  if (s.idle) s.orb = 'idle';
  return s;
}

/** The line an idle tile reads: "Done · last: /plot peek", or "Idle" when no prompt is known. */
export function idleLine(s) {
  return s.lastPrompt ? `Done · last: ${s.lastPrompt}` : 'Idle';
}

/**
 * A tile's preview line: the session's last word (inline markdown, one line) or its last tool row (tool and a short
 * argument). null when the session has said nothing yet.
 */
export function lastLine(s, max = 160) {
  const l = s?.last;
  if (!l) return null;
  const cut = (t) => { const x = String(t || '').replace(/\s+/g, ' ').trim(); return x.length > max ? `${x.slice(0, max - 3)}...` : x; };
  if (l.kind === 'tool') return { kind: 'tool', tool: l.tool || 'tool', arg: cut(l.arg), at: l.at || null };
  // A progress bar line is drawn as the tile's bar (norm, bar), not repeated here as characters.
  if (isProgressLine(l.text)) return null;
  const text = cut(l.text);
  return text ? { kind: 'text', text, at: l.at || null } : null;
}

/** A chunk's title from GET /api/plan (its specs' chunks or its flat chunks), or ''. */
export function chunkTitle(plan, id) {
  if (!plan || id == null || id === '') return '';
  const key = String(id);
  const all = [...(plan.chunks || []), ...(plan.specs || []).flatMap((x) => x.chunks || []), ...[].concat(plan.next || [])];
  const c = all.find((x) => x && String(x.id) === key);
  return c ? String(c.t ?? c.title ?? '') : '';
}

/**
 * Every claim holder no session tile stands for: a session tag (or, with none, a person) whose claims no listed
 * session owns: the fleet head counts them in one line that links to the Plan board. The cloud loop's claims and held claims are not sessions.
 * rows: GET /api/claims rows; sessions: the fleet rows. -> [{ key, session, name, who, mine, n, lines, fold, at, stale }],
 * the most claims first. `fold` is the rail's fold as one line: "59.10-59.49 · 39 chunks, 60.2".
 */
export function claimHolders(rows, sessions = []) {
  const by = new Map();
  for (const r of rows || []) {
    const tag = String(r.session || '');
    if (r.held || tag.startsWith('cloud-')) continue;
    if (tag && sessionOf(sessions, tag)) continue;
    const key = tag ? `s:${tag}` : `p:${r.who || 'someone'}`;
    if (!by.has(key)) by.set(key, { key, session: tag, name: '', who: r.who || '', mine: false, claims: [], at: null, stale: true });
    const h = by.get(key);
    if (r.star && !h.name) h.name = r.star;
    if (r.mine) h.mine = true;
    if (r.state !== 'stale') h.stale = false;
    const t = Date.parse(r.at);
    if (Number.isFinite(t) && (h.at == null || t < h.at)) h.at = t;
    h.claims.push({ id: String(r.id), rawId: String(r.id), t: '', v: { raw: r, pr: r.pr || null, stale: r.state === 'stale' } });
  }
  const out = [...by.values()].map((h) => {
    const lines = foldClaims(h.claims, h.key);
    const fold = lines.map((l) => (l.kind === 'run' ? `${l.from}-${l.to} · ${l.n} chunks` : l.c.id)).join(', ');
    const name = h.name || (h.session ? h.session.slice(0, 8) : h.who || 'someone');
    return { key: h.key, session: h.session, name, who: h.who, mine: h.mine, n: h.claims.length, lines, fold, at: h.at, stale: h.stale };
  });
  return out.sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}

/**
 * Set aside: on the fleet only when asked for. A terminal session nobody linked (any Claude Code chat in the repo that
 * wrote in the last 15 minutes, the owner's own tabs among them), a session that fell over, and one that stopped when
 * the server restarted. Nothing waiting on the owner is ever set aside.
 */
export const fellOver = (s) => s.state === 'fallen' || s.state === 'resume-failed';
export const inTerminal = (s) => s.state === 'observing' && !s.linked;
export const aside = (s) => inTerminal(s) || !!s.ended || fellOver(s);

/**
 * Filters on the view head, and the counts the topbar line reads. "This machine" is the default; `optional` chips
 * show only while they hold something (or are chosen).
 */
export const FILTERS = [
  { value: 'here', label: 'This machine', test: (s) => !aside(s) },
  { value: 'needs', label: 'Needs you', test: (s) => !aside(s) && s.state === 'asking' },
  { value: 'working', label: 'Working', test: (s) => !aside(s) && !s.idle && ['live', 'observing', 'resuming', 'resumed'].includes(s.state) },
  // A session that finished its job reads done (fleet/alive.js), not idle.
  { value: 'idle', label: 'Idle', test: (s) => !aside(s) && !!s.idle && !finishedJob(s) },
  { value: 'terminals', label: 'In terminals', optional: true, test: inTerminal },
  { value: 'fallen', label: 'Fell over', optional: true, test: (s) => !!s.ended || fellOver(s) },
];

export function counts(list) {
  const c = {};
  for (const f of FILTERS) c[f.value] = list.filter(f.test).length;
  return c;
}

/**
 * The topbar line, over what this machine shows: "3 sessions · 2 working · 1 done · 1 needs you · 1 fell over".
 * Fell over counts only work that can be resumed (a stopped session has nothing to lose); terminals get no clause.
 */
export function summary(list) {
  const c = counts(list);
  const lost = list.filter((s) => !s.ended && fellOver(s)).length;
  if (!c.here && !lost) return 'no sessions yet';
  const parts = [`${c.here} ${c.here === 1 ? 'session' : 'sessions'}`];
  if (c.working) parts.push(`${c.working} working`);
  const done = list.filter((s) => !aside(s) && finishedJob(s)).length;
  if (done) parts.push(`${done} done`);
  if (c.idle) parts.push(`${c.idle} idle`);
  if (c.needs) parts.push(`${c.needs} needs you`);
  if (lost) parts.push(`${lost} fell over`);
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
