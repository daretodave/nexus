import test from 'node:test';
import assert from 'node:assert/strict';
import { txFromMessage, newTxContext, friendlyError, summarize, lines, lineDiff, diffOf, clipInput, clipOutput, createToolStore, createToolPool, PREVIEW, DETAIL } from '../server/normalize.mjs';

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
  assert.deepEqual(done, [{ kind: 'tool-done', id: 'T1', agent: 'main', ms: 900, ok: true, at: 1900, text: 'ok' }], 'the result rides on the tool-done: two items per call');
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

test('a clipped input says which strings were cut, so an edit cut short is never diffed', () => {
  const edits = [0, 1, 2].map((k) => ({ old_string: `${k}`.repeat(3000), new_string: `${k}x`.repeat(1500) }));
  const cut = [];
  const shown = clipInput({ file_path: 'a.js', edits }, 'a.js', cut);
  assert.ok(cut.includes('edits/1/new_string') && cut.includes('edits/2/old_string'), 'the strings past the budget');
  assert.ok(!cut.includes('edits/0/old_string') && !cut.includes('file_path'), 'the ones that fit are not listed');
  assert.match(shown.edits[1].new_string, /more characters\)$/);
  const [row] = txFromMessage({ type: 'assistant', parent_tool_use_id: null, message: { id: 'M', content: [{ type: 'tool_use', id: 'E', name: 'MultiEdit', input: { file_path: 'a.js', edits } }] } }, newTxContext());
  const preview = [];
  clipInput({ file_path: 'a.js', edits }, 'a.js', preview, PREVIEW);
  assert.deepEqual(row.clipped, preview, 'the call carries the list for its preview');
  const [small] = txFromMessage({ type: 'assistant', parent_tool_use_id: null, message: { id: 'M', content: [{ type: 'tool_use', id: 'S', name: 'Edit', input: { file_path: 'a.js', old_string: 'a', new_string: 'b' } }] } }, newTxContext());
  assert.equal('clipped' in small, false, 'nothing cut, no list');
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

test('the transcript keeps a preview of each call; the tool store keeps the fuller call for the open row', () => {
  const tools = createToolStore();
  const ctx = newTxContext({ now: () => 1000, tools });
  const big = { file_path: 'src/a.js', old_string: 'o\n'.repeat(4000), new_string: 'n\n'.repeat(4000) };
  const [call] = txFromMessage({ type: 'assistant', parent_tool_use_id: null, message: { id: 'M', content: [{ type: 'tool_use', id: 'T1', name: 'Edit', input: big }] } }, ctx);
  assert.equal(call.more, true, 'the preview cut something: the row can ask for more');
  assert.ok(JSON.stringify(call).length < 2600, 'the transcript item stays small');
  assert.ok(call.clipped.includes('old_string'));
  const kept = tools.get('T1');
  assert.deepEqual(kept.input, big, 'the store has the whole edit');
  assert.equal(kept.clipped, null, 'nothing cut at the store size');
  const long = Array.from({ length: 2000 }, (_, i) => `row ${i}`).join('\n');
  const [done] = txFromMessage({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'T1', content: long }] } }, ctx);
  assert.equal(done.kind, 'tool-done');
  assert.equal(done.more, true);
  assert.ok(done.text.length < PREVIEW.out + 100, 'the result rides as a preview');
  assert.equal(tools.get('T1').output, long, 'the store has the whole result');
  assert.deepEqual(tools.get('T1').input, big, 'and still the call');

  const [small] = txFromMessage({ type: 'assistant', parent_tool_use_id: null, message: { id: 'M', content: [{ type: 'tool_use', id: 'T2', name: 'Edit', input: { file_path: 'a', old_string: 'a', new_string: 'b' } }] } }, ctx);
  assert.equal('more' in small, false, 'a call that fits has nothing more');
  assert.equal(tools.get('T2'), null, 'and is not stored twice');
  const [plain] = txFromMessage({ type: 'assistant', parent_tool_use_id: null, message: { id: 'M', content: [{ type: 'tool_use', id: 'T3', name: 'Edit', input: big }] } }, newTxContext());
  assert.equal('more' in plain, false, 'no store, nothing promised');
});

test('the tool store is bounded: past its size the oldest calls go first', () => {
  const tools = createToolStore({ maxChars: 3000 });
  for (let i = 0; i < 5; i += 1) tools.set(`T${i}`, { input: { s: 'x'.repeat(1000) } });
  assert.ok(tools.size <= 3000, `holds ${tools.size}`);
  assert.equal(tools.get('T0'), null, 'the oldest went');
  assert.ok(tools.get('T4'), 'the newest stays');
  tools.output('T4', 'y'.repeat(10));
  assert.equal(tools.get('T4').output, 'y'.repeat(10));
  const huge = createToolStore({ maxChars: 10 });
  huge.set('H', { input: { s: 'z'.repeat(100) } });
  assert.ok(huge.get('H'), 'a lone call bigger than the bound is still kept until the next comes');
  tools.clear();
  assert.equal(tools.count, 0);
  assert.ok(DETAIL.str > PREVIEW.str * 10);
});

test('every session\'s tool store shares a bound: past it the biggest store gives up its oldest call', () => {
  const pool = createToolPool({ maxChars: 5000 });
  const a = createToolStore({ maxChars: 4000, pool });
  const b = createToolStore({ maxChars: 4000, pool });
  for (let i = 0; i < 3; i += 1) a.set(`A${i}`, { input: { s: 'x'.repeat(1000) } });
  b.set('B0', { input: { s: 'y'.repeat(1000) } });
  b.set('B1', { input: { s: 'y'.repeat(1000) } });
  assert.ok(pool.size <= 5000, `the pool holds ${pool.size}`);
  assert.equal(a.get('A0'), null, 'the biggest store gave up its oldest');
  assert.ok(b.get('B1'), 'the call just kept stays');
  a.dispose();
  assert.equal(pool.size, b.size, 'a closed session gives its share back');
  assert.equal(pool.stores.size, 1);
});
