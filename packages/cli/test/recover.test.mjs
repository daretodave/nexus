// Recover (spec 40 A10): the GUI reads a Workflow transcript folder (journal.jsonl), shows which agents finished and
// what they returned, and resumes the run: a hosted session resumes the run's own Claude Code session and asks it to
// call the Workflow tool with { scriptPath, resumeFromRunId }, or the screen shows the command and prompt to paste.
//
// The fixture (test/fixtures/workflow-run) is a made-up run in the shape Claude Code writes it. lay() puts it under a
// scratch CLAUDE_CONFIG_DIR:
//   projects/<slug>/<session>.jsonl                               session.jsonl
//   projects/<slug>/<session>/subagents/workflows/<run>/          journal.jsonl, agent-*.jsonl, agent-*.meta.json
//   projects/<slug>/<session>/workflows/scripts/<name>-<run>.js   script.js
//   projects/<slug>/<session>/workflows/<run>.json                record.json (only once the run ended)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/server.mjs';
import { claudeSlug } from '../server/sessions.mjs';
import { locateRun, peekOf, readRun, recentRuns, resumeCommand, resumePrompt } from '../server/recover.mjs';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'workflow-run');
const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');
const SESSION = 'cccc4444-0000-4000-8000-000000000004';
const RUN = 'wf_0000aaaa-123';
const NOW = Date.parse('2026-10-21T15:00:00Z');

/** Lay the fixture run out under a scratch Claude home, for the repo `cwd`. */
function lay({ record = false, cwd, now = NOW, at = now - 60 * 60000, sessionAt = at } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-recover-home-'));
  const repo = cwd || fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-recover-repo-'));
  const project = path.join(home, 'projects', claudeSlug(repo));
  const sdir = path.join(project, SESSION);
  const runDir = path.join(sdir, 'subagents', 'workflows', RUN);
  const script = path.join(sdir, 'workflows', 'scripts', `build-9-9-${RUN}.js`);
  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(path.dirname(script), { recursive: true });
  const fill = (s) => s.replaceAll('{{CWD}}', JSON.stringify(repo).slice(1, -1)).replaceAll('{{SESSION}}', SESSION).replaceAll('{{RUN}}', RUN).replaceAll('{{SCRIPT}}', JSON.stringify(script).slice(1, -1));
  for (const f of fs.readdirSync(FIX)) {
    if (f === 'journal.jsonl' || f.startsWith('agent-')) fs.writeFileSync(path.join(runDir, f), fill(fs.readFileSync(path.join(FIX, f), 'utf8')));
  }
  fs.writeFileSync(script, fs.readFileSync(path.join(FIX, 'script.js')));
  fs.writeFileSync(path.join(project, `${SESSION}.jsonl`), fill(fs.readFileSync(path.join(FIX, 'session.jsonl'), 'utf8')));
  if (record) fs.writeFileSync(path.join(sdir, 'workflows', `${RUN}.json`), fill(fs.readFileSync(path.join(FIX, 'record.json'), 'utf8')));
  const t = new Date(at);
  for (const f of fs.readdirSync(runDir)) fs.utimesSync(path.join(runDir, f), t, t);
  fs.utimesSync(path.join(project, `${SESSION}.jsonl`), new Date(sessionAt), new Date(sessionAt));
  return { home, repo, runDir, script, sdir };
}

test('a run folder is found by its folder, its journal or its run record, and only under the Claude home', () => {
  const { home, runDir, sdir } = lay();
  const want = { runDir, sessionId: SESSION, runId: RUN };
  for (const p of [runDir, path.join(runDir, 'journal.jsonl'), `${runDir}${path.sep}`]) {
    const r = locateRun(p, home);
    assert.equal(r.error, undefined, p);
    assert.deepEqual({ runDir: r.runDir, sessionId: r.sessionId, runId: r.runId }, want);
  }
  assert.equal(locateRun(path.join(sdir, 'workflows', `${RUN}.json`), home).runDir, runDir, 'the run record names its folder');
  assert.match(locateRun(os.tmpdir(), home).error, /Claude Code/);
  assert.match(locateRun(path.join(home, 'projects', '..', 'elsewhere', 'wf_x'), home).error, /Claude Code/);
  assert.match(locateRun(path.join(sdir, 'subagents', 'workflows', 'wf_none'), home).error, /journal\.jsonl/);
  assert.match(locateRun('', home).error, /folder/);
});

test('a fallen run reads as a timeline: what finished, what it returned, where it stopped, and how to resume it', () => {
  const { home, repo, runDir, script } = lay();
  const r = readRun(runDir, { home, now: NOW });
  assert.equal(r.run.runId, RUN);
  assert.equal(r.run.sessionId, SESSION);
  assert.equal(r.run.title, 'build-9-9');
  assert.equal(r.run.state, 'fallen', 'no record, a stale journal and an agent that never returned: it fell over');
  assert.ok(r.run.fell.at);
  assert.equal(r.run.scriptPath, script, 'the script is found by its run id when no record names it');
  const by = Object.fromEntries(r.agents.map((a) => [a.name, a]));
  assert.deepEqual(r.agents.map((a) => a.name), ['build', 'verify-1', 'fix-1', 'land']);
  assert.equal(by.build.state, 'done');
  assert.equal(by.build.peek, 'Built chunk 9.9 in two commits.', 'the peek is the first line it returned');
  assert.match(by.build.pre, /abc1234 feat: add the widget/, 'the rest of what it returned is kept');
  assert.equal(by['verify-1'].state, 'done');
  assert.equal(by['verify-1'].peek, 'findings: 2', 'a structured result reads as its shape');
  assert.equal(by['fix-1'].state, 'failed', 'started, never returned, and the run is gone');
  assert.match(by['fix-1'].peek, /stopped before it returned/);
  assert.equal(by.land.state, 'never', 'a phase the script declares and no agent reached');
  assert.equal(by.land.role, 'Land · never started');
  assert.equal(by['fix-1'].resume, true, 'the resume point is the first agent that did not finish');
  assert.equal(r.agents.filter((a) => a.resume).length, 1);
  assert.match(by.build.why, /replays/);
  assert.match(by.land.why, /fix-1/);
  assert.equal(r.resume.hostable, true);
  assert.equal(r.resume.cwd, repo);
  assert.equal(r.resume.sessionId, SESSION);
  assert.match(r.resume.command, new RegExp(`claude --resume ${SESSION}`));
  assert.equal(r.resume.prompt, resumePrompt({ scriptPath: script, runId: RUN }));
  assert.match(r.resume.prompt, /Workflow tool/);
  assert.ok(r.resume.prompt.includes(JSON.stringify(script)) && r.resume.prompt.includes(`"resumeFromRunId": "${RUN}"`));
});

test('a run record adds times, the error, and the run\'s end state', () => {
  const { home, runDir } = lay({ record: true });
  const r = readRun(runDir, { home, now: NOW });
  assert.equal(r.run.state, 'killed');
  assert.ok(r.run.fell, 'a killed run fell over');
  assert.equal(r.run.started, new Date(1792591200000).toISOString());
  const fix = r.agents.find((a) => a.name === 'fix-1');
  assert.equal(fix.state, 'failed');
  assert.equal(fix.pre, 'Not logged in · Please run /login');
  assert.equal(fix.role, 'Fix · 1m');
  assert.equal(r.agents[0].role, 'Build · 17m');
  assert.equal(r.agents[0].when, new Date(1792591200000).toISOString());
});

test('a finished run offers no resume; a live one is left alone', () => {
  const { home, runDir, sdir } = lay({ record: true });
  const rec = JSON.parse(fs.readFileSync(path.join(sdir, 'workflows', `${RUN}.json`), 'utf8'));
  fs.appendFileSync(path.join(runDir, 'journal.jsonl'), '{"type":"result","key":"v2:3333333333333333333333333333333333333333333333333333333333333333","agentId":"a0000000000000003","result":"fixed"}\n');
  fs.writeFileSync(path.join(sdir, 'workflows', `${RUN}.json`), JSON.stringify({ ...rec, status: 'completed', error: undefined, phases: rec.phases.slice(0, 3), workflowProgress: [] }));
  const done = readRun(runDir, { home, now: NOW });
  assert.equal(done.run.state, 'done');
  assert.ok(!done.agents.some((a) => a.resume));
  assert.match(done.agents[0].why, /finished/);

  const live = lay({ at: NOW - 60000 });
  const r = readRun(live.runDir, { home: live.home, now: NOW });
  assert.equal(r.run.state, 'running');
  assert.equal(r.agents.find((a) => a.name === 'fix-1').state, 'running');
  assert.ok(!r.agents.some((a) => a.resume));
});

test('resume is paste-only when the run\'s session is still live or its folder is gone', () => {
  const live = lay({ sessionAt: NOW - 60000 });
  const r = readRun(live.runDir, { home: live.home, now: NOW });
  assert.equal(r.resume.hostable, false);
  assert.match(r.resume.why, /still live/);
  const gone = lay({ cwd: path.join(os.tmpdir(), 'nexus-recover-gone-folder') });
  const g = readRun(gone.runDir, { home: gone.home, now: NOW });
  assert.equal(g.resume.hostable, false);
  assert.match(g.resume.why, /no longer exists/);
});

test('a peek skips the harness\'s own note and reads a structured result by its shape', () => {
  assert.equal(peekOf('[harness: subagent output matched a pattern]\n\nI fixed both findings.'), 'I fixed both findings.');
  assert.equal(peekOf('{"findings":[1,2,3],"ok":true}'), 'findings: 3, ok: true');
  assert.equal(peekOf(''), '');
  assert.equal(resumeCommand({ cwd: 'Z:\\work\\repo', sessionId: SESSION }), `cd "Z:\\work\\repo" && claude --resume ${SESSION}`);
});

test('recent runs list this repo\'s workflow folders, newest first', () => {
  const { home, repo, runDir } = lay();
  const list = recentRuns({ home, dirs: [repo], now: NOW });
  assert.equal(list.length, 1);
  assert.equal(list[0].dir, runDir);
  assert.equal(list[0].kind, 'fallen');
  assert.match(list[0].t, /build-9-9/);
  assert.deepEqual(recentRuns({ home, dirs: [path.join(os.tmpdir(), 'nowhere-else')], now: NOW }), []);
});

function call(app, pathname, body) {
  return new Promise((resolve, reject) => {
    const headers = { host: `127.0.0.1:${app.port}`, 'x-nexus-token': app.token };
    if (body !== undefined) Object.assign(headers, { 'content-type': 'application/json', origin: `http://127.0.0.1:${app.port}` });
    const r = http.request({ host: '127.0.0.1', port: app.port, method: body === undefined ? 'GET' : 'POST', path: pathname, headers }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(data || 'null') }));
    });
    r.on('error', reject);
    r.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

test('GET /api/recover reads a run and the recent ones; POST /api/recover/resume hosts the run\'s own session and asks it to resume', async () => {
  const { home, repo, runDir, script } = lay({ now: Date.now() });
  const by = new Map();
  const factory = (hooks) => {
    const p = { kind: 'fake', sent: [], hooks, send(t) { this.sent.push(t); }, async interrupt() {}, async stop() {}, async fresh() {} };
    by.set(hooks.session, p);
    return p;
  };
  const app = await startServer({ repo, provider: factory, pollRuns: false, dist: NO_DIST, claudeHome: home, ghLogin: async () => '' });
  try {
    const none = await call(app, '/api/recover');
    assert.equal(none.status, 200);
    assert.equal(none.json.run, null);
    assert.equal(none.json.recent[0].dir, runDir);

    const one = await call(app, `/api/recover?dir=${encodeURIComponent(runDir)}`);
    assert.equal(one.status, 200);
    assert.equal(one.json.run.runId, RUN);
    assert.equal(one.json.agents.length, 4);

    const bad = await call(app, `/api/recover?dir=${encodeURIComponent(os.tmpdir())}`);
    assert.equal(bad.status, 400);

    const r = await call(app, '/api/recover/resume', { dir: runDir, from: 'fix-1' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.ok(r.json.id && r.json.name);
    const p = by.get(r.json.id);
    assert.equal(p.hooks.resume, SESSION, 'the hosted session resumes the run\'s own Claude Code session');
    assert.equal(p.hooks.repo, repo, 'in the folder that session worked in');
    assert.deepEqual(p.sent, [resumePrompt({ scriptPath: script, runId: RUN })]);
    const list = await call(app, '/api/sessions');
    assert.ok(list.json.some((s) => s.id === r.json.id), 'the resumed run shows in the fleet');

    const again = await call(app, '/api/recover/resume', { dir: runDir });
    assert.equal(again.status, 409, 'one resume per run at a time');
  } finally {
    await app.close();
  }
});

test('POST /api/recover/resume refuses a run with nothing to resume, and a live session, with the prompt to paste', async () => {
  const { home, repo, runDir } = lay({ now: Date.now(), sessionAt: Date.now() });
  const app = await startServer({ repo, provider: () => ({ kind: 'fake', send() {}, async interrupt() {}, async stop() {}, async fresh() {} }), pollRuns: false, dist: NO_DIST, claudeHome: home, ghLogin: async () => '' });
  try {
    const r = await call(app, '/api/recover/resume', { dir: runDir });
    assert.equal(r.status, 409);
    assert.match(r.json.error, /still live/);
    assert.match(r.json.prompt, /resumeFromRunId/);
    assert.match(r.json.command, /claude --resume/);
  } finally {
    await app.close();
  }
});
