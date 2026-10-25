// `nexus upgrade --write`, `--land`, `--rollback` and the first-tick watch (spec 58, A8). Real git over a local bare
// remote in the temp folder; gh is a stub (never the real one, never a real GitHub repo), and the clock and the
// waits are injected, so the idle-window wait, the pause around the push and the watch run in milliseconds.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { COMMIT_SUBJECT, BRANCH, detect, kitSource, upgrade, runUpgrade } from '../server/upgrade.mjs';
import { ROLLBACK_LINE, ROLLBACK_SUBJECT, ROLLBACK_BRANCH, cronTools, land, nextFire, v1Lock, waitIdle } from '../server/upgrade-land.mjs';

// The upgrade's own commits (gitIn) take the process's identity.
Object.assign(process.env, { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com' });

const scratch = [];
after(() => { for (const d of scratch) fs.rmSync(d, { recursive: true, force: true }); });
const tmp = (p) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); scratch.push(d); return d; };
const git = (cwd, ...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
const put = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
const commit = (dir, msg) => { git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', msg); return git(dir, 'rev-parse', '--short', 'HEAD'); };
const sink = () => { const lines = []; const f = (s) => lines.push(s); f.text = () => lines.join('\n'); return f; };
const subject = (dir, ref) => git(dir, 'log', '-1', '--format=%s', ref);

/** A live v1 repo (Cloud-Run commits on main): a bare origin, the seed that pushes to it, a local clone. */
function v1() {
  const bare = tmp('nexus-land-origin-');
  git(bare, 'init', '-q', '--bare', '-b', 'main');
  const seed = tmp('nexus-land-seed-');
  git(seed, 'init', '-q', '-b', 'main');
  git(seed, 'remote', 'add', 'origin', bare);
  put(seed, 'package.json', '{ "name": "@acme/field-notes" }\n');
  put(seed, 'src/a.txt', 'one\n');
  const one = commit(seed, 'feat: bootstrap\n\nCloud-Run: https://example.invalid/runs/1');
  put(seed, 'agents.md', '# Field notes — agents.md\n\nShip with /ship-a-phase.\n');
  put(seed, 'plan/README.md', '# Field notes plan\n\n## Editorial calendar\n\nOurs.\n');
  put(seed, 'plan/steps/01_build_plan.md', `# 01 — Build plan\n\n## Status (at-a-glance)\n\n- [x] Phase 1 — Bootstrap (commit ${one})\n- [ ] Phase 2 — Search\n\n## Phase log (commit hashes)\n\n`);
  put(seed, 'plan/phases/phase_2_search.md', '# Phase 2 — Search\n\n## Scope\n\nA query finds a note.\n');
  put(seed, 'skills/ship-a-phase.md', '# ship-a-phase\n');
  commit(seed, 'plan: the v1 plan\n\nCloud-Run: https://example.invalid/runs/2');
  git(seed, 'push', '-q', 'origin', 'main');
  const local = tmp('nexus-land-local-');
  git(local, 'clone', '-q', bare, '.');
  return { bare, seed, local, v1sha: git(bare, 'rev-parse', 'main') };
}

/** A fake clock: sleep moves it on. */
function clock(at = '2026-10-25T12:00:00Z') {
  let t = Date.parse(at);
  return { now: () => t, sleep: async (ms) => { t += ms; }, iso: () => new Date(t).toISOString() };
}

/**
 * A stubbed gh: every call recorded as one string. `busy` is how many idle checks see a run in progress first;
 * `tick` runs on `workflow run` (a tick pushing its commit); `hooks[call]` runs before that call answers.
 */
function stubGh(c, { busy = 0, tick = null, conclusion = 'success', hooks = {}, fail = {} } = {}) {
  const calls = [];
  const inputs = [];
  let listed = 0;
  let dispatchedAt = null;
  let watched = 0;
  const ok = (stdout = '') => ({ ok: true, code: 0, stdout, stderr: '' });
  const gh = async (args, { input } = {}) => {
    const a = args.join(' ');
    calls.push(a);
    if (input != null) inputs.push(input);
    for (const [k, f] of Object.entries(hooks)) if (a.startsWith(k)) f();
    for (const [k, msg] of Object.entries(fail)) if (a.startsWith(k)) return { ok: false, code: 1, stdout: '', stderr: msg };
    if (a.startsWith('run list') && a.includes('--event workflow_dispatch')) {
      if (!dispatchedAt) return ok('[]');
      watched += 1;
      const status = watched < 2 ? 'in_progress' : 'completed';
      return ok(JSON.stringify([{ databaseId: 4242, status, conclusion: status === 'completed' ? conclusion : null, createdAt: dispatchedAt, url: 'https://example.invalid/runs/4242' }]));
    }
    if (a.startsWith('run list')) {
      listed += 1;
      return ok(JSON.stringify(listed <= busy ? [{ databaseId: 41, status: 'in_progress', event: 'schedule', createdAt: c.iso() }] : [{ databaseId: 40, status: 'completed', event: 'schedule', createdAt: '2026-10-25T09:00:00Z' }]));
    }
    if (a === 'workflow disable march.yml' || a === 'workflow enable march.yml') return ok();
    if (a === 'variable set NEXUS_LOOP_MODE --body owner') return ok();
    if (a.startsWith('workflow run march.yml')) { dispatchedAt = c.iso(); tick?.(); return ok(); }
    if (a.startsWith('run view 4242')) return ok(JSON.stringify({ jobs: [{ name: 'owner', conclusion }, { name: 'pr', conclusion: 'skipped' }] }));
    if (a.startsWith('api repos/{owner}/{repo}/pulls')) return ok(JSON.stringify({ number: 7, html_url: 'https://example.invalid/pull/7' }));
    return { ok: false, code: 1, stdout: '', stderr: `stub gh: unexpected ${a}` };
  };
  return { gh, calls, inputs };
}

/** The first v2 tick, as the stub's dispatch runs it: the seed pulls the upgrade and pushes one commit. */
const tickPushes = (r) => () => {
  git(r.seed, 'pull', '-q', '--ff-only', 'origin', 'main');
  put(r.seed, 'plan/02-search.md.note', 'chunked\n');
  commit(r.seed, 'plan: chunk spec 02');
  git(r.seed, 'push', '-q', 'origin', 'main');
};

const quick = (c, gh, extra = {}) => ({ land: { gh, now: c.now, sleep: c.sleep, pollMs: 30000, waitMs: 3600000, watchMs: 3600000, log: () => {}, ...extra } });

test('--write: the gate green, one commit on nexus/upgrade-v2 atop the fetched origin; nothing pushed, the checkout untouched', async () => {
  const r = v1();
  const status = git(r.local, 'status', '--porcelain');
  const { code, report } = await upgrade({ repo: r.local, today: '2026-10-25', write: true });
  assert.equal(code, 0, JSON.stringify(report.gate, null, 2) + (report.error || ''));
  assert.equal(report.dry, false);
  assert.equal(report.commit.branch, BRANCH);
  assert.equal(report.commit.subject, COMMIT_SUBJECT);
  assert.equal(git(r.local, 'rev-parse', BRANCH), report.commit.sha, 'the branch outlives the worktree, in the local repo');
  assert.equal(git(r.local, 'rev-parse', `${BRANCH}^`), r.v1sha, 'one commit atop origin/main');
  assert.equal(subject(r.local, BRANCH), COMMIT_SUBJECT);
  assert.match(git(r.local, 'log', '-1', '--format=%b', BRANCH), /First tick \(predicted\): \/next/);
  assert.doesNotMatch(git(r.local, 'log', '-1', '--format=%B', BRANCH), /Co-Authored-By/);
  assert.equal(detect(r.local).shape, 'v1', 'the local checkout is not switched or written');
  assert.equal(git(r.local, 'status', '--porcelain'), status);
  assert.equal(git(r.local, 'worktree', 'list').split('\n').length, 1, 'the worktree is removed');
  assert.equal(git(r.bare, 'rev-parse', 'main'), r.v1sha, 'nothing pushed');
  const tree = git(r.local, 'ls-tree', '-r', '--name-only', BRANCH);
  assert.match(tree, /^plan\/nexus\.lock$/m);
  assert.doesNotMatch(tree, /^plan\/steps\//m);
});

test('--land owner: an idle window, march paused around the push, NEXUS_LOOP_MODE set, the first v2 tick dispatched and watched', async () => {
  const r = v1();
  const c = clock();
  let atDisable = null;
  let atEnable = null;
  const s = stubGh(c, { busy: 2, tick: tickPushes(r), hooks: { 'workflow disable': () => { atDisable = git(r.bare, 'rev-parse', 'main'); }, 'workflow enable': () => { atEnable = git(r.bare, 'rev-parse', 'main'); } } });
  const out = sink();
  const start = c.now();
  const code = await runUpgrade(['--repo', r.local, '--land'], { out, err: out, today: '2026-10-25', opts: quick(c, s.gh) });
  assert.equal(code, 0, out.text());
  // The wait: two idle checks saw a running tick; the third found the window.
  assert.deepEqual(s.calls.slice(0, 3).map((x) => x.split(' --json')[0]), ['run list --workflow march.yml', 'run list --workflow march.yml', 'run list --workflow march.yml']);
  assert.ok(c.now() - start >= 60000, 'it slept between the checks');
  const at = (call) => s.calls.findIndex((x) => x.startsWith(call));
  const order = ['workflow disable march.yml', 'variable set NEXUS_LOOP_MODE --body owner', 'workflow enable march.yml', 'workflow run march.yml --ref main', 'run view 4242'].map(at);
  assert.ok(order.every((n, k) => n >= 0 && (k === 0 || n > order[k - 1])), `${order}\n${s.calls.join('\n')}`);
  assert.equal(atDisable, r.v1sha, 'paused before the push');
  assert.notEqual(atEnable, r.v1sha, 'pushed before resuming');
  assert.equal(subject(r.bare, atEnable), COMMIT_SUBJECT);
  assert.equal(git(r.bare, 'rev-parse', `${atEnable}^`), r.v1sha, 'a fast-forward of origin');
  const text = out.text();
  for (const want of ['land (owner)', 'idle window', 'paused march', 'set NEXUS_LOOP_MODE=owner', 'resumed march', 'dispatched the first v2 tick', 'first v2 tick', 'run       4242 success', 'dispatch  owner (success)', 'plan: chunk spec 02', 'predicted /next']) {
    assert.ok(text.includes(want), `${want}\n---\n${text}`);
  }
  assert.ok(!text.includes(ROLLBACK_LINE), 'the tick did work: no rollback line');
});

test('a first tick that pushes nothing where the report predicted work prints the --rollback line', async () => {
  const r = v1();
  const c = clock();
  const s = stubGh(c);
  const out = sink();
  assert.equal(await runUpgrade(['--repo', r.local, '--land', 'owner'], { out, err: out, today: '2026-10-25', opts: quick(c, s.gh) }), 0, out.text());
  assert.match(out.text(), /\(none: the tick pushed nothing\)/);
  assert.match(out.text(), /pushed nothing where the report predicted work/);
  assert.ok(out.text().includes(ROLLBACK_LINE), out.text());
});

test('no idle window in the wait: nothing paused, nothing pushed, exit 1', async () => {
  const r = v1();
  const c = clock();
  const s = stubGh(c, { busy: 1000 });
  const out = sink();
  assert.equal(await runUpgrade(['--repo', r.local, '--land', 'owner'], { out, err: out, today: '2026-10-25', opts: quick(c, s.gh, { waitMs: 600000 }) }), 1);
  assert.match(out.text(), /no idle window within 10 min \(march run 41 is in_progress\)/);
  assert.ok(!s.calls.some((x) => x.startsWith('workflow')), s.calls.join('\n'));
  assert.equal(git(r.bare, 'rev-parse', 'main'), r.v1sha);
  assert.equal(git(r.local, 'rev-parse', BRANCH).length, 40, 'the commit stays on its branch to land later');
});

test('a refused push (origin moved since the fetch) still resumes march, exit 1', async () => {
  const r = v1();
  const c = clock();
  const moved = () => { put(r.seed, 'src/z.txt', 'a tick slipped in\n'); commit(r.seed, 'feat: late tick'); git(r.seed, 'push', '-q', 'origin', 'main'); };
  const s = stubGh(c, { hooks: { 'workflow disable': moved } });
  const out = sink();
  assert.equal(await runUpgrade(['--repo', r.local, '--land', 'owner', '--no-watch'], { out, err: out, today: '2026-10-25', opts: quick(c, s.gh) }), 1);
  assert.match(out.text(), /git push origin main was refused \(origin\/main moved since the fetch\? run the upgrade again\)/);
  assert.ok(s.calls.includes('workflow enable march.yml'), 'resumed whatever failed');
  assert.ok(!s.calls.some((x) => x.startsWith('workflow run')), 'no dispatch');
  assert.equal(subject(r.bare, 'main'), 'feat: late tick');
});

test('a gh that cannot resume march says so loudly', async () => {
  const r = v1();
  const c = clock();
  const s = stubGh(c, { fail: { 'workflow enable': 'HTTP 403' } });
  const res = await land({ repo: r.local, sha: r.v1sha, branch: 'main', base: 'main', how: 'owner', gh: s.gh, now: c.now, sleep: c.sleep, pollMs: 1000, waitMs: 60000, dispatch: false });
  assert.equal(res.ok, false);
  assert.match(res.error, /march is still paused: gh workflow enable march\.yml failed \(HTTP 403\); run it by hand/);
});

test('--no-pause skips the pause; --no-watch dispatches and stops there', async () => {
  const r = v1();
  const c = clock();
  const s = stubGh(c);
  const out = sink();
  assert.equal(await runUpgrade(['--repo', r.local, '--land', 'owner', '--no-pause', '--no-watch'], { out, err: out, today: '2026-10-25', opts: quick(c, s.gh) }), 0, out.text());
  assert.ok(!s.calls.some((x) => /^workflow (disable|enable)/.test(x)), s.calls.join('\n'));
  assert.ok(s.calls.includes('workflow run march.yml --ref main'));
  assert.ok(!s.calls.some((x) => x.includes('--event workflow_dispatch')), 'not watched');
  assert.equal(subject(r.bare, 'main'), COMMIT_SUBJECT);
});

test('--land pr: the branch pushed and a pull request opened with the report as its body; main untouched', async () => {
  const r = v1();
  const c = clock();
  const s = stubGh(c);
  const out = sink();
  assert.equal(await runUpgrade(['--repo', r.local, '--land', 'pr'], { out, err: out, today: '2026-10-25', opts: quick(c, s.gh) }), 0, out.text());
  assert.equal(git(r.bare, 'rev-parse', 'main'), r.v1sha);
  assert.equal(subject(r.bare, BRANCH), COMMIT_SUBJECT);
  assert.ok(!s.calls.some((x) => x.startsWith('workflow')), 'a pull request pauses nothing');
  const pr = JSON.parse(s.inputs[0]);
  assert.deepEqual([pr.title, pr.head, pr.base], [COMMIT_SUBJECT, BRANCH, 'main']);
  assert.match(pr.body, /files \(/);
  assert.match(pr.body, /first dispatch \(predicted\)/);
  assert.match(out.text(), /opened pull request #7 https:\/\/example\.invalid\/pull\/7/);
});

test('--rollback: one revert commit, the lock pinned to v1.0.0, landed with a pause and no dispatch; a second run finds it done', async () => {
  const r = v1();
  const c = clock();
  const out = sink();
  assert.equal(await runUpgrade(['--repo', r.local, '--land', 'owner', '--no-watch'], { out, err: out, today: '2026-10-25', opts: quick(c, stubGh(c).gh) }), 0, out.text());
  const upgraded = git(r.bare, 'rev-parse', 'main');
  assert.equal(subject(r.bare, upgraded), COMMIT_SUBJECT);

  const s = stubGh(c);
  const back = sink();
  assert.equal(await runUpgrade(['--repo', r.local, '--rollback', '--land', 'owner'], { out: back, err: back, opts: quick(c, s.gh) }), 0, back.text());
  const head = git(r.bare, 'rev-parse', 'main');
  assert.equal(subject(r.bare, head), ROLLBACK_SUBJECT);
  assert.equal(git(r.bare, 'rev-parse', `${head}^`), upgraded, 'one commit');
  assert.match(git(r.bare, 'log', '-1', '--format=%b', head), new RegExp(`Reverts ${upgraded}`));
  assert.deepEqual(git(r.bare, 'diff', '--name-only', r.v1sha, head).split('\n'), ['plan/nexus.lock'], 'the v1 tree back, the lock aside');
  assert.equal(git(r.bare, 'show', `${head}:plan/nexus.lock`), v1Lock(null).trim());
  assert.ok(s.calls.includes('workflow disable march.yml') && s.calls.includes('workflow enable march.yml'));
  assert.ok(!s.calls.some((x) => x.startsWith('workflow run') || x.startsWith('variable')), s.calls.join('\n'));
  assert.equal(git(r.local, 'rev-parse', ROLLBACK_BRANCH), head);
  const check = tmp('nexus-land-check-');
  git(check, 'clone', '-q', r.bare, '.');
  assert.equal(detect(check).shape, 'v1', 'the repo reads as v1 again');
  assert.match(back.text(), /reverted [0-9a-f]{7} \(plan: upgrade to nexus v2/);

  const again = sink();
  assert.equal(await runUpgrade(['--repo', r.local, '--rollback'], { out: again, err: again }), 0);
  assert.match(again.text(), /already rolled back by [0-9a-f]{7}/);
});

test('--rollback with no upgrade commit on origin exits 2', async () => {
  const r = v1();
  const out = sink();
  assert.equal(await runUpgrade(['--repo', r.local, '--rollback'], { out, err: out }), 2);
  assert.match(out.text(), /nothing to roll back/);
  assert.equal(git(r.local, 'worktree', 'list').split('\n').length, 1);
});

test('the idle window waits out a cron due within ten minutes; v1Lock pins an existing lock', async () => {
  const kit = await kitSource();
  const lib = await cronTools(kit.root);
  assert.ok(lib, 'the kit carries cadence.mjs');
  const c = clock('2026-10-25T11:55:00Z');
  assert.equal(new Date(nextFire(['0 * * * *'], c.now(), lib)).toISOString(), '2026-10-25T12:00:00.000Z');
  assert.equal(nextFire([], c.now(), lib), null);
  const s = stubGh(c);
  const lines = [];
  const w = await waitIdle({ gh: s.gh, crons: ['0 * * * *'], lib, now: c.now, sleep: c.sleep, waitMs: 3600000, pollMs: 60000, log: (l) => lines.push(l) });
  assert.equal(w.ok, true);
  assert.equal(c.iso(), '2026-10-25T12:00:00.000Z', 'it waited out the :00 slot');
  assert.match(lines[0], /the next cron fires in 5 min \(under 10\)/);
  assert.equal(v1Lock('kit: nexus\nversion: 2.0.0\nref: v2.0.0\nshape: chunks\nadopted: 2026-10-25\n'), 'kit: nexus\nversion: 1.0.0\nref: v1.0.0\nshape: phases\nadopted: 2026-10-25\n');
});
