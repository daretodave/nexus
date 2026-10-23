// Grill me's pure half (0.5.1): the queue of open plan questions spec by spec, how a step moves through it, the
// progress it shows, where a run picks up, and how the end hands the answers off (one message per session). Tested in
// node (test/grill-model.test.mjs).
import { keepsAnswer, continueTarget, NEW_SESSION } from '../headsdown-inbox/planAnswers.js';

/** A plan group's key in a run: its spec number, or its file for one that is not a spec. */
export const specKeyOf = (pg) => (pg.n ? `spec:${pg.n}` : `file:${pg.file}`);

/**
 * The queue: open plan questions in words (no secret request), spec by spec in number order, then other files; each
 * spec's questions in file order. A question kept but not sent stays in (it reads answered when visited); one sent is
 * done. `specs`: keep only these spec keys (a run's picks, or ?spec=). `all`: every plan item, for the secret count.
 * -> { specs: [{ key, n, title, file, ids }], ids, byId, secrets }
 */
export function queueOf(groups = [], done = {}, { specs = null, all = [] } = {}) {
  const want = specs && specs.length ? new Set(specs) : null;
  const out = [];
  const byId = {};
  for (const pg of groups) {
    const key = specKeyOf(pg);
    if (want && !want.has(key)) continue;
    const items = pg.items
      .filter((i) => keepsAnswer(i) && !(done[i.id] && done[i.id].sent))
      .sort((a, b) => (Number(a.raw?.line) || 0) - (Number(b.raw?.line) || 0));
    if (!items.length) continue;
    for (const i of items) byId[i.id] = { item: i, spec: key };
    out.push({ key, n: pg.n || '', title: pg.title || '', file: pg.file || '', ids: items.map((i) => i.id) });
  }
  // Specs first, then the files that are not specs ("Other files").
  out.sort((a, b) => (a.n && b.n ? Number(a.n) - Number(b.n) : a.n ? -1 : b.n ? 1 : a.file.localeCompare(b.file)));
  const secrets = (all || []).filter((i) => i && i.secret && !(done[i.id])).length;
  return { specs: out, ids: out.flatMap((s) => s.ids), byId, secrets };
}

/** Where a question stands in a run: 'kept' | 'decided' | 'skipped' | 'open'. */
export function standing(id, done = {}, skipped = []) {
  const d = done[id];
  if (d && d.kept) return d.how === 'decide' ? 'decided' : 'kept';
  return skipped.includes(id) ? 'skipped' : 'open';
}

/** The counts the bar shows: { answered, decided, skipped, left, total, perSpec: { [key]: {...} } }. */
export function progress(queue, done = {}, skipped = []) {
  const count = (ids) => {
    const c = { answered: 0, decided: 0, skipped: 0, left: 0, total: ids.length };
    for (const id of ids) {
      const s = standing(id, done, skipped);
      if (s === 'kept') c.answered += 1;
      else if (s === 'decided') c.decided += 1;
      else if (s === 'skipped') c.skipped += 1;
      else c.left += 1;
    }
    return c;
  };
  const all = count(queue.ids);
  const perSpec = Object.fromEntries(queue.specs.map((s) => [s.key, count(s.ids)]));
  return { ...all, perSpec };
}

/**
 * One move through a run. state: { view: 'start'|'q'|'between'|'review', id, from? }. Actions:
 *   { type: 'keep'|'skip'|'decide'|'next' }  on to the next question (a spec boundary shows 'between', the end 'review')
 *   { type: 'prev' }                          back one (no screen between)
 *   { type: 'jump', id }                      straight to a question
 *   { type: 'nextSpec' | 'prevSpec' }         the first question of the next or previous spec
 *   { type: 'go' }                            from 'between' (or 'start') on to the question
 *   { type: 'review' }                        the hand-off screen
 */
export function step(state, action, queue) {
  const ids = queue.ids;
  const at = ids.indexOf(state.id);
  const specOf = (id) => queue.byId[id]?.spec || null;
  switch (action.type) {
    case 'keep':
    case 'skip':
    case 'decide':
    case 'next': {
      const next = ids[at + 1];
      if (!next) return { view: 'review', id: state.id };
      if (specOf(next) !== specOf(state.id) && action.type !== 'next') return { view: 'between', id: next, from: specOf(state.id) };
      return { view: 'q', id: next };
    }
    case 'prev': return { view: 'q', id: ids[Math.max(0, at - 1)] || state.id };
    case 'jump': return ids.includes(action.id) ? { view: 'q', id: action.id } : state;
    case 'nextSpec':
    case 'prevSpec': {
      const si = queue.specs.findIndex((s) => s.key === specOf(state.id));
      const s = queue.specs[si + (action.type === 'nextSpec' ? 1 : -1)];
      return s ? { view: 'q', id: s.ids[0] } : state;
    }
    case 'go': return { view: 'q', id: state.id || ids[0] };
    case 'review': return { view: 'review', id: state.id };
    default: return state;
  }
}

/**
 * Where a saved run picks up: its question when it is still in the queue, else the first open one at or after its old
 * place (`at.i`), else the first open one at all. -> { id, moved } or null when nothing is open.
 */
export function resumeTarget(queue, at, done = {}, skipped = []) {
  const ids = queue.ids;
  if (!ids.length) return null;
  if (at && ids.includes(at.id)) return { id: at.id, moved: false };
  const open = (id) => standing(id, done, skipped) === 'open';
  const from = Math.min(Math.max(0, Number(at?.i) || 0), ids.length - 1);
  const after = ids.slice(from).find(open) || ids.find(open);
  return after ? { id: after, moved: !!at } : { id: ids[0], moved: !!at };
}

/** The saved run (`grill:at` draft): { specs, id, i, at } or null. */
export function readGrillAt(raw) {
  try {
    const v = JSON.parse(raw || 'null');
    return v && typeof v === 'object' && v.id ? v : null;
  } catch { return null; }
}

/** How many open questions a saved run still has, of these open plan items. */
export function grillLeft(at, open = []) {
  if (!at) return 0;
  const specs = Array.isArray(at.specs) && at.specs.length ? new Set(at.specs) : null;
  return open.filter((i) => !specs || specs.has(i.spec ? `spec:${i.spec.n}` : `file:${i.raw?.file || i.file}`)).length;
}

/** The ids a draft list holds (`grill:skip`). */
export function readIds(raw) {
  try { const v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}

/**
 * The hand-off: each spec's kept, unsent answers to its target (picked, else continueTarget), grouped by target, one
 * request each; every spec headed to a new session shares one new session.
 * `specs`: [{ key, n, file, items }]; `picks`: { [specKey]: target }. -> [{ target, keys: [specKey], items }]
 */
export function handoffPlan(specs = [], done = {}, sessions = [], picks = {}) {
  const out = new Map();
  for (const s of specs) {
    const items = s.items.filter((i) => keepsAnswer(i) && done[i.id]?.kept && !done[i.id].sent);
    if (!items.length) continue;
    const target = picks[s.key] || continueTarget({ n: s.n, file: s.file }, sessions);
    const k = target.kind === 'new' ? 'new' : target.id;
    if (!out.has(k)) out.set(k, { target: target.kind === 'new' ? NEW_SESSION : target, keys: [], items: [] });
    const g = out.get(k);
    g.keys.push(s.key);
    g.items.push(...items);
  }
  // The live sessions first (they carry on at once), the new one last.
  return [...out.values()].sort((a, b) => (a.target.kind === 'new') - (b.target.kind === 'new'));
}

/**
 * Run the hand-off one request after another: `send(group)` -> { ok, session, name, note } | { error }. A failed one
 * keeps its answers kept and unsent; the rest still go. -> [{ group, result }]
 */
export async function runHandoff(groups, send) {
  const results = [];
  for (const g of groups) {
    let r;
    try { r = await send(g); } catch (e) { r = { error: e?.message || 'it failed' }; }
    results.push({ group: g, result: r || { error: 'no reply' } });
  }
  return results;
}
