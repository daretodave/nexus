import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseRunArgs, runCli, runOnce, headlessCanUseTool, summarize, UsageError } from '../server/headless.mjs';

const BIN = fileURLToPath(new URL('../bin/nexus.mjs', import.meta.url));

function sink() {
  return { text: '', write(c) { this.text += c; return true; } };
}

// A stand-in for the SDK's query(): records its call, reads the one
// queued user message, and yields the given messages. No model call.
function fakeQuery(messages, calls = []) {
  return ({ prompt, options }) => {
    const call = { options, prompts: [], closed: false };
    calls.push(call);
    return {
      async *[Symbol.asyncIterator]() {
        const it = prompt[Symbol.asyncIterator]();
        const first = await it.next();
        call.prompts.push(first.value.message.content);
        for (const m of messages) {
          if (m instanceof Error) throw m;
          yield m;
        }
      },
      close() { call.closed = true; },
    };
  };
}

const OK = { type: 'result', subtype: 'success', is_error: false, result: 'Hello there.', session_id: 's-1', num_turns: 1, duration_ms: 900, total_cost_usd: 0.0123, usage: { input_tokens: 10, output_tokens: 3 }, permission_denials: [] };

test('A9: run answers one prompt and prints one JSON object', async () => {
  const calls = [];
  const stdout = sink();
  const stderr = sink();
  const code = await runCli(['say hi'], { stdout, stderr, query: fakeQuery([{ type: 'system', subtype: 'init', session_id: 's-1' }, { type: 'assistant', session_id: 's-1' }, OK], calls), cwd: os.tmpdir() });
  assert.equal(code, 0);
  assert.equal(stderr.text, '');
  const lines = stdout.text.trim().split('\n');
  assert.equal(lines.length, 1, 'exactly one JSON line');
  const out = JSON.parse(lines[0]);
  assert.equal(out.result, 'Hello there.');
  assert.equal(out.session_id, 's-1');
  assert.equal(out.is_error, false);
  assert.equal(out.total_cost_usd, 0.0123);
  assert.deepEqual(out.usage, { input_tokens: 10, output_tokens: 3 });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].prompts, ['say hi']);
  assert.equal(calls[0].closed, true, 'the session is closed after the result');
});

test('the session is safe by default: no bypass, project settings, a deny-all approver', async () => {
  const calls = [];
  await runCli(['x'], { stdout: sink(), stderr: sink(), query: fakeQuery([OK], calls), cwd: os.tmpdir() });
  const o = calls[0].options;
  assert.equal(o.permissionMode, 'default');
  assert.deepEqual(o.settingSources, ['project']);
  assert.equal(o.canUseTool, headlessCanUseTool);
  assert.equal(o.env.CLAUDE_AGENT_SDK_CLIENT_APP, 'nexus-cli');
  assert.equal(o.cwd, os.tmpdir());
  assert.equal(o.model, undefined);
  const d = await headlessCanUseTool('Bash', { command: 'rm -rf /' });
  assert.equal(d.behavior, 'deny');
  const a = await headlessCanUseTool('AskUserQuestion', { questions: [] });
  assert.equal(a.behavior, 'deny');
  assert.match(a.message, /recommended option/);
});

test('an error result prints JSON and exits 1', async () => {
  const stdout = sink();
  const err = { type: 'result', subtype: 'error_max_turns', is_error: true, session_id: 's-2', errors: ['too many turns'], num_turns: 9 };
  const code = await runCli(['x'], { stdout, stderr: sink(), query: fakeQuery([err]), cwd: os.tmpdir() });
  assert.equal(code, 1);
  const out = JSON.parse(stdout.text);
  assert.equal(out.is_error, true);
  assert.equal(out.result, 'too many turns');
  assert.deepEqual(out.errors, ['too many turns']);
  assert.equal(out.session_id, 's-2');
});

test('a thrown session error and a missing result are errors too', async () => {
  const thrown = await runOnce({ prompt: 'x', cwd: '.', query: fakeQuery([{ type: 'system', session_id: 's-3' }, new Error('login expired')]) });
  assert.equal(thrown.is_error, true);
  assert.equal(thrown.result, 'login expired');
  assert.equal(thrown.session_id, 's-3');
  const none = await runOnce({ prompt: 'x', cwd: '.', query: fakeQuery([{ type: 'assistant', session_id: 's-4' }]) });
  assert.equal(none.is_error, true);
  assert.equal(none.session_id, 's-4');
  assert.equal(summarize({ type: 'result', subtype: 'error_during_execution', is_error: false }).is_error, true);
});

test('- reads the prompt from stdin', async () => {
  const calls = [];
  const code = await runCli(['-'], { stdin: Readable.from(['what is ', 'nexus?\n']), stdout: sink(), stderr: sink(), query: fakeQuery([OK], calls), cwd: os.tmpdir() });
  assert.equal(code, 0);
  assert.deepEqual(calls[0].prompts, ['what is nexus?']);
});

test('options: --cwd, --permission-mode, --model, --json', async () => {
  const calls = [];
  const code = await runCli(['--json', '--cwd', os.tmpdir(), '--permission-mode', 'plan', '--model', 'haiku', 'x'], { stdout: sink(), stderr: sink(), query: fakeQuery([OK], calls), cwd: '/' });
  assert.equal(code, 0);
  assert.equal(calls[0].options.cwd, os.tmpdir());
  assert.equal(calls[0].options.permissionMode, 'plan');
  assert.equal(calls[0].options.model, 'haiku');
});

test('usage errors exit 2 without starting a session', async () => {
  const cases = [
    [],
    ['a', 'b'],
    ['--permission-mode', 'bypassPermissions', 'x'],
    ['--permission-mode', 'yolo', 'x'],
    ['--cwd'],
    ['--frobnicate', 'x'],
    ['--cwd', '/no/such/dir/for/nexus', 'x'],
  ];
  for (const argv of cases) {
    const calls = [];
    const stderr = sink();
    const stdout = sink();
    const code = await runCli(argv, { stdout, stderr, query: fakeQuery([OK], calls), cwd: os.tmpdir() });
    assert.equal(code, 2, argv.join(' '));
    assert.equal(calls.length, 0, argv.join(' '));
    assert.equal(stdout.text, '', argv.join(' '));
    assert.match(stderr.text, /nexus run:/);
  }
  assert.throws(() => parseRunArgs(['--permission-mode', 'bypassPermissions', 'x']), UsageError);
  const empty = sink();
  assert.equal(await runCli(['-'], { stdin: Readable.from(['  \n']), stdout: sink(), stderr: empty, query: fakeQuery([OK]) }), 2);
  assert.match(empty.text, /empty/);
});

test('run --help prints the headless usage and exits 0 (bin, no session)', () => {
  const r = spawnSync(process.execPath, [BIN, 'run', '--help'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /nexus run: answer one prompt headless/);
  assert.match(r.stdout, /bypassPermissions is refused/);
});

test('the bin routes run usage errors without launching the GUI', () => {
  const r = spawnSync(process.execPath, [BIN, 'run'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /no prompt/);
});

test('the top-level --help still describes the GUI and mentions run', () => {
  const r = spawnSync(process.execPath, [BIN, '--help'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /open the GUI for the repo in this folder/);
  assert.match(r.stdout, /run "<prompt>"/);
});
