// cloud/lost.mjs (the lost-to-background mark) and the guard hook's background rule, end to end: in CI a background
// Bash call or subagent is denied, and a run whose result parks on background work with no commit is marked.
// node:test, git stubbed; the guard runs as the hook runs it (JSON on stdin, exit 2 = denied).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { decide, deferral, committedFor, main, resultText } from '../cloud/lost.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.resolve(HERE, '..', '..', 'claude', 'hooks', 'guard.mjs');
const RUN = 'https://github.com/o/r/actions/runs/38124218196';

// The shape the lost no-ops ended on: the builder dispatched in the background, the turn ended, nothing landed.
const LOST = [
  { type: 'system', subtype: 'init', session_id: 's' },
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Agent', input: { prompt: 'build 41.2', run_in_background: true } }] } },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'The builder is running in the background. I\'ll wait for its notification and resume once it returns.' }] } },
  { type: 'result', subtype: 'success', is_error: false, result: 'The builder is running in the background. I\'ll wait for its notification and resume once it returns.' },
];
const SHIPPED = [{ type: 'result', subtype: 'success', result: 'Shipped 41.2 and pushed main.' }];
const NOOP = [{ type: 'result', subtype: 'success', result: 'No ready chunk; the queues are empty. Clean no-op.' }];

/** A git stub: `log` answers with a sha when `has` holds, records every call. */
function gitStub(has) {
  const calls = [];
  const git = (args) => {
    calls.push(args.join(' '));
    if (args[0] === 'log') return { ok: true, stdout: has ? 'abc123\n' : '' };
    return { ok: true, stdout: '' };
  };
  return { git, calls };
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lost-'));

describe('the result text', () => {
  it('is the last result message, else the last assistant text', () => {
    assert.match(resultText(LOST), /^The builder is running in the background/);
    assert.equal(resultText([{ type: 'assistant', message: { content: [{ type: 'text', text: 'parked' }] } }, { type: 'result', subtype: 'error_during_execution' }]), 'parked');
    assert.equal(resultText([]), '');
  });

  it('defers to background work on any of the spec\'s phrases, either apostrophe', () => {
    for (const t of ['Running it in the background now.', 'I\'ll wait for the gate.', 'I’ll wait for the builder.', 'I will resume once it finishes.']) {
      assert.ok(deferral(t), t);
    }
    assert.equal(deferral('Shipped 41.2 and pushed main.'), null);
  });
});

describe('the mark', () => {
  it('marks a deferring result with no commit', () => {
    const d = decide({ text: resultText(LOST), committed: false });
    assert.equal(d.lost, true);
    assert.match(d.reason, /defers to background work/);
  });

  it('never marks a run whose commit landed, a plain no-op, or a run with no result', () => {
    assert.equal(decide({ text: resultText(LOST), committed: true }).lost, false);
    assert.equal(decide({ text: resultText(NOOP), committed: false }).lost, false);
    assert.equal(decide({ text: '', committed: false }).lost, false);
  });

  it('finds the commit by the run\'s Cloud-Run trailer on any ref, fetching first when asked', () => {
    const yes = gitStub(true);
    assert.equal(committedFor(RUN, { git: yes.git, fetch: 'main' }), true);
    assert.deepEqual(yes.calls, ['fetch --quiet origin main', `log --all --fixed-strings --grep=Cloud-Run: ${RUN} --format=%H -n 1`]);
    assert.equal(committedFor(RUN, { git: gitStub(false).git }), false);
    assert.equal(committedFor('', { git: gitStub(true).git }), false, 'no run url, no claim of a commit');
  });
});

describe('lost.mjs check', () => {
  const run = async (messages, has, asLines = false) => {
    const dir = tmp();
    const file = path.join(dir, 'exec.json');
    fs.writeFileSync(file, asLines ? messages.map((m) => JSON.stringify(m)).join('\n') : JSON.stringify(messages));
    const env = { GITHUB_OUTPUT: path.join(dir, 'out'), GITHUB_STEP_SUMMARY: path.join(dir, 'summary') };
    const code = await main(['check', file, '--run-url', RUN, '--fetch', 'main'], { env, git: gitStub(has).git });
    const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
    const out = { code, outputs: read(env.GITHUB_OUTPUT), summary: read(env.GITHUB_STEP_SUMMARY) };
    fs.rmSync(dir, { recursive: true, force: true });
    return out;
  };

  it('writes lost=true and the no-op reason line for a lost run (execution file and stream-json alike)', async () => {
    for (const lines of [false, true]) {
      const r = await run(LOST, false, lines);
      assert.equal(r.code, 0);
      assert.match(r.outputs, /^lost=true$/m);
      assert.match(r.summary, /^no-op reason: lost-to-background \(/m);
    }
  });

  it('writes lost=false and no summary line otherwise', async () => {
    for (const [messages, has] of [[LOST, true], [SHIPPED, true], [NOOP, false]]) {
      const r = await run(messages, has);
      assert.match(r.outputs, /^lost=false$/m);
      assert.equal(r.summary, '');
    }
  });

  it('never fails: a missing execution file is no result', async () => {
    const dir = tmp();
    const env = { GITHUB_OUTPUT: path.join(dir, 'out') };
    assert.equal(await main(['check', path.join(dir, 'missing.json'), '--run-url', RUN], { env, git: gitStub(false).git }), 0);
    assert.match(fs.readFileSync(env.GITHUB_OUTPUT, 'utf8'), /^lost=false$/m);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('the guard\'s background rule (the hook as Claude Code runs it)', () => {
  const hook = (mode, input, extra = {}) => {
    const env = { ...process.env, GITHUB_ACTIONS: '', NEXUS_ALLOW_BACKGROUND: '', NEXUS_HOOK_PROBE: '', CLAUDE_CODE_SESSION_ID: '', CLAUDE_PROJECT_DIR: '', ...extra };
    const r = spawnSync(process.execPath, [GUARD, mode], { input: JSON.stringify(input), encoding: 'utf8', env, cwd: os.tmpdir() });
    return { code: r.status, stderr: r.stderr };
  };
  const CI = { GITHUB_ACTIONS: 'true' };

  it('denies a background Bash call in CI and allows it off a runner or under the escape hatch', () => {
    const input = { tool_name: 'Bash', tool_input: { command: 'sleep 5', run_in_background: true } };
    const denied = hook('pre-bash', input, CI);
    assert.equal(denied.code, 2);
    assert.match(denied.stderr, /no background calls in CI/);
    assert.equal(hook('pre-bash', input).code, 0);
    assert.equal(hook('pre-bash', input, { ...CI, NEXUS_ALLOW_BACKGROUND: '1' }).code, 0);
    assert.equal(hook('pre-bash', { tool_name: 'Bash', tool_input: { command: 'sleep 5' } }, CI).code, 0);
  });

  it('denies a background subagent in CI, the Agent flag left out included', () => {
    assert.equal(hook('pre-agent', { tool_name: 'Agent', tool_input: { prompt: 'x', run_in_background: true } }, CI).code, 2);
    assert.equal(hook('pre-agent', { tool_name: 'Agent', tool_input: { prompt: 'x' } }, CI).code, 2);
    assert.equal(hook('pre-agent', { tool_name: 'Task', tool_input: { prompt: 'x', run_in_background: true } }, CI).code, 2);
    assert.equal(hook('pre-agent', { tool_name: 'Agent', tool_input: { prompt: 'x', run_in_background: false } }, CI).code, 0);
    assert.equal(hook('pre-agent', { tool_name: 'Agent', tool_input: { prompt: 'x', run_in_background: true } }).code, 0);
  });
});
