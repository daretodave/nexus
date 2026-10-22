// A reorder from the GUI lands (spec 47 A11): written and committed in a temporary worktree of origin's default branch,
// never the checkout the GUI runs from. Owner: settled (when the repo has settle) and pushed to main. Contributor: a
// branch and a pull request. Every git child runs without GIT_DIR and friends, and its hooks run through wrappers
// that unset them: an old hook whose gate runs `git init --bare` never makes the person's repo bare.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/server.mjs';
import { landReorder, listedIds, splitArgs } from '../server/reorder.mjs';
import { GIT_LEAKS, gitEnv, runClean, safeHooks } from '../server/cloud.mjs';
import { removeTreeSync } from './helpers/tmp.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'templates', 'scripts');
const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');
const FAKE = { kind: 'fake', send() {}, async interrupt() {}, async stop() {}, async fresh() {} };
const NOW = new Date(2020, 9, 21, 15, 30, 12);

const SPEC = [
  '# 07 — Search', '', '> Find anything.', '', '## Acceptance', '',
  '- **A1** results', '- **A2** an empty state', '- **A3** paging', '',
  '## Chunks', '', 'Measure: 3 open · 1 closed · next A4', '',
  '- [ ] **07.2** Results list · M · closes A1 · needs —',
  '- [ ] **07.3** Empty state · S · closes A2 · needs —',
  '- [ ] **07.4** Paging · S · closes A3 · needs —',
  '',
].join('\n');
const README = [
  '# Plan', '', '## Lanes', '', '**Asap** (built before the table):', '', '- (none)', '',
  '**Held** (waits):', '', '- (none)', '', '## Specs', '',
  '| # | Initiative | Spec | Status | Progress |', '|---|---|---|---|---|',
  '| 07 | Search | [07-search.md](07-search.md) | planned | 3 left |', '',
].join('\n');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: gitEnv(), stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** The person's checkout (owner or not) with a bare origin; `settle` false leaves the repo without the kit's settle. */
function fixture({ owner = true, settle = true, hook = null } = {}) {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-reorder-land-'));
  const origin = path.join(top, 'origin.git');
  const dir = path.join(top, 'me');
  fs.mkdirSync(dir);
  git(top, 'init', '-q', '--bare', '-b', 'main', origin);
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.name', 'Dave');
  git(dir, 'config', 'user.email', 'd@x');
  fs.mkdirSync(path.join(dir, 'scripts', 'plan'), { recursive: true });
  for (const f of fs.readdirSync(path.join(KIT, 'plan'))) fs.copyFileSync(path.join(KIT, 'plan', f), path.join(dir, 'scripts', 'plan', f));
  if (!settle) fs.rmSync(path.join(dir, 'scripts', 'plan', 'settle.mjs'));
  for (const f of ['plan-check.mjs', 'owner.mjs']) fs.copyFileSync(path.join(KIT, f), path.join(dir, 'scripts', f));
  fs.mkdirSync(path.join(dir, 'plan', 'pending'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'plan', 'README.md'), README);
  fs.writeFileSync(path.join(dir, 'plan', '07-search.md'), SPEC);
  fs.writeFileSync(path.join(dir, 'plan', 'ARCHIVE.md'), '# Archive\n\n- 2026-10-01 · 07.1 · search box · abc1234\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), '.owner\n.nexus/\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'seed');
  git(dir, 'remote', 'add', 'origin', origin);
  git(dir, 'push', '-q', '-u', 'origin', 'main');
  git(dir, 'remote', 'set-head', 'origin', 'main');
  if (owner) fs.writeFileSync(path.join(dir, '.owner'), 'owner\n');
  if (hook) {
    const h = path.join(dir, '.git', 'hooks', 'pre-commit');
    fs.writeFileSync(h, hook, { mode: 0o755 });
  }
  // the person's own work in progress: a dirty edit the landing must keep
  fs.appendFileSync(path.join(dir, 'plan', 'ARCHIVE.md'), 'my edit\n');
  return { top, dir, origin, done: () => removeTreeSync(top) };
}

/** What origin's main holds at `rel`. */
const onMain = (f, rel) => git(f.origin, 'show', `main:${rel}`);
const pendingOnMain = (f) => git(f.origin, 'ls-tree', '--name-only', 'main', 'plan/pending/').split('\n').filter((n) => /reorder-/.test(n));

/** The person's checkout is as it was: same HEAD, their edit kept, no pending file, one worktree, no leftover branch. */
function untouched(f, head) {
  assert.equal(git(f.dir, 'rev-parse', 'HEAD'), head);
  assert.match(fs.readFileSync(path.join(f.dir, 'plan', 'ARCHIVE.md'), 'utf8'), /my edit\n$/);
  assert.deepEqual(fs.readdirSync(path.join(f.dir, 'plan', 'pending')), []);
  assert.equal(git(f.dir, 'status', '--porcelain'), 'M plan/ARCHIVE.md');
  assert.equal(git(f.dir, 'worktree', 'list').split('\n').length, 1, 'the temporary worktree is gone');
  assert.equal(git(f.dir, 'branch', '--list', 'nexus/*'), '');
  assert.equal(git(f.dir, 'config', '--get', 'core.bare'), 'false', 'the repo is never made bare');
}

/** runClean, recording each child. */
function recorder() {
  const calls = [];
  const run = (cmd, args, o = {}) => {
    calls.push({ cmd, args });
    return runClean(cmd, args, o);
  };
  return { calls, run };
}

/** Run fn with GIT_* pointing somewhere else, as a hook or a parent git leaves them. */
async function underHookEnv(f, fn) {
  const saved = {};
  for (const k of GIT_LEAKS) saved[k] = process.env[k];
  Object.assign(process.env, { GIT_DIR: path.join(f.top, 'nowhere'), GIT_WORK_TREE: f.top, GIT_INDEX_FILE: path.join(f.top, 'idx'), GIT_PREFIX: 'x/' });
  try {
    return await fn();
  } finally {
    for (const k of GIT_LEAKS) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  }
}

test('splitArgs reads settle\'s printed commit line', () => {
  assert.deepEqual(splitArgs('commit -q -m "plan: settle 07.2" -- plan/07-search.md plan/pending/reorder-07.md'),
    ['commit', '-q', '-m', 'plan: settle 07.2', '--', 'plan/07-search.md', 'plan/pending/reorder-07.md']);
  assert.deepEqual(splitArgs('commit -m "say \\"hi\\""'), ['commit', '-m', 'say "hi"']);
});

test('owner: the reorder is committed, settled and pushed to main from a temporary worktree; the checkout is untouched', async () => {
  const f = fixture();
  try {
    const head = git(f.dir, 'rev-parse', 'HEAD');
    const rec = recorder();
    const r = await underHookEnv(f, () => landReorder(f.dir, { id: '07.4', after: null }, { owner: true, now: NOW, run: rec.run }));
    assert.equal(r.landed, 'main');
    assert.equal(r.settled, true);
    assert.deepEqual(r.order, ['07.4', '07.2', '07.3']);
    assert.match(r.note, /^Reordered on main: 07\.4 to the top of spec 07\./);
    // main reads in the new order, settled: no pending reorder left
    assert.deepEqual(listedIds(onMain(f, 'plan/07-search.md')), ['07.4', '07.2', '07.3']);
    assert.deepEqual(pendingOnMain(f), []);
    const log = git(f.origin, 'log', '--format=%s', 'main').split('\n');
    assert.equal(log[1], 'plan: reorder 07.4 to the top of spec 07');
    assert.match(log[0], /^plan: settle/);
    assert.equal(r.commit, git(f.origin, 'rev-parse', '--short', 'main'));
    // the server's own environment pointed git elsewhere (GIT_DIR, GIT_INDEX_FILE, ...): every child ran without it
    assert.ok(rec.calls.length > 4);
    assert.ok(rec.calls.some((c) => c.cmd === process.execPath && /settle\.mjs$/.test(c.args[0])), 'settle ran');
    untouched(f, head);
  } finally {
    f.done();
  }
});

test('owner, no settle script: the pending file lands on main alone and says settle will fold it in', async () => {
  const f = fixture({ settle: false });
  try {
    const head = git(f.dir, 'rev-parse', 'HEAD');
    const r = await landReorder(f.dir, { id: '07.3', after: '07.4' }, { owner: true, now: NOW });
    assert.equal(r.landed, 'main');
    assert.equal(r.settled, false);
    assert.match(r.note, /no settle script/);
    assert.deepEqual(pendingOnMain(f), ['plan/pending/reorder-07-20201021-153012.md']);
    assert.deepEqual(listedIds(onMain(f, 'plan/07-search.md')), ['07.2', '07.3', '07.4'], 'the spec waits for a settle');
    untouched(f, head);
  } finally {
    f.done();
  }
});

test('contributor: a nexus/reorder branch, pushed, and a pull request; main is never pushed', async () => {
  const f = fixture({ owner: false });
  try {
    const head = git(f.dir, 'rev-parse', 'HEAD');
    const before = git(f.origin, 'rev-parse', 'main');
    const seen = [];
    const gh = async (args) => { seen.push({ args }); return { ok: true, code: 0, out: 'https://github.com/o/r/pull/7\n', err: '' }; };
    const r = await landReorder(f.dir, { id: '07.2', after: '07.4' }, { owner: false, now: NOW, gh });
    assert.equal(r.landed, 'pr');
    assert.equal(r.pr, 7);
    assert.equal(r.url, 'https://github.com/o/r/pull/7');
    assert.equal(r.branch, 'nexus/reorder-20201021-153012');
    assert.match(r.note, /^Opened PR #7/);
    assert.equal(git(f.origin, 'rev-parse', 'main'), before, 'main is untouched');
    assert.equal(git(f.origin, 'log', '-1', '--format=%s', r.branch), 'plan: reorder 07.2 after 07.4');
    assert.equal(git(f.origin, 'ls-tree', '--name-only', r.branch, 'plan/pending/reorder-07-20201021-153012.md'), 'plan/pending/reorder-07-20201021-153012.md');
    assert.deepEqual(seen[0].args.slice(0, 6), ['pr', 'create', '--base', 'main', '--head', r.branch]);
    assert.equal(seen[0].args[seen[0].args.indexOf('--title') + 1], 'plan: reorder 07.2 after 07.4');
    untouched(f, head);
  } finally {
    f.done();
  }
});

// An old pre-commit hook (no unset line) whose gate runs `git init --bare` in a temp folder: under a linked worktree
// git hands the hook an absolute GIT_DIR, which would make that init rewrite the person's repo as bare.
const OLD_HOOK = (log) => [
  '#!/bin/sh',
  `env | grep '^GIT_' >> "${log.split(path.sep).join('/')}" || true`,
  't=$(mktemp -d)',
  'git init -q --bare "$t/gate.git"',
  'rm -rf "$t"',
  'exit 0',
  '',
].join('\n');

test('an old hook runs through a wrapper that unsets GIT_DIR: the gate\'s git init never makes the repo bare', async () => {
  const log = path.join(os.tmpdir(), `nexus-hook-env-${process.pid}-${Date.now()}.txt`);
  const f = fixture({ hook: OLD_HOOK(log) });
  try {
    const head = git(f.dir, 'rev-parse', 'HEAD');
    const r = await landReorder(f.dir, { id: '07.4', after: '07.2' }, { owner: true, now: NOW });
    assert.equal(r.landed, 'main');
    assert.ok(fs.existsSync(log), 'the hook ran');
    const seen = fs.readFileSync(log, 'utf8');
    for (const k of GIT_LEAKS) assert.doesNotMatch(seen, new RegExp(`^${k}=`, 'm'), `the hook saw ${k}`);
    assert.equal(git(f.dir, 'config', '--get', 'core.bare'), 'false');
    untouched(f, head);
  } finally {
    fs.rmSync(log, { force: true });
    f.done();
  }
});

test('a hook that refuses: 409 with what it said, nothing pushed, the worktree removed', async () => {
  const f = fixture({ hook: '#!/bin/sh\necho "gate: 3 tests failed" >&2\nexit 1\n' });
  try {
    const head = git(f.dir, 'rev-parse', 'HEAD');
    const before = git(f.origin, 'rev-parse', 'main');
    await assert.rejects(landReorder(f.dir, { id: '07.4', after: null }, { owner: true, now: NOW }),
      (e) => e.status === 409 && /hook said no/.test(e.message) && /gate: 3 tests failed/.test(e.message));
    assert.equal(git(f.origin, 'rev-parse', 'main'), before);
    untouched(f, head);
  } finally {
    f.done();
  }
});

test('safeHooks: one wrapper per hook, honouring core.hooksPath; none for samples', async () => {
  const f = fixture({ hook: '#!/bin/sh\nexit 0\n' });
  try {
    const a = await safeHooks(f.dir);
    assert.deepEqual(fs.readdirSync(a.dir), ['pre-commit']);
    const w = fs.readFileSync(path.join(a.dir, 'pre-commit'), 'utf8');
    assert.equal(w.split('\n')[1], `unset ${GIT_LEAKS.join(' ')}`);
    assert.match(w, /^exec ".*\/hooks\/pre-commit" "\$@"$/m);
    a.cleanup();
    assert.equal(fs.existsSync(a.dir), false);
    fs.mkdirSync(path.join(f.dir, '.githooks'));
    fs.writeFileSync(path.join(f.dir, '.githooks', 'pre-push'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    git(f.dir, 'config', 'core.hooksPath', '.githooks');
    const b = await safeHooks(f.dir);
    assert.deepEqual(fs.readdirSync(b.dir), ['pre-push']);
    assert.match(fs.readFileSync(path.join(b.dir, 'pre-push'), 'utf8'), /\.githooks\/pre-push"/);
    b.cleanup();
  } finally {
    f.done();
  }
});

test('POST /api/plan/reorder lands it and answers what landed; a refused move is a 400', async () => {
  const f = fixture();
  const app = await startServer({ repo: f.dir, provider: FAKE, pollRuns: false, dist: NO_DIST });
  try {
    const post = await call(app, 'POST', '/api/plan/reorder', { id: '07.3', after: null });
    assert.equal(post.status, 200, JSON.stringify(post.body));
    assert.equal(post.body.landed, 'main');
    assert.equal(post.body.mode, 'owner');
    assert.deepEqual(listedIds(onMain(f, 'plan/07-search.md')), ['07.3', '07.2', '07.4']);
    const refused = await call(app, 'POST', '/api/plan/reorder', { id: '07.2', after: '09.1' });
    assert.equal(refused.status, 400);
    assert.match(refused.body.error, /within its spec/);
    assert.equal(git(f.dir, 'worktree', 'list').split('\n').length, 1);
  } finally {
    await app.close();
    f.done();
  }
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
