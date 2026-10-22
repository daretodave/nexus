// Spec 47 A4: the cockpit opens at once, the worktree forms behind it, under the repo's worktree root.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { startServer } from '../server/server.mjs';
import { cleanGit, worktreeRoot } from '../server/fleet.mjs';
import { formNext, formReady, formStart, formWords, lastLine } from '../shared/forming.mjs';

const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the root ------------------------------------------------------------------------

test('worktreeRoot: a configured root wins, relative to the repo or absolute', () => {
  const primary = path.resolve('/w/app');
  assert.deepEqual(worktreeRoot({ primary, local: { worktreeRoot: '../trees' } }), { root: path.resolve('/w/trees'), why: 'config' });
  assert.deepEqual(worktreeRoot({ primary, local: { worktreeRoot: path.resolve('/elsewhere/wt') }, linked: [path.resolve('/w/app-wt/1')] }), { root: path.resolve('/elsewhere/wt'), why: 'config' });
  assert.equal(worktreeRoot({ primary, local: { worktreeRoot: '  ' } }).why, 'kit', 'a blank setting is no setting');
});

test('worktreeRoot: the folder most linked worktrees share is the convention', () => {
  const primary = path.resolve('/w/app');
  const linked = ['/w/trees/a', '/w/trees/b', '/w/other/c'].map((p) => path.resolve(p));
  assert.deepEqual(worktreeRoot({ primary, linked }), { root: path.resolve('/w/trees'), why: 'convention' });
  // No strict majority: the kit default.
  assert.equal(worktreeRoot({ primary, linked: ['/w/trees/a', '/w/other/c'].map((p) => path.resolve(p)) }).why, 'kit');
  // Case folds on Windows only.
  const mixed = ['/w/Trees/a', '/w/trees/b'].map((p) => path.resolve(p));
  assert.equal(worktreeRoot({ primary, linked: mixed, win: true }).why, 'convention');
  assert.equal(worktreeRoot({ primary, linked: mixed, win: false }).why, 'kit');
});

test("worktreeRoot: scratch, the GUI's old .nexus-wt and the repo's own tree do not vote", () => {
  const primary = path.resolve('/w/app');
  const tmp = path.resolve('/tmp');
  const kit = { root: path.join(path.resolve('/w'), 'app-wt'), why: 'kit' };
  assert.deepEqual(worktreeRoot({ primary, tmp, linked: [path.resolve('/tmp/nexus-cloud-1/wt')] }), kit);
  assert.deepEqual(worktreeRoot({ primary, tmp, linked: ['/w/.nexus-wt/vega-1', '/w/.nexus-wt/sirius-1'].map((p) => path.resolve(p)) }), kit);
  const inside = ['/w/app/.claude/worktrees/a', '/w/app/.claude/worktrees/b'].map((p) => path.resolve(p));
  assert.deepEqual(worktreeRoot({ primary, tmp, linked: inside }), kit, 'inside the tree, not ignored: never');
  assert.deepEqual(
    worktreeRoot({ primary, tmp, linked: inside, allowedInside: (p) => p === path.resolve('/w/app/.claude/worktrees') }),
    { root: path.resolve('/w/app/.claude/worktrees'), why: 'convention' },
    'a folder the repo ignores is its convention',
  );
  // The kit default lowercases the repo's folder name, as <PROJECT_LOWER> does.
  assert.equal(worktreeRoot({ primary: path.resolve('/w/MyApp') }).root, path.join(path.resolve('/w'), 'myapp-wt'));
});

// ---- the state machine -------------------------------------------------------------------

test('a form moves forming -> ready | failed, and failed -> forming on retry', () => {
  const f = formStart({ branch: 'nexus/vega-1', worktree: '/w/app-wt/vega-1', root: '/w/app-wt', why: 'kit' }, 1000);
  assert.equal(f.state, 'forming');
  assert.equal(formReady(f), false);
  const p = formNext(f, { type: 'progress', line: 'Preparing worktree\rUpdating files:  40%\r' });
  assert.equal(p.line, 'Updating files:  40%');
  assert.equal(formNext(p, { type: 'progress', line: '\n' }), p, 'an empty line changes nothing');
  const ok = formNext(p, { type: 'ready' }, 2000);
  assert.equal(ok.state, 'ready');
  assert.equal(formReady(ok), true);
  assert.equal(formNext(ok, { type: 'fail', error: 'x' }), ok, 'a ready form never fails after');
  assert.equal(formNext(ok, { type: 'retry' }), ok);
  const bad = formNext(f, { type: 'fail', error: 'fatal: a\nfatal: could not create directory' });
  assert.equal(bad.state, 'failed');
  assert.equal(bad.error, 'fatal: could not create directory');
  assert.equal(formNext(bad, { type: 'ready' }), bad, 'only retry leaves failed');
  const again = formNext(bad, { type: 'retry' }, 5000);
  assert.deepEqual([again.state, again.error, again.attempt, again.at], ['forming', null, 2, 5000]);
  assert.equal(formReady(null), true, 'no form: a session in the repo itself');
  assert.equal(lastLine('a\r\nb\r\n'), 'b');
});

test('formWords: the stage says the star is forming, where, and how long once it is slow', () => {
  const f = formStart({ branch: 'nexus/vega-1' }, 0);
  assert.deepEqual(formWords(f, 2000), { title: 'A star is forming', sub: 'checking out nexus/vega-1...' });
  assert.equal(formWords(f, 12000).sub, 'checking out nexus/vega-1... 12s');
  assert.equal(formWords(formNext(f, { type: 'fail', error: 'fatal: no' })).title, 'The star did not form');
  assert.equal(formWords(formNext(f, { type: 'ready' })), null);
});

// ---- the route ---------------------------------------------------------------------------

function tmpRepo() {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-form-'));
  const dir = path.join(parent, 'repo');
  fs.mkdirSync(dir);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'README.md'), '# r\n');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'init'], { cwd: dir });
  return { parent, dir };
}

function fakes() {
  const by = new Map();
  const factory = (hooks) => {
    const p = { kind: 'fake', sent: [], hooks, send(t) { this.sent.push(t); }, async interrupt() {}, async stop() {}, async fresh() {} };
    by.set(hooks.session, p);
    return p;
  };
  return { by, factory };
}

function call(app, pathname, body) {
  return new Promise((resolve, reject) => {
    const headers = { host: `127.0.0.1:${app.port}`, 'x-nexus-token': app.token };
    if (body !== undefined) Object.assign(headers, { 'content-type': 'application/json', origin: `http://127.0.0.1:${app.port}` });
    const r = http.request({ host: '127.0.0.1', port: app.port, method: body === undefined ? 'GET' : 'POST', path: pathname, headers }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => { let json = null; try { json = JSON.parse(data); } catch { /* html */ } resolve({ status: res.statusCode, json }); });
    });
    r.on('error', reject);
    r.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

function hello(app, session) {
  return new Promise((resolve, reject) => {
    const q = new URLSearchParams({ t: app.token, session });
    const r = http.get({ host: '127.0.0.1', port: app.port, path: `/api/events?${q}`, headers: { host: `127.0.0.1:${app.port}` } }, (res) => {
      let buf = '';
      res.on('data', (d) => {
        buf += d;
        const end = buf.indexOf('\n\n');
        if (end < 0) return;
        r.destroy();
        resolve(JSON.parse(buf.slice(0, end).split('\n').find((l) => l.startsWith('data: ')).slice(6)));
      });
    });
    r.on('error', reject);
  });
}

async function formOf(app, id, until) {
  for (let i = 0; i < 200; i++) {
    const f = (await hello(app, id)).status.form;
    if (f && until(f)) return f;
    await wait(50);
  }
  throw new Error('the form never got there');
}

/** git through runClean, with `worktree add` held until `gate` opens (a slow checkout), and every call recorded. */
function slowGit() {
  let open;
  const gate = new Promise((r) => { open = r; });
  const calls = [];
  const git = async (cwd, args, o = {}) => {
    calls.push(args);
    if (args.includes('worktree') && args.includes('add')) {
      o.onErr?.('Preparing worktree (new branch)\n');
      await gate;
    }
    return cleanGit(cwd, args, o);
  };
  return { git, calls, open };
}

test('POST /api/sessions answers before the worktree exists; it forms behind, then the session works there', async () => {
  const { parent, dir } = tmpRepo();
  const { by, factory } = fakes();
  const g = slowGit();
  const app = await startServer({ repo: dir, provider: factory, pollRuns: false, dist: NO_DIST, ghLogin: async () => '', worktree: { git: g.git } });
  try {
    const r = await call(app, '/api/sessions', { prompt: '/heads-down' });
    assert.equal(r.status, 200);
    const s = r.json;
    assert.equal(s.form.state, 'forming');
    assert.equal(s.branch, 'nexus/vega-1');
    assert.equal(path.resolve(s.worktree), path.resolve(parent, 'repo-wt', 'vega-1'), "the kit's ../<repo>-wt/, never ../.nexus-wt/");
    assert.equal(fs.existsSync(path.join(s.worktree, 'README.md')), false, 'answered before git made it');
    assert.equal(by.has(s.id), false, 'no agent yet: it would start in a folder that is not there');

    // The session's own channel and its detail both say forming; the list carries it for the fleet tile.
    const f = await formOf(app, s.id, (x) => x.line);
    assert.equal(f.state, 'forming');
    assert.match(f.line, /Preparing worktree/);
    assert.equal((await call(app, `/api/sessions/${s.id}`)).json.form.state, 'forming');
    assert.equal((await call(app, '/api/sessions')).json.find((x) => x.id === s.id).form.state, 'forming');
    // What is sent meanwhile waits.
    assert.equal((await call(app, '/api/send', { text: 'and then this', session: s.id })).json.held, true);

    g.open();
    await formOf(app, s.id, (x) => x.state === 'ready');
    assert.ok(fs.existsSync(path.join(s.worktree, 'README.md')));
    const p = by.get(s.id);
    assert.equal(path.resolve(p.hooks.repo), path.resolve(s.worktree), 'the agent starts in its worktree');
    for (let i = 0; i < 40 && p.sent.length < 2; i++) await wait(25);
    assert.deepEqual(p.sent, ['/heads-down', 'and then this'], 'held prompts go in order once it is ready');
    // The worktree add ran through the repo's hooks, made safe (cloud.mjs safeHooks).
    const add = g.calls.find((a) => a.includes('worktree') && a.includes('add'));
    assert.equal(add[0], '-c');
    assert.match(add[1], /^core\.hooksPath=/);
    assert.equal((await call(app, '/api/sessions')).json.find((x) => x.id === s.id).form, undefined, 'a ready form leaves the list');
  } finally {
    g.open();
    await app.close();
    fs.rmSync(parent, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});

test('a worktree that fails to form says why, and Retry forms it in the same place', async () => {
  const { parent, dir } = tmpRepo();
  const { by, factory } = fakes();
  let fail = true;
  const git = async (cwd, args, o) => {
    if (fail && args.includes('worktree') && args.includes('add')) return { ok: false, out: '', err: "fatal: could not create leading directories of 'x'", timedOut: false };
    return cleanGit(cwd, args, o);
  };
  const app = await startServer({ repo: dir, provider: factory, pollRuns: false, dist: NO_DIST, ghLogin: async () => '', worktree: { git } });
  try {
    const s = (await call(app, '/api/sessions', {})).json;
    const bad = await formOf(app, s.id, (x) => x.state === 'failed');
    assert.match(bad.error, /could not create leading directories/);
    assert.equal(by.has(s.id), false);
    fail = false;
    const r = await call(app, `/api/sessions/${s.id}/retry`, {});
    assert.equal(r.status, 200);
    assert.equal(r.json.form.attempt, 2);
    // A retry while it forms (or once it is ready) is refused.
    assert.equal((await call(app, `/api/sessions/${s.id}/retry`, {})).status, 409);
    await formOf(app, s.id, (x) => x.state === 'ready');
    assert.ok(fs.existsSync(path.join(s.worktree, 'README.md')));
    assert.equal(path.resolve(by.get(s.id).hooks.repo), path.resolve(s.worktree));
    assert.equal((await call(app, '/api/sessions/nope0000/retry', {})).status, 404);
  } finally {
    await app.close();
    fs.rmSync(parent, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});

test('a configured worktreeRoot in .nexus/local.json places the worktree', async () => {
  const { parent, dir } = tmpRepo();
  fs.mkdirSync(path.join(dir, '.nexus'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.nexus', 'local.json'), JSON.stringify({ worktreeRoot: '../trees' }));
  const app = await startServer({ repo: dir, provider: fakes().factory, pollRuns: false, dist: NO_DIST, ghLogin: async () => '' });
  try {
    const s = (await call(app, '/api/sessions', {})).json;
    assert.equal(path.resolve(s.worktree), path.resolve(parent, 'trees', 'vega-1'));
    await formOf(app, s.id, (x) => x.state === 'ready');
    assert.ok(fs.existsSync(path.join(s.worktree, 'README.md')));
  } finally {
    await app.close();
    fs.rmSync(parent, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});
