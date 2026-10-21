// `nexus run "<prompt>"`: one turn, headless. No server, no browser.
//
// Runs a single turn through the Agent SDK's query() on the person's own
// Claude Code login (the same seam the GUI uses in provider.mjs) and
// prints one JSON object on stdout:
//
//   { result, session_id, is_error, subtype, num_turns, duration_ms,
//     total_cost_usd, usage, permission_denials, errors? }
//
// Exit codes: 0 the turn succeeded; 1 the turn ended in an error (the
// JSON still prints, is_error true); 2 a usage error (message on stderr).
//
// Permission posture: the default mode is `default`, never a bypass.
// The repo's own settings load (settingSources: ['project']), so its
// allowlist and hooks (a guard hook, if it has one) apply as they do in
// Claude Code. A tool call the allowlist does not already cover would
// need a person to approve it; headless there is no one, so it is
// denied and listed in permission_denials. AskUserQuestion is denied
// with a note to take the recommended option. `--permission-mode` may
// widen this to acceptEdits, auto or plan; bypassPermissions is refused.

import path from 'node:path';
import fs from 'node:fs';
import { inputQueue, userMessage, PERMISSION_MODES } from './provider.mjs';

export const RUN_HELP = `nexus run: answer one prompt headless (one turn, JSON out, no browser).

  npx @usenexus/cli run "<prompt>"
  echo "<prompt>" | npx @usenexus/cli run -      read the prompt from stdin

  --cwd <dir>               the repo to run in (default: this folder)
  --permission-mode <mode>  default (the default), acceptEdits, auto or plan;
                            bypassPermissions is refused
  --model <name>            a model for this turn (default: your Claude Code default)
  --json                    JSON on stdout (the default; accepted for scripts)

  Prints one JSON object: result, session_id, is_error, subtype, num_turns,
  duration_ms, total_cost_usd, usage, permission_denials. Exits 1 when the
  turn ends in an error, 2 on a usage error.

  The repo's .claude settings load, so its allowlist and hooks apply. A
  tool call the allowlist does not cover is denied (no one is there to
  approve it) and listed in permission_denials.`;

export class UsageError extends Error {}

/** Parse the arguments after `run`. */
export function parseRunArgs(argv) {
  const o = { prompt: undefined, cwd: undefined, permissionMode: 'default', model: undefined, help: false };
  const take = (i, name) => {
    const v = argv[i + 1];
    if (v === undefined || (v.startsWith('--') && v.length > 2)) throw new UsageError(`${name} needs a value`);
    return v;
  };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--json') { /* the default */ }
    else if (a === '--cwd') { o.cwd = take(i, a); i++; }
    else if (a === '--permission-mode') { o.permissionMode = take(i, a); i++; }
    else if (a === '--model') { o.model = take(i, a); i++; }
    else if (a === '--') { rest.push(...argv.slice(i + 1)); break; }
    else if (a.startsWith('--')) throw new UsageError(`unknown option ${a}`);
    else rest.push(a);
  }
  if (o.help) return o;
  if (rest.length > 1) throw new UsageError('give the prompt as one argument (quote it), or - to read stdin');
  o.prompt = rest[0];
  if (o.prompt === undefined) throw new UsageError('no prompt: nexus run "<prompt>" (or - to read stdin)');
  if (o.permissionMode === 'bypassPermissions') throw new UsageError('bypassPermissions is refused; nexus run keeps a person-approved allowlist in charge');
  if (!PERMISSION_MODES.includes(o.permissionMode)) throw new UsageError(`--permission-mode must be one of ${PERMISSION_MODES.join(', ')}`);
  return o;
}

async function readAll(stream) {
  let s = '';
  stream.setEncoding?.('utf8');
  for await (const c of stream) s += c;
  return s;
}

/** The headless permission callback: no one is there to approve. */
export async function headlessCanUseTool(toolName, input) {
  if (toolName === 'AskUserQuestion') {
    return { behavior: 'deny', message: 'nexus run is headless: no one can answer. Take your recommended option and keep going.' };
  }
  return { behavior: 'deny', message: `nexus run is headless: ${toolName} is outside the repo's allowlist and no one is there to approve it.` };
}

/** Shape the SDK's result message into the JSON nexus run prints. */
export function summarize(msg, sessionId) {
  if (!msg) {
    return { result: 'the session ended without a result', session_id: sessionId || null, is_error: true, subtype: 'no_result' };
  }
  const errors = Array.isArray(msg.errors) && msg.errors.length ? msg.errors : undefined;
  return {
    result: typeof msg.result === 'string' ? msg.result : (errors ? errors.join('\n') : ''),
    session_id: msg.session_id || sessionId || null,
    is_error: !!msg.is_error || (msg.subtype && msg.subtype !== 'success') || false,
    subtype: msg.subtype ?? null,
    num_turns: msg.num_turns ?? null,
    duration_ms: msg.duration_ms ?? null,
    total_cost_usd: msg.total_cost_usd ?? null,
    usage: msg.usage ?? null,
    permission_denials: msg.permission_denials ?? [],
    ...(errors ? { errors } : {}),
  };
}

async function loadQuery() {
  const sdk = await import('@anthropic-ai/claude-agent-sdk');
  return sdk.query;
}

/**
 * Run one turn. `query` is injectable (tests stub it; no model calls).
 * @returns {Promise<object>} the summarized result
 */
export async function runOnce({ prompt, cwd, permissionMode = 'default', model, query, env = process.env }) {
  let q0 = query;
  if (!q0) {
    try { q0 = await loadQuery(); } catch (e) {
      return { ...summarize(null, null), result: `could not load the Claude Agent SDK: ${e && e.message ? e.message : e}`, subtype: 'error' };
    }
  }
  const queue = inputQueue();
  queue.push(userMessage(prompt));
  const q = q0({
    prompt: queue,
    options: {
      cwd,
      settingSources: ['project'],
      permissionMode,
      canUseTool: headlessCanUseTool,
      ...(model ? { model } : {}),
      env: { ...env, CLAUDE_AGENT_SDK_CLIENT_APP: 'nexus-cli' },
    },
  });
  let sessionId = null;
  let result = null;
  try {
    for await (const msg of q) {
      if (msg && msg.session_id) sessionId = msg.session_id;
      if (msg && msg.type === 'result') { result = msg; break; }
    }
  } catch (e) {
    return { ...summarize(null, sessionId), result: String(e && e.message ? e.message : e), subtype: 'error' };
  } finally {
    queue.end();
    try { q.close?.(); } catch { /* already closed */ }
  }
  return summarize(result, sessionId);
}

/**
 * The `nexus run` entry. Returns the exit code; never calls process.exit.
 * @param {string[]} argv the arguments after `run`
 */
export async function runCli(argv, { stdin = process.stdin, stdout = process.stdout, stderr = process.stderr, query, env = process.env, cwd = process.cwd() } = {}) {
  let o;
  try {
    o = parseRunArgs(argv);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    stderr.write(`nexus run: ${e.message}\n\n${RUN_HELP}\n`);
    return 2;
  }
  if (o.help) { stdout.write(`${RUN_HELP}\n`); return 0; }
  let prompt = o.prompt;
  if (prompt === '-') prompt = (await readAll(stdin)).trim();
  if (!prompt) { stderr.write('nexus run: the prompt is empty\n'); return 2; }
  const dir = path.resolve(cwd, o.cwd || '.');
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    stderr.write(`nexus run: --cwd ${dir} is not a folder\n`);
    return 2;
  }
  const out = await runOnce({ prompt, cwd: dir, permissionMode: o.permissionMode, model: o.model, query, env });
  stdout.write(`${JSON.stringify(out)}\n`);
  return out.is_error ? 1 : 0;
}
