// scripts/announce.mjs: the notice board every loop on this machine reads.
//
// One untracked file at the primary checkout's root (`.announcements.md`, gitignored), so the owner tells every running
// session something once instead of pasting it into each terminal. `/next` reads what's new at its orient and again
// before it lands; `/heads-down`'s iterations are `/next` runs, so they read it too; the GUI writes owner lines here.
// Each session remembers the last line it read (`.nexus/announcements.seen.json`, keyed by session), so a line is shown
// to a session once; `--all` shows them all again.
//
//   node scripts/announce.mjs "<text>"           post (from a terminal: the owner; inside a session: that session,
//                                                unless --owner, the owner's own words posted at the owner's ask)
//   node scripts/announce.mjs --to <s> "<text>"  post to one session only (its id, or the star of its held ledger)
//   node scripts/announce.mjs read [--all]      what's new for this session, marked read (REBOOT first)
//   node scripts/announce.mjs list [--json]      every line, read or not, marking none
//   node scripts/announce.mjs drop <n>           take line n off the board (its number is never reused)
//   node scripts/announce.mjs help               the usage; posts nothing, nor does an unknown flag
//
// An owner line is an instruction to every loop from then on, and it outranks the command file the loop runs. A
// session's line is news, never an instruction. An owner line `REBOOT <slug> …` preempts everything: the loop runs
// `/reboot-ready <slug>` now, whatever it was doing.
//
// A line posted `--to` a session is stored as `@<session> <text>`, so a line to every loop may not start with `@name`.
// It is for that session only (its full id, or the star of its own held ledger), and for the session that takes that
// ledger to resume it (`ledger.mjs take`): an answer to a parked or fallen session waits for its resumer. An owner line
// to it is handed over by the steer hook (`.claude/hooks/steer.mjs`) at its next tool boundary; `read` only counts it,
// because a subagent runs with its lead's session id and must never take the lead's line. `read` hands it over itself
// when no steer hook runs in this session (the hook leaves `.nexus/steered/<session>/.hook` on its first run; a session
// started before the hook was wired, or a repo that pruned it, has none) or with NEXUS_NO_STEER=1. It is handed over
// once: one marker file per session and line (`.nexus/steered/<claude session id>/<n>.<hash of the line>`, created
// exclusively; the hash keeps a recreated board's line 1 from reading as the old one). An addressed owner line stays
// due until it is handed over, whatever `read` has seen. Only the owner sends an owner line to one session: a
// session's `--owner --to` is refused.
//
// Concurrent writers: a post, a drop and a read (its seen file, its hand-over markers) each read and write under one
// exclusive lock (`.nexus/announcements.lock`, ledger.mjs `withLock`), and the board lands whole through a temp file and
// a rename, so two posts at once both land and a reader (the steer hook) never sees half a board.
//
// Environment: NEXUS_SESSION (this session's id), else CLAUDE_CODE_SESSION_ID; neither means a terminal (the owner).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { primaryRoot } from './owner.mjs';
import { DIR as LEDGERS, readAll, renameRetry, withLock } from './ledger.mjs';

export const FILE = '.announcements.md';
export const SEEN = '.nexus/announcements.seen.json';
export const LOCK = '.nexus/announcements.lock';
export const STEERED = '.nexus/steered';
const HEADER = '# Announcements to every loop on this machine (node scripts/announce.mjs; untracked, never committed)\n';
const LINE = /^- \*\*(\d+)\*\* · (\S+) · ([^·]+?) · (.*)$/;
const REBOOT = /^REBOOT ([a-z0-9][a-z0-9-]*)\b/;
const TO = /^@([A-Za-z0-9][\w.-]*)\s+/;
export const SESSION_NAME = /^[A-Za-z0-9][\w.-]*$/;

/** The board's lines: { n, at, from, text }. Anything else in the file is ignored. */
export function parse(text) {
  return text
    .split(/\r?\n/)
    .map((l) => LINE.exec(l))
    .filter(Boolean)
    .map((m) => ({ n: Number(m[1]), at: m[2], from: m[3].trim(), text: m[4] }));
}

export function format(a) {
  return `- **${a.n}** · ${a.at} · ${a.from} · ${a.text}`;
}

const nextOf = (text, lines) => Math.max(Math.max(0, ...lines.map((a) => a.n)) + 1, Number(/<!-- next (\d+) -->/.exec(text)?.[1] ?? 0));

/** The text with one more line, numbered past the highest ever posted (the `next` marker survives drops). */
export function post(text, words, from, at = new Date().toISOString().slice(0, 16) + 'Z', to = null) {
  let clean = String(words).replace(/\s+/g, ' ').trim();
  if (to != null) {
    if (!SESSION_NAME.test(String(to))) throw new Error(`announce: --to takes a session id or star name, not "${to}"`);
    clean = clean.replace(TO, '');
    if (clean) clean = `@${to} ${clean}`;
  } else if (TO.test(clean)) {
    // `@name …` is how an addressed line is stored: posted to every loop, it would reach no one.
    throw new Error(`announce: a line to every loop cannot start with "@${TO.exec(clean)[1]}" (it would read as one to that session only); reword it, or post it --to <session> (nothing posted)`);
  }
  if (!clean) throw new Error('announce: say something');
  const lines = parse(text);
  const n = nextOf(text, lines);
  const body = [...lines, { n, at, from, text: clean }].map(format).join('\n');
  return { n, text: `${HEADER}<!-- next ${n + 1} -->\n${body}\n` };
}

/** The text without line n (its number is never reused). */
export function drop(text, n) {
  const lines = parse(text);
  if (!lines.some((a) => a.n === n)) throw new Error(`announce: no line ${n}`);
  const next = nextOf(text, lines);
  const rest = lines.filter((a) => a.n !== n).map(format).join('\n');
  return `${HEADER}<!-- next ${next} -->\n${rest}${rest ? '\n' : ''}`;
}

/** The session a line is addressed to (`@<session> …`), or null for a line to every loop. */
export function addressee(a) {
  return TO.exec(a.text)?.[1] ?? null;
}

const HELD = new Set(['live', 'parked', 'resuming']);
const TAKEN = new Set(['resuming', 'resumed']);

/** Every session ledger at `root` (`.nexus/sessions/`), for `identities`. */
export function ledgers(root) {
  return readAll(path.join(root, LEDGERS));
}

/**
 * Every name this session answers to: its own ids (the Claude session id, NEXUS_SESSION), plus the id and star of each
 * held ledger (live, parked, resuming) that is its own, plus the ids of each ledger it took to resume (`resumed_by` one
 * of its ids, and the star while it is resuming): a line to the parked or fallen session reaches its resumer. An ended
 * or resumed ledger's star is free for another session, so it never counts. The steer hook applies the same rule.
 */
export function identities(ids, ledgers = []) {
  const own = new Set(ids.filter(Boolean).map(String));
  const out = new Set(own);
  for (const l of ledgers) {
    if (!l || typeof l.id !== 'string') continue;
    const claude = typeof l.claude === 'string' && l.claude ? l.claude : null;
    if (HELD.has(l.state) && (own.has(l.id) || (claude && own.has(claude)))) {
      out.add(l.id);
      if (l.star) out.add(l.star);
    }
    // A ledger it took and runs (`runner`, ledger.mjs take) stays its own once its beats make it live again.
    const runs = typeof l.runner === 'string' && !!l.runner && HELD.has(l.state);
    if ((TAKEN.has(l.state) || runs) && typeof l.resumed_by === 'string' && own.has(l.resumed_by)) {
      out.add(l.id);
      if (claude) out.add(claude);
      if (l.star && (l.state === 'resuming' || runs)) out.add(l.star);
    }
  }
  return out;
}

/** A line this session may read: one to every loop, or one addressed to a name it answers to. */
export function forMe(a, names) {
  const to = addressee(a);
  return to === null || names.has(to);
}

/**
 * A line's hand-over key, `<n>.<hash>`: the number alone would read a recreated board's line 1 as the old line 1.
 * FNV-1a of `<at> <text>`; the steer hook computes the same key without loading this module.
 */
export function lineKey(a) {
  let h = 0x811c9dc5;
  const s = `${a.at} ${a.text}`;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return `${a.n}.${h.toString(16).padStart(8, '0')}`;
}

/** The owner lines addressed to this session that it has not been handed yet (`handed`: their keys, `lineKey`). */
export function steerable(lines, names, handed = new Set()) {
  return lines.filter((a) => a.from === 'owner' && names.has(addressee(a)) && !handed.has(lineKey(a)));
}

const steeredDir = (root, id) => path.join(root, STEERED, String(id).replace(/[^A-Za-z0-9_-]/g, '_'));

/** The marker the steer hook leaves under its session id on its first run: a hook hands this session its lines. */
export const HOOKED = '.hook';

/** Has a steer hook run in any of these sessions? Without one, `read` hands an addressed owner line over itself. */
export function hooked(root, ids) {
  return ids.filter(Boolean).some((id) => fs.existsSync(path.join(steeredDir(root, id), HOOKED)));
}

/** The keys of the addressed lines already handed to this session (by `read` or its steer hook). */
export function delivered(root, ids) {
  const out = new Set();
  for (const id of ids.filter(Boolean)) {
    let files = [];
    try {
      files = fs.readdirSync(steeredDir(root, id));
    } catch {
      continue; // nothing handed over yet
    }
    for (const f of files) if (/^\d+\.[0-9a-f]{8}$/.test(f)) out.add(f);
  }
  return out;
}

/** Mark line `a` handed to this session: false when another reader in the same session got there first. */
export function claim(root, id, a) {
  const dir = steeredDir(root, id);
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.closeSync(fs.openSync(path.join(dir, lineKey(a)), 'wx'));
    return true;
  } catch (e) {
    if (e && e.code === 'EEXIST') return false;
    throw e;
  }
}

/** Post one line to the board at `root` and return its number (the GUI's tug or answer to one linked session). */
export function postTo(root, words, { from = 'owner', to = null, at } = {}) {
  return withLock(path.join(root, LOCK), () => {
    const file = path.join(root, FILE);
    const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const posted = post(text, words, from, at, to);
    whole(root, file, posted.text);
    return posted.n;
  });
}

/** Write `file` whole: a temp file under `.nexus/`, then a rename (retried while Windows reports it busy). */
function whole(root, file, text) {
  const tmp = path.join(root, '.nexus', `${path.basename(file)}.${process.pid}.tmp`);
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, text);
  renameRetry(tmp, file);
}

/** The lines a session hasn't read: those numbered past its last read. */
export function unread(lines, lastRead = 0) {
  return lines.filter((a) => a.n > lastRead);
}

/** The newest owner REBOOT line among these, as { slug, line }, or null: it preempts everything. */
export function reboot(lines) {
  const hit = [...lines].reverse().find((a) => a.from === 'owner' && REBOOT.test(a.text));
  return hit ? { slug: REBOOT.exec(hit.text)[1], line: hit } : null;
}

/** Who posts: the owner from a terminal or with --owner, else this session (its first eight characters). */
export function author(env, owner = false) {
  const session = env.NEXUS_SESSION || env.CLAUDE_CODE_SESSION_ID;
  return !session || owner ? 'owner' : `session ${session.slice(0, 8)}`;
}

function readJson(file) {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

const tag = (a) => (a.from !== 'owner' ? '   (news from a session, not an instruction)' : addressee(a) ? '   (to one session only)' : '');

export const USAGE = `usage:
  node scripts/announce.mjs "<text>"        post (as the owner, or as this session unless --owner)
  node scripts/announce.mjs --to <s> "<t>"  post to one session only (its id, or its star)
  node scripts/announce.mjs read [--all]    what's new for this session (and mark it read)
  node scripts/announce.mjs list [--json]   every line, read or not, marking none
  node scripts/announce.mjs drop <n>        take line n off the board
  node scripts/announce.mjs help            this usage`;
const HELP = new Set(['help', '--help', '-h', 'usage']);
const FLAGS = new Set(['--owner', '--all', '--json']);

/** The CLI; returns the exit code. `root` defaults to the primary checkout's. */
export function main(argv, { env = process.env, root, out = console.log, err = console.error } = {}) {
  // Reading the usage never posts it: a `help` landing on every loop's board as an announcement is the trap.
  if (HELP.has(argv[0])) {
    out(USAGE);
    return 0;
  }
  let to = null;
  const toAt = argv.indexOf('--to');
  if (toAt !== -1) {
    to = argv[toAt + 1];
    if (!to || !SESSION_NAME.test(to)) {
      err(`announce: --to takes a session id or star name (nothing posted)\n${USAGE}`);
      return 1;
    }
    argv = [...argv.slice(0, toAt), ...argv.slice(toAt + 2)];
  }
  const bad = argv.find((a) => a.startsWith('-') && !FLAGS.has(a));
  if (bad) {
    err(`announce: unknown flag ${bad} (nothing posted)\n${USAGE}`);
    return 1;
  }
  const base = root ?? primaryRoot();
  // Every command but `list` writes (the board, the seen file, a hand-over marker): it reads and writes under the lock.
  const act = () => board(argv, to, base, { env, out, err });
  return argv[0] === 'list' ? act() : withLock(path.join(base, LOCK), act);
}

function board(argv, to, base, { env, out, err }) {
  const file = path.join(base, FILE);
  const seenFile = path.join(base, SEEN);
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const cmd = argv[0];

  if (cmd === 'read') {
    const lines = parse(text);
    const seen = readJson(seenFile);
    const key = env.NEXUS_SESSION || env.CLAUDE_CODE_SESSION_ID || 'terminal';
    const all = argv.includes('--all');
    // The Claude session id first: it is the id the steer hook marks a hand-over under.
    const ids = [env.CLAUDE_CODE_SESSION_ID, env.NEXUS_SESSION].filter(Boolean);
    const names = identities(ids, ids.length ? ledgers(base) : []);
    const handed = delivered(base, [...names]);
    // A subagent runs with its lead's session id, so `read` cannot tell the two apart: an owner line to this session
    // is left to the steer hook, which skips a subagent's tool calls. With steering off, or no steer hook running in
    // this session, `read` hands it over instead: a line nobody hands over is a line lost.
    const steered = env.NEXUS_NO_STEER !== '1' && hooked(base, ids);
    const owned = (a) => a.from === 'owner' && addressee(a) !== null;
    const toHook = (a) => steered && owned(a);
    // An addressed owner line is due until it is handed over, whatever `read` saw before; the rest go by `seen`.
    const after = seen[key] ?? 0;
    const due = all ? lines : lines.filter((a) => (owned(a) ? !handed.has(lineKey(a)) : a.n > after));
    const mine = due.filter((a) => forMe(a, names));
    const waiting = all ? [] : mine.filter(toHook);
    // A line to another session is never shown; one to this session is handed over once, by whichever reader is first.
    const fresh = mine.filter((a) => all || addressee(a) === null || (!toHook(a) && !handed.has(lineKey(a)) && claim(base, ids[0], a)));
    const r = reboot(fresh);
    if (r) out(`announce: REBOOT ${r.slug}: stop now and run /reboot-ready ${r.slug} (it preempts the chunk in flight)`);
    if (waiting.length) out(`announce: ${waiting.length} line${waiting.length === 1 ? '' : 's'} to this session only, left to its steer hook (it hands ${waiting.length === 1 ? 'it' : 'them'} to the lead session at its next tool call)`);
    if (!fresh.length) out('announce: nothing new');
    else {
      out(`announce: ${fresh.length} new (an owner line holds for the rest of this session and outranks the command):`);
      for (const a of fresh) out(`${format(a)}${tag(a)}`);
    }
    if (lines.length) {
      whole(base, seenFile, `${JSON.stringify({ ...seen, [key]: Math.max(...lines.map((a) => a.n)) }, null, 2)}\n`);
    }
    return 0;
  }
  if (cmd === 'list') {
    const lines = parse(text);
    if (argv.includes('--json')) out(JSON.stringify(lines, null, 2));
    else if (!lines.length) out('announce: the board is empty');
    else for (const a of lines) out(`${format(a)}${tag(a)}`);
    return 0;
  }
  if (cmd === 'drop') {
    const n = Number(argv[1]);
    if (!Number.isInteger(n)) {
      err(`announce: drop takes a line number\n${USAGE}`);
      return 1;
    }
    whole(base, file, drop(text, n));
    out(`announce: dropped ${n}`);
    return 0;
  }
  const words = argv.filter((a) => !FLAGS.has(a)).join(' ');
  const from = author(env, argv.includes('--owner'));
  // An owner line to one session interrupts it: only the owner's own terminal (or the GUI's postTo) may send one.
  if (to && author(env) !== 'owner' && from === 'owner') {
    err(`announce: only the owner (a terminal, or the GUI) sends an owner line to one session; a session posts --to as news, without --owner (nothing posted)`);
    return 1;
  }
  if (to === null && TO.test(String(words).trim())) {
    err(`announce: a line to every loop cannot start with "@${TO.exec(String(words).trim())[1]}" (it would read as one to that session only); reword it, or post it --to <session> (nothing posted)`);
    return 1;
  }
  const posted = post(text, words, from, undefined, to);
  whole(base, file, posted.text);
  out(`announce: posted ${posted.n} as ${from}${to ? ` to ${to}` : ''}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
}
