#!/usr/bin/env node
// .claude/hooks/steer.mjs: hands an owner line addressed to THIS session (`announce.mjs --to <session>`, which the
// nexus GUI posts for an answer or a tug aimed at a linked terminal session) to this session at once. Wired in
// .claude/settings.json for two events; the one hook runs for each:
//
//   UserPromptSubmit  the line rides in with the next prompt (additionalContext)
//   PreToolUse        the interrupt: the next tool call is denied and the reason is the owner's line, so the model
//                     reads it before anything else runs (permissionDecision: deny)
//
// What an interrupt cannot do: a hook never kills a tool call already running (a long build, a test run, a builder
// subagent's whole run), so the next tool boundary is the interrupt point. A session idle at its prompt has no turn to
// join until someone types into it; the line waits for that prompt.
//
// Addressing: by the Claude Code session id on stdin (plus NEXUS_SESSION, the star of the session's own held ledger,
// and the ids of a parked or fallen session's ledger it took to resume, so an answer to that session reaches its
// resumer). A line to another session is never handed here; a line to every loop is left to `announce.mjs read`
// exactly as before. A line is handed over once (`.nexus/steered/<session>/<n>.<hash of the line>`, created
// exclusively). The hook leaves `.nexus/steered/<session>/.hook` on its first run: `read` then leaves the session's
// lines to it, and hands them over itself in a session with no hook running. A subagent's tool calls (agent_id on
// stdin) never take the line: it is the lead's.
//
// NEXUS_NO_STEER=1 makes the hook inert. It never fails a turn: any error exits 0 with nothing on stdout. Zero
// dependencies. Nothing due costs node's startup, the board, the ledgers and this session's marker folders read as
// plain files; it loads the repo's scripts/announce.mjs only for a line that is this session's and not handed yet.
// The board is the project's ($CLAUDE_PROJECT_DIR), whatever folder the session's tools run in; wired by
// "$CLAUDE_PROJECT_DIR"/.claude/hooks/steer.mjs, so a session in a subfolder still runs it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EVENTS = new Set(['UserPromptSubmit', 'PreToolUse']);
const BOARD = '.announcements.md';
const LEDGERS = '.nexus/sessions';
const STEERED = '.nexus/steered';
const HOOKED = '.hook';

/** The primary checkout's root from any folder inside it or one of its worktrees, without spawning git. */
export function primaryRootOf(start) {
  let dir = path.resolve(start);
  for (;;) {
    const dotgit = path.join(dir, '.git');
    let st = null;
    try {
      st = fs.statSync(dotgit);
    } catch {
      /* not here */
    }
    if (st?.isDirectory()) return dir;
    if (st?.isFile()) {
      // A worktree: `.git` names its gitdir, whose `commondir` names the primary's .git.
      const gitdir = path.resolve(dir, /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(dotgit, 'utf8'))[1].trim());
      const common = path.resolve(gitdir, fs.readFileSync(path.join(gitdir, 'commondir'), 'utf8').trim());
      return path.dirname(common);
    }
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** The repo whose board this session reads: the project dir first, then the hook's cwd. */
export function rootFor(input, env = process.env) {
  for (const dir of [env.CLAUDE_PROJECT_DIR, input?.cwd, process.cwd()]) {
    if (typeof dir !== 'string' || !dir) continue;
    try {
      const root = primaryRootOf(dir);
      if (root) return root;
    } catch {
      /* a broken .git file: try the next */
    }
  }
  return null;
}

/** A line's hand-over key, the same as announce.mjs `lineKey`: `<n>.<FNV-1a of "<at> <text>">`. */
export function keyOf(n, at, text) {
  let h = 0x811c9dc5;
  const s = `${at} ${text}`;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return `${n}.${h.toString(16).padStart(8, '0')}`;
}

const HELD = new Set(['live', 'parked', 'resuming']);
const TAKEN = new Set(['resuming', 'resumed']);

/** The names this session answers to: announce.mjs `identities`, the same rule, without loading it. */
export function namesOf(ids, ledgers = []) {
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

const dirOf = (root, id) => path.join(root, STEERED, String(id).replace(/[^A-Za-z0-9_-]/g, '_'));

function readLedgers(root) {
  let files = [];
  try {
    files = fs.readdirSync(path.join(root, LEDGERS)).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  const out = [];
  for (const f of files) {
    try {
      out.push(JSON.parse(fs.readFileSync(path.join(root, LEDGERS, f), 'utf8')));
    } catch {
      /* half written: skipped */
    }
  }
  return out;
}

/**
 * This session's names and the keys of the lines already handed under any of them, read as plain files. Marks that
 * a steer hook runs in this session (`.hook`), which `read` checks before it leaves a line to the hook.
 */
export function scan(root, ids) {
  const names = namesOf(ids, readLedgers(root));
  const handed = new Set();
  for (const id of names) {
    let files = [];
    try {
      files = fs.readdirSync(dirOf(root, id));
    } catch {
      /* nothing handed under this name */
    }
    for (const f of files) if (/^\d+\.[0-9a-f]{8}$/.test(f)) handed.add(f);
  }
  const mine = dirOf(root, ids[0]);
  if (!fs.existsSync(path.join(mine, HOOKED))) {
    fs.mkdirSync(mine, { recursive: true });
    fs.writeFileSync(path.join(mine, HOOKED), '');
  }
  return { names, handed };
}

const OWNER_TO = /^- \*\*(\d+)\*\* · (\S+) · owner · (@([A-Za-z0-9][\w.-]*)\s+.*)$/;

/**
 * Is an owner line to one of this session's `names` on the board, not yet `handed` (its keys)? A scan of the text,
 * so the common case (nothing due, or lines to other sessions only) never loads the board's modules. A yes is checked
 * properly by `respond`.
 */
export function mayBeDue(text, handed, names) {
  for (const line of String(text).split(/\r?\n/)) {
    const m = OWNER_TO.exec(line);
    if (m && names.has(m[4]) && !handed.has(keyOf(Number(m[1]), m[2], m[3]))) return true;
  }
  return false;
}

/** The text the model reads: each line without its address, the owner's words verbatim. */
export function message(lines) {
  const body = lines.map((a) => `- **${a.n}** · ${a.at} · owner · ${a.text.replace(/^@\S+\s+/, '')}`).join('\n');
  return (
    `The owner, from the nexus GUI, to this session only (an owner line outranks the command you run; act on it now, ` +
    `then carry on):\n${body}`
  );
}

/** The hook's JSON for this event, or null for nothing to say. */
export function output(event, lines) {
  if (!lines.length) return null;
  const text = message(lines);
  if (event === 'PreToolUse') {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `Interrupted for the owner before this tool call ran. ${text}\nRe-issue the call afterwards only if it still applies.`,
      },
    };
  }
  return { hookSpecificOutput: { hookEventName: event, additionalContext: text } };
}

/**
 * Hand this session its unread addressed owner lines (marking them handed) and return the hook's JSON, or null.
 * `board` is the announce.mjs module; `root` the primary checkout's root.
 */
export function respond(input, { env = process.env, root, board }) {
  if (env.NEXUS_NO_STEER === '1') return null;
  const event = input?.hook_event_name;
  const session = input?.session_id;
  if (!EVENTS.has(event) || typeof session !== 'string' || !session || input.agent_id) return null;
  const file = path.join(root, board.FILE);
  if (!fs.existsSync(file)) return null;
  const ids = [session, env.NEXUS_SESSION].filter(Boolean);
  const names = board.identities(ids, board.ledgers(root));
  const lines = board.parse(fs.readFileSync(file, 'utf8'));
  const due = board.steerable(lines, names, board.delivered(root, [...names]));
  return output(event, due.filter((a) => board.claim(root, session, a)));
}

async function loadBoard(root) {
  for (const f of [path.resolve(HERE, '..', '..', 'scripts', 'announce.mjs'), path.join(root, 'scripts', 'announce.mjs')]) {
    if (fs.existsSync(f)) return import(pathToFileURL(f).href);
  }
  return null;
}

async function main() {
  if (process.env.NEXUS_NO_STEER === '1') return;
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return;
  }
  if (!EVENTS.has(input?.hook_event_name) || typeof input.session_id !== 'string' || !input.session_id || input.agent_id) return;
  const root = rootFor(input);
  if (!root) return;
  const { names, handed } = scan(root, [input.session_id, process.env.NEXUS_SESSION].filter(Boolean));
  let text;
  try {
    text = fs.readFileSync(path.join(root, BOARD), 'utf8');
  } catch {
    return; // no board
  }
  // The common case, nothing due here: say nothing without loading the board's modules.
  if (!mayBeDue(text, handed, names)) return;
  const board = await loadBoard(root);
  if (typeof board?.steerable !== 'function' || typeof board.lineKey !== 'function') return; // an older board
  const out = respond(input, { root, board });
  if (out) process.stdout.write(JSON.stringify(out));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    () => process.exit(0),
    () => process.exit(0), // never fail a turn
  );
}
