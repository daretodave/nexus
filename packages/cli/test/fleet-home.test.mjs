// The fleet home (spec 40, A2): tiles by star with phase and progress, the merged inbox tagged by star, and Resume
// from a fallen tile through /reboot-resume. Stub providers only: no model, no gh.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { startServer } from '../server/server.mjs';
import { fleetRows, inboxItems, parkedId, parseParkedId, phaseOf, progressOf, resumable, resumePrompt, sameParked } from '../server/fleet-home.mjs';
import { norm, FILTERS } from '../src/screens/fleet/model.js';
import { fromInbox } from '../src/screens/headsdown-inbox/inboxModel.js';

const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');
const OLD = '2026-01-01T00:00:00.000Z';

function tmpRepo({ skill = true } = {}) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-home-'));
  const dir = path.join(parent, 'repo');
  fs.mkdirSync(dir);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  if (skill) {
    fs.mkdirSync(path.join(dir, '.claude', 'commands'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude', 'commands', 'reboot-resume.md'), '---\ndescription: resume\n---\n');
  }
  fs.mkdirSync(path.join(parent, 'claude-home'));
  return { parent, dir, home: path.join(parent, 'claude-home') };
}

function ledger(dir, l) {
  const d = path.join(dir, '.nexus', 'sessions');
  fs.mkdirSync(d, { recursive: true });
  const full = { state: 'live', beat: new Date().toISOString(), chunk: '', step: '', claimed: [], parked: [], loop: '', train: '', ...l };
  fs.writeFileSync(path.join(d, `${l.id}.json`), JSON.stringify(full));
  return full;
}
const readLedger = (dir, id) => JSON.parse(fs.readFileSync(path.join(dir, '.nexus', 'sessions', `${id}.json`), 'utf8'));

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

async function withApp(opts, fn) {
  const t = tmpRepo(opts);
  const f = fakes();
  const app = await startServer({ repo: t.dir, provider: f.factory, pollRuns: false, dist: NO_DIST, ghLogin: async () => '', claudeHome: t.home });
  try {
    await fn({ ...t, ...f, app });
  } finally {
    await app.close();
    fs.rmSync(t.parent, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
}

// ---- pure rules -------------------------------------------------------------

test('a tile reads its phase from the ledger step and its mini progress from done of claimed', () => {
  assert.equal(phaseOf(''), undefined);
  assert.equal(phaseOf('orient'), 'questions');
  assert.equal(phaseOf('building'), 'working');
  assert.equal(phaseOf('end-gate'), 'end');
  assert.equal(phaseOf('package'), 'package');
  assert.equal(progressOf({ claimed: [] }), undefined);
  assert.deepEqual(progressOf({ claimed: ['1.1', '1.2', '1.3', '1.4'], done: ['1.1', 'x'] }), { done: 1, total: 4, pct: 25, label: '1 of 4 chunks' });
});

test('fleetRows: a hosted session with live asks needs you; a fallen one being resumed reads resuming', () => {
  const list = [
    { id: 'aaaa1111', claude: 'c1', name: 'vega', kind: 'local', state: 'live', chunk: { id: '7.1', step: 'building' } },
    { id: 'bbbb2222', claude: 'c2', name: 'sirius', kind: 'terminal', state: 'fallen', chunk: null },
    { id: 'cccc3333', claude: 'c3', name: 'deneb', kind: 'terminal', state: 'live', chunk: null },
  ];
  const ledgers = [
    { id: 'aaaa1111', step: 'building', chunk: '7.1', claimed: ['7.1', '7.2'], done: [] },
    { id: 'bbbb2222', step: 'gate', chunk: '7.3' },
  ];
  const out = fleetRows(list, { ledgers, hosted: [{ id: 'aaaa1111', asks: 2, busy: false }], resumers: new Map([['bbbb2222', { id: 'n', name: 'altair' }]]), owner: true });
  assert.equal(out[0].state, 'asking');
  assert.deepEqual(out[0].questions, { answered: 0, total: 2 });
  assert.equal(out[0].phase, 'questions');
  assert.equal(out[0].progress.label, '0 of 2 chunks');
  assert.equal(out[0].mode, 'owner');
  assert.equal(out[0].orb, 'idle');
  assert.equal(out[1].state, 'resuming');
  assert.equal(out[1].resume.by, 'altair');
  assert.equal(out[1].resume.chunk, '7.3');
  assert.equal(out[2].state, 'live', 'a session with no resumer is left alone');
  assert.equal(list[0].state, 'live', 'the input is not changed');
});

test('a fallen terminal tile keeps its fallen state (and its Resume); a live one observes', () => {
  const fallen = norm({ id: 'x', name: 'sirius', kind: 'terminal', state: 'fallen' });
  assert.equal(fallen.state, 'fallen');
  assert.ok(FILTERS.find((f) => f.value === 'fallen').test(fallen));
  assert.equal(norm({ id: 'y', name: 'deneb', kind: 'terminal', state: 'live' }).state, 'observing');
  assert.equal(norm({ id: 'z', name: 'rigel', kind: 'terminal', state: 'resuming' }).state, 'resuming');
});

test('resume rules: the prompt names the star (and the train slug for a parked car); live or taken refuses', () => {
  assert.equal(resumePrompt({ id: 'a', star: 'vega', state: 'live' }), '/reboot-resume vega');
  assert.equal(resumePrompt({ id: 'a', star: 'vega', state: 'parked', train: 'r1' }), '/reboot-resume r1 vega');
  assert.equal(resumable(null).status, 404);
  assert.equal(resumable({ star: 'v', state: 'live', beat: new Date().toISOString() }).status, 409);
  assert.equal(resumable({ star: 'v', state: 'resuming' }).status, 409);
  assert.equal(resumable({ star: 'v', state: 'ended' }).status, 409);
  assert.ok(resumable({ star: 'v', state: 'live', beat: OLD }).ok, 'a stale beat is fallen');
  assert.ok(resumable({ star: 'v', state: 'parked' }).ok);
});

test('a parked id names its ledger, its place and its words', () => {
  const id = parkedId('abcd1234', 2, 'Which copy?');
  const ref = parseParkedId(id);
  assert.equal(ref.ledger, 'abcd1234');
  assert.equal(ref.index, 2);
  assert.ok(sameParked(ref, 'Which copy?'));
  assert.ok(!sameParked(ref, 'Another question'));
  assert.equal(parseParkedId('perm:x'), null);
});

test('inboxItems merges hosted asks, permissions, every held ledger\'s parked questions and the plan, tagged', () => {
  const items = inboxItems({
    hosted: [{ id: 'h1', name: 'vega', asks: [{ id: 'tu1', agent: 'main', at: 1, questions: [{ question: 'Go?', options: [{ label: 'Yes', description: 'safe' }, 'No'] }, { question: 'Which?', options: [] }] }], permissions: [{ id: 'p1', tool: 'Bash', summary: '{"command":"ls"}' }] }],
    ledgers: [
      { id: 'h1', star: 'vega', state: 'live', parked: [] },
      { id: 't1', star: 'sirius', state: 'live', chunk: '9.2', parked: [{ q: 'Keep the copy?', default: 'keep', alts: ['drop'] }, { q: 'done one', state: 'settled' }] },
      { id: 't2', star: 'deneb', state: 'ended', parked: ['old'] },
    ],
    durable: [{ id: 'plan/a.md:3', file: 'plan/a.md', line: 3, text: 'Ship it?', source: 'open-question' }],
  });
  assert.deepEqual(items.map((x) => [x.src, x.kind, x.session?.name || null]), [
    ['ask', 'now', 'vega'], ['ask', 'now', 'vega'], ['perm', 'now', 'vega'], ['inbox', 'parked', 'sirius'], ['durable', 'cloud', null],
  ]);
  const parked = items[3];
  assert.equal(parked.session.kind, 'terminal');
  assert.equal(parked.chunk, '9.2');
  assert.deepEqual(parked.options, ['keep', 'drop']);
  assert.equal(parked.default, 'keep');
  assert.equal(items[0].why, 'safe');

  // The page reads every row through its own builders, so each answers on its own path; the badge counts them all.
  const view = fromInbox(items, Date.now());
  assert.equal(view.length, 5);
  assert.deepEqual(view.map((x) => x.src), ['ask', 'ask', 'perm', 'inbox', 'durable']);
  assert.equal(view[0].askId, 'tu1');
  assert.equal(view[0].qText, 'Go?');
  assert.equal(view[0].session.name, 'vega');
  assert.equal(view[0].sessionId, 'h1');
  assert.equal(view[2].raw.id, 'p1', 'a permission answers through /api/permission/:id');
  assert.equal(view[2].session.name, 'vega');
  assert.match(view[2].q, /^Allow Bash: ls\?$/);
  assert.equal(view[3].session.name, 'sirius');
  assert.equal(view[4].raw.file, 'plan/a.md', 'a plan question answers through /api/oversight/answer');
});

// ---- the server -------------------------------------------------------------

test('GET /api/inbox merges every session\'s questions; POST /api/inbox/:id settles a parked one', async () => {
  await withApp({}, async ({ dir, by, app }) => {
    const s = (await call(app, '/api/sessions', { worktree: false })).json;
    const ask = by.get(s.id).hooks.onAsk({ id: 'tu_1', agent: 'main', questions: [{ question: 'Go?', options: ['Yes', 'No'] }] });
    const perm = by.get(s.id).hooks.onPermission({ id: 'p_1', agent: 'main', tool: 'Bash', input: { command: 'ls' } });
    ledger(dir, { id: 'term0001', star: 'polaris', claude: 'claude-t', parked: [{ q: 'Keep the copy?', default: 'keep', alts: ['drop'] }] });
    fs.mkdirSync(path.join(dir, 'plan'));
    fs.writeFileSync(path.join(dir, 'plan', 'x.md'), '# x\n\n## Open questions\n\n- Ship it?\n');

    const rows = (await call(app, '/api/inbox')).json;
    assert.deepEqual(rows.map((r) => [r.src, r.session?.name || null]), [['ask', s.name], ['perm', s.name], ['inbox', 'polaris'], ['durable', null]]);
    const parked = rows.find((r) => r.src === 'inbox');

    // A stale id is refused; approving the default takes it off the ledger and sends nothing.
    const stale = parkedId('term0001', 0, 'Some other words');
    assert.equal((await call(app, `/api/inbox/${encodeURIComponent(stale)}`, { answer: 'keep', how: 'approved' })).status, 409);
    const r = await call(app, `/api/inbox/${encodeURIComponent(parked.id)}`, { answer: 'keep', how: 'approved' });
    assert.equal(r.status, 200);
    assert.equal(r.json.settled, 1);
    assert.deepEqual(readLedger(dir, 'term0001').parked, []);
    assert.ok(!(await call(app, '/api/inbox')).json.some((x) => x.src === 'inbox'), 'settled: gone from the inbox');

    // A permission settles through the inbox too; an ask keeps its own route.
    assert.equal((await call(app, `/api/inbox/${encodeURIComponent('perm:p_1')}`, { answer: 'Deny', how: 'answered' })).status, 200);
    assert.deepEqual(await perm, { allow: false, always: false });
    assert.equal((await call(app, `/api/inbox/${encodeURIComponent('tu_1:0')}`, { answer: 'Yes' })).status, 409);
    assert.equal((await call(app, '/api/ask/tu_1', { answers: { 'Go?': 'Yes' } })).status, 200);
    await ask;
  });
});

test('a parked question answered with a change goes to its hosted session and leaves the ledger', async () => {
  await withApp({}, async ({ dir, by, app }) => {
    const s = (await call(app, '/api/sessions', { worktree: false })).json;
    const l = readLedger(dir, s.id);
    fs.writeFileSync(path.join(dir, '.nexus', 'sessions', `${s.id}.json`), JSON.stringify({ ...l, parked: [{ q: 'Which name?', default: 'a', alts: ['b'] }] }));
    const row = (await call(app, '/api/inbox')).json.find((x) => x.src === 'inbox');
    assert.equal(row.session.kind, 'local');
    const r = await call(app, `/api/inbox/${encodeURIComponent(row.id)}`, { answer: 'b', how: 'changed' });
    assert.equal(r.status, 200);
    assert.equal(r.json.via, 'sdk');
    assert.match(by.get(s.id).sent.at(-1), /Change to: b/);
    assert.deepEqual(readLedger(dir, s.id).parked, []);
  });
});

test('Resume on a fallen tile starts a hosted session on /reboot-resume <star>, once', async () => {
  await withApp({}, async ({ dir, by, app }) => {
    ledger(dir, { id: 'fall0001', star: 'rigel', claude: 'claude-f', beat: OLD, chunk: '40.2', step: 'building', loop: '/loop /next 40.2' });
    let rigel = (await call(app, '/api/sessions')).json.find((x) => x.id === 'fall0001');
    assert.equal(rigel.state, 'fallen');
    assert.equal(rigel.kind, 'terminal');
    assert.equal(rigel.phase, 'working');

    const r = await call(app, '/api/sessions/fall0001/resume', {});
    assert.equal(r.status, 200);
    assert.equal(r.json.prompt, '/reboot-resume rigel');
    assert.equal(r.json.resumes, 'fall0001');
    assert.equal(r.json.loop, true);
    assert.deepEqual(by.get(r.json.id).sent, ['/reboot-resume rigel'], 'the resumer\'s first prompt');
    assert.notEqual(r.json.name, 'rigel', 'the resumer takes its own star');

    const list = (await call(app, '/api/sessions')).json;
    rigel = list.find((x) => x.id === 'fall0001');
    assert.equal(rigel.state, 'resuming');
    assert.equal(rigel.resume.by, r.json.name);
    assert.ok(list.some((x) => x.id === r.json.id && x.hosted), 'the resumer shows as its own tile');

    const again = await call(app, '/api/sessions/rigel/resume', {});
    assert.equal(again.status, 409, 'one resumer per ledger');
    assert.match(again.json.error, /already resuming/);
  });
});

test('Resume refuses a live session, an unknown one, and a repo without /reboot-resume', async () => {
  await withApp({}, async ({ dir, app }) => {
    ledger(dir, { id: 'live0001', star: 'spica' });
    assert.equal((await call(app, '/api/sessions/live0001/resume', {})).status, 409);
    assert.equal((await call(app, '/api/sessions/nobody00/resume', {})).status, 404);
  });
  await withApp({ skill: false }, async ({ dir, app, by }) => {
    ledger(dir, { id: 'fall0002', star: 'mira', beat: OLD });
    const r = await call(app, '/api/sessions/fall0002/resume', {});
    assert.equal(r.status, 409);
    assert.match(r.json.error, /reboot-resume/);
    assert.equal(by.size, 1, 'nothing started past the home session');
  });
});
