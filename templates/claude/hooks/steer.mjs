#!/usr/bin/env node
// .claude/hooks/steer.mjs: hands an owner line addressed to THIS session (`announce.mjs --to <session>`, which the
// nexus GUI posts for an answer or a tug aimed at a linked terminal session) to this session at once. Wired in
// .claude/settings.json for four events; the one hook runs for each:
//
//   UserPromptSubmit  the line rides in with the next prompt (additionalContext)
//   PreToolUse        the interrupt: the next tool call is denied and the reason is the owner's line, so the model
//                     reads it before anything else runs (permissionDecision: deny)
//   PostToolUse       the tool that was running when the line landed has finished: the line rides with its result
//   Stop              the session was about to end its turn: it is kept going to act on the line (decision: block)
//
// What an interrupt cannot do: a hook never kills a tool call already running (a long build, a test run, a builder
// subagent's whole run), so the next tool boundary is the interrupt point. A session idle at its prompt has no turn to
// join until someone types into it; the line waits for that prompt.
//
// Addressing: by the Claude Code session id on stdin (plus NEXUS_SESSION, and the star of the session's own held
// ledger). A line to another session is never handed here; a line to every loop is left to `announce.mjs read`
// exactly as before. A line is handed over once (`.nexus/steered/<session>/<n>`, created exclusively), whichever of
// this hook or `read` gets there first. A subagent's tool calls (agent_id on stdin) never take the line: it is the
// lead's.
//
// NEXUS_NO_STEER=1 makes the hook inert. It never fails a turn: any error exits 0 with nothing on stdout. Zero
// dependencies; it reads the board through the repo's scripts/announce.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EVENTS = new Set(['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop']);

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
  if (event === 'Stop') return { decision: 'block', reason: text };
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
  return output(event, due.filter((a) => board.claim(root, session, a.n)));
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
  const root = primaryRootOf(input.cwd || process.cwd());
  if (!root || !fs.existsSync(path.join(root, '.announcements.md'))) return;
  const board = await loadBoard(root);
  if (typeof board?.steerable !== 'function' || typeof board.ledgers !== 'function') return; // an older board
  const out = respond(input, { root, board });
  if (out) process.stdout.write(JSON.stringify(out));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    () => process.exit(0),
    () => process.exit(0), // never fail a turn
  );
}
