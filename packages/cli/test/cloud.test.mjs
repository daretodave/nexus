// Onboarding's Cloud step served (spec 47, A16): POST /api/cloud/workflow writes the kit's march.yml (filled by the
// installer's own fillPlaceholders) and POST /api/cloud/schedule sets its cron, each landed per owner mode from a
// temporary worktree. Fixture repos push to a bare origin in a temp dir; gh is stubbed through the injected run.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/server.mjs';
import {
  addWorkflow, cronNext, fillTemplate, kitFile, parseCron, readCrons, saveSchedule, scheduleRequest, scopeRefused, setCron,
  SETUP_ACTION_PATH, WORKFLOW_PATH,
} from '../server/cloud.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TEMPLATE = fs.readFileSync(path.join(KIT, 'templates', '.github', 'workflows', 'march.yml'), 'utf8').replace(/\r\n/g, '\n');
const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');

const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (f, text) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };

function fixture({ owner = true } = {}) {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-cloud-test-')));
  const origin = path.join(base, 'origin.git');
  const root = path.join(base, 'repo');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
  fs.mkdirSync(root);
  sh(root, 'init', '-q', '-b', 'main');
  sh(root, 'config', 'user.email', 't@example.com');
  sh(root, 'config', 'user.name', 'T');
  sh(root, 'config', 'core.autocrlf', 'false');
  write(path.join(root, '.gitignore'), '.owner\n.nexus/\n');
  write(path.join(root, 'package.json'), '{ "name": "@acme/widget" }\n');
  write(path.join(root, 'README.md'), 'hi\n');
  sh(root, 'add', '-A');
  sh(root, 'commit', '-q', '-m', 'feat: first');
  sh(root, 'remote', 'add', 'origin', origin);
  sh(root, 'push', '-q', '-u', 'origin', 'main');
  if (owner) write(path.join(root, '.owner'), 'owner\n');
  // The person's own work in progress: never touched.
  write(path.join(root, 'README.md'), 'hi, editing\n');
  return { base, origin, root, at: (ref, rel) => sh(origin, 'show', `${ref}:${rel}`) };
}

/** gh stubbed: variables, pull requests. `prs` is the open PR list it reports. */
function fakeGh({ vars = [], prs = [] } = {}) {
  const calls = [];
  const run = async (cmd, args) => {
    calls.push(args.join(' '));
    const ok = (stdout) => ({ ok: true, code: 0, stdout, stderr: '' });
    if (args[0] === 'variable' && args[1] === 'list') return ok(JSON.stringify(vars));
    if (args[0] === 'variable' && args[1] === 'set') { vars.push({ name: args[2], value: args[4] }); return ok(''); }
    if (args[0] === 'pr' && args[1] === 'list') return ok(JSON.stringify(prs));
    if (args[0] === 'pr' && args[1] === 'create') { prs.push({ url: 'https://example.com/pr/1', number: 1 }); return ok('https://example.com/pr/1\n'); }
    return { ok: false, code: 1, stdout: '', stderr: `unexpected: gh ${args.join(' ')}` };
  };
  return { run, calls, vars, prs };
}

/** The person's checkout as they left it: same HEAD, their edit still there, no workflow written into it. */
function untouched(fx, head) {
  assert.equal(sh(fx.root, 'rev-parse', 'HEAD'), head);
  assert.equal(fs.readFileSync(path.join(fx.root, 'README.md'), 'utf8'), 'hi, editing\n');
  assert.equal(fs.existsSync(path.join(fx.root, WORKFLOW_PATH)), false);
  assert.equal(sh(fx.root, 'worktree', 'list').split('\n').length, 1, 'the temporary worktree is gone');
}

// ---- cron ----------------------------------------------------------------------

test('cronNext reads the forms the Cloud step writes, in UTC', () => {
  const at = (s) => new Date(s);
  const iso = (c, from) => cronNext(c, at(from))?.toISOString();
  assert.equal(iso('0 */2 * * *', '2026-10-22T13:15:00Z'), '2026-10-22T14:00:00.000Z');
  assert.equal(iso('0 */2 * * *', '2026-10-22T14:00:00Z'), '2026-10-22T16:00:00.000Z', 'strictly after');
  assert.equal(iso('0 */2 * * *', '2026-10-22T23:30:00Z'), '2026-10-23T00:00:00.000Z');
  assert.equal(iso('30 5-10 * * *', '2026-10-22T11:00:00Z'), '2026-10-23T05:30:00.000Z');
  assert.equal(iso('30 5-10 * * *', '2026-10-22T07:45:00Z'), '2026-10-22T08:30:00.000Z');
  assert.equal(iso('30 0,1,23 * * *', '2026-10-22T02:00:00Z'), '2026-10-22T23:30:00.000Z', 'a night that wraps midnight');
  assert.equal(iso('0 1,3,5,7,9,11,23 * * *', '2026-10-22T11:00:00Z'), '2026-10-22T23:00:00.000Z', 'the template default');
  assert.equal(iso('15,45 */6 * * *', '2026-10-22T06:20:00Z'), '2026-10-22T06:45:00.000Z');
  assert.equal(iso('0 9 * * 1', '2026-10-22T10:00:00Z'), '2026-10-26T09:00:00.000Z', 'Thursday to Monday');
  assert.equal(iso('0 0 * * 7', '2026-10-22T10:00:00Z'), '2026-10-25T00:00:00.000Z', '7 is Sunday');
  assert.equal(iso('0 0 1 * 1', '2026-10-22T10:00:00Z'), '2026-10-26T00:00:00.000Z', 'day of month or day of week');
  assert.equal(iso('0 0 31 2 *', '2026-10-22T10:00:00Z'), undefined, 'never');
  for (const bad of ['', '0 */2 * *', '60 * * * *', '* 24 * * *', '0 */0 * * *', 'a b c d e', '5-1 * * * *']) assert.equal(parseCron(bad), null, bad);
});

test('scheduleRequest checks the body: a known schedule, a cron this reads, on demand needs none', () => {
  assert.deepEqual(scheduleRequest({ schedule: 'demand', cron: '' }), { schedule: 'demand', cron: null, human: 'on demand' });
  assert.deepEqual(scheduleRequest({ schedule: 'two', cron: ' 0  */2 * * * ' }), { schedule: 'two', cron: '0 */2 * * *', human: 'every 2 hours (cron 0 */2 * * *)' });
  assert.equal(scheduleRequest({ schedule: 'night', cron: '30 5-10 * * *' }).human, 'overnight (cron 30 5-10 * * *)');
  assert.ok(scheduleRequest({ schedule: 'weekly', cron: '0 0 * * 0' }).error);
  assert.ok(scheduleRequest({ schedule: 'two', cron: '' }).error);
  assert.ok(scheduleRequest({ schedule: 'two', cron: 'every two hours' }).error);
});

// ---- the template and its schedule -------------------------------------------------

test('the workflow is the kit template filled by the installer\'s own placeholders', async () => {
  assert.ok(kitFile('march') && kitFile('bootstrap') && kitFile('setup'));
  const yml = await fillTemplate(TEMPLATE, { name: 'widget', branch: 'trunk' });
  assert.doesNotMatch(yml, /<PROJECT>|<DEFAULT_BRANCH>|<PROJECT_PKG_PREFIX>/);
  assert.match(yml, /You are running widget's autonomous loop/);
  assert.match(yml, /origin\/trunk/);
  assert.deepEqual(readCrons(yml), ['0 1,3,5,7,9,11,23 * * *']);
  assert.equal(yml.split('\n').length, TEMPLATE.split('\n').length, 'line for line');
});

test('setCron changes only the cron line; on demand takes the schedule out and keeps workflow_dispatch', () => {
  const before = TEMPLATE.split('\n');
  const set = setCron(TEMPLATE, '30 5-10 * * *');
  assert.deepEqual(readCrons(set), ['30 5-10 * * *']);
  const after = set.split('\n');
  assert.equal(after.length, before.length);
  const changed = after.map((l, i) => (l === before[i] ? null : i)).filter((i) => i != null);
  assert.equal(changed.length, 1);
  assert.equal(after[changed[0]], "    - cron: '30 5-10 * * *'");

  const off = setCron(TEMPLATE, null);
  assert.deepEqual(readCrons(off), []);
  assert.doesNotMatch(off, /^\s+schedule:/m);
  assert.match(off, /^on:\n {2}workflow_dispatch:\n/m);
  // Everything outside the schedule block is the same bytes.
  const s = TEMPLATE.indexOf('  schedule:');
  const e = TEMPLATE.indexOf('  workflow_dispatch:');
  assert.equal(off, TEMPLATE.slice(0, s) + TEMPLATE.slice(e));

  // Back on: a schedule block under on:, and the rest unchanged.
  const on = setCron(off, '0 */2 * * *');
  assert.deepEqual(readCrons(on), ['0 */2 * * *']);
  assert.equal(on.replace("  schedule:\n    - cron: '0 */2 * * *'\n", ''), off);
  assert.equal(setCron(off, null), off);
});

test('setCron keeps line ends, quotes and comments, and folds several crons into one', () => {
  const yml = 'name: x\r\non:\r\n  schedule:\r\n    - cron: "0 1 * * *" # one\r\n    - cron: "0 3 * * *"\r\n  push:\r\njobs: {}\r\n';
  assert.deepEqual(readCrons(yml), ['0 1 * * *', '0 3 * * *']);
  assert.equal(setCron(yml, '0 */2 * * *'), 'name: x\r\non:\r\n  schedule:\r\n    - cron: "0 */2 * * *" # one\r\n  push:\r\njobs: {}\r\n');
  assert.equal(setCron(yml, null), 'name: x\r\non:\r\n  push:\r\njobs: {}\r\n');
  assert.throws(() => setCron('name: x\non: [push]\n', '0 * * * *'), (e) => e.status === 409);
});

test('scopeRefused knows GitHub\'s refusal of a workflow push without the scope', () => {
  assert.ok(scopeRefused('! [remote rejected] HEAD -> main (refusing to allow an OAuth App to create or update workflow `.github/workflows/march.yml` without `workflow` scope)'));
  assert.ok(scopeRefused('refusing to allow a GitHub App to create or update workflow'));
  assert.ok(!scopeRefused('! [rejected] HEAD -> main (fetch first)'));
});

// ---- landing per owner mode -----------------------------------------------------

test('owner: the workflow is committed and pushed to main from a temporary worktree; again writes nothing', async () => {
  const fx = fixture({ owner: true });
  const head = sh(fx.root, 'rev-parse', 'HEAD');
  const gh = fakeGh();
  const r = await addWorkflow(fx.root, { owner: true, run: gh.run });
  assert.equal(r.status, 200, r.error);
  assert.equal(r.path, WORKFLOW_PATH);
  assert.equal(r.written, true);
  assert.equal(r.setup, SETUP_ACTION_PATH);
  assert.equal(r.branch, 'main');
  assert.equal(r.sha, sh(fx.origin, 'rev-parse', 'main'));
  assert.equal(sh(fx.origin, 'log', '-1', '--format=%s', 'main'), 'ci: add the nexus cloud loop');
  const yml = fx.at('main', WORKFLOW_PATH);
  assert.match(yml, /widget's autonomous loop/);
  assert.doesNotMatch(yml, /<PROJECT>|<DEFAULT_BRANCH>/);
  assert.doesNotMatch(fx.at('main', SETUP_ACTION_PATH), /<PROJECT_PKG_PREFIX>/);
  assert.equal(r.mode, 'owner', 'an unset NEXUS_LOOP_MODE is set to owner');
  assert.ok(gh.calls.includes('variable set NEXUS_LOOP_MODE --body owner'));
  assert.ok(!gh.calls.some((c) => c.startsWith('pr ')));
  untouched(fx, head);

  const again = await addWorkflow(fx.root, { owner: true, run: gh.run });
  assert.equal(again.status, 200);
  assert.equal(again.written, false);
  assert.equal(again.path, WORKFLOW_PATH);
  assert.equal(again.sha, r.sha);
  assert.equal(sh(fx.origin, 'rev-list', '--count', 'main'), '2');
});

test('owner: the schedule changes the cron line only, on demand removes it, the same schedule writes nothing', async () => {
  const fx = fixture({ owner: true });
  const head = sh(fx.root, 'rev-parse', 'HEAD');
  const gh = fakeGh({ vars: [{ name: 'NEXUS_LOOP_MODE', value: 'pr' }] });
  const now = new Date('2026-10-22T13:15:00Z');
  // No workflow yet: it comes with this schedule, in one commit; a set variable is left as it is.
  const first = await saveSchedule(fx.root, { schedule: 'two', cron: '0 */2 * * *' }, { owner: true, run: gh.run, now });
  assert.equal(first.status, 200, first.error);
  assert.deepEqual([first.cron, first.next, first.written, first.mode], ['0 */2 * * *', '2026-10-22T14:00:00.000Z', true, 'pr']);
  assert.equal(sh(fx.origin, 'log', '-1', '--format=%s', 'main'), 'ci: add the nexus cloud loop, run every 2 hours (cron 0 */2 * * *)');
  assert.deepEqual(readCrons(fx.at('main', WORKFLOW_PATH)), ['0 */2 * * *']);

  const before = fx.at('main', WORKFLOW_PATH);
  const night = await saveSchedule(fx.root, { schedule: 'night', cron: '30 5-10 * * *' }, { owner: true, run: gh.run, now });
  assert.equal(night.status, 200, night.error);
  assert.equal(night.next, '2026-10-23T05:30:00.000Z');
  assert.equal(sh(fx.origin, 'log', '-1', '--format=%s', 'main'), 'ci: the cloud loop runs overnight (cron 30 5-10 * * *)');
  assert.equal(fx.at('main', WORKFLOW_PATH), setCron(before, '30 5-10 * * *'));
  assert.deepEqual(sh(fx.origin, 'diff', '--name-only', 'main~1', 'main').split('\n'), [WORKFLOW_PATH]);

  const same = await saveSchedule(fx.root, { schedule: 'night', cron: '30 5-10 * * *' }, { owner: true, run: gh.run, now });
  assert.equal(same.written, false);
  assert.equal(same.sha, night.sha);

  const off = await saveSchedule(fx.root, { schedule: 'demand' }, { owner: true, run: gh.run, now });
  assert.equal(off.status, 200, off.error);
  assert.deepEqual([off.cron, off.next], [null, null]);
  assert.equal(sh(fx.origin, 'log', '-1', '--format=%s', 'main'), 'ci: the cloud loop runs on demand');
  assert.deepEqual(readCrons(fx.at('main', WORKFLOW_PATH)), []);
  assert.match(fx.at('main', WORKFLOW_PATH), /workflow_dispatch:/);
  assert.equal((await saveSchedule(fx.root, { schedule: 'demand' }, { owner: true, run: gh.run, now })).written, false);
  assert.equal((await saveSchedule(fx.root, { schedule: 'two', cron: 'nope' }, { owner: true, run: gh.run, now })).status, 400);
  untouched(fx, head);
});

test('contributor: main is never pushed; the workflow and its schedule ride one nexus/cloud-loop pull request', async () => {
  const fx = fixture({ owner: false });
  const head = sh(fx.root, 'rev-parse', 'HEAD');
  const main = sh(fx.origin, 'rev-parse', 'main');
  const gh = fakeGh();
  const r = await addWorkflow(fx.root, { owner: false, run: gh.run });
  assert.equal(r.status, 200, r.error);
  assert.deepEqual([r.branch, r.pr, r.written, r.mode], ['nexus/cloud-loop', 'https://example.com/pr/1', true, undefined]);
  assert.equal(sh(fx.origin, 'rev-parse', 'main'), main, 'main is untouched');
  assert.equal(r.sha, sh(fx.origin, 'rev-parse', 'nexus/cloud-loop'));
  assert.match(fx.at('nexus/cloud-loop', WORKFLOW_PATH), /widget's autonomous loop/);
  assert.ok(gh.calls.includes('pr create --head nexus/cloud-loop --base main --fill'));
  assert.ok(!gh.calls.some((c) => c.startsWith('variable')), 'a contributor leaves the repo variable alone');

  // The workflow is pending in the PR: asking again finds it there.
  assert.equal((await addWorkflow(fx.root, { owner: false, run: gh.run })).written, false);
  const s = await saveSchedule(fx.root, { schedule: 'two', cron: '0 */2 * * *' }, { owner: false, run: gh.run });
  assert.equal(s.status, 200, s.error);
  assert.equal(s.pr, 'https://example.com/pr/1', 'the open PR is reused');
  assert.equal(gh.calls.filter((c) => c.startsWith('pr create')).length, 1);
  assert.equal(sh(fx.origin, 'rev-list', '--count', 'main..nexus/cloud-loop'), '2');
  assert.deepEqual(readCrons(fx.at('nexus/cloud-loop', WORKFLOW_PATH)), ['0 */2 * * *']);
  assert.equal(sh(fx.origin, 'rev-parse', 'main'), main);

  // Merged: the next change starts a fresh branch from main.
  sh(fx.origin, 'update-ref', 'refs/heads/main', sh(fx.origin, 'rev-parse', 'nexus/cloud-loop'));
  gh.prs.length = 0;
  const later = await saveSchedule(fx.root, { schedule: 'demand' }, { owner: false, run: gh.run, now: new Date('2026-10-23T08:00:00Z') });
  assert.equal(later.status, 200, later.error);
  assert.equal(later.branch, 'nexus/cloud-loop-202610230800');
  untouched(fx, head);
});

test('a push refused for the token\'s workflow scope answers 409 with the fix, and leaves nothing behind', async () => {
  const fx = fixture({ owner: true });
  const head = sh(fx.root, 'rev-parse', 'HEAD');
  write(path.join(fx.origin, 'hooks', 'pre-receive'), '#!/bin/sh\necho "refusing to allow an OAuth App to create or update workflow \\`.github/workflows/march.yml\\` without \\`workflow\\` scope" >&2\nexit 1\n');
  fs.chmodSync(path.join(fx.origin, 'hooks', 'pre-receive'), 0o755);
  const r = await addWorkflow(fx.root, { owner: true, run: fakeGh().run });
  assert.equal(r.status, 409);
  assert.equal(r.fix, 'gh auth refresh -s workflow');
  assert.match(r.error, /gh auth refresh -s workflow/);
  assert.doesNotMatch(r.error, /\n\s+at /, 'no stack');
  assert.equal(sh(fx.origin, 'rev-list', '--count', 'main'), '1');
  untouched(fx, head);
});

// ---- the routes ----------------------------------------------------------------------

function req(port, { method, pathname, headers, body }) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: pathname, headers: { ...headers, host: `127.0.0.1:${port}` } }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
    });
    r.on('error', reject);
    r.end(body);
  });
}

async function withServer(repo, gh, fn) {
  const provider = () => ({ kind: 'fake', send() {}, async interrupt() {}, async stop() {}, async fresh() {} });
  const claudeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-cloud-claude-'));
  const app = await startServer({ repo, provider, pollRuns: false, dist: NO_DIST, claudeHome, ghRun: gh.run, ghLogin: async () => '' });
  const headers = { 'x-nexus-token': app.token, 'content-type': 'application/json', origin: `http://127.0.0.1:${app.port}` };
  const post = (pathname, b) => req(app.port, { method: 'POST', pathname, headers, body: JSON.stringify(b) });
  try { await fn(post); } finally { await app.close(); }
}

test('POST /api/cloud/workflow and /api/cloud/schedule are served, per owner mode', async () => {
  const own = fixture({ owner: true });
  await withServer(own.root, fakeGh(), async (post) => {
    const w = await post('/api/cloud/workflow', {});
    assert.equal(w.status, 200, w.body?.error);
    assert.equal(w.body.path, WORKFLOW_PATH);
    assert.equal(w.body.sha, sh(own.origin, 'rev-parse', 'main'));
    assert.equal((await post('/api/cloud/schedule', { schedule: 'two', cron: 'often' })).status, 400);
    const s = await post('/api/cloud/schedule', { schedule: 'two', cron: '0 */2 * * *' });
    assert.equal(s.status, 200, s.body?.error);
    assert.equal(s.body.cron, '0 */2 * * *');
    assert.equal(cronNext('0 */2 * * *', new Date(Date.parse(s.body.next) - 60000)).toISOString(), s.body.next);
    assert.deepEqual(readCrons(own.at('main', WORKFLOW_PATH)), ['0 */2 * * *']);
  });
  const contrib = fixture({ owner: false });
  await withServer(contrib.root, fakeGh(), async (post) => {
    const w = await post('/api/cloud/workflow', {});
    assert.equal(w.status, 200, w.body?.error);
    assert.equal(w.body.pr, 'https://example.com/pr/1');
    assert.equal(w.body.branch, 'nexus/cloud-loop');
    assert.equal(sh(contrib.origin, 'rev-list', '--count', 'main'), '1');
    const s = await post('/api/cloud/schedule', { schedule: 'demand', cron: '' });
    assert.equal(s.status, 200, s.body?.error);
    assert.deepEqual([s.body.cron, s.body.next, s.body.pr], [null, null, 'https://example.com/pr/1']);
  });
});

test('the Cloud step calls the served routes: MISSING no longer lists them, and no "not on this server" fallback is left', () => {
  const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
  // hooks.js reads the page's token on import, so its MISSING list is read as text.
  const hooks = fs.readFileSync(path.join(src, 'data', 'hooks.js'), 'utf8');
  const at = hooks.indexOf('export const MISSING');
  assert.doesNotMatch(hooks.slice(at, hooks.indexOf('];', at)), /\/api\/cloud\/\(?(?:workflow|schedule)/);
  const step = fs.readFileSync(path.join(src, 'screens', 'onboarding', 'CloudSetup.jsx'), 'utf8');
  assert.doesNotMatch(step, /notServed|NotYet|cannot write it yet|cannot start a pass yet/);
  assert.match(step, /onboardingCalls\.addWorkflow/);
  assert.match(step, /onboardingCalls\.setSchedule/);
});

// ---- the repo's own hooks -----------------------------------------------------------

const hook = (fx, name, body) => {
  const f = path.join(fx.root, '.git', 'hooks', name);
  write(f, `#!/bin/sh\n${body}`);
  fs.chmodSync(f, 0o755);
};

test('git variables inherited from a parent hook never reach the git cloud.mjs runs', async () => {
  const fx = fixture({ owner: true });
  const head = sh(fx.root, 'rev-parse', 'HEAD');
  const saved = {};
  const bogus = { GIT_DIR: path.join(fx.base, 'elsewhere.git'), GIT_WORK_TREE: path.join(fx.base, 'elsewhere'), GIT_INDEX_FILE: path.join(fx.base, 'elsewhere.index'), GIT_PREFIX: 'x/' };
  for (const [k, v] of Object.entries(bogus)) { saved[k] = process.env[k]; process.env[k] = v; }
  let r;
  try {
    r = await addWorkflow(fx.root, { owner: true, run: fakeGh().run });
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  assert.equal(r.status, 200, r.error);
  assert.equal(r.sha, sh(fx.origin, 'rev-parse', 'main'));
  assert.equal(fs.existsSync(bogus.GIT_DIR), false);
  untouched(fx, head);
});

test('the commit runs the repo\'s pre-commit hook; a refusal answers 409 with its last lines and lands nothing', async () => {
  const fx = fixture({ owner: true });
  const head = sh(fx.root, 'rev-parse', 'HEAD');
  hook(fx, 'pre-commit', 'echo "gate: typecheck ok" >&2\necho "gate: 3 tests failed" >&2\nexit 1\n');
  const r = await addWorkflow(fx.root, { owner: true, run: fakeGh().run });
  assert.equal(r.status, 409);
  assert.match(r.error, /gate: 3 tests failed/);
  assert.doesNotMatch(r.error, /\n\s+at /, 'no stack');
  assert.equal(sh(fx.origin, 'rev-list', '--count', 'main'), '1');
  untouched(fx, head);
});

test('a hook slower than the commit timeout is killed, tree and all, before the worktree is removed', async () => {
  const fx = fixture({ owner: true });
  const head = sh(fx.root, 'rev-parse', 'HEAD');
  const late = path.join(fx.base, 'hook-finished').split(path.sep).join('/');
  const started = path.join(fx.base, 'hook-started').split(path.sep).join('/');
  // The hook marks its start, then its child would mark the end 10 s later unless it is killed.
  hook(fx, 'pre-commit', `echo > '${started}'
node -e "setTimeout(() => require('fs').writeFileSync('${late}', 'late'), 10000)"
`);
  const r = await addWorkflow(fx.root, { owner: true, run: fakeGh().run, commitTimeoutMs: 1500 });
  const answered = Date.now();
  assert.equal(r.status, 504, r.error);
  assert.match(r.error, /checks took longer than/);
  const t0 = fs.statSync(started).mtimeMs;
  assert.ok(answered - t0 < 10000, 'answered without waiting for the hook');
  assert.equal(sh(fx.origin, 'rev-list', '--count', 'main'), '1');
  untouched(fx, head);
  await new Promise((res) => setTimeout(res, Math.max(0, t0 + 11000 - Date.now())));
  assert.equal(fs.existsSync(late), false, 'the hook\'s child was killed, not left running');
});

// ---- the Cloud step waits for the server --------------------------------------------

test('landThenGo: busy while the server works, advances only once it answered, an error stays put', async () => {
  const { landThenGo, BUSY_NOTE } = await import('../src/screens/onboarding/cloudFlow.js');
  assert.match(BUSY_NOTE, /^Committing: your repo's checks are running/);
  const log = [];
  let settle;
  const call = () => new Promise((res, rej) => { settle = { res, rej }; });
  const hooks = { busy: () => log.push('busy'), done: (r) => log.push(`done ${r.cron}`), failed: (m) => log.push(`failed ${m}`), go: () => log.push('go') };
  const p = landThenGo(call, hooks);
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(log, ['busy'], 'nothing advances while the call is out');
  settle.res({ cron: '0 */2 * * *' });
  assert.equal(await p, true);
  assert.deepEqual(log, ['busy', 'done 0 */2 * * *', 'go']);

  log.length = 0;
  const q = landThenGo(call, hooks);
  settle.rej(Object.assign(new Error('your repo\'s checks refused the commit'), { status: 409 }));
  assert.equal(await q, false);
  assert.deepEqual(log, ['busy', 'failed your repo\'s checks refused the commit'], 'an error stays on the step');
});

test('the Cloud step\'s Turn on and Add it go through landThenGo, not a Link that leaves at once', () => {
  const step = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'screens', 'onboarding', 'CloudSetup.jsx'), 'utf8');
  assert.doesNotMatch(step, /<Link[^>]*onClick=\{turnOn\}/, 'Turn on is not a Link');
  assert.match(step, /landThenGo\(fn, \{/);
  assert.match(step, /act\('sched', \(\) => onboardingCalls\.setSchedule/);
  assert.match(step, /act\('wf', onboardingCalls\.addWorkflow/);
  assert.match(step, /nav\(PATHS\.onboarding\(stepAfter\('cloud'\)\)\)/, 'Launch only once it answered');
  assert.match(step, /BUSY_NOTE/);
});

test('an old hook with no unset still runs, wrapped, and its gate\'s scratch repo never reaches the real one', async () => {
  const fx = fixture({ owner: true });
  const head = sh(fx.root, 'rev-parse', 'HEAD');
  const marker = path.join(fx.base, 'gate-ran').split(path.sep).join('/');
  const gate = [
    "import { execFileSync } from 'node:child_process'",
    "import fs from 'node:fs'",
    "import os from 'node:os'",
    "import path from 'node:path'",
    "const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-gate-scratch-'))",
    "execFileSync('git', ['init', '-q', '--bare'], { cwd: d })",
    "fs.rmSync(d, { recursive: true, force: true })",
    `fs.writeFileSync('${marker}', 'ran')`,
    '',
  ].join('\n');
  const gateFile = path.join(fx.base, 'gate.mjs');
  write(gateFile, gate);
  // The pre-commit an older install-hooks wrote: no unset line.
  hook(fx, 'pre-commit', `# nexus:install-hooks — do not edit by hand; regenerate with\n# node scripts/install-hooks.mjs (--uninstall to remove).\nnode "${gateFile.split(path.sep).join('/')}"\n`);
  const r = await addWorkflow(fx.root, { owner: true, run: fakeGh().run });
  assert.equal(r.status, 200, r.error);
  assert.ok(fs.existsSync(marker), 'the repo\'s own hook ran');
  assert.equal(spawnSync('git', ['config', '--get', 'core.bare'], { cwd: fx.root, encoding: 'utf8' }).stdout.trim(), 'false', 'core.bare untouched');
  assert.equal(sh(fx.root, 'rev-parse', '--is-inside-work-tree'), 'true');
  untouched(fx, head);
});

test('safeHooks wraps each hook the repo has, honouring core.hooksPath', async () => {
  const { safeHooks } = await import('../server/cloud.mjs');
  const fx = fixture({ owner: true });
  hook(fx, 'pre-commit', 'exit 0\n');
  const custom = path.join(fx.root, 'githooks');
  write(path.join(custom, 'pre-push'), '#!/bin/sh\nexit 0\n');
  for (const [repoHooks, want, real] of [[null, 'pre-commit', path.join(fx.root, '.git', 'hooks', 'pre-commit')], ['githooks', 'pre-push', path.join(custom, 'pre-push')]]) {
    if (repoHooks) sh(fx.root, 'config', 'core.hooksPath', repoHooks);
    const h = await safeHooks(fx.root);
    try {
      const names = fs.readdirSync(h.dir);
      assert.deepEqual(names, [want]);
      const text = fs.readFileSync(path.join(h.dir, want), 'utf8');
      assert.match(text, /^#!\/bin\/sh\nunset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_PREFIX GIT_COMMON_DIR GIT_OBJECT_DIRECTORY\nexec "[^"]+" "\$@"\n$/);
      assert.equal(fs.realpathSync(text.match(/exec "([^"]+)"/)[1]), fs.realpathSync(real));
      assert.deepEqual(h.args, ['-c', `core.hooksPath=${h.dir.split(path.sep).join('/')}`]);
    } finally {
      h.cleanup();
    }
    assert.equal(fs.existsSync(h.dir), false);
  }
});
