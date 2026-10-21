import test from 'node:test';
import assert from 'node:assert/strict';
import { createHub, coalesce } from '../server/hub.mjs';

test('coalesce merges consecutive deltas of one item only', () => {
  const out = coalesce([
    { type: 'tx', data: { kind: 'delta', id: 'a', text: 'he' } },
    { type: 'tx', data: { kind: 'delta', id: 'a', text: 'llo' } },
    { type: 'beat', data: { k: 'agent', p: 'tool' } },
    { type: 'tx', data: { kind: 'delta', id: 'a', text: '!' } },
    { type: 'tx', data: { kind: 'delta', id: 'b', text: 'x' } },
  ]);
  assert.deepEqual(out.map((e) => e.data.text ?? e.data.k), ['hello', 'agent', '!', 'x']);
});

function fakeRes() {
  return { chunks: [], head: null, writeHead(s, h) { this.head = { s, h }; }, write(c) { this.chunks.push(c); }, end() {} };
}
function fakeReq() {
  const handlers = {};
  return { on(ev, fn) { handlers[ev] = fn; }, fire(ev) { handlers[ev]?.(); } };
}

test('hello carries the full replay; flushes are batched', async () => {
  const hub = createHub({ flushMs: 10, pingMs: 1e6 });
  hub.beat({ k: 'agent', p: 'start', id: 'main' });
  hub.tx({ kind: 'delta', id: 'm:0', agent: 'main', text: 'a' });
  hub.tx({ kind: 'delta', id: 'm:0', agent: 'main', text: 'b' });
  await new Promise((r) => setTimeout(r, 20));
  const req = fakeReq();
  const res = fakeRes();
  hub.attach(req, res);
  assert.equal(res.head.h['x-accel-buffering'], 'no');
  const hello = JSON.parse(res.chunks[0].split('data: ')[1]);
  assert.equal(hello.beats.length, 1);
  assert.deepEqual(hello.transcript, [{ kind: 'text', id: 'm:0', agent: 'main', text: 'ab' }]);
  hub.beat({ k: 'chunk', p: 'claim', id: '1.1' });
  hub.tx({ kind: 'delta', id: 'm:0', agent: 'main', text: 'c' });
  hub.tx({ kind: 'delta', id: 'm:0', agent: 'main', text: 'd' });
  assert.equal(res.chunks.length, 1, 'nothing written before the flush window');
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(res.chunks.length, 2, 'one write per flush');
  assert.match(res.chunks[1], /"text":"cd"/);
  req.fire('close');
  assert.equal(hub.clients, 0);
  hub.close();
});
