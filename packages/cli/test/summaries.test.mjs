// GET /api/summaries: cached AI one-liners for undescribed chunks (40.4, A4).
// The SDK's query() is stubbed throughout: no test calls a model. Checked:
// what counts as undescribed, a cache miss calls once and a hit never, an
// edit to the chunk or its spec's Design asks again for that chunk only,
// the Settings toggle off never calls, a slow call times out into an
// answer, and the plan files are never written.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/server.mjs';
import {
  undescribed, chunkBlock, section, acceptanceFor, collect, createSummaries, parseReply, buildPrompt, clean,
  readCache, CACHE_FILE, SUMMARY_MODEL,
} from '../server/summaries.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'templates', 'scripts');
const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');

const SPEC = (design = 'Results come back ranked by recency.') => [
  '# 07 — Search', '', '> Find anything.', '', '---', '',
  '## Design', '', design, '',
  '## Acceptance', '', '- **A1** a results list', '- **A2** an empty state that says why', '',
  '## Chunks', '', 'Measure: 3 open · 0 closed · next A3', '',
  '- [ ] **07.1** Results list · M · closes A1 · needs —',
  '- [ ] **07.2** · S · closes A2 · needs —',
  '  - shows when nothing matches; links to the filters',
  '- [ ] **07.3** TBD · S · closes A1 · needs —',
  '',
].join('\n');

/** A repo with one spec; readPlan stubbed to what progress.mjs would read. */
function repoWith(spec = SPEC()) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-sum-'));
  fs.mkdirSync(path.join(dir, 'plan'));
  fs.writeFileSync(path.join(dir, 'plan', '07-search.md'), spec);
  return dir;
}
const PLAN = {
  available: true,
  specs: [{
    id: '07', title: 'Search', file: '07-search.md',
    chunks: [
      { id: '07.1', title: 'Results list', state: 'ready' },
      { id: '07.2', title: '· S · closes A2 · needs —', state: 'ready' },
      { id: '07.3', title: 'TBD', state: 'claimed' },
      { id: '07.0', title: '', state: 'closed' },
    ],
  }],
};
const readPlan = async () => PLAN;

/** A stub of the SDK's query(): records each call, answers from `reply(prompt)`. */
function stubQuery(reply = (p) => Object.fromEntries([...p.matchAll(/^## Chunk (\S+)/gm)].map((m) => [m[1], `line for ${m[1]}`])), { delay = 0 } = {}) {
  const calls = [];
  const fn = ({ prompt, options }) => {
    calls.push({ prompt, options });
    return {
      async *[Symbol.asyncIterator]() {
        if (delay) await new Promise((r) => setTimeout(r, delay));
        yield { type: 'result', subtype: 'success', is_error: false, result: `Here:\n${JSON.stringify(reply(prompt))}`, total_cost_usd: 0.001 };
      },
      close() {},
    };
  };
  fn.calls = calls;
  return fn;
}

const snapshot = (dir) => {
  const p = path.join(dir, 'plan');
  return Object.fromEntries(fs.readdirSync(p).map((f) => [f, [fs.readFileSync(path.join(p, f), 'utf8'), fs.statSync(path.join(p, f)).mtimeMs]]));
};

test('undescribed: no words of its own', () => {
  for (const t of ['', '   ', '· S · closes A2 · needs —', '...', '—', 'TBD', 'todo', 'WIP.', '?', '**TK**']) assert.equal(undescribed(t), true, JSON.stringify(t));
  for (const t of ['Results list', 'CSV export', 'A11 local settings', 'Fix it']) assert.equal(undescribed(t), false, t);
});

test('the chunk block, the Design section and the acceptance it closes', () => {
  const s = SPEC();
  assert.equal(chunkBlock(s, '07.2'), '- [ ] **07.2** · S · closes A2 · needs —\n  - shows when nothing matches; links to the filters');
  assert.equal(chunkBlock(s, '07.9'), null);
  assert.equal(section(s, 'Design'), 'Results come back ranked by recency.');
  assert.deepEqual(acceptanceFor(s, chunkBlock(s, '07.2')), ['- **A2** an empty state that says why']);
  const items = collect(repoWith(), PLAN);
  assert.deepEqual(items.map((i) => i.id), ['07.2', '07.3'], 'described and closed chunks are left alone');
  const prompt = buildPrompt(items);
  assert.match(prompt, /## Design\nResults come back ranked by recency\./);
  assert.equal(prompt.match(/## Design/g).length, 1, 'the Design goes in once per spec');
});

test('parseReply and clean keep one tidy line per asked id', () => {
  assert.deepEqual(parseReply('sure: {"07.2": "Say why when a search finds nothing.", "99.1": "x"}', ['07.2', '07.3']), { '07.2': 'Say why when a search finds nothing' });
  assert.deepEqual(parseReply('no json here', ['07.2']), {});
  assert.equal(clean(`"${'word '.repeat(40)}"`).length, 90);
});

test('a miss calls the model once, batched; a hit never calls', async () => {
  const dir = repoWith();
  const query = stubQuery();
  const s = createSummaries({ repo: dir, readPlan, query });
  const first = await s.get();
  assert.deepEqual(first, { '07.2': { text: 'line for 07.2', ai: true }, '07.3': { text: 'line for 07.3', ai: true } });
  assert.equal(query.calls.length, 1, 'one call for every undescribed chunk');
  const o = query.calls[0].options;
  assert.equal(o.model, SUMMARY_MODEL);
  assert.equal(SUMMARY_MODEL, 'claude-haiku-5-5');
  assert.deepEqual(o.tools, [], 'no tools');
  assert.equal(o.maxTurns, 1);
  assert.deepEqual(o.settingSources, []);
  assert.equal(o.persistSession, false);
  assert.ok(fs.existsSync(path.join(dir, CACHE_FILE)));
  assert.match(fs.readFileSync(path.join(dir, '.nexus', 'cache', '.gitignore'), 'utf8'), /^\*$/m);

  const again = await s.get();
  assert.deepEqual(again, first);
  assert.equal(query.calls.length, 1, 'cache hit');
  // a fresh engine (a server restart) reads the same cache
  const query2 = stubQuery();
  assert.deepEqual(await createSummaries({ repo: dir, readPlan, query: query2 }).get(), first);
  assert.equal(query2.calls.length, 0);
});

test('editing a chunk or its spec Design asks again, for the changed chunk only', async () => {
  const dir = repoWith();
  const query = stubQuery();
  const s = createSummaries({ repo: dir, readPlan, query });
  await s.get();
  // a sub-bullet added to 07.2: only 07.2 is asked
  fs.writeFileSync(path.join(dir, 'plan', '07-search.md'), SPEC().replace('links to the filters', 'links to the filters and clears them'));
  await s.get();
  assert.equal(query.calls.length, 2);
  assert.deepEqual([...query.calls[1].prompt.matchAll(/^## Chunk (\S+)/gm)].map((m) => m[1]), ['07.2']);
  // the Design changes: every undescribed chunk on that spec is asked
  fs.writeFileSync(path.join(dir, 'plan', '07-search.md'), SPEC('Results come back ranked by score.').replace('links to the filters', 'links to the filters and clears them'));
  await s.get();
  assert.equal(query.calls.length, 3);
  assert.deepEqual([...query.calls[2].prompt.matchAll(/^## Chunk (\S+)/gm)].map((m) => m[1]), ['07.2', '07.3']);
  // stale keys are pruned
  assert.equal(Object.keys(readCache(dir).entries).length, 2);
});

test('toggled off: no plan read, no model call, an empty answer', async () => {
  const dir = repoWith();
  const query = stubQuery();
  let reads = 0;
  const s = createSummaries({ repo: dir, readPlan: async () => { reads += 1; return PLAN; }, query, enabled: () => false });
  assert.deepEqual(await s.get(), {});
  assert.equal(query.calls.length, 0);
  assert.equal(reads, 0);
  assert.equal(fs.existsSync(path.join(dir, '.nexus')), false);
});

test('a slow call times out into the cached answer, then lands for the next load', async () => {
  const dir = repoWith();
  const query = stubQuery(undefined, { delay: 150 });
  const s = createSummaries({ repo: dir, readPlan, query, timeoutMs: 20 });
  assert.deepEqual(await s.get(), {}, 'the board renders without summaries');
  await new Promise((r) => setTimeout(r, 250));
  assert.equal(Object.keys(await s.get()).length, 2);
  assert.equal(query.calls.length, 1, 'the in-flight call is shared, never repeated');
});

test('a failed call answers what the cache holds and is not retried at once', async () => {
  const dir = repoWith();
  const calls = [];
  const query = (a) => {
    calls.push(a);
    return { async *[Symbol.asyncIterator]() { yield { type: 'result', subtype: 'error_during_execution', is_error: true, result: 'boom' }; }, close() {} };
  };
  const s = createSummaries({ repo: dir, readPlan, query });
  assert.deepEqual(await s.get(), {});
  assert.deepEqual(await s.get(), {});
  assert.equal(calls.length, 1);
});

// ---- through the server, on the kit's real plan scripts --------------------

function fixtureRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-sum-srv-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  fs.mkdirSync(path.join(dir, 'scripts', 'plan'), { recursive: true });
  for (const f of fs.readdirSync(path.join(KIT, 'plan'))) fs.copyFileSync(path.join(KIT, 'plan', f), path.join(dir, 'scripts', 'plan', f));
  for (const f of ['plan-check.mjs', 'owner.mjs']) fs.copyFileSync(path.join(KIT, f), path.join(dir, 'scripts', f));
  fs.mkdirSync(path.join(dir, 'plan'));
  fs.writeFileSync(path.join(dir, 'plan', 'README.md'), [
    '# Plan', '', '## Lanes', '', '**Asap** (built before the table):', '', '- (none)', '',
    '**Held** (waits):', '', '- (none)', '', '## Specs', '',
    '| # | Initiative | Spec | Status | Progress |', '|---|---|---|---|---|',
    '| 07 | Search | [07-search.md](07-search.md) | planned | 3 left |', '',
  ].join('\n'));
  fs.writeFileSync(path.join(dir, 'plan', '07-search.md'), SPEC());
  fs.writeFileSync(path.join(dir, 'plan', 'ARCHIVE.md'), '# Archive\n');
  return dir;
}

function call(app, pathname, { method = 'GET', body } = {}) {
  const origin = `http://127.0.0.1:${app.port}`;
  return new Promise((resolve, reject) => {
    const r = http.request({
      host: '127.0.0.1', port: app.port, method, path: pathname,
      headers: { host: `127.0.0.1:${app.port}`, 'x-nexus-token': app.token, ...(body ? { origin, 'content-type': 'application/json' } : {}) },
    }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    r.on('error', reject);
    r.end(body ? JSON.stringify(body) : undefined);
  });
}

test('GET /api/summaries: on by default, off from Settings, the plan never written', async () => {
  const dir = fixtureRepo();
  const before = snapshot(dir);
  const query = stubQuery();
  const app = await startServer({ repo: dir, provider: { kind: 'fake', send() {}, async interrupt() {}, async stop() {}, async fresh() {} }, pollRuns: false, dist: NO_DIST, summaryQuery: query });
  try {
    const state = await call(app, '/api/state');
    assert.equal(state.body.prefs.aiSummaries, true, 'on by default');
    const on = await call(app, '/api/summaries');
    assert.equal(on.status, 200);
    assert.deepEqual(Object.keys(on.body).sort(), ['07.2', '07.3']);
    assert.equal(on.body['07.2'].ai, true);
    assert.equal(query.calls.length, 1);

    const off = await call(app, '/api/prefs', { method: 'POST', body: { aiSummaries: false } });
    assert.equal(off.body.aiSummaries, false);
    fs.rmSync(path.join(dir, '.nexus'), { recursive: true, force: true });
    assert.deepEqual((await call(app, '/api/summaries')).body, {});
    assert.equal(query.calls.length, 1, 'toggled off never calls the model');
    assert.equal(fs.existsSync(path.join(dir, '.nexus')), false);

    assert.deepEqual(snapshot(dir), before, 'plan/ is byte for byte and mtime for mtime as it was');
  } finally {
    await app.close();
  }
});
