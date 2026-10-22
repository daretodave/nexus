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
import { ANNOUNCE_SCRIPTS, findScript } from './repo.mjs';
import { summarize } from './normalize.mjs';

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

/** The last `bytes` of a session file as parsed lines, in file order (a cut first line is dropped). */
export function tailEntries(file, bytes = 262144) {
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      const len = Math.min(size, bytes);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      const out = [];
      for (const l of buf.toString('utf8').split('\n')) {
        if (!l.trim()) continue;
        try { out.push(JSON.parse(l)); } catch { /* a partial first line */ }
      }
      return out;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return [];
  }
}

const oneLine = (t, max = 200) => {
  const line = String(t || '').split(/\r?\n/).map((l) => l.trim()).find(Boolean) || '';
  return line.length > max ? `${line.slice(0, max - 3)}...` : line;
};

/** A typed prompt's words: a slash command as `/name args`, else its first line; '' for a tool result or a hook's note. */
export function promptText(content) {
  const text = typeof content === 'string' ? content
    : Array.isArray(content) ? content.filter((b) => b && b.type === 'text').map((b) => b.text).join('\n') : '';
  if (!text) return '';
  const cmd = /<command-name>\s*([^<]+?)\s*<\/command-name>/.exec(text);
  if (cmd) {
    const args = /<command-args>\s*([^<]*?)\s*<\/command-args>/.exec(text);
    const name = cmd[1].startsWith('/') ? cmd[1] : `/${cmd[1]}`;
    return oneLine(args && args[1] ? `${name} ${args[1]}` : name);
  }
  if (/^\s*</.test(text) || /^\[Request interrupted/.test(text)) return '';
  return oneLine(text);
}

/**
 * What a Claude Code session file says of its session, read from its tail (newest last):
 *   turn        'working' while a turn runs (a prompt or a tool result awaits the model, or a tool call its result),
 *               'idle' once the main thread's last word ended its turn; null when the tail cannot tell
 *   last        the main thread's last word: { kind: 'text', text, at } or { kind: 'tool', tool, arg, at }
 *   lastPrompt  the last prompt typed (a slash command as `/plot peek`)
 *   cwd, branch where it worked last
 * Subagent (sidechain) lines never move the turn or the last word.
 */
export function sessionActivity(entries = []) {
  let turn = null;
  let last = null;
  let lastPrompt = '';
  let cwd = '';
  let branch = '';
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (!e || typeof e !== 'object') continue;
    if (!cwd && e.cwd) cwd = e.cwd;
    if (!branch && e.gitBranch) branch = e.gitBranch;
    if (!lastPrompt && e.type === 'last-prompt' && e.lastPrompt) lastPrompt = promptText(e.lastPrompt);
    if (e.isSidechain) continue;
    const content = e.message?.content;
    if (e.type === 'user') {
      const words = promptText(content);
      const interrupted = /\[Request interrupted/.test(typeof content === 'string' ? content : JSON.stringify(content || ''));
      if (turn == null && !e.isMeta) turn = interrupted ? 'idle' : 'working';
      if (!lastPrompt && words && !e.isMeta) lastPrompt = words;
    } else if (e.type === 'assistant') {
      const stop = e.message?.stop_reason;
      if (turn == null) turn = stop === 'end_turn' || stop === 'stop_sequence' ? 'idle' : 'working';
      if (!last && Array.isArray(content)) {
        for (let j = content.length - 1; j >= 0 && !last; j--) {
          const b = content[j];
          if (b?.type === 'text' && oneLine(b.text)) last = { kind: 'text', text: oneLine(b.text), at: e.timestamp || null };
          else if (b?.type === 'tool_use') last = { kind: 'tool', tool: b.name || 'tool', arg: summarize(b.name, b.input || {}), at: e.timestamp || null };
        }
      }
    } else if (e.type === 'system' && e.subtype === 'turn_duration' && turn == null) {
      turn = 'idle';
    }
    if (turn != null && last && lastPrompt && cwd && branch) break;
  }
  return { turn, last, lastPrompt, cwd, branch };
}

/**
 * The same for a session this server runs, from its hub's transcript and its state: working while a turn runs or a
 * prompt waits, idle else.
 */
export function transcriptActivity(transcript = [], { busy = false, held = 0 } = {}) {
  let last = null;
  let lastPrompt = '';
  for (let i = transcript.length - 1; i >= 0 && (!last || !lastPrompt); i--) {
    const t = transcript[i];
    if (!t) continue;
    const main = !t.agent || t.agent === 'main';
    if (!last && main && t.kind === 'text' && oneLine(t.text)) last = { kind: 'text', text: oneLine(t.text), at: t.at ?? null };
    else if (!last && main && t.kind === 'tool') last = { kind: 'tool', tool: t.name || 'tool', arg: oneLine(t.summary || '', 140), at: t.at ?? null };
    else if (!lastPrompt && t.kind === 'user') lastPrompt = promptText(t.text);
  }
  const norm = (x) => (x && x.at != null && typeof x.at === 'number' ? { ...x, at: new Date(x.at).toISOString() } : x);
  return { turn: busy || held > 0 ? 'working' : 'idle', last: norm(last), lastPrompt };
}

/**
 * Claude Code sessions written to within the stale window, for these folders:
 * [{ id, cwd, branch, at, file, turn, last, lastPrompt }] (sessionActivity of each file's tail).
 */
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
      const a = sessionActivity(tailEntries(file));
      out.push({
        id: f.slice(0, -'.jsonl'.length), cwd: a.cwd || dir, branch: a.branch || '', at: new Date(st.mtimeMs).toISOString(), file,
        turn: a.turn, last: a.last, lastPrompt: a.lastPrompt,
      });
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

const TRUNKS = new Set(['', 'main', 'master', 'trunk', 'develop', 'HEAD']);
const samePath = (a, b) => !!a && !!b && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/** Does a session file work where a ledger says its session works: the same worktree, or the same session branch? */
export function samePlace(l, c) {
  if (l.worktree && samePath(l.worktree, c.cwd)) return true;
  return !!l.branch && !TRUNKS.has(l.branch) && l.branch === c.branch;
}

/** The activity fields a row carries (sessionActivity / transcriptActivity), only those known. */
function activityFields(a) {
  if (!a) return {};
  const out = {};
  if (a.turn) out.turn = a.turn;
  if (a.last) out.last = a.last;
  if (a.lastPrompt) out.lastPrompt = a.lastPrompt;
  return out;
}

/** Does this session (a Claude Code id, or a claims id) run the ledger it took (`runner`: its claims id, cut to 8)? */
export function runBy(l, id) {
  const r = typeof l?.runner === 'string' ? l.runner : '';
  return !!r && !!id && (r === id || r === String(id).slice(0, 8));
}

// A taken ledger its runner's live file joined reads live: resuming (before its first beat) or resumed (after `done`).
const RUN_LIVE = new Set(['resuming', 'resumed']);

const FLEET_STATE = { live: 'live', fallen: 'fallen', parked: 'paused', resuming: 'resuming', resumed: 'resumed', ended: 'closed' };

/**
 * Every live local session, newest beat first. `gui` is the session id (or ids) this server's SDK sessions run as (null before
 * its first message); `linked` the ids the person linked.
 */
export function mergeSessions({ ledgers, claude, gui = null, linked = new Set(), repoName = '', now = Date.now() }) {
  const guis = (gui == null ? [] : typeof gui === 'string' ? [gui] : [...gui]).filter(Boolean);
  const byId = new Map();
  for (const l of ledgers) {
    const status = ledgerStatus(l, now);
    if (status === 'ended') continue;
    // A resumed ledger shows only through the session that runs it (its `runner`), and only while that one is live.
    if (status === 'resumed' && !l.runner) continue;
    byId.set(l.id, { ledger: l, status, claude: null, onlyRun: status === 'resumed' });
  }
  // A session file joins the ledger it runs first (`runner`, its claims id: ledger.mjs take, so a `/reboot-resume`
  // takeover is the ledger's tile wherever it works, main included), then its own ledger by id; one left over joins the
  // ledger that works where it works (the same worktree, or the same session branch), so a session whose ledger is
  // keyed by its claims id is still one row.
  const rest = [];
  for (const c of claude) {
    const run = [...byId.values()].find((s) => s.ledger && !s.claude && runBy(s.ledger, c.id));
    if (run) {
      run.claude = c;
      run.byRunner = true;
      continue;
    }
    const hit = [...byId.values()].find((s) => s.ledger && (s.ledger.id === c.id || s.ledger.claude === c.id));
    if (hit) hit.claude = c;
    else rest.push(c);
  }
  for (const [id, s] of byId) if (s.onlyRun && !s.claude) byId.delete(id);
  for (const c of rest) {
    const hit = [...byId.values()].find((s) => s.ledger && !s.claude && samePlace(s.ledger, c));
    if (hit) hit.claude = c;
    else byId.set(c.id, { ledger: null, status: 'live', claude: c });
  }
  const out = [];
  for (const [id, s] of byId) {
    const l = s.ledger || {};
    // A row its runner's file joined steers that session (the ledger's own `claude` is the session that stopped).
    const claudeId = s.byRunner ? s.claude.id : l.claude || s.claude?.id || id;
    const isGui = guis.includes(id) || guis.includes(claudeId);
    const parked = (Array.isArray(l.parked) ? l.parked : []).map(parkedItem).filter((p) => p.state === 'pending');
    const running = s.claude && (s.status === 'fallen' || (s.byRunner && RUN_LIVE.has(s.status)));
    out.push({
      id,
      claude: claudeId,
      name: l.star || id.slice(0, 8),
      kind: isGui ? 'local' : 'terminal',
      state: running ? 'live' : FLEET_STATE[s.status] || 'live',
      repo: repoName,
      chunk: l.chunk ? { id: String(l.chunk), step: l.step || '' } : null,
      parked: parked.length,
      beat: l.beat || s.claude?.at || null,
      git: { branch: l.branch || s.claude?.branch || '', worktree: l.worktree || '' },
      linked: isGui || linked.has(id),
      steer: isGui ? 'sdk' : 'hook',
      live: s.status === 'live' || !!s.claude,
      held: HELD.has(l.state) || !!s.byRunner,
      sources: [s.ledger ? 'ledger' : null, s.claude ? 'claude' : null].filter(Boolean),
      ...(l.claims ? { claimsSession: String(l.claims) } : {}),
      ...(l.runner ? { runner: String(l.runner) } : {}),
      ...activityFields(s.claude),
    });
  }
  return out.sort((a, b) => String(b.beat || '').localeCompare(String(a.beat || '')));
}

/**
 * The list with the sessions this server runs folded in: each is local, steered through the SDK, linked and live
 * (paused when paused), whatever its ledger's beat says; one started from the GUI shows before its ledger or session
 * file does. `hosted`: [{ id, claude, name, place: { worktree, branch }, listed, pause: { state }, at, activity }]
 * (`activity`: transcriptActivity of its stream).
 */
export function withHosted(list, hosted = [], repoName = '') {
  let out = list.map((s) => ({ ...s }));
  for (const h of hosted) {
    const names = [h.id, h.claude].filter(Boolean);
    // Its ledger's row (keyed by its id) and its session file's row (keyed by its Claude Code id) are one session:
    // one row, under its ledger's id when it has one (the id its cockpit and its claims know).
    const hits = out.filter((s) => names.includes(s.id) || names.includes(s.claude));
    let row = hits.find((s) => s.id === h.id) || hits[0];
    if (hits.length > 1) {
      for (const o of hits) {
        if (o === row) continue;
        Object.assign(row, {
          beat: [row.beat, o.beat].filter(Boolean).sort().pop() || null,
          git: { ...o.git, ...Object.fromEntries(Object.entries(row.git || {}).filter(([, v]) => v)) },
          chunk: row.chunk || o.chunk || null,
          parked: Math.max(row.parked || 0, o.parked || 0),
          held: !!(row.held || o.held),
          sources: [...new Set([...(row.sources || []), ...(o.sources || [])])],
          ...(!row.claimsSession && o.claimsSession ? { claimsSession: o.claimsSession } : {}),
          ...(!row.last && o.last ? { last: o.last } : {}),
          ...(!row.lastPrompt && o.lastPrompt ? { lastPrompt: o.lastPrompt } : {}),
          ...(!row.turn && o.turn ? { turn: o.turn } : {}),
        });
        if (row.state === 'fallen' && o.state !== 'fallen') row.state = o.state;
      }
      out = out.filter((s) => s === row || !hits.includes(s));
    }
    if (row && h.claude) row.claude = h.claude;
    if (!row) {
      if (!h.listed && !h.claude) continue;
      row = { id: h.id, claude: h.claude || h.id, name: h.name || h.id.slice(0, 8), repo: repoName, chunk: null, parked: 0, beat: h.at || null, git: { branch: h.place?.branch || '', worktree: h.place?.worktree || '' }, held: true, sources: [] };
      out.push(row);
    }
    const paused = h.pause?.state === 'paused' || h.pause?.state === 'pausing';
    Object.assign(row, {
      name: h.name || row.name,
      kind: 'local',
      steer: 'sdk',
      linked: true,
      live: true,
      hosted: true,
      state: paused ? 'paused' : row.state === 'fallen' || row.state === 'paused' ? 'live' : row.state,
      pause: h.pause?.state || 'run',
      sources: [...new Set([...(row.sources || []), 'server'])],
    });
    // A worktree still forming (or failed to): the tile and the cockpit say so (shared/forming.mjs).
    if (h.form && h.form.state !== 'ready') row.form = h.form;
    // The server knows whether its own session runs a turn: that, not the file's tail, says working or idle.
    if (h.activity) Object.assign(row, activityFields({ ...h.activity, last: h.activity.last || row.last, lastPrompt: h.activity.lastPrompt || row.lastPrompt }));
    if (!row.git?.worktree && h.place?.worktree) row.git = { ...row.git, worktree: h.place.worktree, branch: row.git?.branch || h.place.branch || '' };
    if (!row.git?.branch && h.place?.branch) row.git = { ...row.git, branch: h.place.branch };
  }
  return out.sort((a, b) => String(b.beat || '').localeCompare(String(a.beat || '')));
}

/**
 * The repo's notice board module (its own announce.mjs, under scripts/ or scripts/dev/ as the kit lookup finds it),
 * or null when it has none that can post (`postTo`) or, with `addressed` (the default), none that can address one
 * session. The server never writes `.announcements.md` itself: the repo's module owns the board's shape, its lock and
 * its whole-file write.
 */
export async function boardOf(root, { addressed = true } = {}) {
  const rel = findScript(root, ANNOUNCE_SCRIPTS);
  if (!rel) return null;
  const file = path.join(root, rel);
  try {
    const m = await import(`${pathToFileURL(file).href}?v=${fs.statSync(file).mtimeMs}`);
    if (typeof m.postTo !== 'function') return null;
    return !addressed || typeof m.addressee === 'function' ? m : null;
  } catch {
    return null;
  }
}

/** Why there is no board to post to: no announce.mjs at all, or one too old to post from the GUI. */
function noBoard(root, addressed) {
  const rel = findScript(root, ANNOUNCE_SCRIPTS);
  if (!rel) return { status: 409, error: 'this repo has no notice board (scripts/announce.mjs): nothing posted' };
  return { status: 409, error: addressed
    ? `this repo has no notice board that can address one session (${rel} with --to): nothing posted`
    : `this repo's ${rel} has no postTo (update it from the kit's templates/scripts/announce.mjs): nothing posted` };
}

/** Write a ledger the way scripts/ledger.mjs does: whole, through a temp file and a rename. */
export function writeLedger(file, l) {
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
 * The steering desk for one server: links, the session list, and delivery. `send(text, row)` is the SDK input stream of
 * the GUI-owned session `row` names; `guiSession()` its id (or ids); `hosted()` the sessions this server runs
 * (withHosted).
 */
export function createSteering({ repo, send, guiSession = () => null, hosted = () => [], home, now = () => Date.now() }) {
  const linked = new Set();
  let rootP = null;
  const root = () => (rootP ||= primaryRoot(repo));

  async function list() {
    const r = await root();
    const dirs = await worktreeDirs(repo);
    const merged = mergeSessions({
      ledgers: readLedgers(r),
      claude: claudeSessions(dirs, { home: home || claudeHome(), now: now() }),
      gui: guiSession(),
      linked,
      repoName: path.basename(r),
      now: now(),
    });
    return withHosted(merged, hosted(), path.basename(r));
  }

  async function find(id) {
    const all = await list();
    // A star names a session only through its held ledger; an id prefix never names one.
    return all.find((s) => s.id === id || s.claude === id) || all.find((s) => s.held && s.name === id) || null;
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
      await send(whole, s);
      return { status: 200, via: 'sdk', session: s.id };
    }
    if (requireLink && !linked.has(s.id)) return { status: 409, error: `link ${s.name} first: a ${kind} reaches only a linked session` };
    const r = await root();
    const board = await boardOf(r);
    if (!board) return noBoard(r, true);
    // Address by the Claude Code session id: the one name the steer hook is sure belongs to that session alone.
    const n = board.postTo(r, words, { from: 'owner', to: s.claude });
    const sent = { status: 200, via: 'board', line: n, session: s.id, to: s.claude };
    // A parked, resuming or fallen session has no turn to join: the line waits for the session that resumes its
    // ledger (`ledger.mjs take`), which answers to it from then on. Never report that as delivered.
    if (!s.live) return { ...sent, waits: 'resume', note: `${s.name} is not running: it reaches the session that resumes ${s.name}` };
    // A repo without the steer hook: the line waits for the session's next `announce.mjs read`.
    if (!fs.existsSync(path.join(r, '.claude', 'hooks', 'steer.mjs'))) return { ...sent, waits: 'read', note: `no steer hook here: ${s.name} reads it at its next announce.mjs read` };
    return sent;
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
    return { status: 200, settled: 1, via: sent?.via || null, line: sent?.line ?? null, ...(sent?.waits ? { waits: sent.waits, note: sent.note } : {}) };
  }

  /** Post an owner line to every loop on this machine, through the repo's own announce.mjs (its lock, its format). */
  async function announce(text) {
    const words = String(text || '').trim().replace(/\s+/g, ' ');
    if (!words) return { status: 400, error: 'nothing to post' };
    const r = await root();
    const board = await boardOf(r, { addressed: false });
    if (!board) return noBoard(r, false);
    try {
      return { status: 200, line: board.postTo(r, words, { from: 'owner' }) };
    } catch (e) {
      // announce.mjs refuses a line it would misread (one to every loop starting with `@name`) or a held lock.
      return { status: 409, error: e instanceof Error ? e.message : String(e) };
    }
  }

  return { list, find, link, steer, announce, settleParked, linked };
}
