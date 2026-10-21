// claims.mjs over git: the claims branch is a compare-and-swap (two clones racing for one chunk: exactly one wins), a
// contributor claims one chunk (or a package) and never takes the owner's, claims belong to their session, a stale
// claim is reclaimed and a PR'd or held one isn't, an unreadable file is never overwritten, prune and audit drop what
// is done (a pending close counts), and every command speaks JSON with --json. Each case builds scratch repositories
// in the temp folder: offline, but every case spawns git (the opt-in `scripts-git` gate leg). node:test, no deps.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import { PRIVILEGED, TTL_MS, assign, attachPr, audit, claim, fetchClaims, main, parse, prune, pushCount, redrawBoard, release, renew, sessionId, verdict } from '../claims.mjs';

// A git hook's GIT_DIR or GIT_WORK_TREE would point these commands at the real repository: never inherit them.
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
for (const k of Object.keys(process.env)) if (k.startsWith('GIT_')) delete process.env[k];
const dirs = [];
after(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

function git(cwd, ...args) {
  const res = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: ENV });
  if (res.status !== 0) throw new Error(`git ${args.join(' ')}: ${res.stderr}`);
  return res.stdout.trim();
}

let dir, origin, a, b;
function clone(name) {
  const p = path.join(dir, name);
  git(dir, 'clone', '-q', origin, p);
  git(p, 'config', 'user.name', name);
  git(p, 'config', 'user.email', `${name}@example.com`);
  git(p, 'config', 'core.hooksPath', path.join(dir, 'no-hooks'));
  return p;
}

const dev = (who, host = `${who}-pc`, session = `${who}-s1`) => ({ owner: false, who, ip: '10.0.0.2', host, session });
const owner = { owner: true, who: PRIVILEGED, ip: '10.0.0.1', host: 'owner-pc', session: 'loop-a' };
const owner2 = { ...owner, session: 'loop-b' };

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-claims-'));
  dirs.push(dir);
  origin = path.join(dir, 'origin.git');
  git(dir, 'init', '-q', '--bare', '-b', 'main', origin);
  const seed = path.join(dir, 'seed');
  git(dir, 'init', '-q', '-b', 'main', seed);
  fs.mkdirSync(path.join(seed, 'plan', 'pending'), { recursive: true });
  fs.writeFileSync(path.join(seed, 'plan', '16-search.md'), '## Chunks\n\n- [ ] **16.1** a · S · closes A1 · needs —\n- [ ] **16.2** b · S · closes A2 · needs —\n- [ ] **16.3** c · S · closes A3 · needs —\n');
  fs.writeFileSync(path.join(seed, 'plan', 'ARCHIVE.md'), '# Archive\n\n- 2026-10-01 · 16.0 · the first · abc1234\n');
  fs.writeFileSync(path.join(seed, 'plan', 'pending', '16.2.md'), '---\nclose: 16.2\ndate: 2026-10-10\nsays: b works\n---\n');
  git(seed, 'add', '-A');
  git(seed, '-c', 'user.name=s', '-c', 'user.email=s@example.com', 'commit', '-q', '-m', 'seed');
  git(seed, 'push', '-q', origin, 'main');
  a = clone('alex');
  b = clone('sam');
});

describe('the claims branch', () => {
  it('is an orphan branch made by the first claim; a race for one chunk has one winner', () => {
    assert.equal(fetchClaims(a).tip, null);
    assert.equal(claim(a, ['16.1'], dev('alex')).ok, true);
    const { tip, map } = fetchClaims(b);
    assert.deepEqual(Object.keys(map), ['16.1']);
    assert.equal(parse(map['16.1']).who, 'alex');
    assert.deepEqual(git(b, 'ls-tree', '--name-only', tip).split('\n').sort(), ['README.md', 'claims.json']);
    assert.equal(git(b, 'rev-list', '--max-parents=0', tip), tip);
    const lost = claim(b, ['16.1'], dev('sam'));
    assert.equal(lost.ok, false);
    assert.match(lost.results[0].why, /held by alex/);
  });

  it('a stale local tip loses the push and retries on the new tip, keeping both claims', () => {
    assert.equal(claim(a, ['16.1'], dev('alex')).ok, true);
    fetchClaims(b);
    assert.equal(claim(a, ['16.2'], dev('alex', 'alex-pc', 'alex-s2')).ok, true);
    assert.equal(claim(b, ['16.3'], dev('sam')).ok, true);
    assert.deepEqual(Object.keys(fetchClaims(a).map), ['16.1', '16.2', '16.3']);
  });

  it('a contributor claims one id per call or a package; the owner claims a group; all or nothing', () => {
    assert.throws(() => claim(a, ['16.1', '16.2'], dev('alex')), /one chunk at a time/);
    assert.throws(() => claim(a, ['nonsense'], owner), /not a chunk id/);
    assert.equal(claim(b, ['16.2'], dev('sam')).ok, true);
    assert.equal(claim(a, ['16.1', '16.2', '16.3'], owner).ok, false);
    assert.deepEqual(Object.keys(fetchClaims(a).map), ['16.2']);
    assert.equal(claim(a, ['16.1', '16.3'], dev('alex'), { pkg: true }).ok, true);
    assert.deepEqual(Object.keys(fetchClaims(a).map), ['16.1', '16.2', '16.3']);
  });

  it('belongs to its session: one owner loop renews and releases only its own, never a crashed loop\'s', () => {
    assert.equal(claim(a, ['37.1', '37.2'], owner, { now: () => Date.now() - TTL_MS + 60_000 }).ok, true);
    assert.equal(claim(a, ['39.4'], owner2).ok, true);
    assert.equal(claim(a, ['37.1'], owner2).ok, false);
    assert.deepEqual(renew(a, [], owner2), ['39.4']);
    assert.deepEqual(release(a, ['37.1', '39.4'], owner2), { gone: ['39.4'], kept: ['37.1'] });
    assert.equal(claim(a, ['37.2'], owner2, { force: true }).results[0].why, 'taken over');
    assert.equal(claim(a, ['37.1'], owner2, { now: () => Date.now() + 120_000 }).results[0].why, 'reclaimed');
  });

  it('a spec being chunked and its chunks exclude each other; a stale one is reclaimed, a PR kept through renewals', () => {
    assert.equal(claim(a, ['06'], owner).ok, true);
    assert.match(claim(b, ['06.3'], dev('sam')).results[0].why, /06 is held/);
    assert.equal(claim(b, ['16.1'], dev('sam'), { now: () => Date.now() - 2 * TTL_MS }).ok, true);
    assert.equal(claim(a, ['16.1'], dev('alex')).results[0].why, 'reclaimed');
    assert.equal(attachPr(a, '16.1', 9, dev('alex')), true);
    assert.equal(attachPr(b, '16.1', 10, dev('sam')), false);
    assert.deepEqual(renew(a, ['16.1'], dev('alex')), ['16.1']);
    assert.equal(parse(fetchClaims(a).map['16.1']).pr, 9);
  });

  it('refuses to write over a claims file it cannot read, rather than wiping it', () => {
    assert.equal(claim(a, ['16.1'], dev('alex')).ok, true);
    const bad = spawnSync('git', ['-C', a, 'hash-object', '-w', '--stdin'], { input: 'not json', encoding: 'utf8', env: ENV }).stdout.trim();
    const tree = spawnSync('git', ['-C', a, 'mktree'], { input: `100644 blob ${bad}\tclaims.json\n`, encoding: 'utf8', env: ENV }).stdout.trim();
    const tip = git(a, 'rev-parse', 'refs/remotes/origin/claims');
    const commit = git(a, 'commit-tree', tree, '-p', tip, '-m', 'broken');
    git(a, 'push', '-q', 'origin', `${commit}:refs/heads/claims`);
    assert.throws(() => claim(b, ['16.2'], dev('sam')), /can't be read/);
    assert.equal(git(b, 'rev-parse', 'refs/remotes/origin/claims'), commit);
  });

  it('prune drops merged and closed PRs; a held claim keeps its hold when its PR closes', () => {
    assert.throws(() => assign(a, ['42.5'], dev('alex'), { to: 'sam', login: 'sam-gh' }), /only the owner/);
    assert.equal(assign(a, ['42.5'], owner, { to: 'sam', login: '@sam-gh' }).ok, true);
    assert.equal(claim(a, ['42.5'], dev('alex')).ok, false);
    assert.equal(claim(b, ['42.5'], dev('sam', 'laptop', 's7')).results[0].why, 'yours');
    assert.equal(attachPr(b, '42.5', 8, dev('sam', 'laptop', 's8')), true);
    claim(a, ['16.4'], dev('alex'));
    attachPr(a, '16.4', 6, dev('alex'));
    const states = { 6: 'MERGED', 8: 'CLOSED' };
    assert.deepEqual(prune(a, { prState: (n) => states[n] }).sort(), ['16.4 (PR #6 merged)', '42.5 (PR #8 closed, still held for sam)']);
    assert.deepEqual([parse(fetchClaims(a).map['42.5']).held, parse(fetchClaims(a).map['42.5']).pr], ['sam-gh', null]);
  });

  it('audit: a pending close counts as archived, a chunk no spec lists is gone; --release drops them', () => {
    const before = pushCount();
    assert.equal(claim(a, ['16.1', '16.2', '16.9'], owner).ok, true);
    assert.equal(pushCount(), before + 1);
    const r = audit(a, owner, { prState: () => 'UNKNOWN' });
    assert.deepEqual(r.rows.map((x) => [x.id, x.why]), [['16.1', null], ['16.2', 'archived'], ['16.9', 'gone']]);
    const rel = audit(a, owner, { doRelease: true, prState: () => 'UNKNOWN' });
    assert.deepEqual(rel.released, ['16.2', '16.9']);
    assert.deepEqual(Object.keys(fetchClaims(a).map), ['16.1']);
    const held = { who: 'x', host: 'h', at: new Date(0).toISOString(), session: '', pr: null, held: 'x', base: '' };
    assert.equal(verdict('16.1', held, { archive: '', specs: ['**16.1**'], names: [] }), null);
    // A bare number no spec holds yet is a new spec's reservation (/plot): kept while fresh, gone once stale.
    const fresh = { ...held, held: null, at: new Date().toISOString() };
    assert.equal(verdict('77', fresh, { archive: '', specs: [], names: [] }), null);
    assert.equal(verdict('77', { ...fresh, at: new Date(0).toISOString() }, { archive: '', specs: [], names: [] }), 'gone');
  });
});

describe('the CLI', () => {
  const env = (extra = {}) => ({ ...ENV, NEXUS_SESSION: 'cli-s1', NEXUS_GH_LOGIN: '', NEXUS_CONTRIBUTOR: '', ...extra });
  const run = (cwd, argv, extra) => {
    const out = [];
    const code = main(argv, { cwd, env: env(extra), out: (t) => out.push(t), err: (t) => out.push(t) });
    return { code, out: out.join('\n') };
  };

  it('answers --json for whoami, claim, list, free, renew, release and audit', () => {
    fs.writeFileSync(path.join(a, '.owner'), '');
    const who = JSON.parse(run(a, ['whoami', '--json']).out);
    assert.deepEqual([who.owner, who.who, who.session], [true, PRIVILEGED, 'cli-s1']);
    assert.equal(JSON.parse(run(a, ['whoami', '--json'], { NEXUS_CONTRIBUTOR: '1' }).out).owner, false);
    const c = run(a, ['claim', '16.1', '16.3', '--json']);
    assert.equal(c.code, 0);
    assert.deepEqual(JSON.parse(c.out).results.map((x) => x.why), ['free', 'free']);
    const rows = JSON.parse(run(b, ['list', '--json']).out);
    assert.deepEqual(rows.map((x) => [x.id, x.state, x.mine]), [['16.1', 'live', false], ['16.3', 'live', false]]);
    assert.equal(JSON.parse(run(a, ['list', '--json']).out)[0].mine, true);
    const free = run(b, ['free', '16.1', '--json']);
    assert.equal(free.code, 1);
    assert.match(JSON.parse(free.out).why, /held by privileged_agent_session/);
    assert.deepEqual(JSON.parse(run(a, ['renew', '--json']).out).renewed, ['16.1', '16.3']);
    assert.deepEqual(JSON.parse(run(a, ['release', '16.3', '--json']).out), { released: ['16.3'], kept: [] });
    const au = JSON.parse(run(a, ['audit', '--json']).out);
    assert.deepEqual(au.rows.map((x) => [x.id, x.why]), [['16.1', null]]);
    assert.match(run(a, ['claim', '16.2', '--session', 'other']).out, /16\.2: free/);
    assert.equal(run(a, ['nope']).code, 2);
  });

  it('takes the session from NEXUS_SESSION, then the Claude Code session, and dispatches no board unless asked', () => {
    assert.equal(sessionId({ NEXUS_SESSION: 'x1' }), 'x1');
    assert.equal(sessionId({ CLAUDE_CODE_SESSION_ID: 'abcdef123456' }), 'abcdef12');
    assert.match(sessionId({}), /^pid\d+$/);
    const calls = [];
    assert.equal(redrawBoard({ env: {}, run: (...x) => calls.push(x) }), false);
    assert.equal(calls.length, 0);
    assert.equal(redrawBoard({ env: { NEXUS_CLAIMS_BOARD: 'board.yml' }, run: (...x) => (calls.push(x), { status: 0 }) }), true);
    assert.deepEqual(calls[0][1], ['workflow', 'run', 'board.yml', '--ref', 'main']);
  });
});
