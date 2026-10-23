// Recovery across a restart or an upgrade, for real: a server hosts sessions in worktrees in every state, stops (a
// graceful close, or a kill), and a second server on the same repo reads them as stopped with nexus (never terminal
// sessions), picks the calm ones up by itself, and picks the rest up with their own conversations, in their own
// worktrees, under the same ids and stars. Real git in a temp repo with a bare origin; an injected provider (no Claude).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer } from '../server/server.mjs';
import { CARRY_ON, ASK_NOTE } from '../server/recovery.mjs';
import { cleanGit } from '../server/fleet.mjs';
import { removeTree, until, killTree, exited } from './helpers/tmp.mjs';
import { git, commit, tmpRepo, fakes, call, readLedger, claudeFile } from './helpers/restart.mjs';
import { norm, counts, summary, FILTERS, trainOf } from '../src/screens/fleet/model.js';

const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const init = (p, id) => p.hooks.onMessage({ type: 'system', subtype: 'init', session_id: id, model: 'claude-test' });
const result = (p, id) => p.hooks.onMessage({ type: 'result', session_id: id, total_cost_usd: 0 });

/** A git that holds `worktree add` for one folder until released (then answers that it was killed), else real git. */
function holdingGit(match) {
  let release;
  const gate = new Promise((r) => { release = r; });
  const g = async (cwd, args, o) => {
    if (args.includes('worktree') && args.includes('add') && args.some((a) => String(a).includes(match))) {
      await gate;
      return { ok: false, out: '', err: 'killed: nexus stopped', timedOut: false };
    }
    return cleanGit(cwd, args, o);
  };
  return { git: g, release: () => release() };
}

/**
 * Server 1 hosts seven sessions: idle with a commit (vega), idle chat only (sirius), mid-turn (deneb), asking
 * (altair), a heads-down loop mid-step (polaris), forming with a queued prompt (rigel), and one never prompted (capella).
 */
async function hostSeven(t, app, by, hold) {
  const start = async (name, prompt, extra = {}) => {
    const r = await call(app, '/api/sessions', { name, ...(prompt ? { prompt } : {}), ...extra });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    return r.json;
  };
  const ready = async (s) => { await until(() => app.sessions.get(s.id)?.form?.state === 'ready', { what: `${s.name}'s worktree`, ms: 60000 }); };
  const S = {};
  S.vega = await start('vega', 'build the standings table');
  S.sirius = await start('sirius', 'tell me about the repo');
  S.deneb = await start('deneb', 'fix the clash detector');
  S.altair = await start('altair', 'pick a colour');
  S.polaris = await start('polaris', '/heads-down 3');
  for (const n of ['vega', 'sirius', 'deneb', 'altair', 'polaris']) await ready(S[n]);
  S.rigel = await start('rigel', 'make the importer');
  S.capella = await start('capella', null);
  await ready(S.capella);

  for (const n of ['vega', 'sirius', 'deneb', 'altair', 'polaris']) init(by.get(S[n].id), `claude-${n}`);
  result(by.get(S.vega.id), 'claude-vega');
  result(by.get(S.sirius.id), 'claude-sirius');
  // altair asks; the promise stays open (the person never answered before the restart).
  by.get(S.altair.id).hooks.onAsk({ id: 'ask-altair', agent: 'main', questions: [{ question: 'Which colour for the header?', options: [{ label: 'blue', description: 'matches the logo' }, { label: 'red' }] }] });
  // polaris runs a loop on a chunk (its own ledger.mjs beat would write these).
  const lf = path.join(t.dir, '.nexus', 'sessions', `${S.polaris.id}.json`);
  fs.writeFileSync(lf, JSON.stringify({ ...JSON.parse(fs.readFileSync(lf, 'utf8')), loop: '/heads-down 3', chunk: '3.1', step: 'build' }));
  commit(S.vega.worktree, 'standings.txt', 'table\n', 'feat: standings table');
  for (const n of ['vega', 'sirius', 'deneb', 'altair', 'polaris']) claudeFile(t.home, S[n].worktree, `claude-${n}`, `${n} said this last`);
  await until(() => readLedger(t.dir, S.vega.id).claude === 'claude-vega', { what: 'the Claude id in the ledger' });
  assert.equal(app.sessions.get(S.rigel.id).form.state, 'forming', 'rigel is still forming');
  return S;
}

test('a graceful stop parks every session; the next server reads them as stopped, picks up the calm ones, and Pick up all brings the rest back in their own worktrees and conversations', { timeout: 240000 }, async () => {
  const t = tmpRepo();
  const one = fakes();
  const hold = holdingGit('rigel');
  const app1 = await startServer({ repo: t.dir, provider: one.factory, pollRuns: false, dist: NO_DIST, ghLogin: async () => '', claudeHome: t.home, worktree: { git: hold.git }, beatMs: 0 });
  let app2 = null;
  try {
    const S = await hostSeven(t, app1, one.by, hold);

    // ---- the graceful stop -------------------------------------------------------------------------------------
    await app1.close();
    hold.release();
    const L = Object.fromEntries(Object.entries(S).map(([n, s]) => [n, readLedger(t.dir, s.id)]));
    for (const n of ['vega', 'sirius', 'deneb', 'altair', 'polaris', 'rigel']) {
      assert.equal(L[n].state, 'parked', `${n} parked`);
      assert.equal(L[n].stop.by, 'server');
      assert.equal(L[n].stop.why, 'stop');
    }
    assert.equal(L.capella.state, 'ended', 'the never-prompted session frees its star');
    assert.equal(L.vega.stop.turn, 'idle');
    assert.equal(L.vega.claude, 'claude-vega');
    assert.equal(path.resolve(L.vega.cwd), path.resolve(S.vega.worktree));
    assert.equal(L.deneb.stop.turn, 'working');
    assert.equal(L.altair.stop.turn, 'asking');
    assert.deepEqual(L.altair.parked.map((p) => [p.q, p.from, p.alts]), [['Which colour for the header?', 'ask', ['blue', 'red']]]);
    assert.equal(L.rigel.stop.turn, 'forming');
    assert.equal(L.rigel.sent, 0);
    assert.deepEqual(L.rigel.stop.queued.map((q) => q.text), ['make the importer'], 'the prompt sent while it formed is kept');

    // ---- the next server (an upgrade) ----------------------------------------------------------------------------
    const two = fakes();
    app2 = await startServer({ repo: t.dir, provider: two.factory, pollRuns: false, dist: NO_DIST, ghLogin: async () => '', claudeHome: t.home, beatMs: 0 });
    const list = (await call(app2, '/api/sessions')).json;
    const by = Object.fromEntries(list.map((s) => [s.name, s]));
    assert.ok(!list.some((s) => s.kind === 'terminal'), `no GUI session reads as a terminal one: ${JSON.stringify(list.map((s) => [s.name, s.kind, s.state]))}`);
    assert.ok(!by.capella, 'the ended one is gone');
    // The calm ones came back by themselves: hosted, idle, resuming their own conversations, nothing sent.
    for (const n of ['vega', 'sirius']) {
      assert.equal(by[n].hosted, true, `${n} picked up by itself`);
      assert.equal(by[n].kind, 'local');
      const p = two.by.get(S[n].id);
      assert.equal(p.resume, `claude-${n}`);
      assert.equal(path.resolve(p.cwd), path.resolve(S[n].worktree));
      assert.deepEqual(p.sent, [], 'an idle pick-up spends nothing');
    }
    for (const n of ['deneb', 'polaris', 'rigel']) {
      assert.equal(by[n].state, 'stopped', `${n} waits for Pick up`);
      assert.equal(by[n].kind, 'local');
      assert.equal(by[n].stop.clean, true);
      assert.equal(by[n].ended, undefined, `${n} is never "nothing to lose"`);
    }
    assert.equal(by.altair.state, 'asking', 'a stopped session holding a question needs you');
    assert.ok(by.altair.stop);
    assert.equal(by.deneb.stop.turn, 'working');
    assert.equal(by.rigel.stop.queued, 1);
    assert.equal(by.deneb.last.text, 'deneb said this last', 'the tile keeps its last words');

    // The fleet's own filters, unchanged: everything is on This machine, nothing in terminals.
    const rows = list.map(norm);
    const c = counts(rows);
    assert.equal(c.here, rows.length);
    assert.equal(c.terminals, 0);
    assert.equal(c.fallen, 0);
    assert.equal(c.needs, 1);
    assert.match(summary(rows), /^6 sessions · .*3 waiting to pick up/);
    assert.ok(rows.filter(FILTERS.find((f) => f.value === 'here').test).length === 6);
    assert.equal(trainOf(rows, false).stopped, 4);
    const needs = (await call(app2, '/api/needs')).json.items;
    assert.ok(needs.some((n) => n.what === 'question' && n.name === 'altair'), 'the parked question is on the top bar');
    assert.ok(needs.some((n) => n.what === 'stopped'), 'one quiet row for the stopped sessions');
    assert.ok(!needs.some((n) => n.what === 'fallen'), 'nothing reads as fell over');
    const inbox = (await call(app2, '/api/inbox')).json;
    assert.ok(inbox.some((i) => i.question === 'Which colour for the header?' && i.session.kind === 'local'));

    // A stopped session's cockpit draws its saved conversation.
    const d = (await call(app2, `/api/sessions/${S.deneb.id}`)).json;
    assert.equal(d.stopped, true);
    assert.equal(d.saved, true);

    // ---- Pick up all --------------------------------------------------------------------------------------------
    const r = await call(app2, '/api/pickup-all', {});
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual(r.json.failed, []);
    assert.deepEqual(r.json.picked.map((p) => p.name).sort(), ['altair', 'deneb', 'polaris', 'rigel']);
    await until(() => app2.sessions.get(S.rigel.id)?.form?.state === 'ready', { what: "rigel's worktree, formed after the restart", ms: 60000 });
    await until(() => two.by.get(S.rigel.id)?.sent.length === 1, { what: "rigel's queued prompt" });
    const p = (n) => two.by.get(S[n].id);
    assert.equal(p('deneb').resume, 'claude-deneb');
    assert.equal(path.resolve(p('deneb').cwd), path.resolve(S.deneb.worktree));
    assert.deepEqual(p('deneb').sent, [CARRY_ON], 'mid-step: carry on, in its own conversation');
    assert.deepEqual(p('polaris').sent, ['/reboot-resume polaris'], 'a loop picks up through /reboot-resume, in the same session');
    assert.deepEqual(p('altair').sent, [ASK_NOTE]);
    assert.deepEqual(p('rigel').sent, ['make the importer'], 'the queued prompt goes once its worktree is made');
    assert.equal(path.resolve(p('rigel').hooks.repo), path.resolve(S.rigel.worktree));
    assert.ok(fs.existsSync(path.join(S.rigel.worktree, 'README.md')));
    for (const n of ['vega', 'sirius', 'deneb', 'altair', 'polaris', 'rigel']) {
      const l = readLedger(t.dir, S[n].id);
      assert.equal(l.state, 'live', `${n} live again`);
      assert.equal(l.stop, undefined);
      assert.equal(l.star, n, 'the same star');
    }
    // The same ids: one tile each, no duplicates, the commit still on vega's branch.
    const after = (await call(app2, '/api/sessions')).json;
    assert.equal(after.filter((s) => s.name === 'vega').length, 1);
    assert.ok(after.every((s) => s.hosted), 'every session runs again');
    assert.match(git(S.vega.worktree, 'log', '-1', '--format=%s'), /standings table/);
  } finally {
    hold.release();
    await removeTree(t.parent, { stop: [() => app1.close(), () => app2?.close()] });
  }
});

test('a killed server leaves its sessions live: the next server reads them stopped (said plainly), sweeps the ledgers to parked, and picks them up', { timeout: 240000 }, async () => {
  const t = tmpRepo();
  const runner = path.join(t.parent, 'runner.mjs');
  const pkg = pathToFileURL(path.resolve(HERE, '..', 'server', 'server.mjs')).href;
  fs.writeFileSync(runner, `
import http from 'node:http';
import { startServer } from ${JSON.stringify(pkg)};
const by = new Map();
const factory = (hooks) => { const p = { kind: 'fake', hooks, send() {}, async interrupt() {}, async stop() {}, async fresh() {} }; by.set(hooks.session, p); return p; };
const app = await startServer({ repo: process.argv[2], provider: factory, pollRuns: false, dist: ${JSON.stringify(NO_DIST)}, ghLogin: async () => '', claudeHome: process.argv[3], beatMs: 0 });
const post = (p, b) => new Promise((res) => { const r = http.request({ host: '127.0.0.1', port: app.port, method: 'POST', path: p, headers: { host: '127.0.0.1:' + app.port, origin: 'http://127.0.0.1:' + app.port, 'x-nexus-token': app.token, 'content-type': 'application/json' } }, (x) => { let d = ''; x.on('data', (c) => { d += c; }); x.on('end', () => res(JSON.parse(d))); }); r.end(JSON.stringify(b)); });
const a = await post('/api/sessions', { name: 'vega', prompt: 'build it' });
const b = await post('/api/sessions', { name: 'sirius', prompt: 'chat' });
const until = async (f) => { while (!f()) await new Promise((r) => setTimeout(r, 50)); };
await until(() => app.sessions.get(a.id)?.form?.state === 'ready' && app.sessions.get(b.id)?.form?.state === 'ready');
by.get(a.id).hooks.onMessage({ type: 'system', subtype: 'init', session_id: 'claude-vega', model: 'm' });
by.get(b.id).hooks.onMessage({ type: 'system', subtype: 'init', session_id: 'claude-sirius', model: 'm' });
by.get(b.id).hooks.onMessage({ type: 'result', session_id: 'claude-sirius' });
console.log('READY ' + JSON.stringify({ a, b }));
setInterval(() => {}, 1000);
`);
  const child = spawn(process.execPath, [runner, t.dir, t.home], { stdio: ['ignore', 'pipe', 'inherit'] });
  let app2 = null;
  try {
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    const ready = await until(() => /READY (.+)\n/.exec(out), { what: 'the runner', ms: 120000 });
    const { a, b } = JSON.parse(ready[1]);
    await until(() => readLedger(t.dir, a.id).claude === 'claude-vega' && readLedger(t.dir, b.id).claude === 'claude-sirius', { what: 'the Claude ids' });
    // Fresh session files next to each worktree: before, these made a GUI session read as "Running in another terminal".
    claudeFile(t.home, a.worktree, 'claude-vega', 'vega was mid-step');
    claudeFile(t.home, b.worktree, 'claude-sirius', 'sirius idles');
    // The kill: nothing can be caught, nothing is written.
    killTree(child.pid);
    await exited(child);
    assert.equal(readLedger(t.dir, a.id).state, 'live', 'a kill leaves the ledger live');

    const two = fakes();
    app2 = await startServer({ repo: t.dir, provider: two.factory, pollRuns: false, dist: NO_DIST, ghLogin: async () => '', claudeHome: t.home, beatMs: 0 });
    const list = (await call(app2, '/api/sessions')).json;
    const by = Object.fromEntries(list.map((s) => [s.name, s]));
    assert.ok(!list.some((s) => s.kind === 'terminal'));
    for (const n of ['vega', 'sirius']) {
      assert.equal(by[n].state, 'stopped', `${n}: stopped, not "fell over" and not a terminal`);
      assert.equal(by[n].stop.clean, false, 'a crash says so');
      assert.equal(by[n].hosted, undefined, 'a crash leftover waits for Pick up');
    }
    const swept = readLedger(t.dir, a.id);
    assert.equal(swept.state, 'parked', 'the sweep parks it, so the kit agrees');
    assert.equal(swept.stop.why, 'sweep');

    const r = await call(app2, `/api/sessions/${a.id}/pickup`, {});
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.resumed, true);
    assert.equal(two.by.get(a.id).resume, 'claude-vega');
    assert.equal(path.resolve(two.by.get(a.id).cwd), path.resolve(a.worktree));
    // A crash has no turn: the conversation's own tail says it ended its turn, so nothing is sent.
    assert.deepEqual(two.by.get(a.id).sent, []);
    // Resume on a stopped tile picks it up too (the old button, the same path).
    const rr = await call(app2, `/api/sessions/${b.id}/resume`, {});
    assert.equal(rr.status, 200, JSON.stringify(rr.json));
    assert.equal(two.by.get(b.id).resume, 'claude-sirius');
    assert.equal(readLedger(t.dir, b.id).state, 'live');
    // A second pick-up of a running one is a no-op, not a second host.
    const again = await call(app2, `/api/sessions/${a.id}/pickup`, {});
    assert.equal(again.json.already, true);
  } finally {
    await removeTree(t.parent, { stop: [() => app2?.close()], children: [child] });
  }
});
