// The change feed (feed.mjs, feed-push.mjs, feed-line.mjs, feed-deploy.mjs). No test calls a model or gh: the SDK's
// query() and gh are stubs. Checked: the bus (append, no duplicate id, bound, persist, reload, a torn last line,
// compaction), push detection over real git (a first look only records, one event per push with its commits grouped
// and paths, no duplicate across a restart, a push made while closed is caught), the fallback sentence, the model's
// line (and none asked with the helpers off), deploy states from gh api payloads, the "no deploy integration" rule,
// a deploy followed to Deployed, and the Settings switch through the live server.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createBus, createChangeFeed, foldLines, FEED_FILE, liveEvent } from '../server/feed.mjs';
import { createPushWatch, parseLog, pushEvent, runGit } from '../server/feed-push.mjs';
import { askLine, buildPrompt, cleanSubject, fallbackLine, parseLine } from '../server/feed-line.mjs';
import { deployFrom, integrationFrom, readCommit, readIntegration } from '../server/feed-deploy.mjs';
import { startServer } from '../server/server.mjs';
import { ago, byDay, deployWords, mergeEvents, newerFeed, tickerParts, tickerText, whoOf } from '../src/ui/change-feed.js';
import { removeTreeSync } from './helpers/tmp.mjs';

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), `nexus-feed-${p}-`));
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');

function commit(dir, file, text, msg) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), text);
  git(dir, 'add', '-A');
  git(dir, '-c', 'user.name=Sam Owner', '-c', 'user.email=sam@example.com', 'commit', '-q', '-m', msg);
  return git(dir, 'rev-parse', 'HEAD');
}

/** A bare origin, the checkout the GUI watches, and a second clone that pushes (another machine, a terminal). */
function remoteSetup() {
  const root = tmp('git');
  const origin = path.join(root, 'origin.git');
  const seed = path.join(root, 'seed');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'clone', '-q', origin, seed);
  git(seed, 'checkout', '-q', '-b', 'main');
  commit(seed, 'README.md', 'hi\n', 'docs: readme');
  git(seed, 'push', '-q', 'origin', 'main');
  const repo = path.join(root, 'repo');
  const other = path.join(root, 'other');
  git(root, 'clone', '-q', origin, repo);
  git(root, 'clone', '-q', origin, other);
  return { root, origin, repo, other };
}

// ---- the bus ------------------------------------------------------------------------------

test('the bus appends, refuses a second event with the same id, keeps the last N, and reloads from its file', () => {
  const dir = tmp('bus');
  try {
    const file = path.join(dir, FEED_FILE);
    const seen = [];
    const bus = createBus({ file, max: 3, onChange: (e) => seen.push(e.id) });
    for (const n of [1, 2, 3, 4]) assert.ok(bus.append({ id: `e${n}`, line: `L${n}` }));
    assert.equal(bus.append({ id: 'e4', line: 'again' }), null, 'no duplicate id');
    assert.deepEqual(bus.list().map((e) => e.id), ['e4', 'e3', 'e2'], 'newest first, bounded to 3');
    bus.update('e3', { deploy: { state: 'deployed' } });
    assert.deepEqual(seen, ['e1', 'e2', 'e3', 'e4', 'e3']);
    assert.ok(fs.existsSync(path.join(dir, '.nexus', 'feed', '.gitignore')), 'the feed folder is never committed');
    // A torn last line (a crash mid-write) is skipped on reload.
    fs.appendFileSync(file, '{"id":"e5","li');
    const again = createBus({ file, max: 3 }).load();
    assert.deepEqual(again.list().map((e) => e.id), ['e4', 'e3', 'e2']);
    assert.equal(again.get('e3').deploy.state, 'deployed', 'the later snapshot of an id wins');
    assert.equal(again.get('e3').line, 'L3');
  } finally { removeTreeSync(dir); }
});

test('the bus compacts its file once it grows past twice the bound', () => {
  const dir = tmp('compact');
  try {
    const file = path.join(dir, FEED_FILE);
    const bus = createBus({ file, max: 2 });
    for (let n = 0; n < 6; n += 1) bus.append({ id: `e${n}` });
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    assert.ok(lines.length <= 4, `file kept short: ${lines.length} lines`);
    assert.deepEqual(foldLines(fs.readFileSync(file, 'utf8'), 2).map((e) => e.id), ['e4', 'e5']);
  } finally { removeTreeSync(dir); }
});

// ---- push detection -----------------------------------------------------------------------

test('a push on origin/main becomes one event: commits grouped, paths listed, and never twice across a restart', async () => {
  const s = remoteSetup();
  try {
    const stateFile = path.join(s.repo, '.nexus', 'feed', 'state.json');
    const got = [];
    const watch = () => createPushWatch({ repo: s.repo, stateFile, watch: false, onPush: (ev) => { got.push(ev); } });
    const w1 = watch();
    assert.equal(await w1.check(), null, 'a first look only records the tip');
    assert.equal(w1.target.ref, 'refs/remotes/origin/main');
    commit(s.other, 'src/home/home.css', 'body { background: blue; }\n', 'feat(home): blue background');
    const tip = commit(s.other, 'test/home.test.mjs', 'ok\n', 'test: home background');
    git(s.other, 'push', '-q', 'origin', 'main');
    await w1.fetchNow();
    assert.equal(got.length, 1, 'one event for the push');
    const ev = got[0];
    assert.equal(ev.id, `push:${tip}`);
    assert.equal(ev.sha, tip.slice(0, 7));
    assert.equal(ev.count, 2);
    assert.deepEqual(ev.commits.map((c) => c.subject), ['test: home background', 'feat(home): blue background']);
    assert.deepEqual(ev.paths.sort(), ['src/home/home.css', 'test/home.test.mjs']);
    assert.deepEqual(ev.who, { name: 'Sam Owner', kind: 'author' });
    assert.equal(await w1.check(), null, 'the same tip again is nothing');
    // A restart: the same tip is not a push again.
    const w2 = watch();
    assert.equal(await w2.check(), null);
    assert.equal(got.length, 1);
    // A push while the GUI was closed is caught on the next look.
    const next = commit(s.other, 'docs/fixtures.md', 'x\n', 'docs: fixtures guide');
    git(s.other, 'push', '-q', 'origin', 'main');
    git(s.repo, 'fetch', '-q', 'origin');
    const w3 = watch();
    const caught = await w3.check();
    assert.equal(caught.id, `push:${next}`);
    assert.equal(caught.count, 1);
    w1.stop(); w2.stop(); w3.stop();
  } finally { removeTreeSync(s.root); }
});

test('who made a push: the session here when one did, else the author; a checkout with no remote watches main', async () => {
  const dir = tmp('local');
  try {
    git(dir, 'init', '-q', '-b', 'main');
    commit(dir, 'a.txt', '1\n', 'first');
    const got = [];
    const w = createPushWatch({ repo: dir, stateFile: path.join(dir, 's.json'), watch: false, whoFor: async () => ({ name: 'vega', kind: 'local' }), onPush: (ev) => got.push(ev) });
    await w.check();
    assert.equal(w.target.ref, 'refs/heads/main');
    commit(dir, 'b.txt', '2\n', 'second');
    await w.check();
    assert.deepEqual(got[0].who, { name: 'vega', kind: 'local' });
  } finally { removeTreeSync(dir); }
});

test('parseLog and pushEvent cap what an event carries', () => {
  const line = (n) => [`${String(n).padStart(40, 'a')}`, 'Ann', 'a@x', '2026-10-23T10:00:00Z', `subject ${n}`].join('\x1f');
  const commits = parseLog(Array.from({ length: 60 }, (_, i) => line(i)).join('\n'));
  assert.equal(commits.length, 60);
  const ev = pushEvent({ from: 'f', to: commits[0].sha, branch: 'main', commits, paths: Array.from({ length: 50 }, (_, i) => `p${i}`) });
  assert.equal(ev.count, 60);
  assert.equal(ev.commits.length, 50);
  assert.equal(ev.paths.length, 40);
  assert.equal(ev.morePaths, 10);
  assert.equal(liveEvent(ev).paths.length, 12);
  assert.equal(liveEvent(ev).morePaths, 38);
});

// ---- the line -----------------------------------------------------------------------------

test('the fallback sentence: the newest commit subject without its prefix, and how many more came with it', () => {
  assert.equal(cleanSubject('feat(home)!: add blue to the home background.'), 'Add blue to the home background');
  assert.equal(cleanSubject('fix: no double booking'), 'No double booking');
  assert.equal(cleanSubject('Plain words'), 'Plain words');
  assert.equal(fallbackLine([{ subject: 'feat: blue background' }]), 'Blue background');
  assert.equal(fallbackLine([{ subject: "Merge branch 'x'" }, { subject: 'fix: tiebreaks' }, { subject: 'test: tiebreaks' }]), 'Tiebreaks (and 2 more changes)');
  assert.equal(fallbackLine([]), 'New changes landed on main');
});

/** A stub of the SDK's query(): records each call and answers `text`. */
function stubQuery(text, calls) {
  return (args) => {
    calls.push(args);
    return {
      async *[Symbol.asyncIterator]() { yield { type: 'result', subtype: 'success', result: text, total_cost_usd: 0.0004 }; },
      close() {},
    };
  };
}

test('Haiku writes one plain line from the commits; a bad reply leaves the fallback', async () => {
  const calls = [];
  const ev = { branch: 'main', count: 1, commits: [{ subject: 'style(home): blue bg' }], paths: ['src/home.css'] };
  const r = await askLine(ev, { query: stubQuery('Added blue to the home background.\n', calls) });
  assert.equal(r.line, 'Added blue to the home background');
  assert.equal(calls[0].options.model, 'claude-haiku-5-5');
  assert.deepEqual(calls[0].options.tools, []);
  assert.equal(calls[0].options.maxTurns, 1);
  assert.match(buildPrompt(ev), /style\(home\): blue bg/);
  assert.match(buildPrompt(ev), /src\/home\.css/);
  assert.equal(parseLine('Sentence: Fixed the export'), 'Fixed the export');
  assert.equal(parseLine('...'), '');
  assert.equal((await askLine(ev, { query: null })).line, '');
});

/** A push the feed's add() takes, as the watch hands it. */
const PUSH = (to, extra = {}) => pushEvent({ from: 'a'.repeat(40), to, branch: 'main', commits: [{ sha: to, subject: 'feat(home): blue background', author: 'Sam' }], paths: ['src/home.css'], ...extra });
const noGh = async () => ({ ok: false, stdout: '' });

test('the feed puts a push up at once with its fallback line, then the model line; helpers off never asks', async () => {
  const dir = tmp('feed');
  try {
    let views = 0;
    const calls = [];
    const feed = createChangeFeed({ repo: dir, watch: false, gh: noGh, query: stubQuery('Added blue to the home background', calls), onChange: () => { views += 1; } });
    feed.sync();
    const e = feed.add(PUSH('b'.repeat(40)));
    assert.equal(e.line, 'Blue background');
    assert.equal(e.ai, false);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(feed.bus.get(e.id).line, 'Added blue to the home background');
    assert.equal(feed.bus.get(e.id).ai, true);
    assert.equal(feed.bus.get(e.id).deploy, null, 'gh cannot say: nothing about deploys');
    assert.equal(feed.add(PUSH('b'.repeat(40))), null, 'the same push is not added twice');
    assert.ok(views >= 2);
    feed.close();

    const calls2 = [];
    const dir2 = tmp('feed-off');
    const off = createChangeFeed({ repo: dir2, watch: false, gh: noGh, helpers: () => false, query: stubQuery('x', calls2) });
    off.sync();
    off.add(PUSH('c'.repeat(40)));
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(calls2.length, 0, 'AI helpers off: no model call');
    off.close();
    removeTreeSync(dir2);
  } finally { removeTreeSync(dir); }
});

// ---- deploys ------------------------------------------------------------------------------

test('deploy states from GitHub deployments, commit statuses and check runs', () => {
  assert.deepEqual(deployFrom({}), { state: 'waiting', env: '', url: '' }, 'nothing on the commit yet');
  assert.equal(deployFrom({ deployments: [{ environment: 'Production', statuses: [] }] }).state, 'deploying');
  assert.equal(deployFrom({ deployments: [{ environment: 'Production', statuses: [{ state: 'in_progress' }] }] }).state, 'deploying');
  assert.deepEqual(
    deployFrom({ deployments: [{ environment: 'Production', statuses: [{ state: 'success', environment_url: 'https://app.example.com' }, { state: 'in_progress' }] }] }),
    { state: 'deployed', env: 'Production', url: 'https://app.example.com' },
  );
  assert.equal(deployFrom({ deployments: [{ environment: 'Production', statuses: [{ state: 'failure' }] }] }).state, 'failed');
  // Production speaks for the push over a preview.
  assert.equal(deployFrom({ deployments: [
    { environment: 'Preview', statuses: [{ state: 'failure' }] },
    { environment: 'Production', statuses: [{ state: 'success', environment_url: 'https://p.example.com' }] },
  ] }).state, 'deployed');
  // Vercel and Netlify as commit statuses; CI that is not a deploy says nothing.
  assert.equal(deployFrom({ statuses: [{ context: 'Vercel', state: 'pending' }] }).state, 'deploying');
  assert.deepEqual(deployFrom({ statuses: [{ context: 'netlify/fieldday/deploy-preview', state: 'success', target_url: 'https://x.netlify.app' }] }), { state: 'deployed', env: '', url: 'https://x.netlify.app' });
  assert.equal(deployFrom({ statuses: [{ context: 'ci/tests', state: 'failure' }] }).state, 'waiting');
  // Cloudflare Pages as a check run.
  assert.equal(deployFrom({ checks: [{ name: 'Cloudflare Pages', status: 'in_progress' }] }).state, 'deploying');
  assert.equal(deployFrom({ checks: [{ name: 'Cloudflare Pages', status: 'completed', conclusion: 'failure' }] }).state, 'failed');
  assert.equal(deployFrom({ checks: [{ name: 'test (20.x)', status: 'completed', conclusion: 'failure' }] }).state, 'waiting');
  assert.equal(deployFrom({ checks: [{ name: 'Cloudflare Pages', status: 'completed', conclusion: 'skipped' }] }).state, 'waiting');
});

test('no deploy integration: nothing is said about deploys rather than "not deployed yet" forever', async () => {
  assert.equal(integrationFrom({}), false);
  assert.equal(integrationFrom({ statuses: [{ context: 'ci/tests', state: 'success' }], checks: [{ name: 'lint' }] }), false);
  assert.equal(integrationFrom({ deployments: [{ id: 1 }] }), true);
  assert.equal(integrationFrom({ checks: [{ name: 'Vercel – fieldday' }] }), true);
  const gh = fakeGh({ deployments: [], status: { statuses: [{ context: 'ci/tests', state: 'success' }] }, checks: { check_runs: [{ name: 'lint', status: 'completed', conclusion: 'success' }] } });
  assert.equal(await readIntegration('/x', ['abcdef1'], { run: gh.run }), false);
  assert.equal(await readIntegration('/x', [], { run: noGh }), null, 'gh cannot say');
  const dir = tmp('nodeploy');
  try {
    const feed = createChangeFeed({ repo: dir, watch: false, gh: gh.run, query: null });
    feed.sync();
    const e = feed.add(PUSH('d'.repeat(40)));
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(feed.bus.get(e.id).deploy, null);
    assert.equal(deployWords(feed.bus.get(e.id).deploy), null);
    assert.equal(tickerText(feed.bus.get(e.id)), 'Blue background');
    feed.close();
  } finally { removeTreeSync(dir); }
});

/** A fake gh: answers `gh api` by path, and records each call. `deployments` may be a function of the call count. */
function fakeGh(o) {
  const calls = [];
  let n = 0;
  return {
    calls,
    run: async (cmd, args) => {
      calls.push(args.join(' '));
      const p = args[1] || '';
      const pick = (v) => (typeof v === 'function' ? v(n) : v);
      let out;
      if (/\/deployments\/\d+\/statuses$/.test(p)) { n += 1; out = pick(o.statuses); }
      else if (/\/deployments$/.test(p)) out = pick(o.deployments);
      else if (/\/status$/.test(p)) out = pick(o.status) ?? { statuses: [] };
      else if (/\/check-runs$/.test(p)) out = pick(o.checks) ?? { check_runs: [] };
      return out === undefined ? { ok: false, stdout: '' } : { ok: true, stdout: JSON.stringify(out) };
    },
  };
}

test('readCommit reads deployments, their statuses, the commit status and check runs through gh api', async () => {
  const gh = fakeGh({ deployments: [{ id: 7, environment: 'Production' }], statuses: [{ state: 'success', environment_url: 'https://a.example.com' }] });
  const c = await readCommit('/x', 'abc1234', { run: gh.run });
  assert.deepEqual(deployFrom(c), { state: 'deployed', env: 'Production', url: 'https://a.example.com' });
  assert.ok(gh.calls.some((x) => x.includes('repos/{owner}/{repo}/deployments -X GET -f sha=abc1234')));
  assert.equal(await readCommit('/x', 'not a sha; rm', { run: gh.run }), null, 'only a sha reaches gh');
});

test('a pending deploy is followed with backoff until it says Deployed', async () => {
  const dir = tmp('follow');
  try {
    // The repo has deployments; this commit's goes queued, in progress, then success.
    const states = ['queued', 'in_progress', 'success'];
    const gh = fakeGh({
      deployments: [{ id: 9, environment: 'Production' }],
      statuses: (n) => [{ state: states[Math.min(n, states.length - 1)], environment_url: 'https://fieldday.example.com' }],
    });
    const seen = [];
    const feed = createChangeFeed({ repo: dir, watch: false, gh: gh.run, query: null, wait: () => 5, onChange: (v) => { const d = v.events[0]?.deploy?.state; if (d && seen[seen.length - 1] !== d) seen.push(d); } });
    feed.sync();
    const e = feed.add(PUSH('e'.repeat(40)));
    for (let i = 0; i < 100 && feed.bus.get(e.id).deploy?.state !== 'deployed'; i += 1) await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(feed.bus.get(e.id).deploy && { state: feed.bus.get(e.id).deploy.state, env: feed.bus.get(e.id).deploy.env, url: feed.bus.get(e.id).deploy.url }, { state: 'deployed', env: 'Production', url: 'https://fieldday.example.com' });
    assert.equal(seen[0], 'waiting', 'first "not deployed yet"');
    assert.ok(seen.includes('deploying'));
    assert.equal(seen[seen.length - 1], 'deployed');
    feed.close();
  } finally { removeTreeSync(dir); }
});

// ---- the GUI's rules ----------------------------------------------------------------------

test('the ticker and modal rules: words, who, days, the newer feed, the merged list', () => {
  const now = Date.parse('2026-10-23T15:00:00');
  assert.equal(tickerText({ line: 'Added blue to the home background', deploy: { state: 'waiting' } }), 'Added blue to the home background (not deployed yet)');
  assert.equal(tickerText({ line: 'X', deploy: { state: 'deployed', env: 'Production' } }), 'X · Deployed');
  assert.equal(deployWords({ state: 'deployed', env: 'Production' }).text, 'Deployed to Production');
  assert.equal(deployWords({ state: 'failed' }).text, 'Deploy failed');
  assert.deepEqual(whoOf({ who: { name: 'vega', kind: 'local' } }).session, { name: 'vega', kind: 'local' });
  assert.equal(whoOf({ who: { name: 'Sam', kind: 'author' } }).session.kind, 'other');
  assert.equal(ago(new Date(now - 4 * 60000).toISOString(), now), '4 min ago');
  const days = byDay([{ id: 'a', at: '2026-10-23T14:00:00' }, { id: 'b', at: '2026-10-22T09:00:00' }, { id: 'c', at: '2026-10-20T09:00:00' }], now);
  assert.deepEqual(days.map((d) => d.label), ['Today', 'Yesterday', 'Tue 20 Oct']);
  assert.equal(newerFeed({ at: 2, events: [] }, { at: 1, events: [1] }).at, 2);
  assert.equal(newerFeed(null, { at: 1 }).at, 1);
  const merged = mergeEvents([{ id: 'x', at: '2026-10-23T14:00:00Z', line: 'new', paths: ['a'] }], [{ id: 'x', at: '2026-10-23T14:00:00Z', line: 'old', paths: ['a', 'b'] }, { id: 'y', at: '2026-10-22T14:00:00Z' }]);
  assert.deepEqual(merged.map((e) => [e.id, e.line, e.paths?.length]), [['x', 'new', 2], ['y', undefined, undefined]]);
});

// ---- the Settings switch through the server -------------------------------------------------

function req(port, { method = 'GET', pathname, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: pathname, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null }));
    });
    r.on('error', reject);
    r.end(body);
  });
}

test('Settings "Change feed" off stops the feed: GET /api/feed says off, the pref is kept; on again it comes back', async () => {
  const s = remoteSetup();
  const fakeProvider = () => ({ kind: 'fake', send() {}, async interrupt() {}, async stop() {}, async fresh() {} });
  const app = await startServer({ repo: s.repo, provider: () => fakeProvider(), pollRuns: false, dist: NO_DIST, feed: { start: true, watch: false, gh: noGh, query: null } });
  const json = { 'x-nexus-token': app.token, 'content-type': 'application/json', origin: `http://127.0.0.1:${app.port}` };
  try {
    const st = await req(app.port, { pathname: '/api/state', headers: json });
    assert.equal(st.data.prefs.changeFeed, true, 'on by default');
    assert.equal((await req(app.port, { pathname: '/api/feed', headers: json })).data.on, true);
    const off = await req(app.port, { method: 'POST', pathname: '/api/prefs', headers: json, body: JSON.stringify({ changeFeed: false }) });
    assert.equal(off.data.changeFeed, false);
    const f = await req(app.port, { pathname: '/api/feed', headers: json });
    assert.equal(f.data.on, false);
    assert.deepEqual(f.data.events, []);
    const on = await req(app.port, { method: 'POST', pathname: '/api/prefs', headers: json, body: JSON.stringify({ changeFeed: true }) });
    assert.equal(on.data.changeFeed, true);
    assert.equal((await req(app.port, { pathname: '/api/feed', headers: json })).data.on, true);
  } finally {
    await app.close();
    removeTreeSync(s.root);
  }
});

test('the change-feed demo: two pushes land and the first goes not deployed yet, Deploying, Deployed', async () => {
  const { createWorld } = await import('../server/demo/world.mjs');
  const { SCENARIOS } = await import('../server/demo/scenarios.mjs');
  const { manualClock } = await import('../server/demo/clock.mjs');
  const clock = manualClock();
  const world = createWorld(SCENARIOS['change-feed'], { clock, hub: { flushMs: 5, pingMs: 60000 } }).start();
  try {
    assert.equal(world.feed().events.length, 2, 'two older pushes to begin with');
    clock.advance(1600);
    const top = () => world.feed().events[0];
    assert.equal(top().line, 'Added blue to the home page background');
    assert.equal(tickerText(top()), 'Added blue to the home page background (not deployed yet)');
    clock.advance(2100);
    assert.equal(top().deploy.state, 'deploying');
    clock.advance(2800);
    assert.equal(top().deploy.state, 'deployed');
    assert.equal(top().deploy.url, 'https://fieldday.example.com');
    clock.advance(4000);
    assert.equal(world.feed().events.length, 4);
    assert.equal(top().who.kind, 'author');
  } finally { world.close(); }
});

// ---- review fixes -------------------------------------------------------------------------

test('two GUI servers on one repo share the feed: a push one of them records reaches the other', async () => {
  const s = remoteSetup();
  try {
    const a = createChangeFeed({ repo: s.repo, watch: false, gh: noGh, query: null });
    const bViews = [];
    const b = createChangeFeed({ repo: s.repo, watch: false, gh: noGh, query: null, onChange: (v) => bViews.push(v) });
    a.sync(); b.sync();
    // Both first looks (which only record the tip) are done; generous, since a loaded full run is slow to spawn git.
    await new Promise((r) => setTimeout(r, 2000));
    await a.pushes.check(); await b.pushes.check();
    const tip = commit(s.other, 'src/home.css', 'body { background: blue; }\n', 'feat(home): blue background');
    git(s.other, 'push', '-q', 'origin', 'main');
    git(s.repo, 'fetch', '-q', 'origin');
    const ev = await a.pushes.check();
    assert.ok(a.bus.has(`push:${tip}`), ev ? 'A saw the push' : 'B saw it first and A read the shared feed again');
    await b.pushes.check(); // the tip is recorded already (or B's own look raced A's: the same id, folded as one)
    assert.ok(b.bus.has(`push:${tip}`), 'B has it too');
    assert.equal(b.bus.list().filter((e) => e.id === `push:${tip}`).length, 1);
    assert.equal(bViews[bViews.length - 1].events[0].id, `push:${tip}`, 'and sent it to its tabs');
    assert.equal(b.list().events[0].id, `push:${tip}`);
    a.close(); b.close();
  } finally { removeTreeSync(s.root); }
});

test('a push caught after the GUI was closed keeps its own date and its whole commit count', async () => {
  const s = remoteSetup();
  try {
    const stateFile = path.join(s.repo, '.nexus', 'feed', 'state.json');
    const got = [];
    const w1 = createPushWatch({ repo: s.repo, stateFile, watch: false, onPush: (ev) => { got.push(ev); } });
    await w1.check();
    w1.stop();
    assert.ok(JSON.parse(fs.readFileSync(stateFile, 'utf8')).seenAt, 'the last look is kept');
    const old = { ...process.env, GIT_COMMITTER_DATE: '2026-10-20T09:00:00Z', GIT_AUTHOR_DATE: '2026-10-20T09:00:00Z' };
    for (let n = 0; n < 53; n += 1) {
      fs.writeFileSync(path.join(s.other, `f${n}.txt`), `${n}\n`);
      execFileSync('git', ['add', '-A'], { cwd: s.other });
      execFileSync('git', ['-c', 'user.name=Sam Owner', '-c', 'user.email=sam@example.com', 'commit', '-q', '-m', `docs: note ${n}`], { cwd: s.other, env: old });
    }
    git(s.other, 'push', '-q', 'origin', 'main');
    git(s.repo, 'fetch', '-q', 'origin');
    const later = new Date(Date.now() + 3 * 86400000).toISOString();
    const w2 = createPushWatch({ repo: s.repo, stateFile, watch: false, now: () => later, onPush: (ev) => { got.push(ev); } });
    const ev = await w2.check();
    assert.equal(ev.count, 53, 'the whole count, not the capped log');
    assert.equal(ev.commits.length, 50);
    assert.ok(Date.parse(ev.at) < Date.parse(later), 'dated before now (three days on)');
    assert.equal(fallbackLine(ev.commits, ev.count), 'Note 52 (and 52 more changes)');
    assert.match(ev.commits[0].oid, /^[0-9a-f]{40}$/, 'the full sha rides along for GitHub lookups');
  } finally { removeTreeSync(s.root); }
});

test('the background fetch runs only when origin moved (ls-remote first) and never over a held ref lock', async () => {
  const s = remoteSetup();
  try {
    const calls = [];
    const real = async (args, o) => { calls.push(args[0]); return runGit(s.repo, args, o); };
    const w = createPushWatch({ repo: s.repo, stateFile: path.join(s.repo, 's.json'), watch: false, git: real, onPush: () => {} });
    await w.check();
    calls.length = 0;
    await w.fetchNow();
    assert.ok(calls.includes('ls-remote'));
    assert.ok(!calls.includes('fetch'), 'origin has not moved: no fetch, no lock taken');
    commit(s.other, 'x.txt', 'x\n', 'feat: x');
    git(s.other, 'push', '-q', 'origin', 'main');
    const lock = path.join(s.repo, '.git', 'refs', 'remotes', 'origin', 'main.lock');
    fs.writeFileSync(lock, '');
    calls.length = 0;
    await w.fetchNow();
    assert.ok(!calls.includes('fetch'), 'someone holds the ref lock: wait for the next round');
    fs.rmSync(lock);
    calls.length = 0;
    await w.fetchNow();
    assert.ok(calls.includes('fetch'), 'origin moved and the lock is free: fetch');
  } finally { removeTreeSync(s.root); }
});

test('a deploy that never settles is let go: stuck Deploying goes quiet, a never-started one says nothing', async () => {
  const dir = tmp('giveup');
  try {
    const gh = fakeGh({ deployments: [{ id: 9, environment: 'Production' }], statuses: [{ state: 'in_progress' }] });
    let t = Date.now();
    const feed = createChangeFeed({ repo: dir, watch: false, gh: gh.run, query: null, wait: () => 5, followMs: 1000, now: () => t });
    feed.sync();
    const e = feed.add(PUSH('f'.repeat(40)));
    for (let i = 0; i < 50 && feed.bus.get(e.id).deploy?.state !== 'deploying'; i += 1) await new Promise((r) => setTimeout(r, 10));
    assert.equal(feed.bus.get(e.id).deploy.state, 'deploying');
    t += 5000;
    for (let i = 0; i < 50 && feed.bus.get(e.id).deploy?.state !== 'quiet'; i += 1) await new Promise((r) => setTimeout(r, 10));
    assert.equal(feed.bus.get(e.id).deploy.state, 'quiet');
    assert.equal(deployWords(feed.bus.get(e.id).deploy).text, 'No word on the deploy');
    // An old "not deployed yet" left from before a restart is let go at start-up.
    feed.bus.append({ ...PUSH('9'.repeat(40)), seen: new Date(t - 10000).toISOString(), deploy: { state: 'waiting', env: '', url: '' } });
    feed.close();
    const again = createChangeFeed({ repo: dir, watch: false, gh: noGh, query: null, followMs: 1000, now: () => t });
    again.sync();
    assert.equal(again.bus.get(`push:${'9'.repeat(40)}`).deploy, null);
    assert.equal(again.bus.get(e.id).deploy.state, 'quiet');
    again.close();
  } finally { removeTreeSync(dir); }
});

test('the ticker keeps the deploy word apart from the line, so cutting the line never cuts the word', () => {
  assert.deepEqual(tickerParts({ line: 'Added blue', deploy: { state: 'waiting' } }), { line: 'Added blue', state: 'not deployed yet' });
  assert.deepEqual(tickerParts({ line: 'Added blue', deploy: null }), { line: 'Added blue', state: '' });
  assert.equal(tickerText({ line: 'Added blue', deploy: { state: 'deployed' } }), 'Added blue · Deployed');
  const css = fs.readFileSync(new URL('../src/styles/change-feed.css', import.meta.url), 'utf8');
  assert.match(css, /\.feed-tick \{\s*flex: 3 1 0;/, 'no base width: the ticker never wraps the bar');
  assert.doesNotMatch(css, /\.feed-tick \{ display: none; \}/, 'a narrow bar folds the ticker, never hides it');
});
