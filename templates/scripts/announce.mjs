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
// A line posted `--to` a session is stored as `@<session> <text>`: `read` shows it to that session only (its full id,
// or the star of its own held ledger) and only once, and the steer hook (`.claude/hooks/steer.mjs`) hands it to that
// session at its next tool boundary. Either way it is handed over once: one marker file per session and line
// (`.nexus/steered/<session>/<n>`, created exclusively), so two readers in one session never both deliver it.
//
// Environment: NEXUS_SESSION (this session's id), else CLAUDE_CODE_SESSION_ID; neither means a terminal (the owner).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { primaryRoot } from './owner.mjs';
import { DIR as LEDGERS, readAll } from './ledger.mjs';

export const FILE = '.announcements.md';
export const SEEN = '.nexus/announcements.seen.json';
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

/** Every session ledger at `root` (`.nexus/sessions/`), for `identities`. */
export function ledgers(root) {
  return readAll(path.join(root, LEDGERS));
}

/**
 * Every name this session answers to: its own ids (the Claude session id, NEXUS_SESSION), plus the id and star of each
 * held ledger (live, parked, resuming) that is its own. An ended or resumed ledger's star is free for another session,
 * so it never counts.
 */
export function identities(ids, ledgers = []) {
  const own = new Set(ids.filter(Boolean).map(String));
  const out = new Set(own);
  for (const l of ledgers) {
    if (!l || !HELD.has(l.state)) continue;
    if (own.has(l.id) || (typeof l.claude === 'string' && own.has(l.claude))) {
      out.add(l.id);
      if (l.star) out.add(l.star);
    }
  }
  return out;
}

/** A line this session may read: one to every loop, or one addressed to a name it answers to. */
export function forMe(a, names) {
  const to = addressee(a);
  return to === null || names.has(to);
}

/** The owner lines addressed to this session that it has not been handed yet (`handed`: their line numbers). */
export function steerable(lines, names, handed = new Set()) {
  return lines.filter((a) => a.from === 'owner' && names.has(addressee(a)) && !handed.has(a.n));
}

const steeredDir = (root, id) => path.join(root, STEERED, String(id).replace(/[^A-Za-z0-9_-]/g, '_'));

/** The addressed line numbers already handed to this session (by `read` or its steer hook). */
export function delivered(root, ids) {
  const out = new Set();
  for (const id of ids.filter(Boolean)) {
    let files = [];
    try {
      files = fs.readdirSync(steeredDir(root, id));
    } catch {
      continue; // nothing handed over yet
    }
    for (const f of files) if (/^\d+$/.test(f)) out.add(Number(f));
  }
  return out;
}

/** Mark line n handed to this session: false when another reader in the same session got there first. */
export function claim(root, id, n) {
  const dir = steeredDir(root, id);
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.closeSync(fs.openSync(path.join(dir, String(n)), 'wx'));
    return true;
  } catch (e) {
    if (e && e.code === 'EEXIST') return false;
    throw e;
  }
}

/** Post one line to the board at `root` and return its number (the GUI's tug or answer to one linked session). */
export function postTo(root, words, { from = 'owner', to = null, at } = {}) {
  const file = path.join(root, FILE);
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const posted = post(text, words, from, at, to);
  fs.writeFileSync(file, posted.text);
  return posted.n;
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
  const file = path.join(base, FILE);
  const seenFile = path.join(base, SEEN);
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const cmd = argv[0];

  if (cmd === 'read') {
    const lines = parse(text);
    const seen = readJson(seenFile);
    const key = env.NEXUS_SESSION || env.CLAUDE_CODE_SESSION_ID || 'terminal';
    const all = argv.includes('--all');
    const ids = [env.NEXUS_SESSION, env.CLAUDE_CODE_SESSION_ID].filter(Boolean);
    const names = identities(ids, ids.length ? ledgers(base) : []);
    const handed = delivered(base, [...names]);
    // A line to another session is never shown; one to this session is handed over once, by whichever reader is first.
    const fresh = (all ? lines : unread(lines, seen[key] ?? 0))
      .filter((a) => forMe(a, names))
      .filter((a) => all || addressee(a) === null || (!handed.has(a.n) && claim(base, ids[0], a.n)));
    const r = reboot(fresh);
    if (r) out(`announce: REBOOT ${r.slug}: stop now and run /reboot-ready ${r.slug} (it preempts the chunk in flight)`);
    if (!fresh.length) out('announce: nothing new');
    else {
      out(`announce: ${fresh.length} new (an owner line holds for the rest of this session and outranks the command):`);
      for (const a of fresh) out(`${format(a)}${tag(a)}`);
    }
    if (lines.length) {
      fs.mkdirSync(path.dirname(seenFile), { recursive: true });
      fs.writeFileSync(seenFile, `${JSON.stringify({ ...seen, [key]: Math.max(...lines.map((a) => a.n)) }, null, 2)}\n`);
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
    fs.writeFileSync(file, drop(text, n));
    out(`announce: dropped ${n}`);
    return 0;
  }
  const words = argv.filter((a) => !FLAGS.has(a)).join(' ');
  const from = author(env, argv.includes('--owner'));
  const posted = post(text, words, from, undefined, to);
  fs.writeFileSync(file, posted.text);
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
