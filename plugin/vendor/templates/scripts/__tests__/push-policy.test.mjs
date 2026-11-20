// push-policy.mjs: the pre-push leg trip. A push to main on origin or upstream is the owner's alone (a fork's main is
// its contributor's); the claims ref is never checked by later steps; everything else passes through untouched. Pure
// (owner is injected), node:test, no deps.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decide, GUARDED_REMOTES, guards, main, mainOf, sortRefs } from '../git/push-policy.mjs';

const Z = '0'.repeat(40);
const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const line = (remoteRef, local = 'refs/heads/x', sha = A, remoteSha = B) => `${local} ${sha} ${remoteRef} ${remoteSha}`;
const sink = () => {
  let text = '';
  return { write: (s) => { text += s; }, get text() { return text; } };
};

describe('sortRefs', () => {
  it('drops the claims ref and flags main', () => {
    const stdin = [line('refs/heads/claims'), line('refs/heads/main'), line('refs/heads/next/16.3')].join('\n');
    const { keep, toMain } = sortRefs(stdin);
    assert.equal(toMain, true);
    assert.deepEqual(keep, [line('refs/heads/main'), line('refs/heads/next/16.3')]);
  });
  it('a branch merely named like main is not main', () => {
    assert.equal(sortRefs(line('refs/heads/main-old')).toMain, false);
    assert.equal(sortRefs(line('refs/heads/next/main')).toMain, false);
  });
  it('deleting main counts as updating it', () => {
    assert.equal(sortRefs(line('refs/heads/main', '(delete)', Z)).toMain, true);
  });
  it('blank lines and CRLF are harmless', () => {
    assert.deepEqual(sortRefs(`\r\n${line('refs/tags/v1')}\r\n\r\n`).keep, [line('refs/tags/v1')]);
  });
  it('honors another main branch name', () => {
    assert.equal(sortRefs(line('refs/heads/trunk'), { main: 'trunk' }).toMain, true);
    assert.equal(sortRefs(line('refs/heads/main'), { main: 'trunk' }).toMain, false);
  });
});

describe('decide', () => {
  it('refuses a contributor pushing main', () => {
    const v = decide(line('refs/heads/main'), { owner: false });
    assert.equal(v.ok, false);
    assert.match(v.reason, /only the owner's checkout pushes main/);
    assert.match(v.reason, /pull request/);
  });
  it('lets the owner push main', () => {
    assert.equal(decide(line('refs/heads/main'), { owner: true }).ok, true);
    assert.equal(decide(line('refs/heads/main'), { owner: true, remote: 'origin' }).ok, true);
    assert.equal(decide(line('refs/heads/main'), { owner: true, remote: 'upstream' }).ok, true);
  });
  it('refuses a contributor pushing main to origin or upstream', () => {
    for (const remote of ['origin', 'upstream']) {
      const v = decide(line('refs/heads/main'), { owner: false, remote });
      assert.equal(v.ok, false, remote);
      assert.match(v.reason, new RegExp(`pushes main to ${remote}`));
    }
  });
  it("lets a contributor push main to their own fork's remote", () => {
    for (const remote of ['fork', 'mine', 'origin2']) {
      const v = decide(line('refs/heads/main'), { owner: false, remote });
      assert.equal(v.ok, true, remote);
      assert.deepEqual(v.keep, [line('refs/heads/main')]);
    }
  });
  it('a push with no remote name is guarded (an older hook that passes no arguments still refuses)', () => {
    assert.equal(decide(line('refs/heads/main'), { owner: false }).ok, false);
    assert.equal(decide(line('refs/heads/main'), { owner: false, remote: '' }).ok, false);
  });
  it('lets a contributor push a branch and the claims ref', () => {
    const v = decide([line('refs/heads/next/16.3'), line('refs/heads/claims')].join('\n'), { owner: false });
    assert.equal(v.ok, true);
    assert.deepEqual(v.keep, [line('refs/heads/next/16.3')]);
  });
  it('a claims-only push leaves nothing for later steps', () => {
    assert.deepEqual(decide(line('refs/heads/claims'), { owner: false }).keep, []);
  });
});

describe('guards', () => {
  it('origin and upstream, by remote name, nothing else', () => {
    assert.deepEqual(GUARDED_REMOTES, ['origin', 'upstream']);
    assert.equal(guards('origin'), true);
    assert.equal(guards('upstream'), true);
    assert.equal(guards('fork'), false);
    assert.equal(guards('origin2'), false);
    assert.equal(guards('git@example.com:o/r.git'), false); // a bare URL push: no remote name to go by
    assert.equal(guards(undefined), true);
  });
});

describe('main', () => {
  it('reads the remote name from argv, as git hands it to pre-push', () => {
    const run = (argv) => main({ stdin: line('refs/heads/main'), argv, env: {}, owner: false, out: sink(), err: sink() });
    assert.equal(run(['origin', 'git@example.com:o/r.git']), 1);
    assert.equal(run(['upstream', 'git@example.com:o/r.git']), 1);
    assert.equal(run(['fork', 'git@example.com:me/r.git']), 0);
    assert.equal(run([]), 1);
  });
  it('exit 1 with the reason on stderr, nothing on stdout', () => {
    const out = sink();
    const err = sink();
    assert.equal(main({ stdin: line('refs/heads/main'), env: {}, owner: false, out, err }), 1);
    assert.equal(out.text, '');
    assert.match(err.text, /push-policy:/);
  });
  it('exit 0 passes the kept lines on', () => {
    const out = sink();
    assert.equal(main({ stdin: line('refs/heads/next/1.1'), env: {}, owner: false, out, err: sink() }), 0);
    assert.equal(out.text, `${line('refs/heads/next/1.1')}\n`);
  });
  it('NEXUS_MAIN_BRANCH names the protected branch', () => {
    assert.equal(mainOf({ NEXUS_MAIN_BRANCH: 'trunk' }), 'trunk');
    assert.equal(mainOf({}), 'main');
    assert.equal(main({ stdin: line('refs/heads/trunk'), env: { NEXUS_MAIN_BRANCH: 'trunk' }, owner: false, out: sink(), err: sink() }), 1);
  });
});
