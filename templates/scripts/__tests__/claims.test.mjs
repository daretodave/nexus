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
import { fileURLToPath } from 'node:url';
import { HOOKS_DIR, HOOK_FRESH_MS, PRIVILEGED, TTL_MS, assign, attachPr, audit, claim, fetchClaims, hookProblem, main, parse, prune, pushCount, redrawBoard, release, renew, sessionId, verdict } from '../claims.mjs';

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
  // The hook check is off here (this suite may itself run inside a Claude Code session); its own case turns it on.
  const env = (extra = {}) => ({ ...ENV, NEXUS_SESSION: 'cli-s1', NEXUS_GH_LOGIN: '', NEXUS_CONTRIBUTOR: '', NEXUS_NO_HOOK_CHECK: '1', ...extra });
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

  it("tags a claim with the session's ledger star, shows it in whoami and list, and never orphans an older tag", () => {
    const ledger = (id, star, state = 'live') => {
      const d = path.join(a, '.nexus', 'sessions');
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, `${id}.json`), JSON.stringify({ id, star, state, claims: id.slice(0, 8) }));
    };
    const tag = (id) => fetchClaims(a).map[id].split('|')[4];
    // No ledger yet: today's tag, no star.
    assert.equal(JSON.parse(run(a, ['whoami', '--json']).out).star, '');
    assert.equal(run(a, ['claim', '16.1']).code, 0);
    assert.equal(tag('16.1'), 's:cli-s1');
    // The ledger names this session vega: whoami and a new claim carry it, and the older claim stays this session's.
    ledger('cli-s1', 'vega');
    const who = JSON.parse(run(a, ['whoami', '--json']).out);
    assert.deepEqual([who.session, who.star], ['cli-s1', 'vega']);
    assert.match(run(a, ['whoami']).out, /session cli-s1~vega/);
    assert.equal(run(a, ['release', '16.1']).code, 0);
    assert.equal(run(a, ['claim', '16.1']).code, 0);
    assert.equal(tag('16.1'), 's:cli-s1~vega');
    const rows = JSON.parse(run(a, ['list', '--json']).out);
    assert.deepEqual(rows.map((x) => [x.id, x.session, x.star, x.mine]), [['16.1', 'cli-s1', 'vega', true]]);
    assert.match(run(b, ['list']).out, /cli-s1~vega/);
    // An older tag (written before the star) renews and releases by the id alone; the renew gives it the star.
    run(a, ['claim', '16.3'], { NEXUS_SESSION: 'cli-s2' });
    ledger('cli-s2', 'sirius');
    assert.equal(tag('16.3'), 's:cli-s2');
    assert.deepEqual(JSON.parse(run(a, ['renew', '--json'], { NEXUS_SESSION: 'cli-s2' }).out).renewed, ['16.3']);
    assert.equal(tag('16.3'), 's:cli-s2~sirius');
    assert.deepEqual(JSON.parse(run(a, ['release', '16.3', '--json'], { NEXUS_SESSION: 'cli-s2' }).out), { released: ['16.3'], kept: [] });
    // The Claude Code session finds its ledger by the full id; --session finds one by its claims id.
    ledger('abcdef123456', 'polaris');
    assert.equal(JSON.parse(run(a, ['whoami', '--json'], { NEXUS_SESSION: '', CLAUDE_CODE_SESSION_ID: 'abcdef123456' }).out).star, 'polaris');
    assert.equal(JSON.parse(run(a, ['whoami', '--json', '--session', 'abcdef12']).out).star, 'polaris');
    assert.equal(JSON.parse(run(a, ['whoami', '--json', '--session', 'nobody']).out).star, '');
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

  it('whoami warns on stderr, in one line naming NEXUS_SESSION, when the session falls back to the parent pid', () => {
    const say = (extra, argv = ['whoami']) => {
      const out = [];
      const err = [];
      const code = main(argv, { cwd: a, env: env(extra), out: (t) => out.push(t), err: (t) => err.push(t) });
      return { code, out: out.join('\n'), err };
    };
    const bare = say({ NEXUS_SESSION: '', CLAUDE_CODE_SESSION_ID: '' });
    assert.equal(bare.code, 0);
    assert.match(bare.out, /session pid\d+/);
    assert.equal(bare.err.length, 1);
    assert.doesNotMatch(bare.err[0], /\n/);
    assert.match(bare.err[0], /NEXUS_SESSION/);
    const json = say({ NEXUS_SESSION: '', CLAUDE_CODE_SESSION_ID: '' }, ['whoami', '--json']);
    assert.match(JSON.parse(json.out).session, /^pid\d+$/);
    assert.equal(json.err.length, 1);
    assert.deepEqual(say({}).err, []);
    assert.deepEqual(say({ NEXUS_SESSION: '', CLAUDE_CODE_SESSION_ID: 'abcdef123456' }).err, []);
    assert.deepEqual(say({ NEXUS_SESSION: '', CLAUDE_CODE_SESSION_ID: '' }, ['whoami', '--session', 'mine']).err, []);
  });
  it("refuses whoami and claim in a Claude Code session that loaded no hooks; the guard hook's marker, worktree or not, lets it", () => {
    const SID = 'f00dfeed-0000-4000-8000-000000000001';
    const cc = { NEXUS_NO_HOOK_CHECK: '', CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: SID, NEXUS_SESSION: '' };
    // No marker: whoami and claim refuse, naming the fix and the override; nothing is claimed; list still reads.
    assert.throws(() => run(a, ['whoami'], cc), /loaded no project hooks.*\.claude\/settings\.json.*NEXUS_NO_HOOK_CHECK=1/s);
    assert.throws(() => run(a, ['claim', '16.1'], cc), /loaded no project hooks/);
    assert.equal(fetchClaims(a).tip, null);
    assert.equal(run(a, ['list'], cc).code, 0);
    // The guard hook, fired in the primary checkout with the session id on stdin, writes the marker there.
    const guard = fileURLToPath(new URL('../../claude/hooks/guard.mjs', import.meta.url));
    const input = JSON.stringify({ session_id: SID, cwd: a, tool_input: { command: 'ls' } });
    const hook = spawnSync(process.execPath, [guard, 'pre-bash'], { cwd: a, input, encoding: 'utf8', env: { ...ENV, CLAUDE_CODE_SESSION_ID: '', CLAUDE_PROJECT_DIR: '' } });
    assert.equal(hook.status, 0, hook.stderr);
    assert.ok(fs.existsSync(path.join(a, HOOKS_DIR, SID)), 'the guard wrote the marker');
    assert.equal(JSON.parse(run(a, ['whoami', '--json'], cc).out).session, SID.slice(0, 8));
    // A worktree of that checkout reads the same marker (the primary checkout's .nexus/).
    const wt = path.join(dir, 'wt-a');
    git(a, 'worktree', 'add', '-q', '--detach', wt);
    assert.equal(hookProblem(wt, cc), '');
    assert.equal(run(wt, ['claim', '16.1'], cc).code, 0);
    // Another session's marker is not this one's; a stale marker refuses until the hook touches it again.
    assert.match(hookProblem(a, { ...cc, CLAUDE_CODE_SESSION_ID: 'other-session' }), /other-session/);
    const old = (Date.now() - HOOK_FRESH_MS - 60_000) / 1000;
    fs.utimesSync(path.join(a, HOOKS_DIR, SID), old, old);
    assert.match(hookProblem(wt, cc), /loaded no project hooks/);
    // CLAUDECODE with no session id: any fresh marker will do.
    assert.match(hookProblem(a, { ...cc, CLAUDE_CODE_SESSION_ID: '' }), /loaded no project hooks/);
    fs.writeFileSync(path.join(a, HOOKS_DIR, 'some-session'), new Date().toISOString());
    assert.equal(hookProblem(a, { ...cc, CLAUDE_CODE_SESSION_ID: '' }), '');
    // The override, and any shell outside Claude Code, skip the check.
    assert.equal(hookProblem(b, { ...cc, NEXUS_NO_HOOK_CHECK: '1' }), '');
    assert.equal(hookProblem(b, { CLAUDECODE: '', CLAUDE_CODE_SESSION_ID: '' }), '');
    assert.equal(run(b, ['claim', '16.3'], { ...cc, CLAUDECODE: '', CLAUDE_CODE_SESSION_ID: '', NEXUS_SESSION: 'term-1' }).code, 0);
  });
});
