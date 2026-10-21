// The git panel's link for a worktree no session holds (41.8, A8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wtHref, tidyVerdict } from '../src/screens/fleet/worktree-link.js';

// ---- the session-less worktree's link ---------------------------------------

test('a worktree row links to its session, its recover run, or the /tidy dry run', () => {
  assert.equal(wtHref({ sessionId: 'abc', flag: 'active', branch: 'nexus/vega-2' }), '/s/abc');
  assert.equal(wtHref({ sessionId: 'abc', flag: 'fallen', run: 'r/1', branch: 'b' }), '/recover?dir=r%2F1');
  assert.equal(wtHref({ sessionId: 'abc', flag: 'fallen', branch: 'b' }), '/recover');
  assert.equal(wtHref({ sessionId: null, flag: 'orphaned', exists: false, prunable: true, branch: 'nexus/rigel-3' }), '/git?tidy=nexus%2Frigel-3');
  assert.equal(wtHref({ sessionId: null, flag: 'idle', branch: 'nexus/vega-1' }), '/git?tidy=nexus%2Fvega-1');
  assert.equal(wtHref({ sessionId: null, flag: 'orphaned', branch: '(detached)' }), '/git?tidy=1');
});

test('the dry run says what happens to the worktree the link named', () => {
  const plan = {
    worktrees: [{ branch: 'nexus/rigel-3', why: 'its folder is gone; git still lists it.' }],
    holds: [{ branch: 'nexus/vega-1', ahead: 2, dirty: 0 }],
  };
  assert.deepEqual(tidyVerdict(plan, 'nexus/rigel-3'), { go: true, text: 'nexus/rigel-3 would go: its folder is gone; git still lists it.' });
  assert.deepEqual(tidyVerdict(plan, 'nexus/vega-1'), { go: false, text: 'nexus/vega-1 stays: it holds work, so /tidy asks before closing it.' });
  assert.deepEqual(tidyVerdict(plan, 'nexus/x'), { go: false, text: 'nexus/x stays: a session, an open pull request, a live lock or uncommitted work keeps it.' });
  assert.equal(tidyVerdict(plan, '1'), null);
  assert.equal(tidyVerdict(null, 'nexus/x'), null);
});
