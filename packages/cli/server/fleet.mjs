// Starting a session from the GUI (POST /api/sessions): its id, its star name, its worktree and branch, and the ledger
// that holds that star for it. The sessions themselves are session.mjs; the server keeps them.
//
//   id        8 hex characters: the claims session and ledger id (NEXUS_SESSION), as wide as a claims tag
//   name      the next star no held ledger or running session uses: the handoff's four local stars first (vega,
//             sirius, deneb, altair: src/ui/stars.js), then scripts/ledger.mjs's order, then `<star>-2`, ...
//   place     branch `nexus/<name>-<n>`, worktree `../.nexus-wt/<name>-<n>` beside the primary checkout (the
//             handoff's sessionPlaces), cut from the primary's HEAD; n is 1 + the sessions this repo had by that name,
//             bumped past a branch or folder already there
//   ledger    `.nexus/sessions/<id>.json` at the primary root, in scripts/ledger.mjs's shape, so the session's own
//             `ledger.mjs beat` keeps the star the GUI showed
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { run } from './sh.mjs';
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

/** Branch and worktree for the n-th session of a name (the handoff's sessionPlaces), absolute beside `primary`. */
export function placeFor(primary, name, n) {
  return { branch: `nexus/${name}-${n}`, worktree: path.join(path.dirname(primary), '.nexus-wt', `${name}-${n}`) };
}

const slash = (p) => p.replace(/\\/g, '/');

/**
 * Open the session's worktree: `git worktree add -b nexus/<name>-<n> <dir> HEAD` from the primary checkout. Returns
 * { worktree, branch } or { error } (the caller runs the session in the repo itself then, and says so).
 */
export async function openPlace(primary, name, ledgers) {
  const isGit = await run('git', ['rev-parse', '--is-inside-work-tree'], { cwd: primary });
  if (!isGit.ok) return { error: 'not a git repository: the session runs in the folder itself' };
  let n = 1 + ledgers.filter((l) => l.star === name).length;
  for (let tries = 0; tries < 50; tries++, n++) {
    const p = placeFor(primary, name, n);
    if (fs.existsSync(p.worktree)) continue;
    const has = await run('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${p.branch}`], { cwd: primary });
    if (has.ok) continue;
    fs.mkdirSync(path.dirname(p.worktree), { recursive: true });
    const r = await run('git', ['worktree', 'add', '-b', p.branch, slash(p.worktree), 'HEAD'], { cwd: primary, timeout: 60000 });
    if (!r.ok) return { error: (r.stderr || r.stdout || 'git worktree add failed').trim().split('\n').pop() };
    return { ...p, n };
  }
  return { error: 'no free worktree folder for that name' };
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
