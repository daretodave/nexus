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
// Which order.mjs and progress.mjs (spec 47, A8): the repo's own first, wherever it keeps them (repo.mjs kitScripts:
// scripts/plan/, scripts/, scripts/dev/, scripts/git/), since a mature repo's plan may not be in the kit's shape and
// its own script is the one that reads it. Only when the repo has none does the CLI run its bundled copy of the kit's
// (kit/scripts/, copied by scripts/bundle-kit.mjs; inside the nexus repo, templates/scripts) against the repo, cwd the
// repo. The bundled copy only reads: its closure has no claims.mjs and no secrets vault (so it never fetches the claims
// branch or writes a key), it runs with --no-vault, and with no GIT_* a parent git leaked (cloud.mjs gitEnv) and
// GIT_OPTIONAL_LOCKS=0. A script that exits non-zero, prints what isn't JSON, or JSON not in its shape makes the
// answer unreadable ({ available: false, unreadable: true, error, script, docs }), never an empty plan; a plan with no
// specs that read fine stays an empty plan. Every answer says which order script ran (`sources`).
//
// The answer is the shape src/screens/board/model.js normalizePlan reads:
//   { repo, available, specs: [{ id, title, file, unchunked, percent, counts, hoursLeft, here, chunks: [chunk] }],
//     order: [id], next: [{ id, lane, eta, spec }], asap: [id], held: [id], inFlight: [{ id, who }],
//     blocked: [{ id, why }], unchunked: [spec], mark: [id], at, hours,
//     sources: { order: { script, bundled }, progress: { script, bundled } } }
//   chunk: { id, title, size, state: 'ready'|'claimed'|'closed', closedOn, closedBy, claim, plotted: 'main'|null, why?,
//            secrets?: [name], needsSecret?: [name], ownerOnly? }  (secretsOf: the secret gate, names only)
// A chunk with no words of its own is where the AI one-liner (GET /api/summaries,
// server/summaries.mjs) fills in.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { json, track } from './sh.mjs';
import { gitEnv } from './cloud.mjs';
import { findScript, kitScripts, PROGRESS_SCRIPTS, CHUNK_ID } from './repo.mjs';
import { listedIds, settledPlan, specFile } from './reorder.mjs';

export const ORDER_SCRIPTS = kitScripts('order.mjs', { home: 'scripts/plan' });
const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** The CLI's bundled copy of the kit's plan scripts (templates/scripts' layout: plan/order.mjs beside plan-check.mjs). */
export const PLAN_BUNDLED = path.join(PKG, 'kit', 'scripts');
const PLAN_TEMPLATES = path.resolve(PKG, '..', '..', 'templates', 'scripts');
export const PLAN_ENTRIES = Object.freeze(['plan/order.mjs', 'plan/progress.mjs']);
export const PLAN_DOCS = 'https://github.com/daretodave/nexus/blob/main/concepts/plan-shape.md';
export const BUNDLED_LABEL = "nexus's bundled copy";

/**
 * The scripts directory the bundled plan scripts come from: the CLI's copy, else a copy staged from the kit's
 * templates (a dev checkout with no build yet); null when neither. The templates are never run in place: their
 * folder holds claims.mjs, which order.mjs and progress.mjs would load and fetch with, so the staged copy takes only
 * planKitFiles' closure, as the built kit/ does, and stays read-only.
 */
const staged = new Map();
export function planKitDir({ bundled = PLAN_BUNDLED, templates = PLAN_TEMPLATES } = {}) {
  const has = (d) => PLAN_ENTRIES.every((e) => fs.existsSync(path.join(d, e)));
  if (has(bundled)) return bundled;
  if (!has(templates)) return null;
  if (staged.has(templates) && has(staged.get(templates))) return staged.get(templates);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-plan-kit-'));
  for (const f of planKitFiles(templates)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.copyFileSync(path.join(templates, f), path.join(dir, f));
  }
  staged.set(templates, dir);
  return dir;
}

/**
 * The files the bundled order.mjs and progress.mjs need, relative to the scripts dir (posix): their static relative
 * imports, walked. The dynamic ones (claims.mjs, the vault) are left out on purpose: without them the copy only reads.
 */
export function planKitFiles(dir) {
  const seen = [];
  const queue = [...PLAN_ENTRIES];
  while (queue.length) {
    const f = queue.shift();
    if (seen.includes(f)) continue;
    const abs = path.join(dir, f);
    if (!fs.existsSync(abs)) continue;
    seen.push(f);
    for (const m of fs.readFileSync(abs, 'utf8').matchAll(/^\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]/gm)) {
      queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1])));
    }
  }
  return seen;
}

/** node on a script, no shell: { ok, code, stdout, stderr }. The environment carries no GIT_* a parent git leaked. */
export function execNode(_cmd, args, { cwd, timeout = 60000, env } = {}) {
  return new Promise((resolve) => {
    track(execFile(process.execPath, args, { cwd, timeout, env: env || gitEnv(), windowsHide: true, maxBuffer: 64 * 1024 * 1024 }, (e, stdout, stderr) => {
      resolve({ ok: !e, code: e ? (typeof e.code === 'number' ? e.code : -1) : 0, stdout: String(stdout || ''), stderr: String(stderr || (e && !stderr ? e.message : '') || '') });
    }));
  });
}

/** Where a plan script runs from: the repo's own (relative) or the bundled copy (absolute). label: what the board says. */
function planScript(repo, name, list, kitDir) {
  const own = findScript(repo, list);
  if (own) return { path: own, label: own, bundled: false };
  if (!kitDir) return null;
  return { path: path.join(kitDir, 'plan', name), label: BUNDLED_LABEL, bundled: true };
}

/** One line of what a failed script said: its last non-empty stderr line (stdout when stderr is empty). */
export function oneLine(r) {
  const lines = String(r?.stderr || r?.stdout || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const pick = lines.find((l) => /error|cannot|can't|not found|invalid|failed/i.test(l)) || lines[lines.length - 1] || `exited ${r?.code ?? 'non-zero'}`;
  return pick.slice(0, 300);
}

const isOrder = (o) => !!o && typeof o === 'object' && ['next', 'inFlight', 'blocked'].every((k) => o[k] === undefined || Array.isArray(o[k])) && Array.isArray(o.next);
const isProgress = (p) => !!p && typeof p === 'object' && Array.isArray(p.specs);

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

/** An archive line's range field (progress.mjs RANGE): a sha, `sha..sha`, `(this commit)`, `plan only`, `deleted in <sha>`. */
const RANGE_TAIL = / · (?:[0-9a-f]{7,40}(?:\.\.[0-9a-f]{7,40})?|\(this commit\)|plan only|deleted in [0-9a-f]{7,40})\s*$/;
/**
 * A closed chunk's title with no range field left on it. progress.mjs parses the archive by field (spec 49, A9), but a
 * repo's own older copy left `· plan only` (and other ranges it did not know) in the title; the board drops it too.
 */
export const closedTitle = (t) => String(t || '').replace(RANGE_TAIL, '');

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
        id: String(c.id), title: c.state === 'closed' ? closedTitle(c.title) : c.title || '', size: c.size ?? o?.size ?? null,
        state: c.state === 'closed' ? 'closed' : c.state === 'claimed' ? 'claimed' : 'ready',
        closedOn: c.closedOn ?? null, closedBy: c.closedBy ?? null, claim: c.claim ?? null,
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
 * Run order.mjs and progress.mjs (the repo's own, else the CLI's bundled copy) and join them. `mark` is a list of
 * chunk ids to show as just plotted (order.mjs --mark). Never throws for the plan's sake: a repo with no plan/ folder
 * is { available: false, note }; a script that fails or prints what isn't its JSON is { available: false,
 * unreadable: true, error, script, docs }. `exec(cmd, args, opts)` runs node; `kitDir` overrides the bundled copy's
 * place (null: none).
 */
export async function readPlan(repo, { mark = [], exec = execNode, name = path.basename(repo), settled, kitDir } = {}) {
  const dir = kitDir === undefined ? planKitDir() : kitDir;
  const orderS = planScript(repo, 'order.mjs', ORDER_SCRIPTS, dir);
  const progressS = planScript(repo, 'progress.mjs', PROGRESS_SCRIPTS, dir);
  const sources = { order: orderS && { script: orderS.label, bundled: orderS.bundled }, progress: progressS && { script: progressS.label, bundled: progressS.bundled } };
  const nums = specNumbers(repo);
  if (!fs.existsSync(path.join(repo, 'plan', 'README.md')) && !nums.length) {
    return { repo: name, available: false, note: 'No plan in this repo yet (plan/README.md and its spec files).', specs: [], order: [], sources };
  }
  const unreadable = (script, error) => ({ repo: name, available: false, unreadable: true, error, script, docs: PLAN_DOCS, specs: [], order: [], sources });
  if (!orderS || !progressS) {
    const missing = [!orderS && 'order.mjs', !progressS && 'progress.mjs'].filter(Boolean).join(' and ');
    return unreadable(null, `No ${missing} to run: the repo has none and this nexus CLI carries no bundled copy.`);
  }
  const ids = [].concat(mark).map(String).filter((id) => CHUNK_ID.test(id) && id.includes('.'));
  const orderArgs = [orderS.path, '--json', ...(orderS.bundled ? ['--no-vault'] : []), ...(ids.length ? ['--mark', ids.join(',')] : [])];
  // The bundled copy reads only: no leaked GIT_*, and git takes no optional lock (no index refresh written).
  const opts = (s) => ({ cwd: repo, timeout: 60000, env: { ...gitEnv(), ...(s.bundled ? { GIT_OPTIONAL_LOCKS: '0' } : null) } });
  const [o, p] = await Promise.all([
    exec('node', orderArgs, opts(orderS)),
    nums.length ? exec('node', [progressS.path, ...nums, '--json'], opts(progressS)) : Promise.resolve({ ok: true, stdout: '{"specs":[]}' }),
  ]);
  const read = (r, ok, s) => {
    if (!r.ok) return { error: `${s.label} failed: ${oneLine(r)}` };
    const v = json(r.stdout);
    if (v == null) return { error: `${s.label} printed what isn't JSON: ${String(r.stdout || '').trim().split(/\r?\n/)[0]?.slice(0, 120) || 'nothing'}` };
    return ok(v) ? { v } : { error: `${s.label} printed JSON that isn't a plan (${s === orderS ? 'no next list' : 'no specs list'})` };
  };
  const ro = read(o, isOrder, orderS);
  if (ro.error) return unreadable(orderS.label, ro.error);
  const rp = read(p, isProgress, progressS);
  if (rp.error) return unreadable(progressS.label, rp.error);
  const order = ro.v;
  const progress = rp.v;
  const board = { ...boardFrom(order, progress, { repo: name }), sources };
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
