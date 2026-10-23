// `nexus --demo <scenario>` (spec 44 A1): fixtures and a timed beat script, no repo, session or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import dns from 'node:dns';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';
import { startDemo } from '../server/demo.mjs';
import { createWorld, duration, timeline, actionOf } from '../server/demo/world.mjs';
import { SCENARIOS, scenarioNames } from '../server/demo/scenarios.mjs';
import { manualClock, realClock } from '../server/demo/clock.mjs';
import { isBeat } from '../shared/beats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, '..');
const NO_DIST = path.join(PKG, 'test', 'fixtures', 'no-dist');
const request = http.request; // kept before any patching below, so the test's own calls are never counted

function req(port, { method = 'GET', pathname, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const r = request({ host: '127.0.0.1', port, method, path: pathname, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'] || '', data }));
    });
    r.on('error', reject);
    r.end(body);
  });
}

/** The first SSE frame on a channel (the hello). */
function hello(port, token, session) {
  return new Promise((resolve, reject) => {
    const r = request({ host: '127.0.0.1', port, path: `/api/events?t=${encodeURIComponent(token)}&session=${session}`, headers: { host: `127.0.0.1:${port}` } }, (res) => {
      let data = '';
      res.on('data', (d) => {
        data += d;
        const end = data.indexOf('\n\n');
        if (end < 0) return;
        r.destroy();
        const frame = data.slice(0, end);
        resolve({ event: /^event: (.+)$/m.exec(frame)[1], data: JSON.parse(/^data: (.+)$/m.exec(frame)[1]) });
      });
    });
    r.on('error', reject);
    r.end();
  });
}

const play = (name) => {
  const clock = manualClock();
  const world = createWorld(SCENARIOS[name], { clock, hub: { flushMs: 5, pingMs: 60000 } }).start();
  return { clock, world };
};

test('every scenario is well formed: fictional, steps with one known action, beats the reducer takes', () => {
  assert.deepEqual(scenarioNames(), ['fleet-to-tug', 'bug-to-archive', 'fall-and-resume', 'heads-down', 'plain-folder', 'cloud-token']);
  for (const name of scenarioNames()) {
    const sc = SCENARIOS[name];
    assert.equal(sc.name, name);
    assert.ok(sc.title && sc.summary && sc.home, `${name} has a title, summary and home session`);
    for (const { step } of timeline(sc.script)) {
      assert.ok(actionOf(step), `${name}: a step with no action: ${JSON.stringify(step)}`);
      if (step.beat) assert.ok(isBeat(step.beat), `${name}: not a beat: ${JSON.stringify(step.beat)}`);
    }
    const d = duration(sc.script);
    assert.ok(d >= 4000 && d <= 12000, `${name} runs ${d} ms`);
    // No real project is named: only the invented one and star names.
    const text = JSON.stringify(sc.fixtures({ now: 0, at: () => '', ago: () => '' })) + JSON.stringify(sc.script);
    assert.doesNotMatch(text, /semilayer|kintilla|daretodave/i);
  }
});

test('a scenario replays its beats in order on the manual clock, each at its time', () => {
  for (const name of scenarioNames()) {
    const { clock, world } = play(name);
    const expected = timeline(SCENARIOS[name].script).map((x) => x.at);
    clock.advance(world.duration + 1);
    const steps = world.log.filter((e) => e.kind !== 'owner');
    assert.deepEqual(steps.map((e) => e.t), expected, `${name}: every step fired once, at its time`);
    for (let i = 1; i < world.log.length; i += 1) assert.ok(world.log[i].t >= world.log[i - 1].t, `${name}: in order`);
    assert.equal(clock.pending, 0, `${name}: nothing left scheduled`);
    world.close();
  }
});

test('fleet to tug: vega asks, everything hushes, the owner answers, the chunk lands', () => {
  const { clock, world } = play('fleet-to-tug');
  const vega = world.session('vega');
  clock.advance(2400);
  assert.equal(world.asks().length, 0);
  clock.advance(200); // 2600: the ask is open
  assert.equal(world.asks().length, 1);
  assert.equal(world.rows().find((r) => r.name === 'vega').state, 'asking', 'its tile says it needs you');
  const asking = world.detail('vega');
  assert.ok(asking.questions === undefined || Array.isArray(asking.questions), 'the detail keeps the cockpit shape (questions is the start list), not the tile asking count');
  const item = world.inbox().find((x) => x.src === 'ask');
  assert.equal(item.session.name, 'vega', 'the inbox tags it with its star');
  assert.deepEqual(item.options, ['Goal difference (recommended)', 'Head-to-head']);
  clock.advance(world.duration);
  const beats = vega.hub.beats.map((b) => `${b.k}.${b.p}${b.id ? ` ${b.id}` : ''}`);
  const at = (s) => beats.indexOf(s);
  assert.ok(at('oversight.ask ask-vega-standings') >= 0);
  assert.ok(at('oversight.ask ask-vega-standings') < at('oversight.answer ask-vega-standings'));
  assert.ok(at('oversight.answer ask-vega-standings') < at('chunk.gate 12.4'));
  assert.ok(at('chunk.gate 12.4') < at('chunk.archive 12.4'));
  assert.ok(at('chunk.archive 12.4') < at('chunk.claim 12.5'));
  assert.equal(world.asks().length, 0);
  const d = world.detail('vega');
  assert.equal(d.mode, 'owner', 'the river is the owner\'s');
  assert.equal(d.landed.at(-1).sha, '4be81d0', 'the chunk dropped into the shipped river');
  const spec = world.plan().specs.find((s) => s.id === '12');
  assert.equal(spec.chunks.find((c) => c.id === '12.4').state, 'closed');
  assert.ok(world.claims().rows.some((r) => r.id === '12.5' && r.star === 'vega'));
  assert.ok(!world.claims().rows.some((r) => r.id === '12.4'));
  assert.equal(world.log.filter((e) => e.kind === 'owner').length, 1);
  assert.equal(world.log.find((e) => e.kind === 'owner').by, 'script', 'left alone, the script answers');
  world.close();
});

test('the owner can answer by clicking: the run moves from the click, once', () => {
  const { clock, world } = play('fleet-to-tug');
  clock.advance(2600);
  const before = world.log.length;
  assert.equal(world.answer('ask-vega-standings', { q: 'Head-to-head' }), true);
  assert.equal(world.answer('ask-vega-standings', { q: 'Head-to-head' }), false, 'a second answer finds nothing');
  assert.equal(world.log[before].by, 'page');
  clock.advance(200);
  assert.equal(world.log.at(-1).t, 2800, 'the next beat is timed from the click, not the scripted answer');
  clock.advance(world.duration);
  assert.equal(world.log.filter((e) => e.kind === 'owner').length, 1, 'the scripted answer never fires as well');
  assert.ok(world.session('vega').hub.transcript.some((t) => t.kind === 'user' && t.text === 'Head-to-head'));
  world.close();
});

test('bug to archive: a send from the composer slots the chunk in, claims, builds and closes it', () => {
  const { clock, world } = play('bug-to-archive');
  clock.advance(700);
  assert.equal(world.send('vega', '/bug the PDF export crashes on long seasons'), true);
  clock.advance(800);
  const plan = world.plan();
  assert.ok(plan.mark.includes('15.3'), 'just plotted');
  assert.equal(plan.asap[0], '15.3', 'in the asap lane');
  clock.advance(world.duration);
  assert.equal(world.plan().specs.find((s) => s.id === '15').chunks.find((c) => c.id === '15.3').state, 'closed');
  assert.ok(world.detail('vega').landed.some((l) => l.chunk === '15.3'));
  world.close();
});

test('fall and resume: Resume on the fallen tile picks it up', () => {
  const { clock, world } = play('fall-and-resume');
  assert.equal(world.rows().find((r) => r.name === 'deneb').state, 'fallen');
  clock.advance(900);
  assert.equal(world.resume('deneb'), true);
  clock.advance(0); // the resume's first step is due at once
  assert.equal(world.rows().find((r) => r.name === 'deneb').state, 'resuming');
  clock.advance(world.duration);
  assert.equal(world.rows().find((r) => r.name === 'deneb').state, 'live');
  assert.ok(world.detail('deneb').landed.some((l) => l.chunk === '14.1'));
  world.close();
});

test('the real clock speeds up: a scenario plays through in a fraction of its time, in order', async () => {
  const clock = realClock({ speed: 40 });
  const world = createWorld(SCENARIOS['heads-down'], { clock, hub: { flushMs: 5, pingMs: 60000 } }).start();
  await new Promise((r) => setTimeout(r, world.duration / 40 + 400));
  const expected = timeline(SCENARIOS['heads-down'].script).length;
  assert.equal(world.log.length, expected);
  for (let i = 1; i < world.log.length; i += 1) assert.ok(world.log[i].t >= world.log[i - 1].t - 40, 'in order');
  assert.equal(world.rows().find((r) => r.name === 'altair').progress.done, 3);
  world.close();
});

// Every GET the page makes, from the client's own source: the data layer and the screens.
function pageEndpoints() {
  const files = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(jsx?|mjs)$/.test(f.name)) files.push(p); } };
  walk(path.join(PKG, 'src'));
  const out = new Set();
  for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/['"`](\/api\/[A-Za-z0-9/_.-]*)/g)) out.add(m[1]);
  // The event stream is a channel, not a call: the hello is checked on its own below.
  return [...out].filter((p) => p !== '/api/events').map((p) => (p.endsWith('/') ? `${p}demo-vega` : p));
}

const STAGED = ['/api/state', '/api/preflight', '/api/prompts', '/api/local', '/api/sessions', '/api/sessions/demo-vega', '/api/sessions/vega', '/api/inbox', '/api/oversight', '/api/plan', '/api/claims', '/api/summaries', '/api/server', '/api/demo'];

test('every endpoint the UI calls answers: staged ones from fixtures, the rest a JSON 404 (the empty state), never a crash', async () => {
  const clock = manualClock();
  const app = await startDemo({ scenario: 'fleet-to-tug', clock, dist: NO_DIST, hub: { flushMs: 5, pingMs: 60000 } });
  const { port, token } = app;
  const h = { 'x-nexus-token': token };
  try {
    const paths = pageEndpoints();
    for (const p of ['/api/sessions', '/api/inbox', '/api/plan', '/api/state', '/api/local', '/api/claims']) assert.ok(paths.includes(p), `the page calls ${p}`);
    for (const p of [...new Set([...paths, ...STAGED, '/api/no-such-thing'])]) {
      const r = await req(port, { pathname: p, headers: h });
      assert.match(r.type, /application\/json/, `${p} answers JSON`);
      assert.ok(r.status === 200 || r.status === 404, `${p} answered ${r.status}: ${r.data}`);
      JSON.parse(r.data);
      if (STAGED.includes(p)) assert.equal(r.status, 200, `${p} is staged`);
    }
    const st = JSON.parse((await req(port, { pathname: '/api/state', headers: h })).data);
    assert.equal(st.info.name, 'fieldday');
    assert.equal(st.prefs.onboarded, true, 'the page opens on the fleet, not onboarding');
    const rows = JSON.parse((await req(port, { pathname: '/api/sessions', headers: h })).data);
    assert.deepEqual(rows.map((r) => r.name), ['vega', 'sirius', 'deneb', 'altair']);
    const plan = JSON.parse((await req(port, { pathname: '/api/plan', headers: h })).data);
    assert.equal(plan.available, true);
    assert.ok(plan.specs.length >= 4);
    // The channel replays the stage on connect, like the live server's.
    const hi = await hello(port, token, 'vega');
    assert.equal(hi.event, 'hello');
    assert.ok(hi.data.beats.some((b) => b.k === 'chunk' && b.id === '12.4'));
    assert.ok(hi.data.transcript.length > 0);
    assert.equal((await hello(port, token, 'nobody')).data.status.hosted, false, 'an unknown session gets a quiet channel');
    // The guards stand.
    assert.equal((await req(port, { pathname: '/api/state' })).status, 403);
    assert.equal((await req(port, { method: 'POST', pathname: '/api/send', headers: { ...h, 'content-type': 'application/json' }, body: '{"text":"x"}' })).status, 403, 'a POST needs an Origin');
    assert.equal((await req(port, { pathname: '/' })).status, 200);
  } finally {
    await app.close();
  }
});

test('the page answers the ask over HTTP; the demo restarts on request', async () => {
  const clock = manualClock();
  const app = await startDemo({ scenario: 'fleet-to-tug', clock, dist: NO_DIST, hub: { flushMs: 5, pingMs: 60000 } });
  const { port, token } = app;
  const post = { 'x-nexus-token': token, 'content-type': 'application/json', origin: `http://127.0.0.1:${port}` };
  try {
    clock.advance(2600);
    const asks = JSON.parse((await req(port, { pathname: '/api/oversight', headers: post })).data).live;
    assert.equal(asks.length, 1);
    const ok = await req(port, { method: 'POST', pathname: `/api/ask/${asks[0].id}`, headers: post, body: JSON.stringify({ answers: { [asks[0].questions[0].question]: 'Goal difference' } }) });
    assert.equal(ok.status, 200);
    assert.equal((await req(port, { method: 'POST', pathname: `/api/ask/${asks[0].id}`, headers: post, body: '{}' })).status, 404);
    assert.equal(app.world.log.find((e) => e.kind === 'owner').by, 'page');
    clock.advance(app.world.duration);
    const info = JSON.parse((await req(port, { pathname: '/api/demo', headers: post })).data);
    assert.equal(info.scenario, 'fleet-to-tug');
    assert.ok(info.log.length > 10);
    const again = JSON.parse((await req(port, { method: 'POST', pathname: '/api/demo/restart', headers: post, body: '{}' })).data);
    assert.equal(again.log.length, 0, 'started over');
    assert.equal(app.world.detail('vega').landed.length, 1, 'fixtures fresh again');
  } finally {
    await app.close();
  }
});

test('a demo run writes nothing, opens no connection out and starts no process', async () => {
  const seen = [];
  const restore = [];
  const trap = (obj, name, label = name, allow = () => false) => {
    const orig = obj[name];
    if (typeof orig !== 'function') return;
    obj[name] = function trapped(...args) {
      if (!allow(...args)) seen.push(label);
      return orig.apply(this, args);
    };
    restore.push(() => { obj[name] = orig; });
  };
  for (const n of ['writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'mkdir', 'mkdirSync', 'rename', 'renameSync', 'rm', 'rmSync', 'unlink', 'unlinkSync', 'copyFile', 'copyFileSync', 'createWriteStream']) trap(fs, n, `fs.${n}`);
  trap(fs, 'openSync', 'fs.openSync(w)', (_p, flags = 'r') => flags === 'r' || flags === 0);
  for (const n of ['writeFile', 'appendFile', 'mkdir', 'rename', 'rm', 'unlink', 'copyFile']) trap(fs.promises, n, `fs.promises.${n}`);
  for (const n of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) trap(cp, n, `child_process.${n}`);
  trap(https, 'request', 'https.request');
  trap(https, 'get', 'https.get');
  trap(http, 'get', 'http.get');
  trap(http, 'request', 'http.request');
  // The test's own calls to the demo reach 127.0.0.1; anything else is a connection out.
  const loopback = (h) => h === '127.0.0.1' || h === 'localhost' || h === '::1';
  const local = (a, b) => loopback(typeof a === 'object' && a ? a.host || a.hostname || 'localhost' : typeof b === 'string' ? b : 'localhost');
  trap(net, 'connect', 'net.connect', local);
  trap(net, 'createConnection', 'net.createConnection', local);
  trap(dns, 'lookup', 'dns.lookup', (h) => loopback(h));
  const fetch0 = globalThis.fetch;
  globalThis.fetch = (...a) => { seen.push('fetch'); return fetch0(...a); };
  syncBuiltinESMExports();
  try {
    for (const name of scenarioNames()) {
      const clock = manualClock();
      const app = await startDemo({ scenario: name, clock, dist: NO_DIST, hub: { flushMs: 5, pingMs: 60000 } });
      const h = { 'x-nexus-token': app.token, 'content-type': 'application/json', origin: `http://127.0.0.1:${app.port}` };
      for (const p of STAGED) await req(app.port, { pathname: p, headers: h });
      await req(app.port, { method: 'POST', pathname: '/api/prefs', headers: h, body: '{"theme":"dawn"}' });
      await req(app.port, { method: 'POST', pathname: '/api/local', headers: h, body: '{"runMode":"agents"}' });
      await req(app.port, { method: 'POST', pathname: '/api/send', headers: h, body: '{"text":"/bug the PDF export crashes on long seasons"}' });
      await req(app.port, { method: 'POST', pathname: `/api/sessions/${SCENARIOS[name].home}/resume`, headers: h, body: '{}' });
      await hello(app.port, app.token, SCENARIOS[name].home);
      // The folder-to-cloud stage (plain-folder, cloud-token): every step clicked, all in memory.
      await req(app.port, { pathname: '/api/repo/start?fail=push', headers: h });
      for (const step of ['init', 'commit', 'remote', 'push', 'push']) await req(app.port, { method: 'POST', pathname: `/api/repo/${step}`, headers: h, body: JSON.stringify({ confirm: true, owner: 'ada-park', name: 'lantern', visibility: 'private' }) });
      await req(app.port, { method: 'POST', pathname: '/api/cloud/secret', headers: h, body: JSON.stringify({ value: SECRET_VALUE }) });
      await req(app.port, { method: 'POST', pathname: '/api/cloud/run', headers: h, body: '{}' });
      for (const p of ['/api/actions', '/api/runs', '/api/repo/start']) await req(app.port, { pathname: p, headers: h });
      clock.advance(app.world.duration + 1);
      await req(app.port, { pathname: '/api/sessions', headers: h });
      await app.close();
    }
  } finally {
    for (const r of restore) r();
    globalThis.fetch = fetch0;
    syncBuiltinESMExports();
  }
  assert.deepEqual([...new Set(seen)], []);
});

const SECRET_VALUE = ['sk', 'ant', 'oat01', 'demo'.repeat(6)].join('-');

test('plain folder: Detect opens on a folder with no git; init, commit, a confirm, then push; the cloud steps light up', async () => {
  const clock = manualClock();
  const app = await startDemo({ scenario: 'plain-folder', clock, dist: NO_DIST, hub: { flushMs: 5, pingMs: 60000 } });
  const h = { 'x-nexus-token': app.token, 'content-type': 'application/json', origin: `http://127.0.0.1:${app.port}` };
  const get = async (p) => JSON.parse((await req(app.port, { pathname: p, headers: h })).data);
  const post = async (p, b) => { const r = await req(app.port, { method: 'POST', pathname: p, headers: h, body: JSON.stringify(b) }); return { status: r.status, ...JSON.parse(r.data) }; };
  try {
    assert.match(app.url, /\/onboarding\/detect\?t=/, 'the link opens on Detect');
    const st = await get('/api/state');
    assert.deepEqual([st.info.isGit, st.info.place, st.info.adopted, st.prefs.onboarded], [false, 'none', false, false]);
    assert.equal((await get('/api/preflight')).checks.find((c) => c.id === 'remote').ok, false);
    assert.equal((await get('/api/actions')).place, 'none');
    assert.equal((await get('/api/repo/start')).next, 'init');
    assert.equal((await post('/api/repo/init', {})).status, 400, 'confirm required');
    assert.equal((await post('/api/repo/init', { confirm: true })).start.next, 'commit');
    assert.equal((await post('/api/repo/init', { confirm: true })).already, true);
    assert.equal((await post('/api/repo/commit', { confirm: true, leaveOut: ['config/secrets.json'] })).start.next, 'remote');
    const check = await get('/api/repo/start?owner=ada-park&name=lantern&visibility=public');
    assert.equal(check.nameFree, true);
    assert.deepEqual(check.plan.remote, ['gh', 'repo', 'create', 'ada-park/lantern', '--public', '--source', '.', '--remote', 'origin']);
    assert.equal((await get('/api/repo/start?owner=ada-park&name=lantern-old')).nameFree, false);
    assert.equal((await post('/api/repo/remote', { confirm: true, owner: 'ada-park', name: 'lantern', visibility: 'private' })).start.next, 'push');
    await get('/api/repo/start?fail=push');
    const failed = await post('/api/repo/push', { confirm: true });
    assert.equal(failed.status, 409);
    assert.equal(failed.why, 'push-auth');
    assert.deepEqual(failed.guide, ['gh auth setup-git']);
    assert.equal((await post('/api/repo/push', { confirm: true })).start.next, 'done');
    const a = await get('/api/actions');
    assert.deepEqual([a.place, a.slug, a.workflows.length], ['github', 'ada-park/lantern', 0]);
    assert.equal((await get('/api/state')).info.place, 'github');
    clock.advance(app.world.duration + 3000);
    assert.equal((await get('/api/state')).info.place, 'github', 'the world restarting never undoes a click');
    await post('/api/demo/restart', {});
    assert.equal((await get('/api/state')).info.place, 'none', 'only a restart does');
  } finally {
    await app.close();
  }
});

test('cloud token: the loop is there and its sign-in is not; the paste is checked, dropped, and never answered back', async () => {
  const clock = manualClock();
  const app = await startDemo({ scenario: 'cloud-token', clock, dist: NO_DIST, hub: { flushMs: 5, pingMs: 60000 } });
  const h = { 'x-nexus-token': app.token, 'content-type': 'application/json', origin: `http://127.0.0.1:${app.port}` };
  const raw = async (p) => (await req(app.port, { pathname: p, headers: h })).data;
  const post = async (p, b) => { const r = await req(app.port, { method: 'POST', pathname: p, headers: h, body: JSON.stringify(b) }); return { status: r.status, text: r.data, ...JSON.parse(r.data) }; };
  try {
    assert.match(app.url, /\/onboarding\/cloud\?t=/);
    const a = JSON.parse(await raw('/api/actions'));
    assert.deepEqual([a.place, a.viewer, a.workflows[0].path], ['github', 'ADMIN', '.github/workflows/march.yml']);
    assert.equal(a.steps.find((x) => x.id === 'secret').ok, false);
    assert.equal(JSON.parse(await raw('/api/repo/start')).next, 'done');
    const warn = await post('/api/cloud/secret', { value: 'not-a-setup-token-value-xyz' });
    assert.deepEqual([warn.status, warn.warn], [422, 'prefix']);
    const ok = await post('/api/cloud/secret', { value: SECRET_VALUE });
    assert.deepEqual([ok.status, ok.verified], [200, true]);
    assert.ok(!ok.text.includes(SECRET_VALUE));
    assert.equal(JSON.parse(await raw('/api/actions')).steps.find((x) => x.id === 'secret').ok, true);
    for (const p of ['/api/actions', '/api/runs', '/api/repo/start', '/api/state', '/api/preflight', '/api/demo']) assert.ok(!(await raw(p)).includes(SECRET_VALUE), `${p} never carries the token`);
    assert.equal((await post('/api/cloud/run', {})).status, 200);
    assert.equal(JSON.parse(await raw('/api/runs')).runs[0].status, 'queued');
  } finally {
    await app.close();
  }
});

// Node's permission model, end to end: the CLI's own --demo, with no right to write or to start a process.
const PERMISSION = process.allowedNodeEnvironmentFlags.has('--permission');
test('nexus --demo runs under --permission with read-only fs and no child processes', { skip: !PERMISSION && 'this node has no --permission' }, async () => {
  const child = cp.spawn(process.execPath, ['--permission', `--allow-fs-read=${PKG}${path.sep}*`, path.join(PKG, 'bin', 'nexus.mjs'), '--demo', 'fleet-to-tug', '--no-open', '--speed', '20'], { cwd: PKG, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    let out = '';
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    const url = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`no link printed: ${out} ${err}`)), 20000);
      child.stdout.on('data', (d) => {
        out += d;
        const m = /http:\/\/127\.0\.0\.1:\d+\/\?t=\S+/.exec(out);
        if (m) { clearTimeout(t); resolve(new URL(m[0])); }
      });
      child.on('exit', (code) => reject(new Error(`exited ${code}: ${out} ${err}`)));
    });
    const h = { 'x-nexus-token': url.searchParams.get('t') };
    for (const p of ['/api/sessions', '/api/plan', '/api/inbox', '/api/sessions/vega']) {
      const r = await req(Number(url.port), { pathname: p, headers: h });
      assert.equal(r.status, 200, `${p}: ${r.data}`);
    }
    await new Promise((r) => setTimeout(r, 7500 / 20 + 300)); // the whole script, at 20x
    const info = JSON.parse((await req(Number(url.port), { pathname: '/api/demo', headers: h })).data);
    assert.ok(info.log.some((e) => e.kind === 'owner'), 'the scripted answer ran');
    assert.equal(child.exitCode, null, 'still serving: nothing it did was refused');
    assert.doesNotMatch(err, /ERR_ACCESS_DENIED/);
  } finally {
    child.kill();
  }
});
