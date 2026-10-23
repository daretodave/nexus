// An alive Fleet home and put away (0.5.1): the tile's tone by state (working, needs you, done, fell over, idle),
// when a session has finished its job, what putting it away keeps, the coloured "fell over at", the start tile's
// line, Keep it remembered per job, the tiles rendered on the server, and POST /api/sessions/:id/put-away.
import './jsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { FILTERS, norm, summary } from '../src/screens/fleet/model.js';
import {
  agentOrb, commandOf, doneTitle, doneTrack, fellParts, finishedJob, jobTitle, keptAlready, mainOrb, nextInLine, putAwayToast,
  rememberKeep, tone,
} from '../src/screens/fleet/alive.js';
import { andList, claimCount, holdsOf, putAwayPlan } from '../shared/put-away.mjs';
import { startServer } from '../server/server.mjs';
import { removeTree } from './helpers/tmp.mjs';

// src/data/client.js reads its token from the address bar when it loads (the tile pulls it in).
globalThis.window ||= { location: { href: 'http://localhost/' }, history: { replaceState() {} } };
const { default: SessionTile } = await import('../src/screens/fleet/SessionTile.jsx');
const { default: PutAway } = await import('../src/screens/fleet/PutAway.jsx');

const APPLY = '/oversight apply these answers from the nexus GUI. Do not ask again; the person already answered.';
const CLEAN = { branch: 'main', worktree: '', up: 0, ahead: 0, dirty: 0, staged: 0, claims: 0 };
/** deneb after it applied oversight answers: idle, a final word, nothing held. */
const deneb = (over = {}) => norm({
  id: 'd1', name: 'deneb', kind: 'local', state: 'live', turn: 'idle', mode: 'owner', lastPrompt: APPLY,
  last: { kind: 'text', text: "I've recorded your answer. Committed and pushed to main as b9ad24b.", at: '2026-10-23T06:58:00Z' },
  git: CLEAN, ...over,
});

// ---- tone --------------------------------------------------------------------------------------------------------

test('each tile reads its state by tone: working, needs you, done, fell over, idle, stopped, in a terminal', () => {
  assert.equal(tone(norm({ id: 'a', name: 'vega', state: 'live', turn: 'working' })), 'working');
  assert.equal(tone(norm({ id: 'a', name: 'vega', state: 'live' })), 'working', 'unknown turn on a live session: working');
  assert.equal(tone(norm({ id: 'b', name: 'sirius', state: 'asking', questions: { answered: 0, total: 2 } })), 'needs');
  assert.equal(tone(deneb()), 'done');
  assert.equal(tone(norm({ id: 'c', name: 'altair', state: 'fallen' })), 'fallen');
  assert.equal(tone(norm({ id: 'c', name: 'altair', state: 'resume-failed' })), 'fallen');
  assert.equal(tone(norm({ id: 'c', name: 'altair', state: 'resuming' })), 'resuming');
  assert.equal(tone(norm({ id: 'e', name: 'rigel', state: 'live', turn: 'idle', lastPrompt: 'what does this do?', last: { kind: 'text', text: 'It parses.' } })), 'idle', 'a conversation that rests is quiet, not done');
  assert.equal(tone(norm({ id: 'f', name: 'mira', state: 'fallen', ended: true })), 'stopped');
  assert.equal(tone(norm({ id: 'g', name: 'c0ffee12', kind: 'terminal', state: 'live', turn: 'working' })), 'observing');
});

test('the stage orbs follow the tone: done rests green, needs you asks, a working tool call reads cyan', () => {
  assert.equal(mainOrb(deneb()), 'done');
  assert.equal(mainOrb(norm({ id: 'b', name: 'sirius', state: 'asking' })), 'blocked');
  const working = norm({ id: 'a', name: 'vega', state: 'live', turn: 'working', orb: 'thinking', last: { kind: 'tool', tool: 'Bash', arg: 'npm test' } });
  assert.equal(mainOrb(working), 'tool', 'its last word was a tool call');
  assert.equal(mainOrb({ ...working, last: { kind: 'text', text: 'thinking about it' } }), 'thinking');
  assert.equal(mainOrb(norm({ id: 'a', name: 'vega', state: 'live', turn: 'working', orb: 'writing' })), 'writing', 'a reported orb wins');
  assert.equal(agentOrb({ state: 'tool' }, 'done'), 'done');
  assert.equal(agentOrb({ state: 'tool' }, 'idle'), 'idle');
  assert.equal(agentOrb({ state: 'tool' }, 'working'), 'tool');
  assert.ok(doneTrack([{ key: 'q', state: undefined, p: '40%' }]).every((i) => i.state === 'done' && i.p === undefined));
});

// ---- finished its job --------------------------------------------------------------------------------------------

test('a session has finished its job only from real signals', () => {
  assert.deepEqual(finishedJob(deneb()), { why: 'oversight', text: 'applied your answers' });
  assert.equal(finishedJob(deneb({ turn: 'working' })), null, 'still working');
  assert.equal(finishedJob(deneb({ last: { kind: 'tool', tool: 'Bash', arg: 'git push' } })), null, 'it stopped on a tool call, not a final word');
  assert.equal(finishedJob(deneb({ last: null })), null, 'no last word known');
  assert.equal(finishedJob(deneb({ state: 'asking' })), null, 'it asks');
  assert.equal(finishedJob(deneb({ parked: 2 })), null, 'it holds parked questions');
  assert.equal(finishedJob(deneb({ git: { ...CLEAN, claims: 1 } })), null, 'it holds a claim');
  assert.equal(finishedJob(deneb({ git: { ...CLEAN, claims: ['14.1'] } })), null, 'a claim as an id (the demo)');
  assert.equal(finishedJob(deneb({ lastPrompt: 'tidy up the readme please' })), null, 'a free-form prompt is a conversation');
  assert.equal(finishedJob(deneb({ kind: 'terminal' })), null, 'a terminal session is not ours to put away');
  assert.equal(finishedJob(deneb({ state: 'fallen' })), null);
  assert.equal(finishedJob(deneb({ ended: true })), null);
  assert.deepEqual(finishedJob(deneb({ lastPrompt: '/oversight' })), { why: 'oversight', text: 'oversight finished' });
  // A chunk loop is done once its work landed, and not when it stopped short.
  assert.deepEqual(finishedJob(deneb({ lastPrompt: '/next', last: { kind: 'text', text: '14.2 landed on main.' } })), { why: 'next', text: 'its chunk landed' });
  assert.equal(finishedJob(deneb({ lastPrompt: '/next', last: { kind: 'text', text: 'Blocked: the gate fails on a flaky test.' } })), null);
  assert.deepEqual(finishedJob(deneb({ lastPrompt: '/next', last: { kind: 'text', text: 'Gate green.' }, event: { text: '14.2 landed on main' } })), { why: 'next', text: 'its chunk landed' });
  assert.deepEqual(finishedJob(deneb({ lastPrompt: '/heads-down 7', last: { kind: 'text', text: 'All three closed and on main.' } })), { why: 'heads-down', text: 'its list is done' });
  assert.deepEqual(finishedJob(deneb({ lastPrompt: '/plot peek "relative ages"' })), { why: 'plot', text: '/plot finished' });
  // A turn that ends asking something in plain words waits on the person.
  assert.equal(finishedJob(deneb({ lastPrompt: '/oversight', last: { kind: 'text', text: 'Question 1 of 4: warn or block?' } })), null);
  assert.equal(finishedJob(deneb({ lastPrompt: '/plot peek', last: { kind: 'text', text: 'Specced it.\n\nWhich lane should this go in?' } })), null);
  assert.equal(finishedJob(deneb({ lastPrompt: '/plot peek', last: { kind: 'text', text: 'Which lane? **Asap**, or *anytime?*' } })), null, 'a question in markdown');
  assert.deepEqual(finishedJob(deneb({ lastPrompt: '/plot peek', last: { kind: 'text', text: 'Why? It was in the way. Planned as 12.6.' } })), { why: 'plot', text: '/plot finished' }, 'a question mid-text is not one left open');
  // A chunk loop that says its work did not land is not done, and unknown claims are not "none".
  const failed = 'The gate failed, so nothing was pushed and the chunk is not closed.';
  assert.equal(finishedJob(deneb({ lastPrompt: '/next', last: { kind: 'text', text: failed } })), null);
  assert.equal(finishedJob(deneb({ lastPrompt: '/next', last: { kind: 'text', text: "It wasn't merged: the PR waits on review." } })), null);
  assert.equal(finishedJob(deneb({ lastPrompt: '/next', last: { kind: 'text', text: '14.2 landed on main.' }, git: { ...CLEAN, claims: null } })), null, 'claims unknown');
  assert.deepEqual(finishedJob(deneb({ lastPrompt: '/next', last: { kind: 'text', text: 'Gate green, pushed to main as 3f0a9d2. Nothing left to do.' } })), { why: 'next', text: 'its chunk landed' });
  assert.equal(commandOf('  /lessons-pr ../x'), 'lessons-pr');
  assert.equal(commandOf('hello /next'), '');
});

test('a finished session counts as done, never idle: in the topbar line and under the Idle chip', () => {
  const quiet = deneb({ id: 'q1', name: 'vega', lastPrompt: 'hello there' });
  const list = [deneb(), quiet];
  assert.equal(summary(list), '2 sessions · 1 done · 1 idle');
  const idle = FILTERS.find((f) => f.value === 'idle');
  assert.deepEqual(list.filter(idle.test).map((s) => s.name), ['vega']);
});

test('a finished session names its job when it has no chunk; a working one names what it is doing', () => {
  assert.equal(doneTitle(finishedJob(deneb())), 'Applied your oversight answers');
  assert.equal(doneTitle({ why: 'next', text: 'its chunk landed' }), 'Landed its chunk');
  assert.equal(doneTitle({ why: 'plot', text: '/plot finished' }), 'Ran /plot');
  assert.equal(doneTitle(null), '');
  assert.equal(jobTitle({ lastPrompt: APPLY }), 'Applying your oversight answers');
  assert.equal(jobTitle({ lastPrompt: '/next' }), '/next');
  assert.equal(jobTitle({ lastPrompt: 'hi' }), '');
});

// ---- put away safety ---------------------------------------------------------------------------------------------

test('putting a session away never loses work: it says what it holds and keeps it', () => {
  const clean = putAwayPlan({ git: { ...CLEAN, worktree: '/wt/vega-1' } });
  assert.equal(clean.clean, true);
  assert.equal(clean.say, '');
  assert.equal(clean.worktree, '/wt/vega-1');
  const onMain = putAwayPlan({ git: { ...CLEAN, worktree: '/wt/vega-1', up: 2, ahead: 2 } });
  assert.equal(onMain.clean, false);
  assert.equal(onMain.say, 'It still holds 2 commits not pushed yet.');
  assert.match(onMain.keep, /worktree, branch and claims stay/);
  // In the shared checkout its commits and changes may be anyone's, and nothing there closes: only claims count.
  const shared = putAwayPlan({ git: { ...CLEAN, up: 2, ahead: 2, dirty: 1 } });
  assert.equal(shared.clean, true, "the owner's own edits in the checkout are not the session's");
  assert.equal(shared.worktree, '');
  const sharedClaims = putAwayPlan({ git: { ...CLEAN, dirty: 1, claims: 1, claimIds: ['9.3'] } });
  assert.deepEqual(sharedClaims.holds.map((h) => h.kind), ['claims']);
  assert.match(sharedClaims.keep, /branch and claims stay/);
  const branch = putAwayPlan({ git: { branch: 'nexus/vega-1', worktree: '/wt/vega-1', ahead: 1, up: 1, dirty: 3, staged: 1, claims: 2, claimIds: ['12.4', '12.5'] } });
  assert.deepEqual(branch.holds.map((h) => h.kind), ['commits', 'changes', 'claims']);
  assert.equal(branch.say, 'It still holds 1 commit not on main yet, 4 uncommitted changes and 2 claims (12.4, 12.5).');
  assert.match(branch.keep, /worktree, branch and claims stay/);
  assert.equal(putAwayPlan({ git: { ...CLEAN, worktree: '/wt/vega-1', dirty: true } }).say, 'It still holds an uncommitted change.');
  const unknown = putAwayPlan({ git: {} });
  assert.equal(unknown.clean, false, 'git it could not read is never "nothing behind"');
  assert.equal(unknown.say, 'Its git could not be read, so nothing of it is closed.');
  const noClaims = putAwayPlan({ git: { ...CLEAN, claims: null } });
  assert.equal(noClaims.clean, false, 'claims it could not read are never "no claims"');
  assert.deepEqual(holdsOf({ git: { ...CLEAN, claims: null } }).map((h) => h.text), ['claims unknown']);
  assert.equal(noClaims.say, 'Its claims could not be read, so nothing of it is closed.');
  assert.equal(claimCount({ claims: ['1.1', '1.2'] }), 2);
  assert.equal(claimCount({ claims: 3 }), 3);
  assert.equal(claimCount({ claims: null }), 0);
  assert.equal(andList(['a', 'b', 'c']), 'a, b and c');
  assert.equal(putAwayToast('deneb', { worktree: { closed: true } }).body, 'Its star is free and its empty worktree is gone.');
  assert.match(putAwayToast('vega', { kept: [{ kind: 'commits' }], say: 'It still holds 1 commit not on main yet.' }).body, /^Its star is free\. It still holds 1 commit not on main yet\. All of it stays where it was\.$/);
});

// ---- small rules ---------------------------------------------------------------------------------------------------

test('where a session fell splits into its tool and its command, for colour', () => {
  assert.deepEqual(fellParts('Bash npm run build'), { tool: 'Bash', arg: 'npm run build' });
  assert.deepEqual(fellParts('Edit'), { tool: 'Edit', arg: '' });
  assert.deepEqual(fellParts('mcp__x__y  some arg'), { tool: 'mcp__x__y', arg: 'some arg' });
  assert.equal(fellParts(''), null);
});

test('the start tile names what heads-down takes first, from the plan', () => {
  assert.equal(nextInLine({}), null);
  assert.deepEqual(nextInLine({ next: [{ id: '14.2', size: 'S', lane: 'asap' }] }, 'Tide station picker'), { id: '14.2', rest: 'Tide station picker, size S, from the asap lane' });
  assert.deepEqual(nextInLine({ next: { id: '12.5', spec: '12', lane: 'spec' } }), { id: '12.5', rest: 'from spec 12' });
});

test('Keep it is remembered per job: a later job that finishes asks again; a blocked store just asks again', () => {
  const m = new Map();
  const store = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
  const s = deneb();
  assert.equal(keptAlready(s, store), false);
  rememberKeep(s, store);
  assert.equal(keptAlready(s, store), true);
  assert.equal(keptAlready(deneb({ last: { kind: 'text', text: 'again', at: '2026-10-23T08:00:00Z' } }), store), false);
  const blocked = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  assert.equal(keptAlready(s, blocked), false);
  assert.doesNotThrow(() => rememberKeep(s, blocked));
  assert.equal(keptAlready(s, null), false);
});

// ---- rendered ------------------------------------------------------------------------------------------------------

const routed = (el) => renderToStaticMarkup(createElement(MemoryRouter, null, el));
const train = { active: false, isPaused: () => false };

test('a done tile is green with a check, names its job and offers to be put away', () => {
  const html = routed(createElement(SessionTile, { s: deneb(), train, now: Date.now(), onPutAway: () => {} }));
  assert.match(html, /tone-done/);
  assert.match(html, /done-chip/);
  assert.match(html, /st-done/, 'its orb rests done');
  assert.match(html, /Applied your oversight answers/);
  assert.match(html, /Done · applied your answers/);
  assert.match(html, /Put deneb away\?/);
  assert.match(html, />Put away</);
  assert.match(html, /Keep it/);
  const working = routed(createElement(SessionTile, { s: norm({ id: 'a', name: 'vega', state: 'live', turn: 'working', chunk: { id: '12.4', title: 'Season standings' } }), train, now: Date.now() }));
  assert.match(working, /tone-working/);
  assert.doesNotMatch(working, /put-away/);
  const needs = routed(createElement(SessionTile, { s: norm({ id: 'b', name: 'sirius', state: 'asking', questions: { answered: 2, total: 6 } }), train, now: Date.now() }));
  assert.match(needs, /tone-needs/);
});

test('a fell-over tile colours where it fell: the tool, then its command as a tool row draws it', () => {
  const html = routed(createElement(SessionTile, { s: norm({ id: 'c', name: 'altair', state: 'fallen', fell: { tool: 'Bash npm run build', chunk: '14.1' } }), train, now: Date.now() }));
  assert.match(html, /class="fell-at"/);
  assert.match(html, /<span class="fa-tool">Bash<\/span>/);
  assert.match(html, /syn-/, 'the command is coloured');
  assert.match(html, /chunk <b>14.1<\/b>/);
});

test('the put-away card holding work says what, and its one button keeps it', () => {
  const s = deneb({ git: { branch: 'nexus/deneb-1', worktree: '/wt/deneb-1', ahead: 2, up: 2, dirty: 0, claims: 0 } });
  const html = renderToStaticMarkup(createElement(PutAway, { s, done: finishedJob(deneb()) }));
  assert.match(html, /holds-work/);
  assert.match(html, /It still holds 2 commits not on main yet\./);
  assert.match(html, /worktree, branch and claims stay as they are/);
  assert.match(html, /Put away, keep its work/);
  const clean = renderToStaticMarkup(createElement(PutAway, { s: deneb(), done: finishedJob(deneb()) }));
  assert.match(clean, /<b>deneb<\/b> is done/);
  assert.match(clean, /Nothing in the checkout is touched/, 'in the shared checkout nothing closes');
  const own = renderToStaticMarkup(createElement(PutAway, { s: deneb({ git: { ...CLEAN, branch: 'nexus/deneb-1', worktree: '/wt/deneb-1' } }), done: finishedJob(deneb()) }));
  assert.match(own, /closes its empty worktree\. It left nothing behind, so nothing is lost/);
});

// ---- the server ----------------------------------------------------------------------------------------------------

const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');
const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function tmpRepo() {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-away-'));
  const dir = path.join(parent, 'repo');
  fs.mkdirSync(dir);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'README.md'), '# r\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), '.nexus/\n');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'init'], { cwd: dir });
  return { parent, dir };
}

function fakes() {
  const factory = (hooks) => ({ kind: 'fake', sent: [], hooks, send(t) { this.sent.push(t); }, async interrupt() {}, async stop() {}, async fresh() {} });
  return { factory };
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

test('put away ends a finished session and frees its star; the home session and parked questions are refused', async () => {
  const { parent, dir } = tmpRepo();
  const { factory } = fakes();
  const app = await startServer({ repo: dir, provider: factory, pollRuns: false, dist: NO_DIST, ghLogin: async () => '' });
  try {
    // Clean: nothing past its base, no changes, no claims.
    const a = (await call(app, '/api/sessions', { worktree: false })).json;
    const r = await call(app, `/api/sessions/${a.id}/put-away`, {});
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.closed, true);
    assert.deepEqual(r.json.kept, []);
    const ledger = JSON.parse(fs.readFileSync(path.join(dir, '.nexus', 'sessions', `${a.id}.json`), 'utf8'));
    assert.equal(ledger.state, 'ended');
    assert.equal((await call(app, '/api/send', { text: 'x', session: a.id })).status, 404, 'the session is gone');
    assert.equal((await call(app, '/api/sessions', { worktree: false })).json.name, a.name, 'its star is free again');

    // In the shared checkout an uncommitted change may be anyone's: it is not charged, and it stays untouched.
    const b = (await call(app, '/api/sessions', { worktree: false })).json;
    fs.writeFileSync(path.join(dir, 'README.md'), '# r\nwork in progress\n');
    const shared = await call(app, `/api/sessions/${b.id}/put-away`, {});
    assert.equal(shared.status, 200, JSON.stringify(shared.json));
    assert.equal(fs.readFileSync(path.join(dir, 'README.md'), 'utf8'), '# r\nwork in progress\n', 'the change is still there');

    // The home session stays while the server runs.
    const home = (await call(app, '/api/server')).json.home;
    const refusedHome = await call(app, `/api/sessions/${home}/put-away`, {});
    assert.equal(refusedHome.status, 409);
    assert.match(refusedHome.json.error, /home session stays/);
    const rows = (await call(app, '/api/sessions')).json;
    assert.ok(!rows.some((x) => x.home && x.id !== home), 'only the home session reads home');

    // A session holding a parked question is refused: putting it away would end the ledger that holds it.
    const c = (await call(app, '/api/sessions', { worktree: false })).json;
    const lp = path.join(dir, '.nexus', 'sessions', `${c.id}.json`);
    fs.writeFileSync(lp, JSON.stringify({ ...JSON.parse(fs.readFileSync(lp, 'utf8')), parked: [{ q: 'Warn or block?', state: 'pending' }] }));
    const parked = await call(app, `/api/sessions/${c.id}/put-away`, {});
    assert.equal(parked.status, 409, JSON.stringify(parked.json));
    assert.match(parked.json.error, /parked question/);

    assert.equal((await call(app, '/api/sessions/nobody00/put-away', {})).status, 404);
  } finally {
    await removeTree(parent, { stop: [() => app.close()] });
  }
});

test('put away closes a clean linked worktree through worktree.mjs; holding a change it refuses, then keeps it all', async () => {
  const { parent, dir } = tmpRepo();
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.copyFileSync(path.join(KIT, 'scripts', 'worktree.mjs'), path.join(dir, 'scripts', 'worktree.mjs'));
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'scripts'], { cwd: dir });
  const { factory } = fakes();
  const app = await startServer({ repo: dir, provider: factory, pollRuns: false, dist: NO_DIST, ghLogin: async () => '' });
  /** Start a session in a worktree of its own and wait until git has made it. */
  async function started() {
    const s = (await call(app, '/api/sessions', {})).json;
    assert.ok(s.worktree, JSON.stringify(s));
    for (let i = 0; i < 200 && !fs.existsSync(path.join(s.worktree, 'README.md')); i++) await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 200; i++) {
      const row = (await call(app, '/api/sessions')).json.find((x) => x.id === s.id);
      if (row?.git?.worktree) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    return s;
  }
  try {
    // Clean: its empty worktree closes the safe way, and its star frees.
    const a = await started();
    const r = await call(app, `/api/sessions/${a.id}/put-away`, {});
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual(r.json.kept, []);
    assert.equal(r.json.worktree?.closed, true, JSON.stringify(r.json.worktree));
    assert.equal(fs.existsSync(a.worktree), false, 'its empty worktree is gone');

    // An uncommitted change in its own worktree: refused with what it holds; with keep it ends and the worktree stays.
    const b = await started();
    fs.writeFileSync(path.join(b.worktree, 'notes.txt'), 'work in progress\n');
    const refused = await call(app, `/api/sessions/${b.id}/put-away`, {});
    assert.equal(refused.status, 409, JSON.stringify(refused.json));
    assert.match(refused.json.say, /uncommitted change/);
    const kept = await call(app, `/api/sessions/${b.id}/put-away`, { keep: true });
    assert.equal(kept.status, 200);
    assert.ok(kept.json.kept.some((h) => h.kind === 'changes'));
    assert.equal(kept.json.worktree.closed, false);
    assert.equal(fs.readFileSync(path.join(b.worktree, 'notes.txt'), 'utf8'), 'work in progress\n', 'its worktree and change stay');
  } finally {
    await removeTree(parent, { stop: [() => app.close()] });
  }
});

test('a fresh git read never trusts a stored answer: git it cannot read and claims it cannot list read unknown', async () => {
  const { createGitView } = await import('../server/git.mjs');
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-away-git-'));
  const nogit = path.join(parent, 'nogit');
  fs.mkdirSync(nogit);
  const { dir } = tmpRepo();
  try {
    const stored = { id: 'a1', git: { branch: 'main', worktree: '', up: 0, ahead: 0, dirty: 0, staged: 0, claims: 0 } };
    const blind = createGitView({ repo: nogit, root: async () => nogit, sessions: async () => [], run: async () => ({ ok: false }), claims: async () => ({ rows: [] }) });
    const [fresh] = await blind.withGit([stored], { fresh: true });
    assert.equal(fresh.git.ahead, null);
    assert.equal(fresh.git.up, null);
    assert.equal(putAwayPlan(fresh).clean, false, 'unknown git is never clean');
    const [cached] = await blind.withGit([stored]);
    assert.equal(cached.git.up, 0, 'a passing read keeps what it knew, for the tile');

    const unlisted = createGitView({ repo: dir, root: async () => dir, sessions: async () => [], run: async () => ({ ok: false }), claims: async () => ({ available: true, rows: [], error: 'unreadable claims list' }) });
    const [read] = await unlisted.withGit([{ id: 'a1', git: {} }], { fresh: true });
    assert.equal(read.git.ahead, 0);
    assert.equal(read.git.claims, null, 'a claims list that failed is unknown, not "none"');
  } finally {
    await removeTree(parent);
    await removeTree(path.dirname(dir));
  }
});
