import test from 'node:test';
import assert from 'node:assert/strict';
import { txFromMessage, newTxContext, friendlyError, summarize, lines, lineDiff, diffOf, clipInput, clipOutput } from '../server/normalize.mjs';

test('streamed text is not repeated by the full assistant message', () => {
  const ctx = newTxContext();
  const a = txFromMessage({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'message_start', message: { id: 'M1' } } }, ctx);
  const b = txFromMessage({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hi' } } }, ctx);
  const c = txFromMessage({ type: 'assistant', parent_tool_use_id: null, message: { id: 'M1', content: [{ type: 'text', text: 'hi' }, { type: 'tool_use', id: 'T', name: 'Bash', input: { command: 'ls' } }] } }, ctx);
  assert.deepEqual(a, []);
  assert.deepEqual(b, [{ kind: 'delta', id: 'M1:0', agent: 'main', text: 'hi' }]);
  assert.deepEqual(c, [{ kind: 'tool', id: 'T', agent: 'main', name: 'Bash', summary: 'ls' }]);
});

test('without partials the full text still shows', () => {
  const out = txFromMessage({ type: 'assistant', parent_tool_use_id: null, message: { id: 'M9', content: [{ type: 'text', text: 'whole' }] } }, newTxContext());
  assert.deepEqual(out, [{ kind: 'text', id: 'M9:0', agent: 'main', text: 'whole' }]);
});

test('subagent tools are attributed to their parent tool use', () => {
  const out = txFromMessage({ type: 'assistant', parent_tool_use_id: 'P', message: { id: 'M2', content: [{ type: 'text', text: 'inner' }, { type: 'tool_use', id: 'T2', name: 'Read', input: { file_path: 'x' } }] } }, newTxContext());
  assert.deepEqual(out, [{ kind: 'tool', id: 'T2', agent: 'P', name: 'Read', summary: 'x' }]);
});

test('auth failures read as the fix, not the code', () => {
  assert.match(friendlyError('authentication_failed'), /run `claude`.*\/login/i);
  const out = txFromMessage({ type: 'assistant', error: 'authentication_failed', parent_tool_use_id: null, message: { id: 'E', content: [] } }, newTxContext());
  assert.equal(out[0].kind, 'error');
});

test('result carries cost and session', () => {
  const [r] = txFromMessage({ type: 'result', is_error: false, total_cost_usd: 0.12, num_turns: 3, duration_ms: 900, session_id: 'S' }, newTxContext());
  assert.equal(r.cost, 0.12);
  assert.equal(r.session, 'S');
  assert.equal(summarize('X', { command: 'a'.repeat(300) }).length, 140);
});

// ---- times, durations and diffstats (41.7) -----------------------------------------

test('with a clock, items carry when they were read and a tool_result gives the call its duration', () => {
  let t = 1000;
  const ctx = newTxContext({ now: () => t });
  const [call] = txFromMessage({ type: 'assistant', parent_tool_use_id: null, message: { id: 'M1', content: [{ type: 'tool_use', id: 'T1', name: 'Bash', input: { command: 'npm test' } }] } }, ctx);
  assert.equal(call.at, 1000);
  t = 1900;
  const done = txFromMessage({ type: 'user', parent_tool_use_id: null, message: { content: [{ type: 'tool_result', tool_use_id: 'T1', content: 'ok' }] } }, ctx);
  assert.deepEqual(done, [{ kind: 'tool-output', id: 'T1', agent: 'main', text: 'ok', at: 1900 }, { kind: 'tool-done', id: 'T1', agent: 'main', ms: 900, ok: true, at: 1900 }]);
  // A result for a call this context never saw has no start: no duration is guessed.
  assert.deepEqual(txFromMessage({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'X' }] } }, ctx), []);
  // A failed call still ends, with ok false, after its tool-error.
  txFromMessage({ type: 'assistant', parent_tool_use_id: null, message: { id: 'M2', content: [{ type: 'tool_use', id: 'T2', name: 'Read', input: { file_path: 'a' } }] } }, ctx);
  t = 2000;
  const bad = txFromMessage({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'T2', is_error: true, content: 'nope' }] } }, ctx);
  assert.deepEqual(bad.map((x) => [x.kind, x.ok, x.ms]), [['tool-error', undefined, undefined], ['tool-done', false, 100]]);
});

test('without a clock nothing is stamped and no duration is made up', () => {
  const ctx = newTxContext();
  const [call] = txFromMessage({ type: 'assistant', parent_tool_use_id: null, message: { id: 'M', content: [{ type: 'tool_use', id: 'T', name: 'Bash', input: { command: 'ls' } }] } }, ctx);
  assert.equal('at' in call, false);
  assert.deepEqual(txFromMessage({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'T' }] } }, ctx), []);
});

test('an Edit and a MultiEdit count their lines from the call; a Write knows only what it adds', () => {
  assert.deepEqual(lines('a\nb\n'), ['a', 'b']);
  assert.deepEqual(lines(''), []);
  assert.deepEqual(lineDiff('a\nb\nc', 'a\nB\nc\nd'), { add: 2, del: 1 });
  assert.deepEqual(lineDiff('same', 'same'), { add: 0, del: 0 });
  assert.deepEqual(diffOf('Edit', { file_path: 'x', old_string: 'one\ntwo', new_string: 'one\n2\nthree' }), { add: 2, del: 1 });
  assert.equal(diffOf('Edit', { old_string: 'a', new_string: 'b', replace_all: true }), null);
  assert.deepEqual(diffOf('MultiEdit', { edits: [{ old_string: 'a', new_string: 'b' }, { old_string: '', new_string: 'x\ny' }] }), { add: 3, del: 1 });
  assert.deepEqual(diffOf('Write', { content: 'l1\nl2\nl3\n' }), { add: 3, del: null });
  assert.equal(diffOf('Bash', { command: 'ls' }), null);
  const [row] = txFromMessage({ type: 'assistant', parent_tool_use_id: null, message: { id: 'M', content: [{ type: 'tool_use', id: 'E', name: 'Edit', input: { file_path: 'src/a.ts', old_string: 'x', new_string: 'x\ny' } }] } }, newTxContext());
  assert.deepEqual(row.diff, { add: 1, del: 0 });
  // A big changed middle past the diff budget counts as replaced, never hangs.
  const big = Array.from({ length: 800 }, (_, i) => `l${i}`).join('\n');
  const other = Array.from({ length: 800 }, (_, i) => `m${i}`).join('\n');
  assert.deepEqual(lineDiff(big, other), { add: 800, del: 800 });
});

// ---- detail for the open tool row (the syntax pass) ------------------------------------------

test('a call carries its input when the summary does not say it all; strings clipped, the lot bounded', () => {
  const edit = { file_path: 'src/a.js', old_string: 'one\ntwo', new_string: 'one\n2' };
  const [row] = txFromMessage({ type: 'assistant', parent_tool_use_id: null, message: { id: 'M', content: [{ type: 'tool_use', id: 'E', name: 'Edit', input: edit }] } }, newTxContext());
  assert.deepEqual(row.input, edit, 'an Edit keeps its old and new text for the diff');
  const [heredoc] = txFromMessage({ type: 'assistant', parent_tool_use_id: null, message: { id: 'M', content: [{ type: 'tool_use', id: 'B', name: 'Bash', input: { command: 'cat <<EOF\nx\nEOF', description: 'heredoc' } }] } }, newTxContext());
  assert.equal(heredoc.input.command, 'cat <<EOF\nx\nEOF', 'the whole command, newlines kept (the summary folds them)');
  assert.equal(clipInput({ command: 'ls' }, 'ls'), null, 'a lone field the summary shows adds nothing');
  assert.equal(clipInput(null), null);
  const big = clipInput({ a: 'x'.repeat(9000), b: 'y'.repeat(9000), c: 'z' });
  assert.ok(big.a.length < 4100 && big.a.endsWith('(5000 more characters)'));
  assert.ok(JSON.stringify(big).length < 9000, 'the whole input stays bounded');
  assert.equal(typeof clipInput({ deep: { a: { b: { c: { d: { e: 1 } } } } } }).deep.a.b.c.d, 'string', 'nesting is cut a few levels down');
});

test('a successful result becomes a tool-output item, clipped to its head and tail', () => {
  const ok = txFromMessage({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'T', content: [{ type: 'text', text: 'line 1' }, { type: 'text', text: 'line 2' }] }] } }, newTxContext());
  assert.deepEqual(ok, [{ kind: 'tool-output', id: 'T', agent: 'main', text: 'line 1\nline 2' }]);
  assert.deepEqual(txFromMessage({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'T', content: '   ' }] } }, newTxContext()), [], 'nothing to show, no item');
  const long = Array.from({ length: 3000 }, (_, i) => `row ${i}`).join('\n');
  const out = clipOutput(long);
  assert.ok(out.length < 4200);
  assert.ok(out.startsWith('row 0\nrow 1'));
  assert.ok(out.endsWith('row 2999'));
  assert.match(out, /\.\.\. \(\d+ more lines\) \.\.\./);
  assert.equal(clipOutput('short'), 'short');
});
