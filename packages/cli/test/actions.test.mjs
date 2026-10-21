// The Actions panel (spec 40, A7): the command behind each button, per-step
// stalls from `gh run view --json jobs`, and the least-privilege permission
// check. Every gh call goes to an injected fake (a function, never PATH
// shadowing), so no test can reach a real repo's workflows.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import {
  workflowCommand, setWorkflow, dispatchWorkflow, stepStatus, listRuns, permissionSteps,
  declaresPermissions, actionsSetup, STEP_STALL_MS, STALL_MS,
} from '../server/gh.mjs';
import { startServer } from '../server/server.mjs';
import { toRow, stepStalls } from '../src/screens/cloud-settings/rows.js';

/** A fake gh: answers by the joined argument string, records every call. */
function fakeGh(answers = {}) {
  const calls = [];
  const fn = async (cmd, args) => {
    assert.equal(cmd, 'gh');
    const key = args.join(' ');
    calls.push(key);
    for (const [k, v] of Object.entries(answers)) {
      if (key === k || key.startsWith(k + ' ')) return { ok: v.ok !== false, code: v.ok === false ? 1 : 0, stdout: v.stdout ?? '', stderr: v.stderr ?? '' };
    }
    return { ok: false, code: 1, stdout: '', stderr: `fake gh: no answer for ${key}` };
  };
  fn.calls = calls;
  return fn;
}

const ok = (data) => ({ stdout: typeof data === 'string' ? data : JSON.stringify(data) });
const no = (stderr = 'HTTP 403') => ({ ok: false, stderr });

// ---- buttons -> commands ------------------------------------------------

test('each button maps to one gh command, and a bad id never reaches gh', async () => {
  assert.deepEqual(workflowCommand('pause', 42), ['workflow', 'disable', '42']);
  assert.deepEqual(workflowCommand('resume', '42'), ['workflow', 'enable', '42']);
  assert.deepEqual(workflowCommand('run', 42), ['workflow', 'run', '42']);
  assert.equal(workflowCommand('delete', 42), null);
  assert.equal(workflowCommand('run', '42; rm -rf /'), null);
  assert.equal(workflowCommand('run', 'march.yml'), null);

  const gh = fakeGh({ 'workflow disable 7': ok(''), 'workflow enable 7': ok(''), 'workflow run 7': ok('Created workflow_dispatch event') });
  assert.equal((await setWorkflow('/r', 7, false, { run: gh })).ok, true);
  assert.equal((await setWorkflow('/r', 7, true, { run: gh })).ok, true);
  const d = await dispatchWorkflow('/r', 7, { run: gh });
  assert.equal(d.ok, true);
  assert.deepEqual(gh.calls, ['workflow disable 7', 'workflow enable 7', 'workflow run 7']);

  const bad = fakeGh();
  assert.equal((await setWorkflow('/r', 'x', true, { run: bad })).error, 'bad workflow id');
  assert.equal((await dispatchWorkflow('/r', '1 2', { run: bad })).status, 400);
  assert.deepEqual(bad.calls, []);
});

test('run one pass with no id finds the loop workflow; gh refusing is a 502, not a success', async () => {
  const gh = fakeGh({
    'workflow list': ok([{ id: 3, path: '.github/workflows/ci.yml' }, { id: 9, path: '.github/workflows/march.yml' }]),
    'workflow run 9': ok(''),
  });
  const r = await dispatchWorkflow('/r', undefined, { run: gh });
  assert.equal(r.ok, true);
  assert.equal(r.id, '9');
  assert.deepEqual(gh.calls, ['workflow list --all --json id,path', 'workflow run 9']);

  const none = await dispatchWorkflow('/r', null, { run: fakeGh({ 'workflow list': ok([{ id: 3, path: '.github/workflows/ci.yml' }]) }) });
  assert.equal(none.status, 409);

  const refused = await dispatchWorkflow('/r', 9, { run: fakeGh({ 'workflow run 9': no('HTTP 403: Resource not accessible by personal access token') }) });
  assert.equal(refused.ok, false);
  assert.equal(refused.status, 502);
  assert.match(refused.error, /not accessible/);
});

// ---- per-step stalls ------------------------------------------------------

const T0 = Date.parse('2026-10-21T01:00:00Z');
const at = (min) => new Date(T0 + min * 60000).toISOString();
const NEVER = '0001-01-01T00:00:00Z';

function jobs({ stepStarted = 0, now = 5 } = {}) {
  return {
    now: T0 + now * 60000,
    jobs: [{
      name: 'march', status: 'in_progress', startedAt: at(0),
      steps: [
        { name: 'Set up job', number: 1, status: 'completed', conclusion: 'success', startedAt: at(0), completedAt: at(0.1) },
        { name: 'Run /march (cloud mode)', number: 5, status: 'in_progress', startedAt: at(stepStarted), completedAt: NEVER },
        { name: 'Post Run /march', number: 10, status: 'pending', startedAt: NEVER, completedAt: NEVER },
      ],
    }],
  };
}

test('a running step under the threshold is current, not stalled', () => {
  const { jobs: j, now } = jobs({ now: 5 });
  const s = stepStatus(j, now);
  assert.equal(s.current.name, 'Run /march (cloud mode)');
  assert.equal(s.current.ms, 5 * 60000);
  assert.equal(s.current.stalled, false);
  assert.deepEqual(s.stalls, []);
});

test('a step running past the threshold stalls on its own; pending steps never do', () => {
  const { jobs: j, now } = jobs({ now: STEP_STALL_MS / 60000 + 4 });
  const s = stepStatus(j, now);
  assert.equal(s.current.stalled, true);
  assert.deepEqual(s.stalls, [{ kind: 'step', job: 'march', name: 'Run /march (cloud mode)', ms: STEP_STALL_MS + 4 * 60000 }]);
  // a custom threshold
  assert.equal(stepStatus(jobs({ now: 6 }).jobs, T0 + 6 * 60000, { stepMs: 5 * 60000 }).stalls.length, 1);
});

test('a job waiting for a runner stalls after the queue threshold, measured from the run', () => {
  const j = [{ name: 'build', status: 'queued', startedAt: NEVER, steps: [] }, { name: 'done', status: 'completed', conclusion: 'success', steps: [] }];
  assert.deepEqual(stepStatus(j, T0 + 60000, { since: at(0) }).stalls, []);
  const s = stepStatus(j, T0 + STALL_MS + 60000, { since: at(0) });
  assert.deepEqual(s.stalls, [{ kind: 'queued', job: 'build', name: 'waiting for a runner', ms: STALL_MS + 60000 }]);
  assert.equal(s.current, null);
  assert.deepEqual(stepStatus(null, T0), { current: null, stalls: [] });
});

test('listRuns reads jobs only for live runs and attaches their step status', async () => {
  const live = { databaseId: 11, status: 'in_progress', workflowName: 'march', createdAt: at(0) };
  const done = { databaseId: 10, status: 'completed', conclusion: 'success', workflowName: 'march', createdAt: at(-60), updatedAt: at(-50) };
  const { jobs: j } = jobs();
  const gh = fakeGh({ 'run list': ok([live, done]), 'run view 11 --json jobs': ok({ jobs: j }) });
  const r = await listRuns('/r', { run: gh, now: T0 + 40 * 60000 });
  assert.equal(r.ok, true);
  assert.equal(r.runs[0].steps.current.name, 'Run /march (cloud mode)');
  assert.equal(r.runs[0].steps.stalls.length, 1);
  assert.equal(r.runs[1].steps, undefined);
  assert.deepEqual(gh.calls.filter((c) => c.startsWith('run view')), ['run view 11 --json jobs']);
});

test('the run row names the running step and draws each stall as a chip', () => {
  const run = { databaseId: 11, status: 'in_progress', workflowName: 'march', createdAt: at(0), steps: { current: { name: 'Run /march (cloud mode)', stalled: false }, stalls: [] } };
  assert.deepEqual(toRow(run).chips, [{ kind: 'ci', state: 'running', label: 'running · Run /march (cloud mode)' }]);
  const stalled = { ...run, steps: { current: { name: 'Run /march (cloud mode)', stalled: true }, stalls: [{ kind: 'step', name: 'Run /march (cloud mode)', ms: 34 * 60000 + 10000 }] } };
  assert.deepEqual(toRow(stalled).chips, [{ kind: 'parked', label: 'stalled · Run /march (cloud mode) · 34m 10s' }]);
  // no step status (gh run view failed): the plain running chip, as before
  assert.deepEqual(toRow({ ...run, steps: null }).chips, [{ kind: 'ci', state: 'running', label: 'running' }]);
  assert.deepEqual(stepStalls({}), []);
});

// ---- least privilege ------------------------------------------------------

const step = (steps, id) => steps.find((s) => s.id === id);

test('permission matrix: the role that may pause and run', () => {
  for (const [viewer, want] of [['ADMIN', true], ['MAINTAIN', true], ['WRITE', true], ['write', true], ['TRIAGE', false], ['READ', false], [null, null]]) {
    const c = step(permissionSteps({ viewer }), 'control');
    assert.equal(c.ok, want, String(viewer));
    assert.equal(c.optional, true);
    assert.equal(!!c.fix, want === false, `fix only when refused: ${viewer}`);
  }
});

test('permission matrix: a read-only token default is fine when the loop declares its own', () => {
  const cases = [
    // [defaultPerm, declares, ok]
    ['read', true, true], // least privilege, the recommended setting
    ['write', true, true],
    [null, true, true], // default unreadable without admin: the file is enough
    ['write', false, true],
    ['read', false, false], // the one real gap
    ['write', null, true],
    ['read', null, null], // file not read locally: unknown, not a failure
    [null, null, null],
  ];
  for (const [defaultPerm, declares, want] of cases) {
    const p = step(permissionSteps({ defaultPerm, declares, file: 'march.yml' }), 'permissions');
    assert.equal(p.ok, want, `${defaultPerm}/${declares}`);
  }
  assert.match(step(permissionSteps({ defaultPerm: 'read', declares: true, file: 'march.yml' }), 'permissions').detail, /least privilege/);
  assert.match(step(permissionSteps({ defaultPerm: 'read', declares: false, file: 'march.yml' }), 'permissions').fix, /permissions block to march\.yml/);
});

test('declaresPermissions reads a workflow file', () => {
  assert.equal(declaresPermissions('jobs:\n  a:\n    permissions:\n      contents: write\n'), true);
  assert.equal(declaresPermissions('permissions: read-all\n'), true);
  assert.equal(declaresPermissions('jobs:\n  a:\n    runs-on: ubuntu-latest\n'), false);
  assert.equal(declaresPermissions(''), false);
});

test('actionsSetup as a write-role collaborator: secrets unknown, read default accepted, no gh writes', async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-actions-'));
  fs.mkdirSync(path.join(repo, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.github', 'workflows', 'march.yml'), 'on: workflow_dispatch\njobs:\n  m:\n    permissions:\n      contents: write\n');
  const gh = fakeGh({
    'auth status': ok('Logged in to github.com'),
    'secret list': no('HTTP 403: Must have admin rights to Repository.'),
    'workflow list': ok([{ id: 9, name: 'march', path: '.github/workflows/march.yml', state: 'disabled_manually' }]),
    'api repos/{owner}/{repo}/actions/permissions/workflow': no(),
    'api repos/{owner}/{repo}/rulesets': ok([]),
    'repo view --json viewerPermission': ok({ viewerPermission: 'WRITE' }),
  });
  const a = await actionsSetup(repo, { run: gh });
  assert.equal(a.gh, true);
  assert.equal(step(a.steps, 'secret').ok, null);
  assert.equal(step(a.steps, 'control').ok, true);
  assert.equal(step(a.steps, 'permissions').ok, true);
  assert.deepEqual(a.workflows, [{ id: 9, name: 'march', path: '.github/workflows/march.yml', enabled: false, state: 'disabled_manually' }]);
  assert.ok(gh.calls.every((c) => !/^workflow (enable|disable|run)\b/.test(c)), 'reading setup never changes the loop');
});

// ---- the route ------------------------------------------------------------

function req(port, { method = 'GET', pathname, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: pathname, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data || '{}') }));
    });
    r.on('error', reject);
    r.end(body);
  });
}

test('POST /api/cloud/run and /api/actions/workflow reach only the injected gh', async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-actions-srv-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  const gh = fakeGh({ 'workflow run 9': ok(''), 'workflow disable 9': ok(''), 'workflow enable 9': ok('') });
  const provider = { kind: 'fake', send() {}, async interrupt() {}, async stop() {}, async fresh() {} };
  const app = await startServer({ repo, provider, pollRuns: false, dist: path.join(os.tmpdir(), 'nexus-cli-no-dist'), ghRun: gh });
  const headers = { 'x-nexus-token': app.token, 'content-type': 'application/json', origin: `http://127.0.0.1:${app.port}` };
  try {
    const run = await req(app.port, { method: 'POST', pathname: '/api/cloud/run', headers, body: '{"id":9}' });
    assert.equal(run.status, 200);
    assert.equal(run.data.ok, true);
    assert.equal((await req(app.port, { method: 'POST', pathname: '/api/cloud/run', headers, body: '{"id":"9 --ref evil"}' })).status, 400);
    assert.equal((await req(app.port, { method: 'POST', pathname: '/api/actions/workflow', headers, body: '{"id":9,"enabled":false}' })).data.ok, true);
    assert.equal((await req(app.port, { method: 'POST', pathname: '/api/actions/workflow', headers, body: '{"id":9,"enabled":true}' })).data.ok, true);
    assert.deepEqual(gh.calls, ['workflow run 9', 'workflow disable 9', 'workflow enable 9']);
  } finally {
    await app.close();
  }
});
