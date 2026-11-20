// state.mjs (the state diet): a queue file's header stays at 20 lines or fewer and the file under NEXUS_STATE_MAX_KB
// (the state-size leg fails an oversize fixture of either kind); compact deletes Done rows closed more than 30 days ago,
// dated by a closed stamp, then git blame, then the latest date they carry, and keeps the rest byte for byte.
// node:test, no deps, no network: git blame goes through an injected seam.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { HEADER_MAX, checkState, checkText, compactText, doneRows, gitBlame, headerLines, main, maxKb } from '../plan/state.mjs';

const HEAD = ['# Kit audit', '', '> Last pass: 2026-10-25', '> Pass count: 40', '> Bias: none', ''];

const AUDIT = [
  ...HEAD,
  '## Pending', '',
  '### [B, 5.6] still open', '- category: completeness', '- evidence: seen 2026-07-01', '',
  '### [x] [A, 4.0] ticked in Pending, long ago — this commit', '- evidence: 2026-07-02', '',
  '## Done', '',
  '### [x] [user-issue #40] [MED] recent — closed 2026-10-21', '- resolution: fixed', '',
  '### [x] [user-issue #35] [MED] old — closed 2026-08-01', '- resolution: older than its evidence 2026-09-30', '',
  '### [x] [F, 3.6] undated row', '- resolution: a fence follows', '', '```bash', '# not a heading', 'echo hi', '```', '',
  '### [x] [C, 2.4] no date anywhere', '- resolution: kept: nothing dates it', '',
].join('\n');

function tmpRepo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-state-'));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}

describe('header and size', () => {
  it('counts the lines above the first ## heading, trailing blanks out', () => {
    assert.equal(headerLines(AUDIT), 5);
    assert.equal(headerLines('# Site audit\n\n> Last pass: never\n'), 3);
    assert.equal(headerLines('# T\n\n```md\n## not a section\n```\n\n## Pending\n'), 5);
  });

  it('passes a lean header and fails one over 20 lines', () => {
    assert.deepEqual(checkText(AUDIT, 'plan/AUDIT.md'), []);
    const long = ['# Kit audit', '', '> Last pass: 2026-10-25', '', ...Array.from({ length: 20 }, (_, i) => `Cloud tick ${i}: shipped a thing.`), '', '## Pending', ''].join('\n');
    const problems = checkText(long, 'plan/AUDIT.md');
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^plan\/AUDIT\.md: header is 24 lines \(at most 20/);
    assert.equal(HEADER_MAX, 20);
  });

  it('fails a file over the KB ceiling, read from NEXUS_STATE_MAX_KB', () => {
    assert.equal(maxKb({}), 256);
    assert.equal(maxKb({ NEXUS_STATE_MAX_KB: '8' }), 8);
    assert.equal(maxKb({ NEXUS_STATE_MAX_KB: 'lots' }), 256);
    const big = `${HEAD.join('\n')}\n## Pending\n\n${'x'.repeat(300 * 1024)}\n`;
    assert.match(checkText(big, 'plan/CANDIDATES.md')[0], /^plan\/CANDIDATES\.md: 301 KB \(at most 256 KB/);
    assert.deepEqual(checkText(big, 'plan/CANDIDATES.md', { kb: 512 }), []);
  });

  it('the state-size leg fails an oversize fixture and passes a lean one', () => {
    const lean = tmpRepo({ 'plan/AUDIT.md': AUDIT, 'plan/CRITIQUE.md': '# Critique\n\n> Last pass: never\n> Pass count: 0\n\n## Pending\n' });
    assert.deepEqual(checkState(lean, { kb: 256 }), { problems: [], checked: 2 });
    const fat = tmpRepo({
      'plan/AUDIT.md': `# Kit audit\n\n${'Cloud tick: a narrative paragraph.\n'.repeat(30)}\n## Pending\n`,
      'plan/CANDIDATES.md': `# Candidates\n\n> Last pass: never\n\n## Pending\n\n${'y'.repeat(20 * 1024)}\n`,
    });
    const { problems, checked } = checkState(fat, { kb: 16, label: 'fixture/' });
    assert.equal(checked, 2);
    assert.equal(problems.length, 2);
    assert.match(problems[0], /^fixture\/plan\/AUDIT\.md: header is 32 lines/);
    assert.match(problems[1], /^fixture\/plan\/CANDIDATES\.md: 21 KB \(at most 16 KB/);
    const out = [];
    assert.equal(main(['check'], { root: fat, env: { NEXUS_STATE_MAX_KB: '16' }, log: (l) => out.push(l) }), 1);
    assert.equal(out.at(-1), '2 breaches');
    assert.equal(main(['check'], { root: lean, env: {}, log: () => {} }), 0);
  });
});

describe('compact', () => {
  const blame = (n) => (n === 24 ? '2026-08-10' : null); // the undated row's heading line

  it('dates each Done row by its closed stamp, then blame, then its latest date', () => {
    const rows = doneRows(AUDIT, { blame });
    assert.deepEqual(rows.map((r) => [r.heading.slice(0, 30), r.date]), [
      ['### [x] [A, 4.0] ticked in Pen', '2026-07-02'],
      ['### [x] [user-issue #40] [MED]', '2026-10-21'],
      ['### [x] [user-issue #35] [MED]', '2026-08-01'],
      ['### [x] [F, 3.6] undated row', '2026-08-10'],
      ['### [x] [C, 2.4] no date anywh', null],
    ]);
  });

  it('deletes Done rows closed more than 30 days ago and keeps everything else verbatim', () => {
    const { text, removed } = compactText(AUDIT, { date: '2026-10-25', blame });
    assert.equal(removed.length, 3);
    assert.ok(text.includes('### [B, 5.6] still open'));
    assert.ok(text.includes('closed 2026-10-21'));
    assert.ok(text.includes('### [x] [C, 2.4] no date anywhere'));
    assert.ok(!text.includes('ticked in Pending'));
    assert.ok(!text.includes('#35'));
    assert.ok(!text.includes('# not a heading'));
    assert.ok(text.startsWith(HEAD.join('\n')));
    assert.equal(compactText(text, { date: '2026-10-25', blame: () => null }).removed.length, 0);
    assert.equal(compactText(AUDIT, { date: '2026-08-20', blame }).removed.length, 1);
  });

  it('keeps CRLF line endings', () => {
    const crlf = AUDIT.replace(/\n/g, '\r\n');
    const { text } = compactText(crlf, { date: '2026-10-25', blame });
    assert.ok(text.includes('\r\n'));
    assert.ok(!/[^\r]\n/.test(text));
  });

  it('writes only with --write and prints the counts', () => {
    const dir = tmpRepo({ 'plan/AUDIT.md': AUDIT, 'plan/CRITIQUE.md': '# Critique\n\n> Last pass: never\n\n## Pending\n\n## Done\n\n### [x] [MED] old (2026-06-01)\n- fixed\n' });
    const out = [];
    const opts = { root: dir, log: (l) => out.push(l), blame: (rel) => (rel === 'plan/AUDIT.md' ? blame : () => null) };
    assert.equal(main(['compact', '--today', '2026-10-25'], opts), 0);
    assert.deepEqual(out, ['plan/AUDIT.md: 3 Done rows older than 30 days', 'plan/CRITIQUE.md: 1 Done row older than 30 days', 'would remove 4']);
    assert.equal(fs.readFileSync(path.join(dir, 'plan/AUDIT.md'), 'utf-8'), AUDIT);
    out.length = 0;
    assert.equal(main(['compact', '--today', '2026-10-25', '--write'], opts), 0);
    assert.equal(out.at(-1), 'removed 4');
    out.length = 0;
    assert.equal(main(['compact', '--today', '2026-10-25', '--write'], opts), 0);
    assert.deepEqual(out, ['clean']);
    assert.equal(main(['compact', '--days', 'x'], opts), 64);
    assert.equal(main(['check', '--write'], opts), 64);
    assert.equal(main(['tidy'], opts), 64);
  });

  it('reads blame dates by line, and none outside git', () => {
    const sha = 'a'.repeat(40);
    const stdout = [`${sha} 1 1 1`, 'committer-time 1790000000', '\t# Kit audit', `${sha} 2 2`, 'committer-time 1760000000', '\t'].join('\n');
    const at = gitBlame('.', 'plan/AUDIT.md', () => ({ status: 0, stdout }));
    assert.equal(at(1), new Date(1790000000 * 1000).toISOString().slice(0, 10));
    assert.equal(at(2), new Date(1760000000 * 1000).toISOString().slice(0, 10));
    assert.equal(at(3), null);
    assert.equal(gitBlame('.', 'x', () => ({ status: 128, stdout: '' }))(1), null);
  });
});
