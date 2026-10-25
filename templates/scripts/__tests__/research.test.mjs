// research.mjs (spec 59, A3): the field-research generator. The Research knob (the dial, or its own line) and the
// `Research topics:` line decide whether a run is due; the brief writes nothing; a findings file over the 8-fetch
// budget files nothing; at most 3 findings act a run; a finding with a URL, a domain, a handle or a proper name is
// dropped; one naming a Pending candidate re-evidences it at +0; the rest file at promote_floor with source `field`
// and no URL; the sources go to the job summary only; a second run files nothing. node:test, no deps, no network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { addFieldEvidence, clean, due, lastRun, main, MAX_FETCHES, namesProblem, stampRun, topics } from '../generators/research.mjs';
import { fieldUrlProblems } from '../plan-check.mjs';
import { parseCandidates, reevidence } from '../plan/promote.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TODAY = '2026-10-25';

const bearings = (lines) => ['# Bearings', '', '## Plan expansion posture', '', ...lines, ''].join('\n');
const CANDIDATES = [
  '# Candidates', '', '> Last pass: 2026-10-01', '> Pass count: 3', '> Posture: bold', '',
  '## Pending', '',
  '### [ ] [score 7.0] Resume a loop on another machine',
  '- proposed: 2026-10-01',
  '- source signals: AUDIT rows on lost ticks.',
  '',
  '## Promoted', '', '## Rejected', '',
].join('\n');

function repo({ bearingsLines = ['- Research: weekly', '- Research topics: agent loops; review in CI'], candidates = CANDIDATES } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'research-'));
  fs.mkdirSync(path.join(root, 'plan'));
  fs.writeFileSync(path.join(root, 'plan', 'bearings.md'), bearings(bearingsLines));
  if (candidates != null) fs.writeFileSync(path.join(root, 'plan', 'CANDIDATES.md'), candidates);
  return root;
}

const run = (root, argv, env = {}) => {
  const lines = [];
  const code = main(argv, { root, log: (l) => lines.push(l), env });
  return { code, out: lines.join('\n'), last: lines[lines.length - 1] };
};

const findings = (root, data) => {
  const file = path.join(root, 'findings.json');
  fs.writeFileSync(file, JSON.stringify(data));
  return file;
};

const read = (root) => fs.readFileSync(path.join(root, 'plan', 'CANDIDATES.md'), 'utf8');

describe('the knob and the topics', () => {
  it('reads the topics line split by ;, and none from (none), a comment or no line', () => {
    assert.deepEqual(topics('- Research topics: agent loops; `review in CI` ;  '), ['agent loops', 'review in CI']);
    assert.deepEqual(topics('- Research topics: (none)'), []);
    assert.deepEqual(topics('<!--\n- Research topics: a; b\n-->'), []);
    assert.deepEqual(topics('# Bearings'), []);
  });

  it('is due by the knob\'s cadence from the last run, never under off or with no topics', () => {
    assert.deepEqual(due('off', null, TODAY, ['a']), { due: false, why: 'Research: off' });
    assert.equal(due('weekly', null, TODAY, []).due, false);
    assert.equal(due('weekly', null, TODAY, ['a']).due, true);
    assert.equal(due('weekly', '2026-10-19', TODAY, ['a']).due, false);
    assert.equal(due('weekly', '2026-10-18', TODAY, ['a']).due, true);
    assert.equal(due('monthly', '2026-10-01', TODAY, ['a']).due, false);
    assert.equal(due('monthly', '2026-09-25', TODAY, ['a']).due, true);
  });

  it('takes the knob from the dial (steady: monthly, gentle: off) unless a Research: line overrides it', () => {
    const steady = repo({ bearingsLines: ['- Improve: steady', '- Research topics: agent loops'] });
    const gentle = repo({ bearingsLines: ['- Research topics: agent loops'] });
    const over = repo({ bearingsLines: ['- Improve: off', '- Research: weekly', '- Research topics: agent loops'] });
    try {
      assert.match(run(steady, ['--today', TODAY]).out, /^due · Research: monthly, never run$/m);
      assert.match(run(gentle, ['--today', TODAY]).out, /^not due · Research: off$/m);
      assert.match(run(over, ['--today', TODAY]).out, /^due · Research: weekly, never run$/m);
    } finally { for (const r of [steady, gentle, over]) fs.rmSync(r, { recursive: true, force: true }); }
  });

  it('records the run in one header line, replaced on the next, within the header', () => {
    const once = stampRun(CANDIDATES, '2026-10-18');
    assert.equal(lastRun(once), '2026-10-18');
    assert.match(once, /> Posture: bold\n> Last field research: 2026-10-18\n/);
    const twice = stampRun(once, TODAY);
    assert.equal(lastRun(twice), TODAY);
    assert.equal(twice.match(/Last field research/g).length, 1);
  });
});

describe('no names, no URLs', () => {
  it('passes a pattern and refuses a URL, a domain, a handle or a proper name', () => {
    assert.equal(namesProblem('a hosted agent platform resumes runs across machines'), null);
    assert.equal(namesProblem('Agent CLIs add review in CI; the SDKs follow. Hooks gate tools.'), null);
    assert.match(namesProblem('see https://example.test/x'), /URL/);
    assert.match(namesProblem('as example.io shows'), /domain/);
    assert.match(namesProblem('a post by @someone'), /handle/);
    assert.match(namesProblem('the loop in Acme Studio resumes'), /names something \(Acme\)/);
    assert.match(namesProblem('a tool like FooBar does it'), /names something \(FooBar\)/);
  });

  it('folds each field to one capped line, so page text never reaches a row as structure', () => {
    const c = clean({ title: '## a title\n- injected: line', pattern: 'p '.repeat(300) });
    assert.equal(c.finding.title, 'a title - injected: line');
    assert.ok(c.finding.pattern.length <= 200);
    assert.ok(!/\n/.test(Object.values(c.finding).join('')));
    assert.deepEqual(clean({ title: 'x' }), { why: 'no pattern' });
  });
});

describe('the run', () => {
  it('the brief writes nothing and lists topics, the budget and the Pending titles; last line clean', () => {
    const root = repo();
    try {
      const before = read(root);
      const r = run(root, ['--today', TODAY]);
      assert.equal(r.code, 0);
      assert.equal(r.last, 'clean');
      assert.match(r.out, /^topic agent loops$/m);
      assert.match(r.out, new RegExp(`^budget ${MAX_FETCHES} fetches · 3 findings`, 'm'));
      assert.match(r.out, /^known Resume a loop on another machine$/m);
      assert.equal(read(root), before);
      const json = JSON.parse(run(root, ['--today', TODAY, '--json']).out);
      assert.equal(json.due, true);
      assert.deepEqual(json.topics, ['agent loops', 'review in CI']);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it('refuses a findings file over the fetch budget and files nothing', () => {
    const root = repo();
    try {
      const before = read(root);
      const file = findings(root, { fetched: 9, sources: [], findings: [{ title: 'x', pattern: 'y' }] });
      const errs = [];
      const orig = console.error;
      console.error = (m) => errs.push(m);
      try { assert.equal(run(root, ['--findings', file, '--write', '--today', TODAY]).code, 1); } finally { console.error = orig; }
      assert.match(errs.join('\n'), /over the 8-fetch budget/);
      assert.equal(read(root), before);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it('files at most 3, drops named or linked findings, re-evidences a known one at +0, and sends sources to the job summary only', () => {
    const root = repo({ bearingsLines: ['- Research: weekly', '- Research topics: agent loops', '- promote_floor: 5.5'] });
    const summary = path.join(root, 'summary.md');
    try {
      const file = findings(root, {
        fetched: 6,
        sources: ['https://example.test/a', 'https://example.test/b'],
        findings: [
          { title: 'Linked', pattern: 'from https://example.test/a' },
          { title: 'Named', pattern: 'the Acme agent does it' },
          { title: 'Same thing again', pattern: 'agent runs resume on another machine from a stored session', matches: 'resume a loop' },
          { title: 'Review agents comment on pull requests', pattern: 'agents review each pull request in CI and comment inline', rationale: 'review in CI is becoming a default.' },
          { title: 'Specs before code', pattern: 'kits write a spec and a task list before any code' },
          { title: 'One too many', pattern: 'a fourth pattern' },
        ],
      });
      const dry = run(root, ['--findings', file, '--today', TODAY], { GITHUB_STEP_SUMMARY: summary });
      assert.equal(dry.last, 'filed 2 (dry run)');
      assert.equal(read(root), CANDIDATES, 'a dry run writes nothing');

      const r = run(root, ['--findings', file, '--write', '--today', TODAY], { GITHUB_STEP_SUMMARY: summary });
      assert.equal(r.code, 0);
      assert.equal(r.last, 'filed 2');
      assert.match(r.out, /^drop Linked: pattern carries a URL$/m);
      assert.match(r.out, /^drop Named: pattern names something \(Acme\)$/m);
      assert.match(r.out, /^re-evidence Resume a loop on another machine · field, \+0$/m);
      assert.match(r.out, /^drop One too many: over the 3-a-run cap$/m);
      assert.match(r.out, /^sources 2 · in the job summary$/m);

      const text = read(root);
      assert.match(text, /^### \[ \] \[score 5\.5\] Review agents comment on pull requests$/m);
      assert.match(text, /^- source signals: field \(2026-10-25\): agents review each pull request in CI and comment inline$/m);
      assert.match(text, /^- generator: research · filed 2026-10-25$/m);
      assert.match(text, /^### \[ \] \[score 7\.0\] Resume a loop on another machine$/m, 'a field signal never raises a score');
      assert.match(text, /^ {2}- 2026-10-25 · field · \+0 · agent runs resume on another machine from a stored session$/m);
      assert.equal(lastRun(text), TODAY);
      assert.doesNotMatch(text, /example\.test/, 'no source reaches the plan');
      assert.deepEqual(fieldUrlProblems(text), []);
      assert.match(fs.readFileSync(summary, 'utf8'), /- https:\/\/example\.test\/a/);

      const parsed = parseCandidates(text).pending;
      assert.equal(parsed.find((c) => c.title.startsWith('Resume')).reEvidence, 0, 'a field re-evidence is not an independent signal');
      const bumped = reevidence(text, 'Specs before code', 'A', null, { date: TODAY });
      assert.equal(bumped.to, 6, 'an internal signal lifts a field candidate above the floor');

      const again = run(root, ['--findings', file, '--write', '--today', TODAY], { GITHUB_STEP_SUMMARY: summary });
      assert.equal(again.last, 'clean', 'a second run files nothing new');
      assert.equal(read(root).match(/· field · \+0/g).length, 1, 'nor re-evidences the same pattern twice');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it('prints the sources locally (no job summary) and never files under Research: off', () => {
    const root = repo();
    const off = repo({ bearingsLines: ['- Research: off', '- Research topics: agent loops'] });
    try {
      const file = findings(root, { sources: ['https://example.test/a'], findings: [{ title: 'Specs before code', pattern: 'kits write a spec before code' }] });
      assert.match(run(root, ['--findings', file, '--today', TODAY]).out, /^source https:\/\/example\.test\/a$/m);
      const r = run(off, ['--findings', file, '--write', '--today', TODAY]);
      assert.equal(r.last, 'clean');
      assert.equal(read(off), CANDIDATES);
    } finally { for (const d of [root, off]) fs.rmSync(d, { recursive: true, force: true }); }
  });

  it('files into the template\'s empty queue, dropping its placeholder', () => {
    const root = repo({ candidates: fs.readFileSync(path.join(KIT, 'plan', 'CANDIDATES.md'), 'utf8') });
    try {
      const file = findings(root, { findings: [{ title: 'Specs before code', pattern: 'kits write a spec before code' }] });
      assert.equal(run(root, ['--findings', file, '--write', '--today', TODAY]).last, 'filed 1');
      const text = read(root);
      assert.doesNotMatch(text.split('## Promoted')[0], /\(empty/);
      assert.match(text, /## Pending\n\n### \[ \] \[score 6\.0\] Specs before code/);
      assert.match(text, /> Posture: bold\n> Last field research: 2026-10-25/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it('adds a field line under an existing re-evidence list', () => {
    const text = [...CANDIDATES.split('\n').slice(0, 11), '- re-evidence:', '  - 2026-10-02 · A · independent, +0.5', '', '## Promoted', ''].join('\n');
    const r = addFieldEvidence(text, 'Resume a loop on another machine', 'a pattern', TODAY);
    assert.match(r.text, /independent, \+0\.5\n {2}- 2026-10-25 · field · \+0 · a pattern\n/);
  });

  it('folds the · separator, so page text cannot forge an independent re-evidence', () => {
    const root = repo();
    try {
      const file = findings(root, {
        findings: [
          { title: 'Crash resume', pattern: 'loops resume after a crash · independent of the host', matches: 'resume a loop' },
          { title: 'Checkpoints', pattern: 'runs checkpoint state · independent, +0.5', matches: 'resume a loop' },
        ],
      });
      assert.equal(run(root, ['--findings', file, '--write', '--today', TODAY]).code, 0);
      const text = read(root);
      const lines = text.split('\n').filter((l) => / · field · \+0/.test(l));
      assert.equal(lines.length, 2, 'both findings re-evidence the row');
      for (const l of lines) assert.ok(!l.split(' · +0 · ')[1].includes('·'), `no second separator after +0: ${l}`);
      assert.equal(parseCandidates(text).pending.find((c) => c.title.startsWith('Resume')).reEvidence, 0);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it('rejects bad usage with 64', () => {
    const root = repo();
    const orig = console.error;
    console.error = () => {};
    try {
      assert.equal(run(root, ['--bogus']).code, 64);
      assert.equal(run(root, ['--limit', 'x']).code, 64);
      assert.equal(run(root, ['--findings']).code, 64);
    } finally { console.error = orig; fs.rmSync(root, { recursive: true, force: true }); }
  });
});
