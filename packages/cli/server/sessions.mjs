// Live local sessions, and steering one of them (spec 41, "Magical steering").
//
// Two sources, merged by session id:
//   - the session ledgers at the primary checkout's root (`.nexus/sessions/<id>.json`, scripts/ledger.mjs)
//   - Claude Code's own session files for the repo and each of its worktrees
//     (`<CLAUDE_CONFIG_DIR or ~/.claude>/projects/<slug of the folder>/<session id>.jsonl`), live while written to
//
// Steering a linked session: a GUI-owned session (the SDK session this server runs) takes the text on its input
// stream; a terminal session gets an owner line addressed to it on the notice board (`scripts/announce.mjs` postTo),
// which its steer hook (`.claude/hooks/steer.mjs`) hands over at its next tool boundary, to that session only. The
// board and the ledger file shapes are the contract; the repo's own announce.mjs writes the line.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { run } from './sh.mjs';

export const LEDGERS = '.nexus/sessions';
export const STALE_MIN = 15;
const HELD = new Set(['live', 'parked', 'resuming']);
const ID = /^[A-Za-z0-9][\w.-]{3,127}$/;

/** Claude Code's folder name for a working directory: every character but a letter or digit becomes `-`. */
export function claudeSlug(dir) {
  return path.resolve(dir).replace(/[^A-Za-z0-9]/g, '-');
}

export function claudeHome(env = process.env) {
  return env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

/** The primary checkout's root (where the board and the ledgers live), or the repo itself outside git. */
export async function primaryRoot(repo) {
  const r = await run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: repo });
  return r.ok && r.stdout.trim() ? path.dirname(path.resolve(r.stdout.trim())) : repo;
}

/** The repo's worktree folders (the primary first), or just the repo. */
export async function worktreeDirs(repo) {
  const r = await run('git', ['worktree', 'list', '--porcelain'], { cwd: repo });
  const dirs = r.ok ? r.stdout.split(/\r?\n/).filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9).trim()) : [];
  return [...new Set([...dirs, repo].map((d) => path.resolve(d)))];
}

export function readLedgers(root) {
  const dir = path.join(root, LEDGERS);
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  const out = [];
  for (const f of files) {
    try {
      const l = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (l && typeof l.id === 'string') out.push({ ...l, _file: path.join(dir, f) });
    } catch {
      /* a half-written ledger: skipped */
    }
  }
  return out;
}

/** Same rule as scripts/ledger.mjs: a live ledger past its stale window reads fallen. */
export function ledgerStatus(l, now = Date.now(), staleMin = STALE_MIN) {
  if (l.state !== 'live') return l.state || 'live';
  const beat = Date.parse(l.beat ?? '');
  return Number.isFinite(beat) && now - beat <= staleMin * 60000 ? 'live' : 'fallen';
}

function tailJson(file, bytes = 16384) {
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      const len = Math.min(size, bytes);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      const lines = buf.toString('utf8').split('\n').filter((l) => l.trim());
      for (let i = lines.length - 1; i >= 0; i--) {
        try { return JSON.parse(lines[i]); } catch { /* a partial first line */ }
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    /* unreadable */
  }
  return null;
}

/** Claude Code sessions written to within the stale window, for these folders: [{ id, cwd, branch, at, file }]. */
export function claudeSessions(dirs, { home = claudeHome(), now = Date.now(), staleMin = STALE_MIN } = {}) {
  const out = [];
  for (const dir of dirs) {
    const folder = path.join(home, 'projects', claudeSlug(dir));
    let files = [];
    try {
      files = fs.readdirSync(folder).filter((f) => f.endsWith('.jsonl'));
    } catch {
      continue;
    }
    for (const f of files) {
      const file = path.join(folder, f);
      let st;
      try { st = fs.statSync(file); } catch { continue; }
      if (now - st.mtimeMs > staleMin * 60000) continue;
      const last = tailJson(file) || {};
      out.push({ id: f.slice(0, -'.jsonl'.length), cwd: last.cwd || dir, branch: last.gitBranch || '', at: new Date(st.mtimeMs).toISOString(), file });
    }
  }
  return out;
}

/** One parked question as the cockpit draws it, whatever shape the session wrote. */
export function parkedItem(p) {
  if (typeof p === 'string') return { q: p, alts: [], state: 'pending' };
  if (!p || typeof p !== 'object') return { q: String(p), alts: [], state: 'pending' };
  const alts = (p.alts || p.options || []).map((o) => (typeof o === 'string' ? o : o?.label || '')).filter(Boolean);
  const def = p.default != null ? String(p.default) : null;
  return { ...p, q: p.q || p.question || p.text || '', alts: def && !alts.includes(def) ? [def, ...alts] : alts, state: p.state || 'pending' };
}

const FLEET_STATE = { live: 'live', fallen: 'fallen', parked: 'paused', resuming: 'resuming', resumed: 'resumed', ended: 'closed' };

/**
 * Every live local session, newest beat first. `gui` is the session id this server's SDK session runs as (null before
 * its first message); `linked` the ids the person linked.
 */
export function mergeSessions({ ledgers, claude, gui = null, linked = new Set(), repoName = '', now = Date.now() }) {
  const byId = new Map();
  for (const l of ledgers) {
    const status = ledgerStatus(l, now);
    if (status === 'ended' || status === 'resumed') continue;
    byId.set(l.id, { ledger: l, status, claude: null });
  }
  for (const c of claude) {
    const hit = [...byId.values()].find((s) => s.ledger && (s.ledger.id === c.id || s.ledger.claude === c.id));
    if (hit) hit.claude = c;
    else byId.set(c.id, { ledger: null, status: 'live', claude: c });
  }
  const out = [];
  for (const [id, s] of byId) {
    const l = s.ledger || {};
    const claudeId = l.claude || s.claude?.id || id;
    const isGui = !!gui && (gui === id || gui === claudeId);
    const parked = (Array.isArray(l.parked) ? l.parked : []).map(parkedItem).filter((p) => p.state === 'pending');
    out.push({
      id,
      claude: claudeId,
      name: l.star || id.slice(0, 8),
      kind: isGui ? 'local' : 'terminal',
      state: s.status === 'fallen' && s.claude ? 'live' : FLEET_STATE[s.status] || 'live',
      repo: repoName,
      chunk: l.chunk ? { id: String(l.chunk), step: l.step || '' } : null,
      parked: parked.length,
      beat: l.beat || s.claude?.at || null,
      git: { branch: l.branch || s.claude?.branch || '', worktree: l.worktree || '' },
      linked: isGui || linked.has(id),
      steer: isGui ? 'sdk' : 'hook',
      live: s.status === 'live' || !!s.claude,
      held: HELD.has(l.state),
      sources: [s.ledger ? 'ledger' : null, s.claude ? 'claude' : null].filter(Boolean),
    });
  }
  return out.sort((a, b) => String(b.beat || '').localeCompare(String(a.beat || '')));
}

/** The repo's notice board module (its own scripts/announce.mjs), or null when it has none that can address. */
export async function boardOf(root) {
  const file = path.join(root, 'scripts', 'announce.mjs');
  if (!fs.existsSync(file)) return null;
  try {
    const m = await import(`${pathToFileURL(file).href}?v=${fs.statSync(file).mtimeMs}`);
    return typeof m.postTo === 'function' && typeof m.addressee === 'function' ? m : null;
  } catch {
    return null;
  }
}

/** Write a ledger the way scripts/ledger.mjs does: whole, through a temp file and a rename. */
function writeLedger(file, l) {
  const { _file, ...clean } = l;
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(clean, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

/** The ledger without parked question `index` (checked against `q` when given), or an error. */
export function dropParked(ledger, index, q) {
  const list = Array.isArray(ledger.parked) ? ledger.parked : [];
  if (!Number.isInteger(index) || index < 0 || index >= list.length) return { error: 'no such parked question' };
  const item = parkedItem(list[index]);
  if (q != null && String(q) !== item.q) return { error: 'the parked list changed; reload and try again' };
  return { ledger: { ...ledger, parked: list.filter((_, i) => i !== index) }, item };
}

/** The words an answered parked question carries to its session. */
export function parkedAnswer(item, { action, pick, answer } = {}) {
  const chosen = answer != null && String(answer).trim() ? String(answer).trim() : Number.isInteger(pick) ? item.alts[pick] : null;
  if (action === 'approve' || !chosen) return `Parked question settled: "${item.q}". Keep the default you took${item.alts[0] ? ` (${item.alts[0]})` : ''}.`;
  return `Parked question answered: "${item.q}". Change to: ${chosen}. Apply it now (or in this chunk's close if it is already built).`;
}

/**
 * The steering desk for one server: links, the session list, and delivery. `send(text)` is the SDK input stream of the
 * GUI-owned session; `guiSession()` its id.
 */
export function createSteering({ repo, send, guiSession = () => null, home, now = () => Date.now() }) {
  const linked = new Set();
  let rootP = null;
  const root = () => (rootP ||= primaryRoot(repo));

  async function list() {
    const r = await root();
    const dirs = await worktreeDirs(repo);
    return mergeSessions({
      ledgers: readLedgers(r),
      claude: claudeSessions(dirs, { home: home || claudeHome(), now: now() }),
      gui: guiSession(),
      linked,
      repoName: path.basename(r),
      now: now(),
    });
  }

  async function find(id) {
    return (await list()).find((s) => s.id === id || s.claude === id || s.name === id) || null;
  }

  async function link(id, on = true) {
    if (!ID.test(String(id))) return { status: 400, error: 'bad session id' };
    const s = await find(id);
    if (!s) return { status: 404, error: 'no such live session' };
    if (on) linked.add(s.id);
    else linked.delete(s.id);
    return { status: 200, session: { ...s, linked: s.steer === 'sdk' || linked.has(s.id) } };
  }

  /** Hand `text` to one linked session: the SDK stream for the GUI's own, an addressed owner line for a terminal one. */
  async function steer(id, text, { kind = 'tug', requireLink = true } = {}) {
    const whole = String(text || '').trim();
    const words = whole.replace(/\s+/g, ' '); // a board line is one line
    if (!words) return { status: 400, error: 'nothing to send' };
    const s = await find(id);
    if (!s) return { status: 404, error: 'no such live session' };
    if (s.steer === 'sdk') {
      send(whole);
      return { status: 200, via: 'sdk', session: s.id };
    }
    if (requireLink && !linked.has(s.id)) return { status: 409, error: `link ${s.name} first: a ${kind} reaches only a linked session` };
    const r = await root();
    const board = await boardOf(r);
    if (!board) return { status: 409, error: 'this repo has no notice board that can address one session (scripts/announce.mjs with --to)' };
    // Address by the Claude Code session id: the one name the steer hook is sure belongs to that session alone.
    const n = board.postTo(r, words, { from: 'owner', to: s.claude });
    return { status: 200, via: 'board', line: n, session: s.id, to: s.claude };
  }

  /** Settle parked question `index` of a session: it leaves the ledger's parked list, and the answer goes to it. */
  async function settleParked(id, { index, q, action = 'change', pick, answer } = {}) {
    const r = await root();
    const all = readLedgers(r);
    // An ended ledger's star belongs to whichever session took it next: a star names only a held ledger.
    const ledger = all.find((l) => l.id === id || l.claude === id) || all.find((l) => l.star === id && HELD.has(l.state));
    if (!ledger) return { status: 404, error: 'no ledger for that session' };
    if (action === 'approve-rest') {
      const n = (ledger.parked || []).length;
      writeLedger(ledger._file, { ...ledger, parked: [] });
      return { status: 200, settled: n };
    }
    const dropped = dropParked(ledger, Number(index), q);
    if (dropped.error) return { status: 409, error: dropped.error };
    const words = parkedAnswer(dropped.item, { action, pick: pick == null ? undefined : Number(pick), answer });
    // Approving the default changes nothing the session did: only an answer that differs goes to it.
    let sent = null;
    if (action !== 'approve') {
      // Answering a session's own parked question aims at that session: no separate link needed.
      sent = await steer(ledger.id, words, { kind: 'answer', requireLink: false });
      if (sent.status !== 200) return sent;
    }
    // Re-read: the session may have beaten (or parked another question) meanwhile. Drop only the one answered.
    const fresh = readLedgers(r).find((l) => l.id === ledger.id) || ledger;
    const raw = JSON.stringify(ledger.parked[Number(index)]);
    const at = (fresh.parked || []).findIndex((p) => JSON.stringify(p) === raw);
    if (at !== -1) writeLedger(fresh._file, { ...fresh, parked: fresh.parked.filter((_, i) => i !== at) });
    return { status: 200, settled: 1, via: sent?.via || null, line: sent?.line ?? null };
  }

  return { list, find, link, steer, settleParked, linked };
}
