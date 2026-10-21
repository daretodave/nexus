// ledger.mjs (the live session ledger): star names go to the first free one, a live session past its stale window
// reads fallen, --set/--add/--clear shape the JSON, park and take and done move the state, and a second take is
// refused. node:test, no deps, no git (the CLI runs against a scratch folder in the temp dir).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DIR, STARS, apply, find, fresh, main, nextStar, readAll, status } from '../ledger.mjs';

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
