// GET /api/plan: the plan board's data is order.mjs --json and progress.mjs --json, joined, never a parse of its
// own. A fixture repo carries the kit's plan scripts (templates/scripts) and a small plan; the route's answer is
// checked against what the scripts print there. boardFrom's joins (pending chunks, marks, spec order) and the
// no-plan answer are checked on stubbed output. Spec 47 (A8): the repo's own order script first, else the CLI's
// bundled copy (run read-only on a plan-only fixture), and an unreadable plan says what happened, never zeros.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/server.mjs';
import { boardFrom, readPlan, specNumbers, planKitDir, planKitFiles, oneLine } from '../server/plan.mjs';
import { normalizePlan, lanes, specProgress, subLine, orderMeta } from '../src/screens/board/model.js';

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


// ---- which order script, and an unreadable plan (spec 47, A8) ----------------------------------------------------

/** A kit-shape plan and no plan scripts at all: the board runs the CLI's bundled copy. */
function planOnlyRepo() {
  const dir = fixtureRepo();
  fs.rmSync(path.join(dir, 'scripts'), { recursive: true, force: true });
  return dir;
}

/** Every file under .git, relative: the bundled run must leave the list (and the tree) as it found them. */
function gitFiles(dir) {
  const out = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) (e.isDirectory() ? walk : (x) => out.push(path.relative(dir, x)))(path.join(d, e.name)); };
  walk(path.join(dir, '.git'));
  return out.sort();
}

test('readPlan: a repo with no order.mjs runs the bundled copy, read-only, and says so', async () => {
  const dir = planOnlyRepo();
  const kit = planKitDir();
  assert.ok(kit, 'a bundled copy (kit/scripts) or the kit templates');
  const own = fixtureRepo();
  const want = node(own, ['scripts/plan/order.mjs', '--json']);
  const before = gitFiles(dir);
  const status = execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' });
  const board = await readPlan(dir);
  assert.equal(board.available, true);
  assert.deepEqual(board.sources.order, { script: "nexus's bundled copy", bundled: true });
  assert.deepEqual(board.sources.progress, { script: "nexus's bundled copy", bundled: true });
  assert.deepEqual(board.order, want.next.map((c) => c.id));
  assert.deepEqual(board.specs.map((s) => s.id), ['09', '07', '11']);
  assert.equal(board.specs.find((s) => s.id === '07').percent, 33);
  // nothing written: no ref fetched, no index, no file in the tree
  assert.deepEqual(gitFiles(dir), before);
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' }), status);
  // the bundled copy's closure carries no claims module and no vault: it can't fetch or write a key
  const files = planKitFiles(kit);
  assert.ok(files.includes('plan/order.mjs') && files.includes('plan/progress.mjs') && files.includes('plan-check.mjs'));
  assert.ok(!files.some((f) => /claims|secrets-vault/.test(f)), files.join(', '));
  // and the board says which order script it used
  assert.equal(orderMeta(normalizePlan(board)), "order: nexus's bundled copy");
});

test('readPlan: the bundled copy runs with --no-vault and without a leaked GIT_*', async () => {
  const dir = planOnlyRepo();
  const kit = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-plan-kit-'));
  fs.mkdirSync(path.join(kit, 'plan'));
  for (const f of ['order.mjs', 'progress.mjs']) fs.writeFileSync(path.join(kit, 'plan', f), '');
  const calls = [];
  const exec = async (cmd, args, opts) => {
    calls.push({ args, env: opts.env, cwd: opts.cwd });
    return { ok: true, stdout: args[0].endsWith('order.mjs') ? '{"next":[],"inFlight":[],"blocked":[]}' : '{"specs":[]}' };
  };
  const was = process.env.GIT_DIR;
  process.env.GIT_DIR = path.join(os.tmpdir(), 'not-this-repo');
  try {
    const board = await readPlan(dir, { exec, kitDir: kit });
    assert.equal(board.available, true);
  } finally {
    if (was === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = was;
  }
  const order = calls.find((c) => c.args[0].endsWith('order.mjs'));
  assert.deepEqual(order.args, [path.join(kit, 'plan', 'order.mjs'), '--json', '--no-vault']);
  assert.equal(order.cwd, dir);
  assert.equal(order.env.GIT_DIR, undefined);
  assert.equal(order.env.GIT_OPTIONAL_LOCKS, '0');
});

test("readPlan: the repo's own order script is preferred, wherever it keeps it", async () => {
  const dir = planOnlyRepo();
  fs.mkdirSync(path.join(dir, 'scripts', 'dev'), { recursive: true });
  for (const f of ['order.mjs', 'progress.mjs']) fs.writeFileSync(path.join(dir, 'scripts', 'dev', f), '');
  const calls = [];
  const exec = async (cmd, args) => {
    calls.push(args);
    // a mature repo's own shape: rows whose # is a dash still come out as a plan
    return { ok: true, stdout: args[0].endsWith('order.mjs') ? JSON.stringify({ next: [{ id: '09.2', spec: '09', lane: 'asap', eta: 1 }], inFlight: [], blocked: [] }) : JSON.stringify({ specs: [{ spec: '09', title: 'Billing', chunks: [{ id: '09.2', title: 'Invoices', size: 'S', state: 'open' }] }] }) };
  };
  const board = await readPlan(dir, { exec, kitDir: planKitDir() });
  assert.deepEqual(calls.find((a) => a[0].endsWith('order.mjs')), ['scripts/dev/order.mjs', '--json']);
  assert.deepEqual(board.sources.order, { script: 'scripts/dev/order.mjs', bundled: false });
  assert.deepEqual(board.order, ['09.2']);
  assert.equal(orderMeta(normalizePlan(board)), 'order: scripts/dev/order.mjs');
  // the kit's own home is looked at first
  const fx = fixtureRepo();
  const kitHome = await readPlan(fx, { exec, kitDir: null });
  assert.equal(kitHome.sources.order.script, 'scripts/plan/order.mjs');
});

test('readPlan: no plan is an answer; a failing, non-JSON or shapeless script is unreadable, never zeros', async () => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-plan-bare-'));
  const none = await readPlan(bare, { exec: () => assert.fail('no plan to read') });
  assert.equal(none.available, false);
  assert.equal(none.unreadable, undefined);
  assert.deepEqual(none.specs, []);
  assert.equal(subLine('bare', normalizePlan(none), false), 'bare · no plan yet · claims expire after 24h unless held');

  const dir = fixtureRepo();
  assert.deepEqual(specNumbers(dir), ['07', '09', '11']);
  const calls = [];
  const answer = (order, progress = { ok: true, stdout: '{"specs":[]}' }) => async (cmd, args) => {
    calls.push(args);
    return args[0].endsWith('order.mjs') ? order : progress;
  };
  // non-zero exit: one line of what it printed, which script ran, the docs
  const failed = await readPlan(dir, { exec: answer({ ok: false, code: 1, stdout: '', stderr: 'at line 3\nError: plan/README.md: no specs table\n    at x (y.mjs:1:1)\n' }), mark: ['07.2', 'nope; rm', '7'] });
  assert.equal(failed.available, false);
  assert.equal(failed.unreadable, true);
  assert.equal(failed.error, 'scripts/plan/order.mjs failed: Error: plan/README.md: no specs table');
  assert.equal(failed.script, 'scripts/plan/order.mjs');
  assert.match(failed.docs, /^https:\/\//);
  assert.deepEqual(failed.specs, []);
  assert.deepEqual(calls.find((a) => a[0].endsWith('order.mjs')), ['scripts/plan/order.mjs', '--json', '--mark', '07.2']);
  assert.deepEqual(calls.find((a) => a[0].endsWith('progress.mjs')), ['scripts/plan/progress.mjs', '07', '09', '11', '--json']);
  // the header says so, not "0 specs · 0 chunks"
  const plan = normalizePlan(failed);
  assert.equal(subLine('tide', plan, false), 'tide · plan unreadable · claims expire after 24h unless held');
  assert.equal(subLine('tide', plan, true), 'tide · plan unreadable · you own this checkout');
  assert.equal(oneLine({ code: 2, stderr: '', stdout: '' }), 'exited 2');

  const badJson = await readPlan(dir, { exec: answer({ ok: true, stdout: 'next up (as /next would pick)\n  1 09.2' }) });
  assert.equal(badJson.unreadable, true);
  assert.equal(badJson.error, "scripts/plan/order.mjs printed what isn't JSON: next up (as /next would pick)");

  const shapeless = await readPlan(dir, { exec: answer({ ok: true, stdout: '{"chunks":[]}' }) });
  assert.equal(shapeless.unreadable, true);
  assert.match(shapeless.error, /^scripts\/plan\/order\.mjs printed JSON that isn't a plan/);

  const progressBad = await readPlan(dir, { exec: answer({ ok: true, stdout: '{"next":[]}' }, { ok: false, code: 1, stderr: 'boom' }) });
  assert.equal(progressBad.unreadable, true);
  assert.equal(progressBad.script, 'scripts/plan/progress.mjs');
  assert.equal(progressBad.error, 'scripts/plan/progress.mjs failed: boom');

  // no script of its own and no bundled copy to run
  const lone = await readPlan(planOnlyRepo(), { exec: () => assert.fail('nothing to run'), kitDir: null });
  assert.equal(lone.unreadable, true);
  assert.match(lone.error, /^No order\.mjs and progress\.mjs to run/);

  // a plan that read fine with no specs keeps the empty plan, counted
  const empty = await readPlan(dir, { exec: answer({ ok: true, stdout: '{"next":[],"inFlight":[],"blocked":[]}' }) });
  assert.equal(empty.available, true);
  assert.equal(subLine('tide', normalizePlan(empty), false), 'tide · 0 specs · 0 chunks · 0 closed · claims expire after 24h unless held');
});

test('GET /api/plan: an unreadable plan answers 200 with what happened', async () => {
  const dir = fixtureRepo();
  fs.writeFileSync(path.join(dir, 'scripts', 'plan', 'order.mjs'), "console.error('Error: this plan has no table'); process.exit(3);\n");
  const app = await startServer({ repo: dir, provider: { kind: 'fake', send() {}, async interrupt() {}, async stop() {}, async fresh() {} }, pollRuns: false, dist: NO_DIST });
  try {
    const { status, body } = await get(app, '/api/plan');
    assert.equal(status, 200);
    assert.equal(body.unreadable, true);
    assert.equal(body.error, 'scripts/plan/order.mjs failed: Error: this plan has no table');
    assert.equal(body.script, 'scripts/plan/order.mjs');
  } finally {
    await app.close();
  }
});
