// The server's stale-while-revalidate (server/swr.mjs): a slow read is shared, served stale at once while one fresh
// read runs, waited for when asked fresh, and forgotten on a write so a change this server made always shows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSwr } from '../server/swr.mjs';
import { drawsAnswer } from '../src/data/order.js';

function clock() {
  let t = 1000;
  return { now: () => t, tick: (ms) => { t += ms; } };
}

function gate() {
  let open;
  const p = new Promise((r) => { open = r; });
  return { p, open };
}

test('two asks at once share one read', async () => {
  const c = clock();
  const swr = createSwr({ now: c.now });
  let reads = 0;
  const g = gate();
  const fn = async () => { reads++; await g.p; return reads; };
  const a = swr.get('k', fn);
  const b = swr.get('k', fn);
  g.open();
  assert.deepEqual(await a, { value: 1, stale: false });
  assert.deepEqual(await b, { value: 1, stale: false });
  assert.equal(reads, 1);
});

test('a young answer is served as it is; an older one stale at once, with one read behind it', async () => {
  const c = clock();
  const swr = createSwr({ now: c.now, freshMs: 1000 });
  let n = 0;
  const fn = async () => ++n;
  assert.deepEqual(await swr.get('k', fn), { value: 1, stale: false });
  c.tick(500);
  assert.deepEqual(await swr.get('k', fn), { value: 1, stale: false }, 'young: nothing re-read');
  assert.equal(n, 1);
  c.tick(2000);
  assert.deepEqual(await swr.get('k', fn), { value: 1, stale: true }, 'old: the last answer, marked stale');
  await new Promise((r) => setImmediate(r));
  assert.equal(n, 2, 'one read ran behind it');
  assert.deepEqual(await swr.get('k', fn), { value: 2, stale: false });
});

test('asking fresh waits for the read running behind a stale answer, and shares it', async () => {
  const c = clock();
  const swr = createSwr({ now: c.now, freshMs: 10 });
  let n = 0;
  const g = gate();
  await swr.get('k', async () => ++n);
  c.tick(100);
  const slow = async () => { await g.p; return ++n; };
  assert.equal((await swr.get('k', slow)).stale, true);
  const fresh = swr.get('k', slow, { fresh: true });
  g.open();
  assert.deepEqual(await fresh, { value: 2, stale: false });
  assert.equal(n, 2, 'the fresh ask joined the running read');
});

test('an answer past keepMs is not served stale', async () => {
  const c = clock();
  const swr = createSwr({ now: c.now, freshMs: 10, keepMs: 1000 });
  let n = 0;
  await swr.get('k', async () => ++n);
  c.tick(5000);
  assert.deepEqual(await swr.get('k', async () => ++n), { value: 2, stale: false });
});

test('forget drops what is kept, and a read running across it is not kept', async () => {
  const c = clock();
  const swr = createSwr({ now: c.now, freshMs: 1000 });
  const g = gate();
  const before = swr.get('k', async () => { await g.p; return 'before the write'; });
  swr.forget();
  g.open();
  assert.equal((await before).value, 'before the write', 'its own caller still gets it');
  assert.deepEqual(await swr.get('k', async () => 'after'), { value: 'after', stale: false });
  await swr.get('inbox', async () => 1);
  await swr.get('plan', async () => 1);
  swr.forget('inbox');
  assert.equal(swr.size, 2, 'k and plan stay');
});

test('a failed read keeps the last answer and is asked again', async () => {
  const c = clock();
  const swr = createSwr({ now: c.now, freshMs: 10 });
  await swr.get('k', async () => 'good');
  c.tick(100);
  assert.deepEqual(await swr.get('k', async () => { throw new Error('gh down'); }), { value: 'good', stale: true });
  await new Promise((r) => setImmediate(r));
  await assert.rejects(swr.get('k', async () => { throw new Error('still down'); }, { fresh: true }), /still down/);
  assert.deepEqual(await swr.get('k', async () => 'back'), { value: 'good', stale: true });
});

test('a polled screen draws the newest answer: never an older one over it, never a stale one while a fresh read runs', () => {
  assert.equal(drawsAnswer({ n: 1, drawn: 0, stale: false, fresh: false, freshing: 0 }), true, 'the first answer draws');
  assert.equal(drawsAnswer({ n: 2, drawn: 3, stale: false, fresh: true, freshing: 1 }), false, 'started before the one drawn');
  assert.equal(drawsAnswer({ n: 3, drawn: 2, stale: true, fresh: false, freshing: 1 }), false, 'a poll\'s stale answer while a fresh read is on its way');
  assert.equal(drawsAnswer({ n: 3, drawn: 2, stale: true, fresh: false, freshing: 0 }), true, 'stale with nothing fresh coming still draws');
  assert.equal(drawsAnswer({ n: 4, drawn: 3, stale: false, fresh: true, freshing: 1 }), true, 'the fresh read itself draws');
});
