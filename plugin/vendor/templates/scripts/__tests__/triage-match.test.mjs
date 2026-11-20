// triage-match.mjs (which open spec an issue belongs to): terms drop stop words and plurals; a spec's title, open
// chunk lines and Design weigh in; an issue matches at the threshold with two terms, or when it names the spec; two
// close matches are ambiguous; an open pull request's pending files cover an issue that they name or that they add
// to the matched spec for; everything else is `none`. node:test, no deps, no gh: the PR lister is injected.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { coveringPr, pendingDiffText, scoreIssue, specTerms, terms, triageMatch } from '../plan/triage-match.mjs';

const SEARCH = specTerms('07-search.md', [
  '# 07 — Search by place',
  '',
  '> Find an office by city or zip.',
  '',
  '## Design',
  '',
  '- The resolver takes a query and returns offices, ranked by distance.',
  '- An empty query shows the empty state.',
  '',
  '## Acceptance',
  '',
  '- **A1** A city finds its offices.',
  '',
  '## Chunks',
  'Measure: 2 open · 0 closed · next A2',
  '',
  '- [ ] **07.1** Resolver ranks offices by distance · S · closes A1 · needs —',
  '- [ ] **07.2** Empty query state · S · closes A1 · needs 07.1',
].join('\n'));

const BILLING = specTerms('09-billing.md', [
  '# 09 — Billing and invoices',
  '',
  '## Design',
  '',
  '- Plans renew monthly; an invoice is emailed on renewal.',
  '',
  '## Chunks',
  'Measure: 1 open · 0 closed · next A2',
  '',
  '- [ ] **09.1** Invoice email on renewal · M · closes A1 · needs —',
].join('\n'));

const SPECS = [SEARCH, BILLING];
const noPrs = () => [];
const issue = (number, title, body = '') => ({ number, title, body, url: `https://github.com/o/r/issues/${number}` });

describe('terms', () => {
  it('drops short words, stop words and numbers, and a plural s', () => {
    assert.deepEqual([...terms('The offices in 2026 are not ranked; plan this spec')], ['office', 'ranked']);
  });
});

describe('specTerms', () => {
  it('weighs the title over chunk lines over the Design, and reads open chunk ids', () => {
    assert.equal(SEARCH.weights.get('search'), 3);
    assert.equal(SEARCH.weights.get('resolver'), 2);
    assert.equal(SEARCH.weights.get('distance'), 2);
    assert.equal(SEARCH.weights.get('return'), 1);
    assert.deepEqual(SEARCH.chunkIds, ['07.1', '07.2']);
    assert.equal(SEARCH.file, 'plan/07-search.md');
  });
});

describe('matching an issue to a spec', () => {
  it('finds the spec whose area the issue names', () => {
    const r = triageMatch(issue(12, 'Search ranks offices wrong', 'The resolver ignores distance for a zip.'), SPECS, { listPrs: noPrs });
    assert.equal(r.verdict, 'spec');
    assert.equal(r.spec.file, 'plan/07-search.md');
    assert.ok(r.spec.hits.includes('resolver'));
  });

  it('routes an issue no spec covers as before', () => {
    const r = triageMatch(issue(13, 'Dark mode colours are off', 'The header contrast fails.'), SPECS, { listPrs: noPrs });
    assert.equal(r.verdict, 'none');
    assert.equal(r.spec, null);
  });

  it('needs two terms: one shared word is not enough', () => {
    const [m] = scoreIssue('Support a distance unit toggle in settings', SPECS);
    const r = triageMatch(issue(14, 'Support a distance unit toggle in settings'), SPECS, { listPrs: noPrs, threshold: 1 });
    assert.equal(m.hits.length, 1);
    assert.equal(r.verdict, 'none');
  });

  it('matches a spec the issue names by chunk id or file, whatever the words', () => {
    const byChunk = triageMatch(issue(15, 'Follow-up to 09.1', 'Weird.'), SPECS, { listPrs: noPrs });
    assert.equal(byChunk.verdict, 'spec');
    assert.equal(byChunk.spec.file, 'plan/09-billing.md');
    assert.ok(byChunk.spec.named);
    const byFile = triageMatch(issue(16, 'See plan/07-search.md'), SPECS, { listPrs: noPrs });
    assert.equal(byFile.spec.file, 'plan/07-search.md');
  });

  it('calls two close matches ambiguous and lists both', () => {
    const r = triageMatch(issue(17, 'Invoice email lists offices by distance', 'Search resolver and renewal invoice both.'), SPECS, { listPrs: noPrs });
    assert.equal(r.verdict, 'ambiguous');
    assert.deepEqual(r.matches.map((m) => m.file).sort(), ['plan/07-search.md', 'plan/09-billing.md']);
  });
});

const DIFF = [
  'diff --git a/plan/pending/plot-zip.md b/plan/pending/plot-zip.md',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/plan/pending/plot-zip.md',
  '@@ -0,0 +1,8 @@',
  '+---',
  '+date: 2026-10-21',
  '+---',
  '+## Add plan/07-search.md',
  '+~~~ chunks',
  '+- [ ] **07.?zip** Resolver ranks offices for a bare zip by distance · S · closes A1 · needs —',
  '+~~~',
  'diff --git a/src/app.js b/src/app.js',
  '+const fixed = "#12";',
].join('\n');

describe('open pull requests', () => {
  it('reads only the lines a diff adds under plan/pending/', () => {
    const text = pendingDiffText(DIFF);
    assert.match(text, /^## Add plan\/07-search\.md$/m);
    assert.doesNotMatch(text, /fixed/);
    assert.doesNotMatch(text, /^\+\+\+/m);
  });

  it('says Already in PR #N when a PR adds to the matched spec with the same words', () => {
    const prs = [{ number: 5, text: pendingDiffText(DIFF) }];
    const r = triageMatch(issue(12, 'Search ranks offices wrong', 'The resolver ignores distance for a zip.'), SPECS, { listPrs: () => prs });
    assert.equal(r.verdict, 'covered');
    assert.equal(r.pr.number, 5);
  });

  it('says Already in PR #N when a PR names the issue, matched or not', () => {
    const prs = [{ number: 8, text: '## Notes\n- dark mode contrast, from #13' }];
    const r = triageMatch(issue(13, 'Dark mode colours are off'), SPECS, { listPrs: () => prs });
    assert.equal(r.verdict, 'covered');
    assert.equal(r.pr.number, 8);
    assert.equal(coveringPr(issue(130, 'x'), null, prs), null, '#13 is not #130');
  });

  it('a PR on the same spec about something else covers nothing', () => {
    const prs = [{ number: 5, text: pendingDiffText(DIFF) }];
    const r = triageMatch(issue(18, 'Empty query state flickers', 'The empty query state shows twice.'), SPECS, { listPrs: () => prs });
    assert.equal(r.verdict, 'spec');
    assert.equal(r.pr, null);
  });
});
