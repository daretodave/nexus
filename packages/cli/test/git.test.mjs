// Git per session and the repo's worktree panel (spec 40 A6): fixture repos in temp dirs, the kit's own
// worktree.mjs for verdicts, gh stubbed through the injected ghRun (never PATH). Read-only: the tidy dry run
// lists and every worktree is still there after it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/server.mjs';
import { ciOf, parseStatus, claimsOf, worktreeRow, tidyPlan } from '../server/git.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const A = 'aaaaaaaa-1111-4111-8111-111111111111';
const B = 'bbbbbbbb-2222-4222-8222-222222222222';

const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (f, text) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };

function fixture() {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-cli-git-')));
  const origin = path.join(base, 'origin.git');
  const root = path.join(base, 'repo');
  const wt = (n) => path.join(base, 'wt', n);
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
  fs.mkdirSync(root);
  sh(root, 'init', '-q', '-b', 'main');
  sh(root, 'config', 'user.email', 't@example.com');
  sh(root, 'config', 'user.name', 'T');
  write(path.join(root, 'scripts', 'worktree.mjs'), fs.readFileSync(path.join(KIT, 'templates', 'scripts', 'worktree.mjs'), 'utf8'));
  write(path.join(root, '.gitignore'), '.nexus/\n');
  write(path.join(root, 'README.md'), 'hi\n');
  sh(root, 'add', '-A');
  sh(root, 'commit', '-q', '-m', 'feat: first');
  sh(root, 'remote', 'add', 'origin', origin);
  sh(root, 'push', '-q', '-u', 'origin', 'main');
  // A remote branch of a closed PR, and a local branch main already holds.
  sh(root, 'push', '-q', 'origin', 'main:next/9.1');
  sh(root, 'fetch', '-q', 'origin');
  sh(root, 'branch', 'merged-1');

  // vega: a live session, one commit beyond main, a staged and an unstaged change.
  sh(root, 'worktree', 'add', '-q', '-b', 'nexus/vega-1', wt('vega-1'));
  write(path.join(wt('vega-1'), 'a.txt'), 'a\n');
  sh(wt('vega-1'), 'add', 'a.txt');
  sh(wt('vega-1'), '-c', 'user.email=t@example.com', '-c', 'user.name=T', 'commit', '-q', '-m', 'feat: vega work');
  write(path.join(wt('vega-1'), 'b.txt'), 'b\n');
  sh(wt('vega-1'), 'add', 'b.txt');
  write(path.join(wt('vega-1'), 'a.txt'), 'a2\n');
  // rigel: nobody, clean, nothing beyond main: what /tidy would close.
  sh(root, 'worktree', 'add', '-q', '-b', 'nexus/rigel-1', wt('rigel-1'));
  // deneb: nobody, but it holds a commit: kept.
  sh(root, 'worktree', 'add', '-q', '-b', 'nexus/deneb-1', wt('deneb-1'));
  write(path.join(wt('deneb-1'), 'd.txt'), 'd\n');
  sh(wt('deneb-1'), 'add', 'd.txt');
  sh(wt('deneb-1'), '-c', 'user.email=t@example.com', '-c', 'user.name=T', 'commit', '-q', '-m', 'feat: deneb work');
  // old: git lists it, its folder is gone.
  sh(root, 'worktree', 'add', '-q', '-b', 'nexus/old-1', wt('old-1'));
  fs.rmSync(wt('old-1'), { recursive: true, force: true });
  // lock: locked by this (live) process, as an agent harness locks its worktree.
  sh(root, 'worktree', 'add', '-q', '-b', 'nexus/lock-1', wt('lock-1'));
  sh(root, 'worktree', 'lock', '--reason', `claude agent (pid ${process.pid})`, wt('lock-1'));
  // altair: its session fell over (a live ledger whose beat went stale).
  sh(root, 'worktree', 'add', '-q', '-b', 'nexus/altair-1', wt('altair-1'));

  const now = new Date().toISOString();
  const old = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  write(path.join(root, '.nexus', 'sessions', `${A}.json`), JSON.stringify({ id: A, star: 'vega', state: 'live', beat: now, worktree: wt('vega-1'), branch: 'nexus/vega-1' }));
  write(path.join(root, '.nexus', 'sessions', `${B}.json`), JSON.stringify({ id: B, star: 'altair', state: 'live', beat: old, worktree: wt('altair-1'), branch: 'nexus/altair-1' }));
  return { base, root, wt };
}

function fakeGh() {
  const calls = [];
  const run = async (cmd, args) => {
    calls.push([cmd, ...args]);
    if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'list' && args.includes('open')) {
      return { ok: true, code: 0, stderr: '', stdout: JSON.stringify([
        { number: 7, title: 'Vega work', headRefName: 'nexus/vega-1', author: { login: 'dave' }, isDraft: false, url: 'https://example.com/pr/7', statusCheckRollup: [{ __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'FAILURE' }] },
        { number: 8, title: 'Docs', headRefName: 'docs-x', author: { login: 'jun' }, isDraft: true, url: 'https://example.com/pr/8', statusCheckRollup: [] },
      ]) };
    }
    if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'list' && args.includes('closed')) {
      return { ok: true, code: 0, stderr: '', stdout: JSON.stringify([{ headRefName: 'next/9.1' }, { headRefName: 'next/gone-already' }]) };
    }
    return { ok: false, code: 1, stdout: '', stderr: `unexpected: ${cmd} ${args.join(' ')}` };
  };
  return { run, calls };
}

function req(port, token, { method = 'GET', pathname, body }) {
  return new Promise((resolve, reject) => {
    const headers = { host: `127.0.0.1:${port}`, 'x-nexus-token': token };
    if (method !== 'GET') Object.assign(headers, { origin: `http://127.0.0.1:${port}`, 'content-type': 'application/json' });
    const r = http.request({ host: '127.0.0.1', port, method, path: pathname, headers }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null }));
    });
    r.on('error', reject);
    r.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

const fakeProvider = () => ({ kind: 'fake', sent: [], active: false, send(t) { this.sent.push(t); }, async interrupt() {}, async stop() {}, async fresh() {} });

async function serve(fx, gh) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-cli-claude-'));
  return startServer({
    repo: fx.root, provider: fakeProvider(), pollRuns: false, dist: path.join(os.tmpdir(), 'nexus-cli-no-dist'), claudeHome: home,
    ghRun: gh?.run,
    git: { claims: async () => ({ rows: [{ id: '40.6', session: A.slice(0, 8) }, { id: '40.9', session: A }, { id: '12.1', session: 'someone' }] }), ttl: { prs: 0, claims: 0, session: 0 } },
  });
}

test('ciOf reads gh\'s rollup: red beats running beats queued beats green; no checks is null', () => {
  assert.equal(ciOf([]), null);
  assert.equal(ciOf([{ status: 'COMPLETED', conclusion: 'SUCCESS' }, { status: 'COMPLETED', conclusion: 'SKIPPED' }]), 'green');
  assert.equal(ciOf([{ status: 'COMPLETED', conclusion: 'SUCCESS' }, { status: 'QUEUED' }]), 'queued');
  assert.equal(ciOf([{ status: 'IN_PROGRESS' }, { status: 'QUEUED' }]), 'running');
  assert.equal(ciOf([{ status: 'IN_PROGRESS' }, { status: 'COMPLETED', conclusion: 'TIMED_OUT' }]), 'red');
  assert.equal(ciOf([{ __typename: 'StatusContext', state: 'PENDING' }]), 'queued');
  assert.equal(ciOf([{ __typename: 'StatusContext', state: 'ERROR' }]), 'red');
});

test('parseStatus counts staged apart from unstaged and untracked', () => {
  const s = parseStatus('## nexus/vega-1...origin/nexus/vega-1 [ahead 1]\nM  b.txt\n M a.txt\nMM c.txt\n?? new.txt\n');
  assert.deepEqual(s, { branch: 'nexus/vega-1', upstream: 'origin/nexus/vega-1', dirty: 3, staged: 2 });
  assert.equal(parseStatus('## HEAD (no branch)\n').branch, '');
  assert.equal(parseStatus('## No commits yet on main\n').branch, 'main');
});

test('claimsOf matches a claim by the session id or its first eight characters', () => {
  const rows = [{ id: '1.1', session: A.slice(0, 8) }, { id: '1.2', session: A }, { id: '1.3', session: 'cccccccc' }, { id: '1.4' }];
  assert.deepEqual(claimsOf(rows, { id: A }).map((c) => c.id), ['1.1', '1.2']);
  assert.deepEqual(claimsOf(rows, { id: 'x', claude: 'cccccccc-9' }).map((c) => c.id), ['1.3']);
});

test('worktreeRow flags and tidyPlan only lists: idle and safe or orphaned go, the rest is kept with why', () => {
  const safe = worktreeRow({ path: '/w/a', branch: 'a', verdict: 'safe', exists: true }, null);
  const work = worktreeRow({ path: '/w/b', branch: 'b', verdict: 'holds work', exists: true, ahead: 2, dirty: 1 }, null);
  const gone = worktreeRow({ path: '/w/c', branch: 'c', verdict: 'orphan', exists: false }, null);
  const live = worktreeRow({ path: '/w/d', branch: 'd', verdict: 'safe', exists: true }, { id: 's1', name: 'vega', state: 'live' });
  const fell = worktreeRow({ path: '/w/e', branch: 'e', verdict: 'safe', exists: true }, { id: 's2', name: 'altair', state: 'fallen' });
  const lock = worktreeRow({ path: '/w/f', branch: 'f', verdict: 'locked', exists: true, locked: true, pid: 42, pidAlive: true }, null);
  const stale = worktreeRow({ path: '/w/g', branch: 'g', verdict: 'locked', exists: true, locked: true, pid: 43, pidAlive: false }, null);
  const pr = worktreeRow({ path: '/w/h', branch: 'h', verdict: 'safe', exists: true }, null, { pr: { num: 5, ci: 'green' } });
  assert.deepEqual([safe, work, gone, live, fell, lock, stale, pr].map((w) => w.flag), ['idle', 'idle', 'orphaned', 'active', 'fallen', 'active', 'idle', 'idle']);
  assert.equal(lock.who, 'pid 42');
  assert.match(stale.act, /locked by pid 43 \(dead\)/);
  assert.match(work.act, /2 commits beyond/);
  const plan = tidyPlan({ worktrees: [safe, work, gone, live, fell, lock, stale, pr], merged: ['m'], remote: ['next/1.1'] });
  assert.deepEqual(plan.worktrees.map((w) => w.branch), ['a', 'c']);
  assert.equal(plan.keep, 6);
  assert.deepEqual(plan.holds.map((w) => w.branch), ['b']);
  assert.match(plan.keepNote, /holds work \(b\)/);
  assert.deepEqual(plan.branches, ['m']);
  assert.deepEqual(plan.remote, ['next/1.1']);
});

test('GET /api/git: every worktree with its session and flag, the primary checkout, main, open PRs with CI', async () => {
  const fx = fixture();
  const gh = fakeGh();
  const app = await serve(fx, gh);
  try {
    const r = await req(app.port, app.token, { pathname: '/api/git' });
    assert.equal(r.status, 200);
    const d = r.data;
    assert.equal(d.repo, 'repo');
    assert.equal(d.worktreeScript, 'scripts/worktree.mjs', 'verdicts come from the repo\'s own worktree.mjs');
    const by = Object.fromEntries(d.worktrees.map((w) => [w.branch, w]));
    assert.deepEqual(Object.keys(by).sort(), ['nexus/altair-1', 'nexus/deneb-1', 'nexus/lock-1', 'nexus/old-1', 'nexus/rigel-1', 'nexus/vega-1']);
    assert.equal(by['nexus/vega-1'].flag, 'active');
    assert.equal(by['nexus/vega-1'].who, 'vega');
    assert.equal(by['nexus/vega-1'].sessionId, A);
    assert.ok(by['nexus/vega-1'].dirty >= 2);
    assert.deepEqual(by['nexus/vega-1'].pr, { num: 7, ci: 'red', url: 'https://example.com/pr/7' });
    assert.match(by['nexus/vega-1'].age, /^\d{4}-\d\d-\d\dT/);
    assert.match(by['nexus/vega-1'].act, /^committed [0-9a-f]{7}/);
    assert.equal(by['nexus/altair-1'].flag, 'fallen');
    assert.equal(by['nexus/rigel-1'].flag, 'idle');
    assert.equal(by['nexus/rigel-1'].verdict, 'safe');
    assert.equal(by['nexus/deneb-1'].verdict, 'holds work');
    assert.equal(by['nexus/deneb-1'].ahead, 1);
    // 41.8 links the orphaned worktree: its path, branch and head travel with it.
    assert.equal(by['nexus/old-1'].flag, 'orphaned');
    assert.equal(by['nexus/old-1'].exists, false);
    assert.equal(path.resolve(by['nexus/old-1'].path), path.resolve(fx.wt('old-1')));
    assert.match(by['nexus/old-1'].head, /^[0-9a-f]{40}$/);
    assert.equal(by['nexus/lock-1'].flag, 'active');
    assert.equal(by['nexus/lock-1'].pidAlive, true);
    assert.equal(by['nexus/lock-1'].who, `pid ${process.pid}`);
    assert.equal(d.root.branch, 'main');
    assert.equal(d.root.dirty, 0);
    assert.equal(d.root.upstream, 'origin/main');
    assert.equal(d.main.base, 'origin/main');
    assert.deepEqual([d.main.ahead, d.main.behind], [0, 0]);
    assert.equal(d.main.commits[0].m, 'feat: first');
    assert.deepEqual(d.prs.map((p) => [p.num, p.ci]), [[7, 'red'], [8, null]]);
    assert.match(d.prs[0].desc, /^vega · nexus\/vega-1 · dave$/);
    assert.match(d.prs[1].desc, /draft/);
    assert.equal(d.gh, true);
    assert.ok(gh.calls.every((c) => c[0] === 'gh'), 'gh only through the injected runner');
  } finally {
    await app.close();
  }
});

test('GET /api/git/tidy lists what /tidy would offer and changes nothing', async () => {
  const fx = fixture();
  const app = await serve(fx, fakeGh());
  try {
    const before = sh(fx.root, 'worktree', 'list', '--porcelain');
    const branches = sh(fx.root, 'branch', '--format=%(refname:short)');
    const r = await req(app.port, app.token, { pathname: '/api/git/tidy' });
    assert.equal(r.status, 200);
    assert.equal(r.data.dry, true);
    assert.deepEqual(r.data.worktrees.map((w) => w.branch).sort(), ['nexus/old-1', 'nexus/rigel-1']);
    assert.deepEqual(r.data.branches, ['merged-1']);
    assert.deepEqual(r.data.remote, ['next/9.1']);
    assert.equal(r.data.keep, 4);
    assert.deepEqual(r.data.holds.map((w) => w.branch), ['nexus/deneb-1']);
    assert.equal(sh(fx.root, 'worktree', 'list', '--porcelain'), before, 'no worktree closed or pruned');
    assert.equal(sh(fx.root, 'branch', '--format=%(refname:short)'), branches, 'no branch deleted');
    assert.ok(fs.existsSync(fx.wt('rigel-1')));
    assert.equal((await req(app.port, app.token, { method: 'POST', pathname: '/api/git/tidy', body: {} })).status, 404, 'the tidy itself is not served: /tidy runs it');
  } finally {
    await app.close();
  }
});

test('a repo without worktree.mjs lists worktrees from git and has no dry run', async () => {
  const fx = fixture();
  fs.rmSync(path.join(fx.root, 'scripts', 'worktree.mjs'));
  const app = await serve(fx, fakeGh());
  try {
    const g = await req(app.port, app.token, { pathname: '/api/git' });
    assert.equal(g.data.worktreeScript, null);
    assert.equal(g.data.worktrees.length, 6);
    assert.equal(g.data.worktrees.find((w) => w.branch === 'nexus/old-1').flag, 'orphaned');
    const t = await req(app.port, app.token, { pathname: '/api/git/tidy' });
    assert.equal(t.status, 404);
    assert.match(t.data.error, /worktree\.mjs/);
  } finally {
    await app.close();
  }
});

test('every session carries its git: branch, worktree, ahead/behind, dirty and staged, five commits, PR and checks, claims', async () => {
  const fx = fixture();
  const app = await serve(fx, fakeGh());
  try {
    const list = (await req(app.port, app.token, { pathname: '/api/sessions' })).data;
    const vega = list.find((s) => s.id === A);
    assert.ok(vega, 'the vega ledger is listed');
    const g = vega.git;
    assert.equal(g.branch, 'nexus/vega-1');
    assert.equal(path.resolve(g.worktree), path.resolve(fx.wt('vega-1')));
    assert.equal(g.base, 'origin/main');
    assert.deepEqual([g.ahead, g.behind, g.up, g.down], [1, 0, 1, 0]);
    assert.deepEqual([g.dirty, g.staged], [1, 1]);
    assert.deepEqual(g.commits.map((c) => c.m), ['feat: vega work', 'feat: first']);
    assert.deepEqual(g.pr, { num: 7, ci: 'red', url: 'https://example.com/pr/7', title: 'Vega work' });
    assert.equal(g.claims, 2);
    assert.deepEqual(g.claimIds, ['40.6', '40.9']);
    const detail = (await req(app.port, app.token, { pathname: `/api/sessions/${A}` })).data;
    assert.equal(detail.git.branch, 'nexus/vega-1');
    assert.equal(detail.git.staged, 1);
    assert.equal(detail.git.commits.length, 2);
  } finally {
    await app.close();
  }
});

test('with no gh, the panel still reads git and says why PRs are missing', async () => {
  const fx = fixture();
  const app = await serve(fx, null);
  try {
    const d = (await req(app.port, app.token, { pathname: '/api/git' })).data;
    assert.equal(d.gh, false);
    assert.deepEqual(d.prs, []);
    assert.ok(d.ghNote);
    assert.equal(d.worktrees.length, 6);
  } finally {
    await app.close();
  }
});

test('POST /api/git/fetch prunes remote refs at the primary checkout, nothing else', async () => {
  const fx = fixture();
  const app = await serve(fx, fakeGh());
  try {
    execFileSync('git', ['push', '-q', 'origin', '--delete', 'next/9.1'], { cwd: fx.root });
    execFileSync('git', ['update-ref', 'refs/remotes/origin/next/9.1', 'HEAD'], { cwd: fx.root });
    const r = await req(app.port, app.token, { method: 'POST', pathname: '/api/git/fetch', body: {} });
    assert.equal(r.status, 200);
    assert.equal(sh(fx.root, 'for-each-ref', 'refs/remotes/origin/next'), '');
    assert.ok(fs.existsSync(fx.wt('rigel-1')));
  } finally {
    await app.close();
  }
});
