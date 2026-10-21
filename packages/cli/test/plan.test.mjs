// GET /api/plan: the plan board's data is order.mjs --json and progress.mjs --json, joined, never a parse of its
// own. A fixture repo carries the kit's plan scripts (templates/scripts) and a small plan; the route's answer is
// checked against what the scripts print there. boardFrom's joins (pending chunks, marks, spec order) and the
// no-scripts answer are checked on stubbed output.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/server.mjs';
import { boardFrom, readPlan, specNumbers } from '../server/plan.mjs';
import { normalizePlan, lanes, specProgress } from '../src/screens/board/model.js';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'templates', 'scripts');
const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');

const README = [
  '# Plan', '', '## Lanes', '', '**Asap** (built before the table):', '', '- 09.2', '',
  '**Held** (waits):', '', '- (none)', '', '## Specs', '',
  '| # | Initiative | Spec | Status | Progress |', '|---|---|---|---|---|',
  '| 07 | Search | [07-search.md](07-search.md) | planned | 2 left |',
  '| 09 | Billing | [09-billing.md](09-billing.md) | planned · priority 1 | 2 left |',
  '| 11 | Export | [11-export.md](11-export.md) | planned | not chunked |', '',
].join('\n');
const spec = (title, chunks) => [`# ${title}`, '', '## Acceptance', '', '- **A1** it works', '- **A2** it is fast', '', '## Chunks', '', ...chunks, ''].join('\n');

function fixtureRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-plan-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  fs.mkdirSync(path.join(dir, 'scripts', 'plan'), { recursive: true });
  for (const f of fs.readdirSync(path.join(KIT, 'plan'))) fs.copyFileSync(path.join(KIT, 'plan', f), path.join(dir, 'scripts', 'plan', f));
  for (const f of ['plan-check.mjs', 'owner.mjs']) fs.copyFileSync(path.join(KIT, f), path.join(dir, 'scripts', f));
  fs.mkdirSync(path.join(dir, 'plan'));
  fs.writeFileSync(path.join(dir, 'plan', 'README.md'), README);
  fs.writeFileSync(path.join(dir, 'plan', '07-search.md'), spec('Search', [
    'Measure: 2 open · 1 closed · next A3', '',
    '- [ ] **07.2** Results list · M · closes A1 · needs —',
    '- [ ] **07.3** Empty state · S · closes A2 · needs 09.1',
  ]));
  fs.writeFileSync(path.join(dir, 'plan', '09-billing.md'), spec('Billing', [
    'Measure: 2 open · 0 closed · next A3', '',
    '- [ ] **09.1** Plans · L · closes A1 · needs —',
    '- [ ] **09.2** Invoices · S · closes A2 · needs —',
  ]));
  fs.writeFileSync(path.join(dir, 'plan', '11-export.md'), ['# Export', '', '## Acceptance', '', '- **A1** a CSV', '', '## Chunks', '', 'Not chunked yet.', ''].join('\n'));
  fs.writeFileSync(path.join(dir, 'plan', 'ARCHIVE.md'), '# Archive\n\n- 2026-10-01 · 07.1 · search box · abc1234\n');
  return dir;
}

const node = (dir, args) => JSON.parse(execFileSync('node', args, { cwd: dir, encoding: 'utf8' }));

function get(app, pathname) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: app.port, path: pathname, headers: { host: `127.0.0.1:${app.port}`, 'x-nexus-token': app.token } }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    r.on('error', reject);
    r.end();
  });
}

test('GET /api/plan is order.mjs and progress.mjs, joined', async () => {
  const dir = fixtureRepo();
  const order = node(dir, ['scripts/plan/order.mjs', '--json', '--mark', '07.3']);
  const progress = node(dir, ['scripts/plan/progress.mjs', '07', '09', '11', '--json']);
  const app = await startServer({ repo: dir, provider: { kind: 'fake', send() {}, async interrupt() {}, async stop() {}, async fresh() {} }, pollRuns: false, dist: NO_DIST });
  try {
    const { status, body } = await get(app, '/api/plan?mark=07.3');
    assert.equal(status, 200);
    assert.equal(body.available, true);
    // the all-chunks view: order.mjs's next-up list, in its order, lanes and all
    assert.deepEqual(order.next.map((c) => c.id), ['09.2', '09.1', '07.2', '07.3']);
    assert.deepEqual(body.order, order.next.map((c) => c.id));
    assert.deepEqual(body.next.map((c) => [c.id, c.lane, c.eta]), order.next.map((c) => [c.id, c.lane, c.eta]));
    assert.deepEqual(body.asap, ['09.2']);
    assert.deepEqual(body.unchunked, order.unchunked);
    // the spec view: progress.mjs's chunks, states and % done, spec for spec
    for (const s of progress.specs) {
      const b = body.specs.find((x) => x.id === s.spec);
      assert.ok(b, `spec ${s.spec} on the board`);
      assert.equal(b.percent, s.percent);
      assert.deepEqual(b.counts, s.counts);
      assert.equal(b.unchunked, s.status === 'unchunked');
      assert.deepEqual(b.chunks.map((c) => [c.id, c.state === 'ready' ? 'open' : c.state]), s.chunks.map((c) => [c.id, c.state]));
    }
    // specs read in pick order: 09 first (the Asap chunk), then 07, then 11 waiting to be chunked
    assert.deepEqual(body.specs.map((s) => s.id), ['09', '07', '11']);
    assert.equal(body.specs.find((s) => s.id === '07').percent, 33);
    // just plotted: order.mjs --mark, echoed per chunk
    assert.deepEqual(body.mark, ['07.3']);
    assert.deepEqual(body.specs.flatMap((s) => s.chunks).filter((c) => c.plotted).map((c) => c.id), ['07.3']);

    // the board's own model reads it the same way
    const plan = normalizePlan(body);
    assert.deepEqual(plan.order, ['09.2', '09.1', '07.2', '07.3']);
    const next = lanes(plan, plan.chunks, 'next', {}, {});
    assert.deepEqual(next.map((l) => [l.title, l.rows.map(([c]) => c.id)]), [['asap', ['09.2']], ['Next up', ['09.1', '07.2', '07.3']]]);
    const s07 = plan.specs.find((s) => s.id === '07');
    assert.deepEqual(specProgress(plan.chunks.filter((c) => c.spec === '07'), s07), { total: 3, done: 1, pct: 33, text: '1 of 3' });
    assert.equal(plan.specs.find((s) => s.id === '11').unchunked, true);
  } finally {
    await app.close();
  }
});

test('boardFrom: a pending chunk shows as just plotted; blocked and held keep why', () => {
  const order = {
    inFlight: [{ id: '05.1', title: 'Taken', size: 'M', spec: '05', who: 'sam' }],
    next: [{ id: '05.2', title: 'Two', size: 'S', spec: '05', lane: 'table', eta: 1 }, { id: '06.1', title: 'Fresh', size: 'M', lane: 'table', eta: 3.5 }],
    blocked: [{ id: '04.1', title: 'Wait', size: 'S', spec: '04', why: 'held' }],
    unchunked: ['08'],
    mark: [],
  };
  const progress = {
    at: 'x', hours: { S: 1 },
    specs: [
      { spec: '04', title: 'Four', file: '04-four.md', status: 'chunked', counts: { closed: 0, claimed: 0, open: 1, total: 1 }, percent: 0, chunks: [{ id: '04.1', title: 'Wait', size: 'S', state: 'open' }] },
      { spec: '05', title: 'Five', file: '05-five.md', status: 'chunked', counts: { closed: 1, claimed: 1, open: 1, total: 3 }, percent: 33, chunks: [
        { id: '05.0', title: 'Done', size: null, state: 'closed', closedOn: '2026-10-01' },
        { id: '05.1', title: 'Taken', size: 'M', state: 'claimed', claim: { who: 'sam' } },
        { id: '05.2', title: 'Two', size: 'S', state: 'open' },
      ] },
      { spec: '08', title: 'Eight', file: '08-eight.md', status: 'unchunked', counts: { closed: 0, claimed: 0, open: 0, total: 0 }, percent: 0, chunks: [] },
    ],
  };
  const b = boardFrom(order, progress, { repo: 'tide' });
  assert.deepEqual(b.specs.map((s) => s.id), ['05', '06', '08', '04']);
  const fresh = b.specs.find((s) => s.id === '06').chunks[0];
  assert.deepEqual([fresh.id, fresh.plotted, fresh.state], ['06.1', 'main', 'ready']);
  assert.equal(b.specs.find((s) => s.id === '05').chunks[1].state, 'claimed');
  assert.equal(b.specs.find((s) => s.id === '04').chunks[0].why, 'held');
  assert.deepEqual(b.held, ['04.1']);
  assert.deepEqual(b.order, ['05.2', '06.1', '05.1', '04.1']);
  assert.deepEqual(b.inFlight, [{ id: '05.1', who: 'sam' }]);
  assert.equal(b.specs.find((s) => s.id === '08').unchunked, true);
  const plan = normalizePlan(b);
  assert.equal(plan.chunks.find((c) => c.id === '04.1').laneHeld, true);
  assert.equal(plan.chunks.find((c) => c.id === '05.0').state, 'closed');
});

test('readPlan: no plan scripts is an answer, not an error; a failing script is a 502', async () => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-plan-bare-'));
  const none = await readPlan(bare, { exec: () => assert.fail('no script to run') });
  assert.equal(none.available, false);
  assert.deepEqual(none.specs, []);

  const dir = fixtureRepo();
  assert.deepEqual(specNumbers(dir), ['07', '09', '11']);
  const calls = [];
  const exec = async (cmd, args) => {
    calls.push(args);
    return args[0].endsWith('order.mjs') ? { ok: false, stdout: '', stderr: 'boom' } : { ok: true, stdout: '{"specs":[]}' };
  };
  await assert.rejects(readPlan(dir, { exec, mark: ['07.2', 'nope; rm', '7'] }), (e) => e.status === 502 && /order\.mjs failed: boom/.test(e.message));
  assert.deepEqual(calls.find((a) => a[0].endsWith('order.mjs')), ['scripts/plan/order.mjs', '--json', '--mark', '07.2']);
  assert.deepEqual(calls.find((a) => a[0].endsWith('progress.mjs')), ['scripts/plan/progress.mjs', '07', '09', '11', '--json']);
});
