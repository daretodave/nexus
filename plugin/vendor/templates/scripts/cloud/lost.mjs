#!/usr/bin/env node
// scripts/cloud/lost.mjs: the lost-to-background mark. A cloud tick is one single-shot process: work handed to a
// background Bash call or subagent outlives the turn that would collect it, the job exits clean, and nothing lands.
// The guard hook denies those calls in CI (.claude/hooks/guard.mjs, the background rule); this is the check that holds
// even where the action loads no project hooks. It runs after the model step and marks the run when its final result
// defers to background work and no commit carries the run's `Cloud-Run:` trailer.
//
//   node scripts/cloud/lost.mjs check [<execution file>] --run-url <url> [--fetch <branch>]
//       Reads the run's final result text from claude-code-action's execution_file (a JSON array) or a CLI run's
//       stream-json lines (default $RUNNER_TEMP/claude-execution-output.json). With --fetch, fetches origin's <branch>
//       first (best effort), then looks for a commit on any ref whose message carries `Cloud-Run: <url>`. Sets the
//       outputs `lost` (true|false) and `reason`; a lost run writes `no-op reason: lost-to-background (...)` to the
//       step summary. Never fails the job.
//
// Environment: GITHUB_OUTPUT, GITHUB_STEP_SUMMARY, RUNNER_TEMP. Zero dependencies beside quota.mjs (its parser).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseMessages } from './quota.mjs';

/** What a result says when it parks on background work instead of finishing (spec 55). */
export const DEFERS = /background|I['’]ll wait|resume once/i;

/** The run's final result text: the last `result` message's text, else the last assistant text; '' when none. */
export function resultText(messages) {
  let result = null;
  let assistant = '';
  for (const m of messages) {
    if (!m || typeof m !== 'object') continue;
    if (m.type === 'result' && typeof m.result === 'string') result = m.result;
    if (m.type === 'assistant') {
      const content = m.message?.content;
      const text = Array.isArray(content)
        ? content.filter((c) => c?.type === 'text' && typeof c.text === 'string').map((c) => c.text).join('\n')
        : typeof content === 'string' ? content : '';
      if (text.trim()) assistant = text;
    }
  }
  return result !== null && result.trim() ? result : assistant;
}

/** The words around the first deferral in a text, one line, or null when it defers to nothing. */
export function deferral(text) {
  const t = String(text ?? '');
  const m = DEFERS.exec(t);
  if (!m) return null;
  const from = Math.max(0, m.index - 60);
  const to = Math.min(t.length, m.index + m[0].length + 60);
  return `${from > 0 ? '...' : ''}${t.slice(from, to).replace(/\s+/g, ' ').trim()}${to < t.length ? '...' : ''}`;
}

/** The mark: { lost, reason }. `committed` is whether a commit carries this run's trailer. */
export function decide({ text, committed }) {
  const said = deferral(text);
  if (committed) return { lost: false, reason: 'a commit carries this run\'s Cloud-Run trailer' };
  if (!said) return { lost: false, reason: String(text ?? '').trim() ? 'no commit, and the result defers to no background work' : 'no result text' };
  return { lost: true, reason: `the result defers to background work ("${said.replace(/"/g, "'")}") and no commit carries this run's Cloud-Run trailer` };
}

function gitRun(args) {
  const r = spawnSync('git', args, { encoding: 'utf8', timeout: 60000 });
  return { ok: r.status === 0, stdout: r.stdout ?? '' };
}

/** Whether any ref holds a commit whose message carries `Cloud-Run: <url>`. */
export function committedFor(runUrl, { git = gitRun, fetch = '' } = {}) {
  if (!runUrl) return false;
  if (fetch) git(['fetch', '--quiet', 'origin', fetch]);
  const r = git(['log', '--all', '--fixed-strings', `--grep=Cloud-Run: ${runUrl}`, '--format=%H', '-n', '1']);
  return r.ok && r.stdout.trim() !== '';
}

function flags(rest) {
  const out = { _: [] };
  for (let i = 0; i < rest.length; i++) {
    const m = /^--([\w-]+)$/.exec(rest[i]);
    if (m) out[m[1]] = rest[++i] ?? '';
    else out._.push(rest[i]);
  }
  return out;
}

function emit(env, outputs, summary) {
  const lines = Object.entries(outputs).map(([k, v]) => `${k}=${String(v ?? '').replace(/[\r\n]+/g, ' ')}`);
  try {
    if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, lines.join('\n') + '\n');
  } catch {}
  try {
    if (env.GITHUB_STEP_SUMMARY && summary) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, summary + '\n');
  } catch {}
}

function check(f, { env, git }) {
  const file = f._[0] || path.join(env.RUNNER_TEMP || '.', 'claude-execution-output.json');
  let text = '';
  try {
    text = resultText(parseMessages(fs.readFileSync(file, 'utf8')));
  } catch {
    text = '';
  }
  const committed = committedFor(f['run-url'] || '', { git, fetch: f.fetch || '' });
  const d = decide({ text, committed });
  const line = d.lost ? `no-op reason: lost-to-background (${d.reason})` : `lost-to-background: no (${d.reason})`;
  console.log(line);
  emit(env, { lost: d.lost ? 'true' : 'false', reason: d.reason }, d.lost ? line : '');
  return 0;
}

export async function main(argv, { env = process.env, git = gitRun } = {}) {
  const [cmd, ...rest] = argv;
  if (cmd === 'check') return check(flags(rest), { env, git });
  console.error('usage: node scripts/cloud/lost.mjs check [<execution file>] --run-url <url> [--fetch <branch>]');
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then(
    (code) => (process.exitCode = code),
    (e) => {
      // A post-tick check never fails a tick.
      console.error(`lost: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 0;
    },
  );
}
