// ledger.mjs (the live session ledger): star names go to the first free one, a live session past its stale window
// reads fallen, --set/--add/--clear shape the JSON, park and take and done move the state, and a second take is
// refused; sessions that beat or take at once (real child processes) never share a star or both win, a stale lock
// breaks and a busy rename retries. node:test, no deps, no git (the CLI runs against a scratch folder in the temp dir).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { spawn, spawnSync } from 'node:child_process';

import { DIR, LOCK, STARS, apply, breakStale, find, fresh, main, nextStar, readAll, renameRetry, status, withLock } from '../ledger.mjs';

const T0 = Date.parse('2026-10-20T12:00:00Z');

describe('the pure parts', () => {
  it('names a session after the first star no held ledger uses', () => {
    assert.equal(nextStar([]), 'vega');
    assert.equal(nextStar([{ star: 'vega', state: 'live' }, { star: 'sirius', state: 'parked' }]), 'polaris');
    assert.equal(nextStar([{ star: 'vega', state: 'ended' }]), 'vega');
    assert.equal(nextStar(STARS.map((star) => ({ star, state: 'live' }))), 'vega-2');
  });

  it('reads a live session with a stale beat as fallen', () => {
    const l = { state: 'live', beat: new Date(T0).toISOString() };
    assert.equal(status(l, T0 + 10 * 60_000), 'live');
    assert.equal(status(l, T0 + 16 * 60_000), 'fallen');
    assert.equal(status({ ...l, state: 'parked' }, T0 + 99 * 60_000), 'parked');
    assert.equal(status({ state: 'live' }, T0), 'fallen');
  });

  it('sets dotted keys as JSON, appends lists and clears keys', () => {
    const l = apply(fresh('abcdef0123', 'vega', new Date(T0)), {
      set: ['workflow.runId=wf-1', 'workflow.scriptPath=C:/x/y.js', 'claimed=["07.1","07.2"]', 'step=building'],
      add: ['defaults=took the Recommended copy', 'parked=which colour?'],
      clear: ['builder'],
    });
    assert.deepEqual(l.workflow, { runId: 'wf-1', scriptPath: 'C:/x/y.js' });
    assert.deepEqual(l.claimed, ['07.1', '07.2']);
    assert.deepEqual(l.defaults, ['took the Recommended copy']);
    assert.equal('builder' in l, false);
    assert.throws(() => apply(l, { set: ['novalue'] }), /not key=value/);
  });

  it('finds by id, prefix or star, preferring the held one', () => {
    const ls = [{ id: 'aaaa1111x', star: 'vega', state: 'ended' }, { id: 'bbbb2222y', star: 'vega', state: 'live' }];
    assert.equal(find(ls, 'vega').id, 'bbbb2222y');
    assert.equal(find(ls, 'aaaa1111').id, 'aaaa1111x');
    assert.equal(find(ls, 'nope'), null);
  });
});

describe('the CLI', () => {
  let root;
  let said;
  let clock;
  const run = (argv, env) => {
    said = [];
    return main(argv, { env, root, now: () => new Date(clock), out: (s) => said.push(s), err: (s) => said.push(s) });
  };
  const A = { CLAUDE_CODE_SESSION_ID: 'aaaa1111-2222' };
  const B = { CLAUDE_CODE_SESSION_ID: 'bbbb3333-4444' };
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-ledger-'));
    clock = T0;
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('beats, parks for a train, and lets one other session take it once', () => {
    assert.equal(run(['beat', '--chunk', '07.2', '--step', 'building', '--add', 'claimed=07.2'], A), 0);
    assert.match(said[0], /vega \(aaaa1111\) live · 07.2 · building/);
    run(['beat'], B);
    assert.match(said[0], /^ledger: sirius/);
    assert.equal(run(['park', '1020-1000', '--set', 'next_step=run the gate'], A), 0);
    run(['list', '--train', '1020-1000']);
    assert.equal(said.length, 1);
    assert.match(said[0], /vega\s+parked/);
    assert.equal(run(['take', 'vega'], B), 0);
    assert.equal(JSON.parse(said[0]).next_step, 'run the gate');
    assert.equal(run(['take', 'vega'], B), 1);
    assert.equal(run(['done', 'vega'], B), 0);
    assert.equal(readAll(path.join(root, DIR)).find((l) => l.star === 'vega').state, 'resumed');
  });

  it('records the taker as the runner, whose beats keep the ledger it took', () => {
    const C = { CLAUDE_CODE_SESSION_ID: 'cccc5555-6666-7777' };
    run(['beat', '--chunk', '60.10', '--step', 'building'], A);
    clock = T0 + 30 * 60_000;
    assert.equal(run(['take', 'vega'], C), 0);
    const taken = JSON.parse(said[0]);
    assert.equal(taken.runner, 'cccc5555');
    assert.equal(taken.runnerSince, new Date(clock).toISOString());
    assert.equal(run(['show'], C), 0);
    assert.match(said[0], /^vega\s+resuming .*run by cccc5555/);
    clock += 60_000;
    assert.equal(run(['beat', '--step', 'gating'], C), 0);
    assert.match(said[0], /^ledger: vega \(aaaa1111\) live · 60.10 · gating/);
    const ls = readAll(path.join(root, DIR));
    assert.equal(ls.length, 1, 'no fresh ledger for the runner');
    assert.equal(ls[0].runner, 'cccc5555');
    assert.equal(run(['done', 'vega'], C), 0);
    run(['beat'], C);
    assert.equal(readAll(path.join(root, DIR)).length, 1);
    // A NEXUS_SESSION names the runner whole, as claims.mjs does.
    run(['end'], C);
    clock += 60 * 60_000;
    run(['beat'], B);
    clock += 60 * 60_000;
    assert.equal(run(['take', 'bbbb3333'], { NEXUS_SESSION: 'gui-7' }), 0);
    assert.equal(readAll(path.join(root, DIR)).find((l) => l.id === B.CLAUDE_CODE_SESSION_ID).runner, 'gui-7');
    // An ended ledger is no longer run: the runner's next beat starts its own.
    run(['beat'], C);
    assert.equal(readAll(path.join(root, DIR)).length, 3);
  });

  it('refuses to take a live session, and takes a fallen one', () => {
    run(['beat', '--chunk', '09.1'], A);
    clock = T0 + 5 * 60_000;
    assert.equal(run(['take', 'aaaa1111'], B), 1);
    assert.match(said[0], /is live/);
    clock = T0 + 30 * 60_000;
    run(['list', '--json']);
    assert.equal(JSON.parse(said[0])[0].status, 'fallen');
    assert.equal(run(['take', 'aaaa1111'], B), 0);
  });

  it('refuses to take a session that ended its loop', () => {
    run(['end'], A);
    clock = T0 + 30 * 60_000;
    assert.equal(run(['take', 'aaaa1111'], B), 1);
    assert.match(said[0], /ended its loop/);
  });

  it('stores a file verbatim with --set-file (the loop prompt), refusing a missing one', () => {
    const prompt = `/next Build these: 07.1 07.2 (skip one whose needs aren't done).\nSay "done" at the end.`;
    const file = path.join(root, 'loop.txt');
    fs.writeFileSync(file, `${prompt}\r\n`);
    assert.equal(run(['beat', '--set-file', `loop=${file}`, '--set', 'kind=heads-down', '--add', 'done=07.1'], A), 0);
    const l = readAll(path.join(root, DIR))[0];
    assert.equal(l.loop, prompt);
    assert.deepEqual(l.done, ['07.1']);
    assert.throws(() => run(['beat', '--set-file', `loop=${file}.gone`], A), /no file/);
    assert.throws(() => run(['beat', '--set-file', 'nokey'], A), /not key=<path>/);
    assert.deepEqual(apply(l, { text: ['loop=[1,2]'] }).loop, '[1,2]');
  });

  it('keeps no ledger without a session id, and says so', () => {
    assert.throws(() => run(['beat'], {}), /no session id/);
    assert.equal(run(['list'], {}), 0);
    assert.deepEqual(said, ['ledger: no sessions']);
  });
});

// N child processes start together (each waits on a go file once all are ready) and run the CLI against one root.
async function race(jobs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-race-'));
  const go = path.join(dir, 'go');
  const mod = new URL('../ledger.mjs', import.meta.url).href;
  const code = `import fs from 'node:fs'; import { main } from ${JSON.stringify(mod)};
const job = JSON.parse(process.env.RACE_JOB);
fs.writeFileSync(job.ready, '');
while (!fs.existsSync(job.go)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2);
const said = [];
try {
  process.exitCode = main(job.argv, { root: job.root, env: job.env, out: (s) => said.push(s), err: (s) => said.push(s) });
} finally {
  fs.writeFileSync(job.ready + '.out', JSON.stringify(said));
}`;
  const kids = jobs.map((job, i) => {
    const ready = path.join(dir, `ready-${i}`);
    const kid = spawn(process.execPath, ['--input-type=module', '-e', code], {
      env: { ...process.env, RACE_JOB: JSON.stringify({ ...job, ready, go }) }, stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    kid.stderr.on('data', (d) => (stderr += d));
    return { ready, done: new Promise((resolve) => kid.on('close', (exit) => resolve({ exit, stderr }))) };
  });
  const until = Date.now() + 30_000;
  while (!kids.every((k) => fs.existsSync(k.ready)) && Date.now() < until) await new Promise((r) => setTimeout(r, 10));
  fs.writeFileSync(go, '');
  const results = await Promise.all(kids.map(async (k) => ({ ...(await k.done), out: JSON.parse(fs.readFileSync(`${k.ready}.out`, 'utf8')).join('\n') })));
  fs.rmSync(dir, { recursive: true, force: true });
  return results;
}

describe('concurrent writers', () => {
  let root;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-ledger-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  const N = 6;

  it('gives sessions that beat at once a star each, never one twice', async () => {
    const results = await race(Array.from({ length: N }, (_, i) => ({ root, argv: ['beat'], env: { NEXUS_SESSION: `race${i}-session` } })));
    for (const r of results) assert.equal(r.exit, 0, r.stderr);
    const stars = readAll(path.join(root, DIR)).map((l) => l.star);
    assert.equal(stars.length, N);
    assert.deepEqual([...stars].sort(), [...STARS.slice(0, N)].sort());
    assert.equal(fs.existsSync(path.join(root, DIR, LOCK)), false);
  });

  it('lets exactly one of the sessions that take a fallen ledger at once win', async () => {
    const dir = path.join(root, DIR);
    fs.mkdirSync(dir, { recursive: true });
    const fallen = { ...fresh('fallen0-session', 'vega', new Date(T0)), state: 'live' };
    fs.writeFileSync(path.join(dir, 'fallen0-session.json'), JSON.stringify(fallen));
    const results = await race(Array.from({ length: N }, (_, i) => ({ root, argv: ['take', 'vega'], env: { NEXUS_SESSION: `taker${i}-session` } })));
    const won = results.filter((r) => r.exit === 0);
    assert.equal(won.length, 1, results.map((r) => r.out || r.stderr).join('\n'));
    const l = readAll(dir).find((x) => x.id === 'fallen0-session');
    assert.equal(l.state, 'resuming');
    assert.equal(JSON.parse(won[0].out).resumed_by, l.resumed_by);
  });
});

describe('the lock and the rename', () => {
  let root;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-lock-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('retries a rename the OS reports busy, and gives up on anything else', () => {
    const from = path.join(root, 'a.tmp');
    const to = path.join(root, 'a.json');
    fs.writeFileSync(from, '{}');
    let calls = 0;
    const flaky = (a, b) => {
      if (++calls < 3) throw Object.assign(new Error('busy'), { code: calls === 1 ? 'EPERM' : 'EBUSY' });
      fs.renameSync(a, b);
    };
    renameRetry(from, to, { rename: flaky });
    assert.equal(calls, 3);
    assert.equal(fs.readFileSync(to, 'utf8'), '{}');
    calls = 0;
    const gone = () => {
      calls++;
      throw Object.assign(new Error('gone'), { code: 'ENOENT' });
    };
    assert.throws(() => renameRetry(from, to, { rename: gone }), /gone/);
    assert.equal(calls, 1);
    calls = 0;
    const stuck = () => {
      calls++;
      throw Object.assign(new Error('stuck'), { code: 'EPERM' });
    };
    assert.throws(() => renameRetry(from, to, { rename: stuck, tries: 3 }), /stuck/);
    assert.equal(calls, 3);
  });

  it('breaks a lock whose holder is gone or that outlived its window, and waits out a live one', () => {
    const lock = path.join(root, 'x.lock');
    const dead = spawnSync(process.execPath, ['-e', '0']).pid;
    fs.writeFileSync(lock, `${dead} 2026-10-20T12:00:00Z\n`);
    assert.equal(withLock(lock, () => 'ran'), 'ran');
    assert.equal(fs.existsSync(lock), false);
    fs.writeFileSync(lock, `${process.ppid} 2026-10-20T12:00:00Z\n`);
    assert.equal(breakStale(lock, 10_000), false);
    assert.throws(() => withLock(lock, () => 'ran', { waitMs: 100 }), /stayed locked/);
    assert.equal(breakStale(lock, 10_000, Date.now() + 60_000), true);
    assert.equal(withLock(lock, () => 'ran'), 'ran');
    assert.throws(() => withLock(lock, () => {
      throw new Error('inside');
    }), /inside/);
    assert.equal(fs.existsSync(lock), false);
  });
});
