// The board's grip (spec 40 A12): a reorder within a spec lands as one pending file whose `## Edit` settle applies
// cleanly. The pure edit is checked on a spec with wrapped chunk lines and sub-bullets; the written file is checked
// against the kit's own plan scripts in a fixture repo: pending.mjs parses it, the settled view and plan-check read the
// new order, settle --dry-run takes it, a real settle writes the spec in that order, and GET /api/plan lists it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer } from '../server/server.mjs';
import { applyExact, chunkBlocks, listedIds, pendingName, pendingText, reorderEdits, settledPlan, writeReorder, clock } from '../server/reorder.mjs';
import { inListedOrder } from '../server/plan.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'templates', 'scripts');
const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');
const FAKE = { kind: 'fake', send() {}, async interrupt() {}, async stop() {}, async fresh() {} };
// Before any real clock, so the file the server writes with today's date settles after these.
const NOW = new Date(2020, 9, 21, 15, 30, 12);

const SPEC = [
  '# 07 — Search', '', '> Find anything.', '', '## Acceptance', '',
  '- **A1** results', '- **A2** an empty state', '- **A3** paging', '- **A4** export', '',
  '## Chunks', '', 'Measure: 4 open · 1 closed · next A6', '',
  '- [ ] **07.2** Results list · M · closes A1 · needs —',
  '  - Keep the page size at 20.',
  '- [ ] **07.3** Empty state for a query long enough to',
  '  wrap · S · closes A2 · needs 07.2',
  '- [ ] **07.4** Paging · S · closes A3 · needs —',
  '- [ ] **07.5** Export · S · closes A4 · needs —',
  '  - CSV first.',
  '',
].join('\n');

const README = [
  '# Plan', '', '## Lanes', '', '**Asap** (built before the table):', '', '- (none)', '',
  '**Held** (waits):', '', '- (none)', '', '## Specs', '',
  '| # | Initiative | Spec | Status | Progress |', '|---|---|---|---|---|',
  '| 07 | Search | [07-search.md](07-search.md) | planned | 4 left |', '',
].join('\n');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function fixtureRepo({ owner = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-reorder-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.name', 'Dave');
  git(dir, 'config', 'user.email', 'd@x');
  fs.mkdirSync(path.join(dir, 'scripts', 'plan'), { recursive: true });
  for (const f of fs.readdirSync(path.join(KIT, 'plan'))) fs.copyFileSync(path.join(KIT, 'plan', f), path.join(dir, 'scripts', 'plan', f));
  for (const f of ['plan-check.mjs', 'owner.mjs']) fs.copyFileSync(path.join(KIT, f), path.join(dir, 'scripts', f));
  fs.mkdirSync(path.join(dir, 'plan', 'pending'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'plan', 'README.md'), README);
  fs.writeFileSync(path.join(dir, 'plan', '07-search.md'), SPEC);
  fs.writeFileSync(path.join(dir, 'plan', 'ARCHIVE.md'), '# Archive\n\n- 2026-10-01 · 07.1 · search box · abc1234\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), '.owner\n.nexus/\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'seed');
  if (owner) fs.writeFileSync(path.join(dir, '.owner'), 'owner\n');
  return dir;
}

const run = (dir, args) => spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8' });
const imp = (dir, rel) => import(pathToFileURL(path.join(dir, rel)).href);

test('chunk blocks: a chunk line, its wrapped lines and its sub-bullets; only under ## Chunks', () => {
  const b = chunkBlocks(SPEC);
  assert.deepEqual(b.map((x) => x.id), ['07.2', '07.3', '07.4', '07.5']);
  assert.equal(b[0].text, '- [ ] **07.2** Results list · M · closes A1 · needs —\n  - Keep the page size at 20.');
  assert.equal(b[1].text, '- [ ] **07.3** Empty state for a query long enough to\n  wrap · S · closes A2 · needs 07.2');
  assert.deepEqual(listedIds('# x\n\n- [ ] **01.1** not a chunk list\n'), []);
});

test('reorder edits: a block out, then back after its new neighbour; the order they give is the one asked for', () => {
  const down = reorderEdits(SPEC, { id: '07.2', after: '07.4' });
  assert.deepEqual(down.before, ['07.2', '07.3', '07.4', '07.5']);
  assert.deepEqual(down.order, ['07.3', '07.4', '07.2', '07.5']);
  assert.equal(down.edits.length, 2);
  assert.equal(down.edits[0].new, '');
  const moved = applyExact(SPEC, down.edits);
  assert.deepEqual(listedIds(moved), down.order);
  // the sub-bullet travels with its chunk; nothing else in the file changes
  assert.match(moved, /\*\*07\.4\*\* Paging · S · closes A3 · needs —\n- \[ \] \*\*07\.2\*\* Results list · M · closes A1 · needs —\n {2}- Keep the page size at 20\.\n- \[ \] \*\*07\.5\*\*/);
  assert.equal(moved.length, SPEC.length);

  // to the top: before the first open chunk
  const top = reorderEdits(SPEC, { id: '07.5', after: null });
  assert.deepEqual(top.order, ['07.5', '07.2', '07.3', '07.4']);
  assert.deepEqual(listedIds(applyExact(SPEC, top.edits)), top.order);
  // the wrapped chunk moves whole
  assert.deepEqual(listedIds(applyExact(SPEC, reorderEdits(SPEC, { id: '07.3', after: '07.5' }).edits)), ['07.2', '07.4', '07.5', '07.3']);
});

test('reorder refuses: another spec, a closed chunk (moved or as the anchor), itself, a move that moves nothing', () => {
  const no = (body, closed, re) => assert.throws(() => reorderEdits(SPEC, body, closed), (e) => e.status >= 400 && re.test(e.message));
  no({ id: '07.2', after: '09.1' }, undefined, /stays within its spec/);
  no({ id: '07.9', after: null }, undefined, /not listed/);
  no({ id: '07.2', after: '07.2' }, undefined, /follow itself/);
  no({ id: '07.3', after: '07.2' }, undefined, /nothing moves/);
  no({ id: '07.2', after: null }, undefined, /nothing moves/);
  no({ id: 'x; rm', after: null }, undefined, /bad chunk id/);
  const closed = new Set(['07.4']);
  no({ id: '07.4', after: null }, closed, /closed: a closed chunk never moves/);
  no({ id: '07.2', after: '07.4' }, closed, /never an anchor/);
  // a closed chunk is skipped: after 07.3 is the end of the open list, with 07.4 between them in the file
  const r = reorderEdits(SPEC, { id: '07.2', after: '07.5' }, closed);
  assert.deepEqual(r.before, ['07.2', '07.3', '07.5']);
  assert.deepEqual(r.order, ['07.3', '07.5', '07.2']);
  assert.ok(!r.edits.some((e) => e.old.includes('**07.4**')), 'a closed chunk is never quoted');
});

test('the pending file\'s name sorts in time and never collides; its text is pending.mjs\'s format', async () => {
  const { date, stamp } = clock(NOW);
  assert.equal(date, '2020-10-21');
  assert.equal(stamp, '20201021-153012');
  assert.equal(pendingName('07', stamp), 'reorder-07-20201021-153012.md');
  assert.equal(pendingName('07', stamp, new Set(['reorder-07-20201021-153012.md'])), 'reorder-07-20201021-153012-2.md');
  assert.ok('reorder-07-20201021-153012.md' < 'reorder-07-20201021-153013.md');
  const { parsePending } = await import(pathToFileURL(path.join(KIT, 'plan', 'pending.mjs')).href);
  const { edits } = reorderEdits(SPEC, { id: '07.2', after: '07.4' });
  const p = parsePending(pendingText('plan/07-search.md', edits, date), 'reorder-07.md');
  assert.equal(p.close, null);
  assert.equal(p.date, '2020-10-21');
  assert.deepEqual(p.edits, edits.map((e) => ({ path: 'plan/07-search.md', ...e })));
});

test('writeReorder: the pending file settles cleanly, plan-check passes the settled view, the board lists it', async () => {
  const dir = fixtureRepo();
  try {
    assert.equal(run(dir, ['scripts/plan-check.mjs']).status, 0, 'the fixture plan passes before');
    const r = await writeReorder(dir, { id: '07.2', after: '07.4' }, { now: NOW });
    assert.equal(r.file, 'plan/pending/reorder-07-20201021-153012.md');
    assert.deepEqual(r.order, ['07.3', '07.4', '07.2', '07.5']);
    // the spec file itself is never written
    assert.equal(fs.readFileSync(path.join(dir, 'plan', '07-search.md'), 'utf8'), SPEC);

    // a second move reads the first through the settled view
    const r2 = await writeReorder(dir, { id: '07.5', after: null }, { now: new Date(NOW.getTime() + 1000) });
    assert.deepEqual(r2.order, ['07.5', '07.3', '07.4', '07.2']);

    // the repo's own settled view applies both with no problem, in the board's order
    const { settledView } = await imp(dir, 'scripts/plan/settled.mjs');
    const view = settledView(dir);
    assert.deepEqual(view.problems, []);
    assert.deepEqual(listedIds(view.read('plan/07-search.md')), ['07.5', '07.3', '07.4', '07.2']);
    // plan-check reads the settled view and passes
    const pc = run(dir, ['scripts/plan-check.mjs']);
    assert.equal(pc.status, 0, pc.stdout + pc.stderr);
    // settle's dry run would take both files
    const dry = run(dir, ['scripts/plan/settle.mjs', '--dry-run']);
    assert.equal(dry.status, 0, dry.stdout + dry.stderr);
    assert.match(dry.stdout, /would write plan\/07-search\.md/);
    assert.match(dry.stdout, /reorder-07-20201021-153012\.md/);
    assert.match(dry.stdout, /reorder-07-20201021-153013\.md/);
    assert.doesNotMatch(dry.stdout + dry.stderr, /skip/i);

    // GET /api/plan lists the spec's chunks in the settled order
    const app = await startServer({ repo: dir, provider: FAKE, pollRuns: false, dist: NO_DIST });
    try {
      const plan = await call(app, 'GET', '/api/plan');
      assert.equal(plan.status, 200);
      const s07 = plan.body.specs.find((s) => s.id === '07');
      assert.deepEqual(s07.chunks.filter((c) => c.state !== 'closed').map((c) => c.id), ['07.5', '07.3', '07.4', '07.2']);
    } finally {
      await app.close();
    }

    // the owner's settle applies both on main: the spec reads in the board's order, and the gate still passes
    const settle = run(dir, ['scripts/plan/settle.mjs', '--no-commit']);
    assert.equal(settle.status, 0, settle.stdout + settle.stderr);
    const after = fs.readFileSync(path.join(dir, 'plan', '07-search.md'), 'utf8').replace(/\r\n/g, '\n');
    assert.deepEqual(listedIds(after), ['07.5', '07.3', '07.4', '07.2']);
    assert.match(after, /\*\*07\.2\*\* Results list · M · closes A1 · needs —\n {2}- Keep the page size at 20\./);
    assert.match(after, /\*\*07\.3\*\* Empty state for a query long enough to\n {2}wrap · S · closes A2 · needs 07\.2/);
    assert.equal(after.length, SPEC.length);
    assert.deepEqual(fs.readdirSync(path.join(dir, 'plan', 'pending')).filter((n) => n.startsWith('reorder-')), []);
    assert.equal(run(dir, ['scripts/plan-check.mjs']).status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('writeReorder: a pending close is never moved, nor an anchor', async () => {
  const dir = fixtureRepo();
  try {
    fs.writeFileSync(path.join(dir, 'plan', 'pending', '07.4.md'), '---\nclose: 07.4\ndate: 2020-01-01\nsays: Paging works\n---\n');
    const plan = await settledPlan(dir);
    assert.deepEqual([...plan.closed], ['07.4']);
    await assert.rejects(writeReorder(dir, { id: '07.4', after: null }, { now: NOW }), /never moves/);
    await assert.rejects(writeReorder(dir, { id: '07.2', after: '07.4' }, { now: NOW }), /never an anchor/);
    const ok = await writeReorder(dir, { id: '07.2', after: '07.5' }, { now: NOW });
    assert.deepEqual(ok.order, ['07.3', '07.5', '07.2']);
    // the close settles first (its date is earlier): the reorder, which never quotes 07.4, still applies
    const pc = run(dir, ['scripts/plan-check.mjs']);
    assert.equal(pc.status, 0, pc.stdout + pc.stderr);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the board keeps an unlisted chunk\'s slot and fills the rest in the listed order', () => {
  const specs = [{ id: '07', chunks: [{ id: '07.1', state: 'closed' }, { id: '07.2' }, { id: '07.3' }, { id: '07.4' }] }, { id: '09', chunks: [{ id: '09.1' }] }];
  const out = inListedOrder(specs, new Map([['07', ['07.4', '07.2', '07.3']]]));
  assert.deepEqual(out[0].chunks.map((c) => c.id), ['07.1', '07.4', '07.2', '07.3']);
  assert.deepEqual(out[1].chunks.map((c) => c.id), ['09.1']);
});

function call(app, method, pathname, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const r = http.request({
      host: '127.0.0.1', port: app.port, path: pathname, method,
      headers: { host: `127.0.0.1:${app.port}`, origin: `http://127.0.0.1:${app.port}`, 'x-nexus-token': app.token, ...(data ? { 'content-type': 'application/json' } : null) },
    }, (res) => {
      let out = '';
      res.on('data', (d) => { out += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(out || '{}') }));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}
