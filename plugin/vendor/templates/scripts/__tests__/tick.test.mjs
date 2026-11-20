// cloud/tick.mjs (a PR-mode cloud tick's credentialed steps): the fence keeps a loop PR to pending files, new specs
// and code; candidates follow the simulated pick order; the PR's title and body say what it is. node:test, no git.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { candidates, claimsEnv, fenceProblems, loopPrCount, prBody, prTitle } from '../cloud/tick.mjs';

const ch = (rows) => rows.map(([status, path]) => ({ status, path }));

describe('the fence', () => {
  it('lets code, pending files and a new spec file through', () => {
    assert.deepEqual(fenceProblems(ch([['M', 'src/app.ts'], ['A', 'plan/pending/07.3.md'], ['A', 'plan/pending/plot-x.md'], ['A', 'plan/12-billing.md'], ['M', 'README.md']])), []);
  });

  it('refuses an edited or deleted shared plan or identity file', () => {
    const p = fenceProblems(ch([['M', 'plan/README.md'], ['D', 'plan/07-search.md'], ['M', 'plan/ARCHIVE.md'], ['M', 'identity/footguns.md'], ['A', 'identity/decisions/2026.md']]));
    assert.equal(p.length, 5);
    assert.match(p[1], /deleted/);
    assert.match(p[0], /plan\/pending/);
  });

  it('refuses workflow files, per-checkout state and raw dumps, even added', () => {
    const p = fenceProblems(ch([['M', '.github/workflows/march.yml'], ['A', '.github/actions/setup/action.yml'], ['A', '.owner'], ['A', '.nexus/local.json'], ['A', 'plan/messy/dump.md']]));
    assert.equal(p.length, 5);
  });

  it('takes --allow paths as exact files (the night shift writes its digest)', () => {
    assert.deepEqual(fenceProblems(ch([['M', 'plan/DIGEST.md'], ['M', 'plan/AUDIT.md']]), { allow: ['plan/DIGEST.md', 'plan/AUDIT.md'] }), []);
    assert.equal(fenceProblems(ch([['M', 'plan/DIGEST.md'], ['M', 'plan/README.md']]), { allow: ['plan/DIGEST.md'] }).length, 1);
  });

  it('takes --only as the whole list: code and pending files outside it are refused too', () => {
    const only = ['plan/DIGEST.md', 'plan/AUDIT.md'];
    assert.deepEqual(fenceProblems(ch([['M', 'plan/DIGEST.md']]), { only }), []);
    const p = fenceProblems(ch([['M', 'plan/DIGEST.md'], ['M', 'src/app.ts'], ['A', 'plan/pending/07.3.md'], ['M', '.github/workflows/march.yml']]), { only });
    assert.equal(p.length, 3);
    assert.match(p[0], /src\/app\.ts: outside/);
  });

  it('treats a file added in a plan subfolder other than pending as shared', () => {
    assert.equal(fenceProblems(ch([['A', 'plan/specs/x.md']])).length, 1);
  });
});

describe('picking', () => {
  it('takes chunk ids from the simulated next list, in order, capped', () => {
    const sim = { next: [{ id: '09.1' }, { id: '07.1' }, { id: '07.2' }, { id: '07.4' }] };
    assert.deepEqual(candidates(sim), ['09.1', '07.1', '07.2']);
    assert.deepEqual(candidates({ next: [] }), []);
  });

  it('skips a chunk whose needs are only picked earlier or in flight, not closed', () => {
    const sim = { next: [{ id: '32.1' }, { id: '32.2', needs: ['32.1'] }, { id: '33.2', needs: ['33.1'] }, { id: '34.1', needs: ['20.1'] }], inFlight: [{ id: '33.1' }], blocked: [] };
    assert.deepEqual(candidates(sim), ['32.1', '34.1']);
  });

  it('counts only loop branches among open PRs', () => {
    assert.equal(loopPrCount([{ headRefName: 'nexus/123' }, { headRefName: 'next/07.3' }, { headRefName: 'nexus/night-9' }, {}]), 2);
  });

  it('runs claims as the contributor nexus-cloud, keeping the session', () => {
    const env = claimsEnv({ NEXUS_SESSION: 'cloud-42', PATH: 'x' });
    assert.equal(env.NEXUS_CONTRIBUTOR, '1');
    assert.equal(env.NEXUS_GH_LOGIN, 'nexus-cloud');
    assert.equal(env.NEXUS_SESSION, 'cloud-42');
  });
});

describe('the pull request', () => {
  it('titles it by the newest work subject, tagged with the chunk', () => {
    assert.equal(prTitle(['plan: close 07.3', 'feat: empty search state', 'test: empty state'], '07.3'), 'feat: empty search state (07.3)');
    assert.equal(prTitle(['plan: close 07.3'], '07.3'), 'plan: close 07.3 (07.3)');
    assert.equal(prTitle(['digest: 2026-10-20'], ''), 'digest: 2026-10-20');
  });

  it('says how it was built and how it closes', () => {
    const body = prBody({ chunk: '07.3', subjects: ['feat: x'], runUrl: 'https://example.test/run/1', session: 'cloud-1' });
    assert.match(body, /no token in the agent's step/);
    assert.match(body, /plan\/pending\/07\.3\.md/);
    assert.match(body, /- feat: x/);
  });
});
