// scripts/ledger.mjs: every session's live ledger, so a crash leaves what a planned reboot would.
//
// A session (a terminal `/heads-down`, a GUI session, a single `/next`) rewrites `.nexus/sessions/<id>.json` at the
// primary checkout's root (untracked) at every beat: its star name, its Claude session id and claims session, the
// claimed ids, the worktree and branch, the chunk in flight and its step, the active Workflow (run id, script path,
// transcript folder) and builder, the defaults taken, the parked questions and the last beat. `/reboot-ready` parks it
// on purpose; a crash leaves it `live` with a beat gone stale, which `list` calls `fallen`. Either way
// `/reboot-resume` picks the work up from it. A ledger never releases a claim: claims stay held until their TTL.
//
// Sessions take star names (vega, sirius, polaris, ...): the next one no live or parked ledger holds. The name shows in
// the claims session tag, the GUI's fleet tiles, the oversight inbox tags and the `/heads-down` banner.
//
//   node scripts/ledger.mjs beat [--chunk <id>] [--step <step>] [--set key=value …] [--set-file key=<path> …]
//                                [--add key=value …] [--clear key …]
//   node scripts/ledger.mjs show [<id | star>] [--json]
//   node scripts/ledger.mjs list [--train <slug>] [--json]   every session: star, state, chunk, step, last beat
//   node scripts/ledger.mjs park <slug> [--set key=value …]  state parked for reboot train <slug>
//   node scripts/ledger.mjs take <id | star>                 this session resumes that ledger (state resuming, runner)
//   node scripts/ledger.mjs done <id | star>                 the resume finished (state resumed)
//   node scripts/ledger.mjs end                              this session finished its loop (state ended)
//
// Concurrent writers: every command that writes (beat, park, end, take, done) reads and writes under one exclusive
// lock (`.nexus/sessions/.lock`, `withLock`), so two sessions starting at once never take the same star and two `take`
// calls never both win. A ledger lands whole through a temp file and a rename, retried while Windows holds the file
// busy (`renameRetry`). The notice board (announce.mjs) posts under the same kind of lock.
//
// A take records the taker as the ledger's `runner` (its claims id, `runnerId`) and `runnerSince`: from then on that
// session's beat, park and end write the ledger it took (not a fresh one of its own), so the loop it resumed keeps one
// star and one Fleet tile, and a second crash resumes it again.
//
// `--set a.b=v` writes a dotted key (a value that parses as JSON is stored as JSON); `--set-file k=<path>` stores a
// file's text verbatim (the `/heads-down` loop prompt: its quotes never meet a shell); `--add k=v` appends to a list
// (`defaults`, `parked`, `claimed`, `done`). A parked question is `{ "q": "...", "alts": ["...", "..."], "why": "...",
// "default": "..." }` (alts a list; a bare string is read as the question alone); the GUI reads that shape. A ledger the
// nexus GUI wrote may carry `gui`, `claude`, `cwd`, `sent`, `server` and `stop` (why and how it stopped): optional, kept
// as they are. Environment: NEXUS_SESSION, else CLAUDE_CODE_SESSION_ID (the session's id);
// NEXUS_LEDGER_STALE_MIN (minutes without a beat before a live session reads as fallen; default 15).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { primaryRoot } from './owner.mjs';

export const DIR = '.nexus/sessions';
export const STARS = Object.freeze([
  'vega', 'sirius', 'polaris', 'altair', 'deneb', 'rigel', 'capella', 'arcturus', 'betelgeuse', 'aldebaran',
  'spica', 'antares', 'procyon', 'canopus', 'achernar', 'fomalhaut', 'regulus', 'castor', 'pollux', 'mira',
]);
export const STATES = Object.freeze(['live', 'parked', 'resuming', 'resumed', 'ended']);
const FREE_AFTER = new Set(['resumed', 'ended']);

export const LOCK = '.lock';

const nap = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return !!e && e.code === 'EPERM'; // EPERM: it runs, as someone else
  }
};

/**
 * Run `fn` holding the exclusive lock `file` (created with `wx`: one holder at a time), and release it after. A lock
 * whose holder is gone (its pid no longer runs) or older than `staleMs` is broken: a crash mid-write never wedges every
 * session. Past `waitMs` it throws rather than write unlocked. Synchronous, like the scripts that call it.
 */
export function withLock(file, fn, { staleMs = 10_000, waitMs = 15_000 } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const until = Date.now() + waitMs;
  for (let pause = 2; ; pause = Math.min(pause * 2, 50)) {
    let fd = null;
    try {
      fd = fs.openSync(file, 'wx');
    } catch (e) {
      // Windows answers EPERM (or EACCES/EBUSY) while another writer's lock is being deleted: busy, not broken.
      if (!e || !['EEXIST', 'EPERM', 'EACCES', 'EBUSY'].includes(e.code)) throw e;
    }
    if (fd !== null) {
      try {
        fs.writeSync(fd, `${process.pid} ${new Date().toISOString()}
`);
      } finally {
        fs.closeSync(fd);
      }
      try {
        return fn();
      } finally {
        fs.rmSync(file, { force: true });
      }
    }
    breakStale(file, staleMs);
    if (Date.now() > until) throw new Error(`${path.basename(file)}: ${file} stayed locked for ${waitMs / 1000}s (another writer, or a stale lock: delete it if no session is writing)`);
    nap(pause + Math.floor(Math.random() * pause));
  }
}

/** Remove the lock at `file` when its holder no longer runs or it is older than `staleMs`; true when it did. */
export function breakStale(file, staleMs = 10_000, now = Date.now()) {
  let held;
  let age;
  try {
    held = fs.readFileSync(file, 'utf8');
    age = now - fs.statSync(file).mtimeMs;
  } catch {
    return false; // released meanwhile
  }
  const pid = Number(held.split(' ')[0]);
  // A lock with no pid yet is a holder between its create and its write: only its age breaks it.
  const gone = Number.isInteger(pid) && pid > 0 && pid !== process.pid && !alive(pid);
  if (!gone && age <= staleMs) return false;
  try {
    if (fs.readFileSync(file, 'utf8') !== held) return false; // a new holder took it meanwhile
    fs.rmSync(file);
    return true;
  } catch {
    return false;
  }
}

const BUSY = new Set(['EPERM', 'EBUSY', 'EACCES']);

/** `fs.renameSync`, retried with a short backoff while the target is busy (Windows: a reader holds it open). */
export function renameRetry(from, to, { tries = 8, rename = fs.renameSync } = {}) {
  for (let i = 1; ; i++) {
    try {
      return rename(from, to);
    } catch (e) {
      if (!e || !BUSY.has(e.code) || i >= tries) throw e;
      nap(Math.min(10 * 2 ** (i - 1), 200));
    }
  }
}

/** The first star no held ledger (live, parked, resuming) uses; past the list, `<star>-2`, `-3`, … */
export function nextStar(ledgers) {
  const taken = new Set(ledgers.filter((l) => !FREE_AFTER.has(l.state)).map((l) => l.star));
  for (let round = 1; ; round++) {
    for (const s of STARS) {
      const name = round === 1 ? s : `${s}-${round}`;
      if (!taken.has(name)) return name;
    }
  }
}

/** `live` past its stale window reads `fallen` (a crash: resume it like a parked one). */
export function status(ledger, now = Date.now(), staleMin = 15) {
  if (ledger.state !== 'live') return ledger.state;
  const beat = Date.parse(ledger.beat ?? '');
  return Number.isFinite(beat) && now - beat <= staleMin * 60_000 ? 'live' : 'fallen';
}

const parseValue = (v) => {
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
};

/** The ledger with `--set`, `--set-file` (as `text`: stored verbatim), `--add` and `--clear` applied (dotted keys reach into objects). */
export function apply(ledger, { set = [], text = [], add = [], clear = [] } = {}) {
  const out = structuredClone(ledger);
  const walk = (key, make) => {
    const parts = key.split('.');
    let o = out;
    for (const p of parts.slice(0, -1)) {
      if (o[p] === undefined || typeof o[p] !== 'object' || o[p] === null) {
        if (!make) return [null, null];
        o[p] = {};
      }
      o = o[p];
    }
    return [o, parts.at(-1)];
  };
  const pair = (kv) => {
    const i = kv.indexOf('=');
    if (i < 1) throw new Error(`ledger: "${kv}" is not key=value`);
    return [kv.slice(0, i), kv.slice(i + 1)];
  };
  for (const kv of set) {
    const [k, v] = pair(kv);
    const [o, last] = walk(k, true);
    o[last] = parseValue(v);
  }
  for (const kv of text) {
    const [k, v] = pair(kv);
    const [o, last] = walk(k, true);
    o[last] = v;
  }
  for (const kv of add) {
    const [k, v] = pair(kv);
    const [o, last] = walk(k, true);
    o[last] = [...(Array.isArray(o[last]) ? o[last] : []), parseValue(v)];
  }
  for (const k of clear) {
    const [o, last] = walk(k, false);
    if (o) delete o[last];
  }
  return out;
}

/** A fresh ledger for this session. */
export function fresh(id, star, now = new Date()) {
  return {
    id, star, state: 'live', claims: id.slice(0, 8), started: now.toISOString(), beat: now.toISOString(),
    cwd: '', worktree: '', branch: '', chunk: '', step: '', loop: '', claimed: [], workflow: null, builder: '',
    defaults: [], parked: [], train: '', next_step: '', notes: '',
  };
}

/** A session's claims id, the way claims.mjs names it: NEXUS_SESSION, else the Claude Code session id cut to 8. */
export function runnerId(env = process.env) {
  return env.NEXUS_SESSION || (env.CLAUDE_CODE_SESSION_ID ?? '').slice(0, 8);
}

/** The ledger this session runs because it took it (the newest take; never an ended one), or null. */
export function runs(ledgers, runner) {
  if (!runner) return null;
  const hits = ledgers.filter((l) => l.runner === runner && l.state !== 'ended');
  return hits.sort((a, b) => String(b.runnerSince ?? '').localeCompare(String(a.runnerSince ?? '')))[0] ?? null;
}

/** One line for `list`. */
export function line(l, now = Date.now(), staleMin = 15) {
  const ago = Math.round((now - Date.parse(l.beat ?? l.started ?? 0)) / 60_000);
  const where = l.chunk ? `${l.chunk}${l.step ? ` · ${l.step}` : ''}` : 'between chunks';
  return `${(l.star ?? '?').padEnd(11)} ${status(l, now, staleMin).padEnd(8)} ${l.id.slice(0, 8)}  ${where}  (beat ${ago}m ago)${l.train ? `  train ${l.train}` : ''}${l.runner ? `  run by ${l.runner}` : ''}`;
}

export function readAll(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      } catch {
        return null; // a half-written file: skipped, never fatal
      }
    })
    .filter((l) => l && typeof l.id === 'string');
}

/** A ledger by full id, id prefix or star name. */
export function find(ledgers, key) {
  const hits = ledgers.filter((l) => l.id === key || l.star === key || (key.length >= 4 && l.id.startsWith(key)));
  if (hits.length > 1) {
    const held = hits.filter((l) => !FREE_AFTER.has(l.state));
    if (held.length === 1) return held[0];
    throw new Error(`ledger: "${key}" names ${hits.length} sessions (${hits.map((l) => l.id.slice(0, 8)).join(', ')}): use the id`);
  }
  return hits[0] ?? null;
}

function write(dir, l) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${l.id.replace(/[^A-Za-z0-9_-]/g, '_')}.json`);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(l, null, 2)}\n`);
  renameRetry(tmp, file); // a reader never sees half a ledger
  return file;
}

export const USAGE = `usage:
  node scripts/ledger.mjs beat [--chunk <id>] [--step <s>] [--set k=v …] [--set-file k=<path> …] [--add k=v …] [--clear k …]
  node scripts/ledger.mjs show [<id | star>] [--json]
  node scripts/ledger.mjs list [--train <slug>] [--json]
  node scripts/ledger.mjs park <slug> [--set k=v …]
  node scripts/ledger.mjs take <id | star>
  node scripts/ledger.mjs done <id | star>
  node scripts/ledger.mjs end`;

function opts(argv) {
  const o = { set: [], text: [], add: [], clear: [], pos: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      if (argv[i + 1] === undefined) throw new Error(`ledger: ${a} needs a value\n${USAGE}`);
      return argv[++i];
    };
    if (a === '--set') o.set.push(val());
    else if (a === '--set-file') {
      const kv = val();
      const eq = kv.indexOf('=');
      if (eq < 1) throw new Error(`ledger: "${kv}" is not key=<path>`);
      const file = kv.slice(eq + 1);
      if (!fs.existsSync(file)) throw new Error(`ledger: --set-file ${kv.slice(0, eq)}: no file ${file}`);
      o.text.push(`${kv.slice(0, eq)}=${fs.readFileSync(file, 'utf8').replace(/\r?\n$/, '')}`);
    } else if (a === '--add') o.add.push(val());
    else if (a === '--clear') o.clear.push(val());
    else if (a === '--chunk') o.text.push(`chunk=${val()}`); // verbatim: chunk 60.10 is never the number 60.1
    else if (a === '--step') o.text.push(`step=${val()}`);
    else if (a === '--train') o.train = val();
    else if (a === '--json') o.json = true;
    else if (a.startsWith('-')) throw new Error(`ledger: unknown flag ${a}\n${USAGE}`);
    else o.pos.push(a);
  }
  return o;
}

/** The CLI; returns the exit code. `root` defaults to the primary checkout's, `now` to the clock. */
export function main(argv, { env = process.env, root, now = () => new Date(), out = console.log, err = console.error } = {}) {
  const [cmd, ...rest] = argv;
  if (!cmd || ['help', '--help', '-h'].includes(cmd)) {
    out(USAGE);
    return cmd ? 0 : 1;
  }
  const o = opts(rest);
  const dir = path.join(root ?? primaryRoot(), DIR);
  // A writer reads the ledgers under the lock, so its star and its take see every other writer's.
  if (['beat', 'park', 'end', 'take', 'done'].includes(cmd)) return withLock(path.join(dir, LOCK), () => run(cmd, o, dir, { env, now, out, err }));
  return run(cmd, o, dir, { env, now, out, err });
}

function run(cmd, o, dir, { env, now, out, err }) {
  const all = readAll(dir);
  const staleMin = Number(env.NEXUS_LEDGER_STALE_MIN) || 15;
  const me = env.NEXUS_SESSION || env.CLAUDE_CODE_SESSION_ID || '';
  const runner = runnerId(env);
  const mine = () => {
    if (!me) throw new Error('ledger: no session id (NEXUS_SESSION or CLAUDE_CODE_SESSION_ID): only a session keeps a ledger');
    // A session that took a ledger runs it: its beats keep that ledger (one star, one tile), not a fresh one.
    return runs(all, runner) ?? all.find((l) => l.id === me) ?? fresh(me, nextStar(all), now());
  };
  const target = (key) => {
    const l = key == null ? runs(all, runner) ?? find(all, me) : find(all, key);
    if (!l) throw new Error(`ledger: no session "${key ?? me}" in ${DIR}`);
    return l;
  };

  if (cmd === 'beat' || cmd === 'park' || cmd === 'end') {
    let l = apply(mine(), o);
    l.beat = now().toISOString();
    if (!l.cwd) l.cwd = process.cwd();
    if (cmd === 'beat' && l.state !== 'live') l.state = 'live';
    if (cmd === 'park') {
      if (!o.pos[0]) throw new Error(`ledger: park needs the train's slug\n${USAGE}`);
      l = { ...l, state: 'parked', train: o.pos[0], parked_at: l.beat };
    }
    if (cmd === 'end') l.state = 'ended';
    write(dir, l);
    out(`ledger: ${l.star} (${l.id.slice(0, 8)}) ${l.state}${l.chunk ? ` · ${l.chunk}${l.step ? ` · ${l.step}` : ''}` : ''}`);
    return 0;
  }
  if (cmd === 'take' || cmd === 'done') {
    if (!o.pos[0]) throw new Error(`ledger: ${cmd} needs a session id or star\n${USAGE}`);
    const l = target(o.pos[0]);
    if (cmd === 'take') {
      if (l.state === 'ended') {
        err(`ledger: ${l.star} ended its loop: nothing to resume`);
        return 1;
      }
      if (l.state === 'resuming' || l.state === 'resumed') {
        err(`ledger: ${l.star} is already ${l.state}${l.resumed_by ? ` by ${l.resumed_by.slice(0, 8)}` : ''}: another session has it`);
        return 1;
      }
      if (status(l, now().getTime(), staleMin) === 'live' && l.id !== me && !(runner && l.runner === runner)) {
        err(`ledger: ${l.star} is live (beat within ${staleMin}m): it is still running, not fallen`);
        return 1;
      }
    }
    const at = now().toISOString();
    const next = { ...l, state: cmd === 'take' ? 'resuming' : 'resumed', resumed_by: me || 'terminal', [cmd === 'take' ? 'taken_at' : 'resumed_at']: at };
    // The taker runs it from now on (its claims id); a take from a bare terminal names no runner.
    if (cmd === 'take' && runner) Object.assign(next, { runner, runnerSince: at });
    write(dir, next);
    out(cmd === 'take' ? JSON.stringify(next, null, 2) : `ledger: ${l.star} resumed by ${(me || 'terminal').slice(0, 8)}`);
    return 0;
  }
  if (cmd === 'show') {
    const l = target(o.pos[0]);
    out(o.json ? JSON.stringify({ ...l, status: status(l, now().getTime(), staleMin) }, null, 2) : `${line(l, now().getTime(), staleMin)}\n${JSON.stringify(l, null, 2)}`);
    return 0;
  }
  if (cmd === 'list') {
    const ls = all.filter((l) => !o.train || l.train === o.train).sort((a, b) => String(a.started).localeCompare(String(b.started)));
    if (o.json) out(JSON.stringify(ls.map((l) => ({ ...l, status: status(l, now().getTime(), staleMin) })), null, 2));
    else if (!ls.length) out('ledger: no sessions');
    else for (const l of ls) out(line(l, now().getTime(), staleMin));
    return 0;
  }
  err(`ledger: unknown command ${cmd}\n${USAGE}`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
}
