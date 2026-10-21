// GET /api/plan: the plan board's data, read only from the repo's own plan
// scripts so the board never disagrees with /next. The pick order is
// `order.mjs --json` (what /next would build, in order, with lanes, what is
// in flight and what is blocked); the specs, their chunks and % done are
// `progress.mjs <every spec> --json` (what `/next status` prints, pending
// closes counted). Nothing is parsed from the plan files here except the
// spec file names, to ask progress.mjs about every spec, and each spec's
// chunk order as it reads once settled (a grip reorder waits in a pending
// file, server/reorder.mjs), so the spec view lists what /next will read.
//
// The answer is the shape src/screens/board/model.js normalizePlan reads:
//   { repo, available, specs: [{ id, title, file, unchunked, percent, counts, hoursLeft, here, chunks: [chunk] }],
//     order: [id], next: [{ id, lane, eta, spec }], asap: [id], held: [id], inFlight: [{ id, who }],
//     blocked: [{ id, why }], unchunked: [spec], mark: [id], at, hours }
//   chunk: { id, title, size, state: 'ready'|'claimed'|'closed', closedOn, claim, plotted: 'main'|null, why?,
//            secrets?: [name], needsSecret?: [name], ownerOnly? }  (secretsOf: the secret gate, names only)
// A chunk with no words of its own is where the AI one-liner (GET /api/summaries,
// server/summaries.mjs) fills in.
import fs from 'node:fs';
import path from 'node:path';
import { run, json } from './sh.mjs';
import { findScript, PROGRESS_SCRIPTS, CHUNK_ID } from './repo.mjs';
import { listedIds, settledPlan, specFile } from './reorder.mjs';

export const ORDER_SCRIPTS = ['scripts/plan/order.mjs', 'scripts/order.mjs', 'scripts/dev/order.mjs'];
const SPEC_FILE = /^(\d{2,})-[a-z0-9][a-z0-9-]*\.md$/;
const specOf = (id) => String(id).split('.')[0];

/** The spec numbers the plan folder holds, as files spell them, in number order. */
export function specNumbers(repo) {
  const dir = path.join(repo, 'plan');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map((n) => SPEC_FILE.exec(n)?.[1]).filter(Boolean).sort((a, b) => Number(a) - Number(b));
}

/**
 * The secret gate's fields for a chunk order.mjs lists (spec 42): `secrets`, the names its line asks for, and
 * `needsSecret`, the ones the vault lacks (the owner's checkout), or every one of them on a contributor's checkout,
 * where a chunk with secrets is the owner's alone (`ownerOnly`). Names only, never a value.
 */
export function secretsOf(o) {
  if (!o) return {};
  const names = Array.isArray(o.secrets) ? o.secrets.map(String) : [];
  const out = names.length ? { secrets: names } : {};
  if (Array.isArray(o.needsSecret) && o.needsSecret.length) out.needsSecret = o.needsSecret.map(String);
  else if (names.length && /^owner only \(secrets/.test(String(o.why || ''))) Object.assign(out, { needsSecret: names, ownerOnly: true });
  return out;
}

/**
 * Join order.mjs's and progress.mjs's JSON into the board. Pure. Specs read in
 * pick order: by their first chunk /next would take (in flight first), then
 * specs waiting to be chunked, then blocked ones, then the rest by number.
 * Just plotted: the ids order.mjs echoes under `mark`, and a chunk order.mjs
 * sees (through a pending file) that progress.mjs does not list yet.
 */
export function boardFrom(order, progress, { repo = '' } = {}) {
  const next = order?.next || [];
  const inFlight = order?.inFlight || [];
  const blocked = order?.blocked || [];
  const marked = new Set((order?.mark || []).map(String));
  const why = new Map(blocked.map((c) => [String(c.id), c.why]));
  const fromOrder = new Map([...inFlight, ...next, ...blocked].map((c) => [String(c.id), c]));
  const known = new Set();
  const specs = (progress?.specs || []).map((s) => {
    const chunks = (s.chunks || []).map((c) => {
      known.add(String(c.id));
      const o = fromOrder.get(String(c.id));
      return {
        id: String(c.id), title: c.title || '', size: c.size ?? o?.size ?? null,
        state: c.state === 'closed' ? 'closed' : c.state === 'claimed' ? 'claimed' : 'ready',
        closedOn: c.closedOn ?? null, claim: c.claim ?? null,
        plotted: marked.has(String(c.id)) ? 'main' : null,
        ...(why.has(String(c.id)) ? { why: why.get(String(c.id)) } : null),
        ...secretsOf(o),
      };
    });
    return {
      id: String(s.spec), title: s.title || '', file: s.file || '', unchunked: s.status === 'unchunked',
      percent: s.percent ?? null, counts: s.counts ?? null, hoursLeft: s.hoursLeft ?? null, here: s.here ?? null, chunks,
    };
  });
  // A chunk order.mjs reads through a pending file before it settles: on its spec, just plotted.
  for (const c of fromOrder.values()) {
    if (known.has(String(c.id))) continue;
    const sid = String(c.spec ?? specOf(c.id));
    let s = specs.find((x) => x.id === sid);
    if (!s) specs.push((s = { id: sid, title: '', file: '', unchunked: false, percent: null, counts: null, hoursLeft: null, here: null, chunks: [] }));
    s.chunks.push({ id: String(c.id), title: c.title || '', size: c.size ?? null, state: 'ready', closedOn: null, claim: null, plotted: 'main', ...(why.has(String(c.id)) ? { why: why.get(String(c.id)) } : null), ...secretsOf(c) });
  }
  const rank = new Map();
  const put = (sid) => { if (!rank.has(sid)) rank.set(sid, rank.size); };
  for (const c of [...inFlight, ...next]) put(String(c.spec ?? specOf(c.id)));
  for (const n of order?.unchunked || []) put(String(n));
  for (const c of blocked) put(String(c.spec ?? specOf(c.id)));
  specs.sort((a, b) => (rank.get(a.id) ?? 1e6 + Number(a.id)) - (rank.get(b.id) ?? 1e6 + Number(b.id)));
  return {
    repo, available: true, at: progress?.at ?? null, hours: progress?.hours ?? null,
    specs,
    order: [...next, ...inFlight, ...blocked].map((c) => String(c.id)),
    next: next.map((c) => ({ id: String(c.id), spec: String(c.spec ?? specOf(c.id)), lane: c.lane, eta: c.eta })),
    asap: next.filter((c) => c.lane === 'asap').map((c) => String(c.id)),
    held: blocked.filter((c) => c.why === 'held').map((c) => String(c.id)),
    inFlight: inFlight.map((c) => ({ id: String(c.id), who: c.who })),
    blocked: blocked.map((c) => ({ id: String(c.id), why: c.why })),
    unchunked: (order?.unchunked || []).map(String),
    mark: [...marked],
  };
}

/**
 * Shell to the repo's order.mjs and progress.mjs and join them. `mark` is a
 * list of chunk ids to show as just plotted (order.mjs --mark). Returns
 * { available: false, note } when the repo has no plan scripts; throws
 * (status 502) when one fails, with what it printed.
 */
export async function readPlan(repo, { mark = [], exec = run, name = path.basename(repo), settled } = {}) {
  const orderScript = findScript(repo, ORDER_SCRIPTS);
  const progressScript = findScript(repo, PROGRESS_SCRIPTS);
  if (!orderScript || !progressScript) {
    return { repo: name, available: false, note: 'No plan scripts in this repo yet (scripts/plan/order.mjs and progress.mjs).', specs: [], order: [] };
  }
  const ids = [].concat(mark).map(String).filter((id) => CHUNK_ID.test(id) && id.includes('.'));
  const orderArgs = [orderScript, '--json', ...(ids.length ? ['--mark', ids.join(',')] : [])];
  const nums = specNumbers(repo);
  const [o, p] = await Promise.all([
    exec('node', orderArgs, { cwd: repo, timeout: 60000 }),
    nums.length ? exec('node', [progressScript, ...nums, '--json'], { cwd: repo, timeout: 60000 }) : Promise.resolve({ ok: true, stdout: '{"specs":[]}' }),
  ]);
  const order = o.ok ? json(o.stdout) : null;
  const progress = p.ok ? json(p.stdout) : null;
  if (!order || !progress) {
    const bad = !order ? [orderScript, o] : [progressScript, p];
    throw Object.assign(new Error(`${bad[0]} failed: ${String(bad[1].stderr || bad[1].stdout || '').trim().slice(0, 400)}`), { status: 502 });
  }
  const board = boardFrom(order, progress, { repo: name });
  try {
    const view = settled || (await settledPlan(repo));
    const listed = new Map(board.specs.map((s) => {
      const file = specFile(repo, s.id);
      return [s.id, file ? listedIds(view.read(file) || '') : []];
    }));
    board.specs = inListedOrder(board.specs, listed);
  } catch { /* progress.mjs's order stands */ }
  return board;
}

/**
 * Each spec's chunks in the order its file lists them once settled (listed: spec id -> chunk ids). Pure. A chunk the
 * listing does not name (closed and gone, or only in a pending file) keeps its own slot; the listed ones fill theirs.
 */
export function inListedOrder(specs, listed) {
  return specs.map((s) => {
    const at = new Map((listed.get(s.id) || []).map((id, i) => [id, i]));
    const named = s.chunks.filter((c) => at.has(c.id)).sort((a, b) => at.get(a.id) - at.get(b.id));
    let k = 0;
    return { ...s, chunks: s.chunks.map((c) => (at.has(c.id) ? named[k++] : c)) };
  });
}
