// Starting a session from the GUI (POST /api/sessions): its id, its star name, its worktree and branch, and the ledger
// that holds that star for it. The sessions themselves are session.mjs; the server keeps them.
//
//   id        8 hex characters: the claims session and ledger id (NEXUS_SESSION), as wide as a claims tag
//   name      the next star no held ledger or running session uses: the handoff's four local stars first (vega,
//             sirius, deneb, altair: src/ui/stars.js), then scripts/ledger.mjs's order, then `<star>-2`, ...
//   place     branch `nexus/<name>-<n>`, worktree `<root>/<name>-<n>`, cut from the primary's HEAD; n is 1 + the
//             sessions this repo had by that name, bumped past a branch or folder already there. The root is where
//             the repo keeps its worktrees (worktreeRoot below): `worktreeRoot` in .nexus/local.json, else the one
//             folder most of its linked worktrees already share, else the kit's `../<repo>-wt/` (skills/next/build.md)
//   form      the worktree is made after POST /api/sessions answers (formPlace; shared/forming.mjs): the cockpit opens
//             at once and draws it forming
//   ledger    `.nexus/sessions/<id>.json` at the primary root, in scripts/ledger.mjs's shape, so the session's own
//             `ledger.mjs beat` keeps the star the GUI showed
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run } from './sh.mjs';
import { runClean, safeHooks } from './cloud.mjs';
import { LEDGERS, readLedgers, writeLedger } from './sessions.mjs';

/** The handoff's local stars, in the order a new session takes them (src/ui/stars.js SESSIONS). */
export const LOCAL_STARS = Object.freeze(['vega', 'sirius', 'deneb', 'altair']);
/** scripts/ledger.mjs STARS, the names past the four. */
export const LEDGER_STARS = Object.freeze([
  'vega', 'sirius', 'polaris', 'altair', 'deneb', 'rigel', 'capella', 'arcturus', 'betelgeuse', 'aldebaran',
  'spica', 'antares', 'procyon', 'canopus', 'achernar', 'fomalhaut', 'regulus', 'castor', 'pollux', 'mira',
]);
const FREE_AFTER = new Set(['resumed', 'ended']);
const NAME = /^[a-z][a-z0-9-]{1,31}$/;

export const newSessionId = () => crypto.randomBytes(4).toString('hex');

/** The first star not in `taken`. */
export function nextName(taken) {
  const t = new Set(taken);
  const order = [...LOCAL_STARS, ...LEDGER_STARS.filter((s) => !LOCAL_STARS.includes(s))];
  for (let round = 1; ; round++) {
    for (const s of order) {
      const name = round === 1 ? s : `${s}-${round}`;
      if (!t.has(name)) return name;
    }
  }
}

/** Star names held now: every held ledger's, plus the running sessions'. */
export function heldNames(ledgers, running = []) {
  return [...ledgers.filter((l) => !FREE_AFTER.has(l.state)).map((l) => l.star), ...running].filter(Boolean);
}

export function validName(name) {
  return NAME.test(String(name || ''));
}

/** The .nexus/local.json key naming where GUI sessions' worktrees go (relative to the primary checkout, or absolute). */
export const ROOT_KEY = 'worktreeRoot';
/** The folder the GUI used before 47.5 (`../.nexus-wt/`): its worktrees never vote for a convention. */
const OLD_ROOT = '.nexus-wt';

const keyOf = (p, win) => (win ? path.resolve(p).toLowerCase() : path.resolve(p));
const under = (p, dir, win) => { const a = keyOf(p, win); const b = keyOf(dir, win); return a === b || a.startsWith(b + path.sep); };

/**
 * Where a GUI session's worktree goes: { root, why: 'config' | 'convention' | 'kit' }.
 *   config      `worktreeRoot` in the checkout's .nexus/local.json (relative to the primary checkout, or absolute)
 *   convention  the parent folder a strict majority of the repo's linked worktrees share (`git worktree list`). Folders
 *               under the temp folder (a landing's scratch worktree) and the GUI's old `.nexus-wt` don't vote; one
 *               inside the repo's own tree votes only when `allowedInside(parent)` says the repo ignores it (a
 *               gitignored `.claude/worktrees/`, say)
 *   kit         `../<repo>-wt/`, the kit's own default (skills/next/build.md, customization/sessions.md)
 * Pure: `linked` (the linked worktrees' paths, the primary left out) and `allowedInside` are read by the caller.
 */
export function worktreeRoot({ primary, local = {}, linked = [], allowedInside = () => false, tmp = os.tmpdir(), win = process.platform === 'win32' }) {
  const set = typeof local?.[ROOT_KEY] === 'string' ? local[ROOT_KEY].trim() : '';
  if (set) return { root: path.resolve(primary, set), why: 'config' };
  const voters = linked
    .filter(Boolean)
    .map((p) => path.dirname(path.resolve(p)))
    .filter((parent) => !under(parent, tmp, win) && path.basename(parent) !== OLD_ROOT)
    .filter((parent) => !under(parent, primary, win) || allowedInside(parent));
  const counts = new Map();
  for (const parent of voters) {
    const k = keyOf(parent, win);
    counts.set(k, { parent: counts.get(k)?.parent || parent, n: (counts.get(k)?.n || 0) + 1 });
  }
  const best = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  if (best && best.n * 2 > voters.length) return { root: best.parent, why: 'convention' };
  const repo = path.resolve(primary);
  return { root: path.join(path.dirname(repo), `${path.basename(repo).toLowerCase()}-wt`), why: 'kit' };
}

/** Branch and worktree for the n-th session of a name, under `root` (worktreeRoot). */
export function placeFor(root, name, n) {
  return { branch: `nexus/${name}-${n}`, worktree: path.join(root, `${name}-${n}`) };
}

const slash = (p) => p.replace(/\\/g, '/');
const WIN = process.platform === 'win32';

/** git for the worktree: no shell, no leaked GIT_* (cloud.mjs runClean). -> { ok, out, err, timedOut }. Tests pass their own. */
export const cleanGit = (cwd, args, o = {}) => runClean('git', args, { cwd, ...o });

/** The linked worktrees' paths (`git worktree list --porcelain`), the primary left out. */
export async function linkedWorktrees(primary, git = cleanGit) {
  const r = await git(primary, ['worktree', 'list', '--porcelain']);
  if (!r.ok) return [];
  const all = String(r.out).split(/\r?\n/).filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9).trim());
  return all.slice(1); // the main checkout lists first
}

/**
 * Pick the session's place without making it (a few quick git reads, so POST /api/sessions answers at once):
 * { worktree, branch, n, root, why } or { error } (not a git repository: the session works in the folder itself).
 */
export async function planPlace(primary, name, ledgers, { git = cleanGit, local = {} } = {}) {
  const isGit = await git(primary, ['rev-parse', '--is-inside-work-tree']);
  if (!isGit.ok) return { error: 'not a git repository: the session runs in the folder itself' };
  const linked = await linkedWorktrees(primary, git);
  const inside = new Set();
  for (const p of linked) {
    const parent = path.dirname(path.resolve(p));
    if (!under(parent, primary, WIN) || inside.has(parent)) continue;
    // check-ignore exits 0 for an ignored path: the repo keeps that folder out of its own tree.
    if ((await git(primary, ['check-ignore', '-q', `${slash(path.relative(primary, parent))}/`])).ok) inside.add(parent);
  }
  const { root, why } = worktreeRoot({ primary, local, linked, allowedInside: (p) => inside.has(p) });
  let n = 1 + ledgers.filter((l) => l.star === name).length;
  for (let tries = 0; tries < 50; tries++, n++) {
    const p = placeFor(root, name, n);
    if (fs.existsSync(p.worktree)) continue;
    const has = await git(primary, ['rev-parse', '--verify', '--quiet', `refs/heads/${p.branch}`]);
    if (has.ok) continue;
    return { ...p, n, root, why };
  }
  return { error: 'no free worktree folder for that name' };
}

/**
 * Make the planned worktree: `git worktree add -b <branch> <dir> HEAD` from the primary checkout, through the repo's
 * hooks made safe for a linked worktree (cloud.mjs safeHooks: its post-checkout runs, and no GIT_* leaks into it).
 * Each chunk git or a hook prints to stderr goes to `onLine`. A retry takes the branch when the failed try left it,
 * and a folder git already lists is taken as made. -> { ok: true } or { error }.
 */
export async function formPlace(primary, place, { git = cleanGit, hooks = safeHooks, onLine = () => {}, timeout = 10 * 60 * 1000 } = {}) {
  const same = (p) => keyOf(p, WIN) === keyOf(place.worktree, WIN);
  if (fs.existsSync(place.worktree) && (await linkedWorktrees(primary, git)).some(same)) return { ok: true };
  const h = await hooks(primary);
  try {
    fs.mkdirSync(path.dirname(place.worktree), { recursive: true });
    const branched = (await git(primary, ['rev-parse', '--verify', '--quiet', `refs/heads/${place.branch}`])).ok;
    const wt = slash(place.worktree);
    const args = branched ? ['worktree', 'add', wt, place.branch] : ['worktree', 'add', '-b', place.branch, wt, 'HEAD'];
    const r = await git(primary, [...(h.args || []), ...args], { timeout, onErr: onLine });
    if (!r.ok) return { error: `${(r.err || r.out || 'git worktree add failed').trim().split(/\r?\n/).pop()}${r.timedOut ? ' (timed out)' : ''}` };
    return { ok: true };
  } finally {
    h.cleanup?.();
  }
}

/** Plan and form in one call: { worktree, branch, ... } or { error }. The server does the two apart, to answer first. */
export async function openPlace(primary, name, ledgers, o = {}) {
  const p = await planPlace(primary, name, ledgers, o);
  if (p.error) return p;
  const f = await formPlace(primary, p, o);
  return f.error ? { error: f.error } : p;
}

/** The ledger a GUI-started session begins with (scripts/ledger.mjs `fresh`, plus where it works). */
export function startLedger({ id, name, cwd, place = {}, now = new Date() }) {
  return {
    id, star: name, state: 'live', claims: id.slice(0, 8), started: now.toISOString(), beat: now.toISOString(),
    cwd, worktree: place.worktree || '', branch: place.branch || '', chunk: '', step: '', loop: '', claimed: [],
    workflow: null, builder: '', defaults: [], parked: [], train: '', next_step: '', notes: '', gui: true,
  };
}

export function ledgerFile(root, id) {
  return path.join(root, LEDGERS, `${id.replace(/[^A-Za-z0-9_-]/g, '_')}.json`);
}

export function writeStartLedger(root, ledger) {
  const file = ledgerFile(root, ledger.id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeLedger(file, ledger);
  return file;
}

/** Mark a ledger this server wrote `ended` (a closed session frees its star). A ledger gone or not ours is left. */
export function endLedger(root, id, now = new Date()) {
  const l = readLedgers(root).find((x) => x.id === id);
  if (!l || l.state === 'ended') return false;
  writeLedger(l._file, { ...l, state: 'ended', beat: now.toISOString() });
  return true;
}

/**
 * This machine's GitHub login, asked of gh once per server and handed to every session as NEXUS_GH_LOGIN (an
 * existing NEXUS_GH_LOGIN wins). '' when gh can't say: claims then match by session alone, as they would.
 */
export function ghLoginOnce(ask = async () => {
  const r = await run('gh', ['api', 'user', '--jq', '.login'], { timeout: 10000 });
  return r.ok ? r.stdout.trim() : '';
}, env = process.env) {
  let p = null;
  return () => (p ||= env.NEXUS_GH_LOGIN !== undefined ? Promise.resolve(env.NEXUS_GH_LOGIN) : Promise.resolve().then(ask).catch(() => ''));
}
