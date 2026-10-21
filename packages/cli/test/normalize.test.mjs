import test from 'node:test';
import assert from 'node:assert/strict';
import { txFromMessage, newTxContext, friendlyError, summarize } from '../server/normalize.mjs';

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
