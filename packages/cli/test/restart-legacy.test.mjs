// Ledgers an older nexus (0.5.1) wrote, with none of the fields a stopping server now keeps (claude, stop, server,
// sent): they still read as stopped with nexus, their own Claude Code session is found in its worktree's folder, an
// ambiguous match in the shared checkout is refused, and a pick-up with no conversation falls back to /reboot-resume.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { startServer } from '../server/server.mjs';
import { claudeFor, claudeSlug } from '../server/sessions.mjs';
import { removeTree } from './helpers/tmp.mjs';
import { tmpRepo, fakes, call, readLedger } from './helpers/restart.mjs';

const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');

/** A 0.5.1 ledger: what fleet.mjs startLedger wrote then. */
function oldLedger(dir, o) {
  const d = path.join(dir, '.nexus', 'sessions');
  fs.mkdirSync(d, { recursive: true });
  const l = {
    id: o.id, star: o.star, state: 'live', claims: o.id, started: o.started, beat: o.started, cwd: o.cwd, worktree: o.worktree || '',
    branch: o.branch || '', chunk: '', step: '', loop: '', claimed: [], workflow: null, builder: '', defaults: [], parked: [], train: '',
    next_step: '', notes: '', gui: true, ...(o.extra || {}),
  };
  fs.writeFileSync(path.join(d, `${o.id}.json`), JSON.stringify(l, null, 2));
  return l;
}

function session(home, cwd, id, at) {
  const folder = path.join(home, 'projects', claudeSlug(cwd));
  fs.mkdirSync(folder, { recursive: true });
  const f = path.join(folder, `${id}.jsonl`);
  fs.writeFileSync(f, `${JSON.stringify({ type: 'user', cwd, timestamp: at, message: { role: 'user', content: 'hi' } })}\n${JSON.stringify({ type: 'assistant', cwd, timestamp: at, message: { id: 'm1', content: [{ type: 'text', text: 'said before the upgrade' }], stop_reason: 'end_turn' } })}\n`);
  return f;
}

test('0.5.1 ledgers read stopped; claudeFor finds a worktree\'s conversation and refuses an ambiguous shared one; Pick up falls back to /reboot-resume', { timeout: 120000 }, async () => {
  const t = tmpRepo();
  const wt = path.join(t.parent, 'repo-wt', 'vega-1');
  execFileSync('git', ['worktree', 'add', '-q', '-b', 'nexus/vega-1', wt, 'HEAD'], { cwd: t.dir });
  const started = new Date(Date.now() - 3600000).toISOString();
  const later = new Date(Date.now() - 3500000).toISOString();
  const vega = oldLedger(t.dir, { id: 'aaaa0001', star: 'vega', started, cwd: wt, worktree: wt, branch: 'nexus/vega-1' });
  // Two sessions in the shared checkout around the same time: no way to tell which is whose.
  const deneb = oldLedger(t.dir, { id: 'aaaa0002', star: 'deneb', started, cwd: t.dir });
  session(t.home, wt, 'claude-old-vega', later);
  session(t.home, wt, 'claude-older', new Date(Date.now() - 7200000).toISOString()); // before the ledger: never its
  session(t.home, t.dir, 'claude-x', later);
  session(t.home, t.dir, 'claude-y', later);

  assert.equal(claudeFor(vega, { home: t.home, primary: t.dir })?.id, 'claude-old-vega');
  assert.equal(claudeFor(deneb, { home: t.home, primary: t.dir }), null, 'two candidates in the shared checkout: none');
  // One alone in the shared checkout, within two minutes of the ledger's start, is taken.
  const solo = { ...deneb, started: new Date(Date.now() - 90000000).toISOString() };
  session(t.home, t.dir, 'claude-solo', new Date(Date.parse(solo.started) + 30000).toISOString());
  assert.equal(claudeFor(solo, { home: t.home, primary: t.dir })?.id, 'claude-solo');

  const two = fakes();
  const app = await startServer({ repo: t.dir, provider: two.factory, pollRuns: false, dist: NO_DIST, ghLogin: async () => '', claudeHome: t.home, beatMs: 0 });
  try {
    const list = (await call(app, '/api/sessions')).json;
    const by = Object.fromEntries(list.map((s) => [s.name, s]));
    assert.equal(by.vega.state, 'stopped');
    assert.equal(by.vega.kind, 'local');
    assert.equal(by.vega.last.text, 'said before the upgrade', 'the found conversation gives the tile its last words, whatever its age');
    assert.equal(by.deneb.state, 'stopped');
    assert.equal(readLedger(t.dir, 'aaaa0001').stop.why, 'sweep', 'an old live ledger with no server pid is swept');

    const r = await call(app, '/api/sessions/aaaa0001/pickup', {});
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(two.by.get('aaaa0001').resume, 'claude-old-vega', 'its conversation is found and resumed');
    const r2 = await call(app, '/api/sessions/aaaa0002/pickup', {});
    assert.equal(r2.status, 200);
    assert.equal(r2.json.resumed, false);
    assert.equal(two.by.get('aaaa0002').resume, null);
    // Nothing to say it ever ran (no sent, no claude): nothing is sent until the person sends something.
    assert.deepEqual(two.by.get('aaaa0002').sent, []);
  } finally {
    await removeTree(t.parent, { stop: [() => app.close()] });
  }
});

test('a pick-up with a lost conversation and work to carry on starts fresh on /reboot-resume', async () => {
  const { pickupMessages, contextPrompt } = await import('../server/recovery.mjs');
  const l = { id: 'x', star: 'vega', sent: 3, chunk: '4.2', stop: { turn: 'working' } };
  assert.deepEqual(pickupMessages(l, { resumed: false, skill: true }).map((m) => m.text), ['/reboot-resume vega']);
  assert.match(pickupMessages(l, { resumed: false, skill: false })[0].text, /picking up the nexus session vega/);
  assert.match(contextPrompt({ star: 'vega', worktree: '/w', branch: 'b', chunk: '4.2' }), /on branch b.*chunk 4\.2/);
  // Idle with its conversation: nothing.
  assert.deepEqual(pickupMessages({ ...l, chunk: '', stop: { turn: 'idle' } }, { resumed: true, skill: true }), []);
  // What the person typed goes last, after the queued ones.
  assert.deepEqual(pickupMessages({ ...l, chunk: '', stop: { turn: 'idle', queued: [{ text: 'a' }, { text: 'b', steered: true }] } }, { resumed: true, then: 'c' }).map((m) => [m.text, m.steered]), [['a', false], ['b', true], ['c', false]]);
});
