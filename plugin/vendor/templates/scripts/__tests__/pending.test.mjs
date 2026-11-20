// pending.mjs, settled.mjs and config.mjs: a branch's plan change is one new file in plan/pending/, read the same way
// by settle, by the plan's readers (a pending close counts as closed) and by the settled view. node:test, no deps.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { CONFIG_FILE, DEFAULTS, fill, loadConfig, makeConfig, mayEdit } from '../plan/config.mjs';
import { parsePending, pendingArchiveLines, pendingCloses, pendingFiles, pendingSpecs } from '../plan/pending.mjs';
import { settledView } from '../plan/settled.mjs';

const temps = [];
after(() => {
  for (const d of temps) fs.rmSync(d, { recursive: true, force: true });
});
function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-pending-'));
  temps.push(d);
  return d;
}
function write(root, rel, text) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
}

const FULL = [
  '---',
  'close: 07.3',
  'date: 2026-10-14',
  'says: Empty query shows the empty state',
  'footguns: guard-test-noop, clock-edge',
  '---',
  '## Edit plan/07-search.md',
  '~~~ old',
  'the empty copy',
  '~~~',
  '~~~ new',
  'the empty copy (locked)',
  '~~~',
  '',
  '## Decisions',
  '- **D?empty-copy** · 2026-10-14 · The copy is locked in the spec. *Why:* one voice.',
  '',
  '## Footguns',
  '- **new-slug** · the trap → the rule · seen 1× · last 2026-10-14 · open',
  '',
].join('\n');

describe('a pending file', () => {
  it('reads a close, its edits, decisions and footguns', () => {
    const p = parsePending(FULL, 'plan/pending/07.3.md');
    assert.equal(p.close, '07.3');
    assert.equal(p.date, '2026-10-14');
    assert.equal(p.says, 'Empty query shows the empty state');
    assert.deepEqual(p.footguns, ['guard-test-noop', 'clock-edge']);
    assert.deepEqual(p.edits, [{ path: 'plan/07-search.md', old: 'the empty copy', new: 'the empty copy (locked)' }]);
    assert.equal(p.decisions.length, 1);
    assert.match(p.decisions[0], /^- \*\*D\?empty-copy\*\* · /);
    assert.equal(p.newFootguns.length, 1);
    assert.equal(p.commits, null);
  });

  it('reads CRLF, a lone note, an empty new text, and a "## " heading inside an edit as text', () => {
    const p = parsePending(FULL.replace(/\n/g, '\r\n'), 'x.md');
    assert.equal(p.close, '07.3');
    const note = parsePending('---\ndate: 2026-10-14\n---\n## Notes\n- a note\n', 'n.md');
    assert.deepEqual(note.notes, ['- a note']);
    const del = parsePending('---\ndate: 2026-10-14\n---\n## Edit plan/README.md\n~~~ old\n| a |\n~~~\n~~~ new\n~~~\n', 'd.md');
    assert.equal(del.edits[0].new, '');
    const head = parsePending('---\ndate: 2026-10-14\n---\n## Edit plan/README.md\n~~~ old\n## Specs\n~~~\n~~~ new\n## Specs\n\nmore\n~~~\n', 'h.md');
    assert.equal(head.edits[0].old, '## Specs');
    assert.equal(head.edits[0].new, '## Specs\n\nmore');
  });

  it('refuses what settle could misread', () => {
    const bad = [
      ['## Notes\nx\n', /no front matter/],
      ['---\nclose: 07.3\nsays: x\n---\n', /date: YYYY-MM-DD/],
      ['---\ndate: 2026-10-14\nwho: me\n---\n## Notes\nx\n', /unknown key "who"/],
      ['---\ndate: 2026-10-14\nclose: seven\nsays: x\n---\n', /isn't a chunk id/],
      ['---\ndate: 2026-10-14\nclose: 07.3\n---\n', /needs "says:"/],
      ['---\ndate: 2026-10-14\ncommits: nope\n---\n## Notes\nx\n', /isn't <sha>\.\.<sha>/],
      ['---\ndate: 2026-10-14\n---\n', /nothing to settle/],
      ['---\ndate: 2026-10-14\n---\nstray\n## Notes\nx\n', /text before the first/],
      ['---\ndate: 2026-10-14\n---\n## Edit src/app.js\n~~~ old\na\n~~~\n~~~ new\nb\n~~~\n', /settle edits only/],
      ['---\ndate: 2026-10-14\n---\n## Edit plan/pending/x.md\n~~~ old\na\n~~~\n~~~ new\nb\n~~~\n', /settle edits only/],
      ['---\ndate: 2026-10-14\n---\n## Edit plan/README.md\nno fences\n', /no ~~~ old/],
      ['---\ndate: 2026-10-14\n---\n## Footguns\n- **x** · not the format\n', /footgun format/],
      ['---\ndate: 2026-10-14\n---\n## Decisions\n- **D12** · numbered already\n', /D\?<slug>/],
      ['---\ndate: 2026-10-14\n---\n## Decisions\n- **D?a** · 1\n  2\n  3\n  4\n', /at most 3 lines/],
      ['---\ndate: 2026-10-14\n---\n## Elsewhere\nx\n', /unknown section/],
    ];
    for (const [text, re] of bad) assert.throws(() => parsePending(text, 'p.md'), re, text);
  });

  it('takes its limits and its editable paths from the config', () => {
    const text = '---\ndate: 2026-10-14\n---\n## Edit docs/x.md\n~~~ old\na\n~~~\n~~~ new\nb\n~~~\n';
    assert.throws(() => parsePending(text, 'p.md'));
    assert.equal(parsePending(text, 'p.md', makeConfig({ editable: ['docs/'] })).edits.length, 1);
    const long = '---\ndate: 2026-10-14\n---\n## Decisions\n- **D?a** · 1\n  2\n  3\n  4\n';
    assert.equal(parsePending(long, 'p.md', makeConfig({ limits: { decisionLines: 4 } })).decisions.length, 1);
  });

  it('counts as closed for readers until it settles; a malformed one closes nothing', () => {
    const files = [
      { file: 'plan/pending/07.3.md', text: FULL },
      { file: 'plan/pending/bad.md', text: '---\nclose: 07.4\n---\n' },
      { file: 'plan/pending/plot-x.md', text: '---\ndate: 2026-10-15\n---\n## Notes\nx\n' },
    ];
    assert.deepEqual(pendingArchiveLines(files), ['- 2026-10-14 · 07.3 · Empty query shows the empty state']);
    assert.deepEqual([...pendingCloses(files)], ['07.3']);
  });

  it('lists the pending files by name, never the folder README', () => {
    const root = tmp();
    write(root, 'plan/pending/README.md', '# not one\n');
    write(root, 'plan/pending/b.md', 'b');
    write(root, 'plan/pending/a.md', 'a');
    assert.deepEqual(pendingFiles(root).map((f) => f.file), ['plan/pending/a.md', 'plan/pending/b.md']);
    assert.deepEqual(pendingFiles(tmp()), []);
  });
});

describe('the settle config', () => {
  it('lays plan/settle.json over the defaults, merging lanes, limits and the ladder', () => {
    const root = tmp();
    assert.deepEqual(loadConfig(root), makeConfig());
    write(root, CONFIG_FILE, JSON.stringify({ queue: 'plan/queue.md', limits: { openFootguns: 5 }, ladder: { spec: '48', file: '48-x.md', rows: { root: 'r {file}' } } }));
    const cfg = loadConfig(root);
    assert.equal(cfg.queue, 'plan/queue.md');
    assert.equal(cfg.limits.openFootguns, 5);
    assert.equal(cfg.limits.watchDays, DEFAULTS.limits.watchDays);
    assert.equal(cfg.ladder.spec, '48');
    assert.equal(cfg.ladder.rows.plan, DEFAULTS.ladder.rows.plan);
    assert.equal(fill(cfg.ladder.rows.root, cfg.ladder), 'r 48-x.md');
    write(root, CONFIG_FILE, '{ nope');
    assert.throws(() => loadConfig(root), /not JSON/);
  });

  it('lets an edit touch only the editable paths, never plan/pending/', () => {
    assert.ok(mayEdit('plan/07-search.md'));
    assert.ok(mayEdit('README.md'));
    assert.ok(mayEdit('identity/footguns.md'));
    assert.ok(!mayEdit('plan/pending/x.md'));
    assert.ok(!mayEdit('docs/README.md'));
    assert.ok(!mayEdit('plan/../src/x.js'));
  });
});

describe('the settled view', () => {
  const pendingFile = (date, edits) => `---\ndate: ${date}\n---\n${edits.map(([p, o, n]) => `## Edit ${p}\n~~~ old\n${o}\n~~~\n~~~ new\n${n}\n~~~\n`).join('\n')}`;

  it("applies each pending file's edits in settle's order, in memory, and leaves the files on disk alone", () => {
    const root = tmp();
    write(root, 'plan/README.md', '| a |\r\n| b |\r\n');
    write(root, 'plan/pending/README.md', '# not a pending file\n');
    write(root, 'plan/pending/plot-z.md', pendingFile('2026-10-02', [['plan/README.md', '| b2 |', '| b2 |\n| c |']]));
    write(root, 'plan/pending/plot-y.md', pendingFile('2026-10-01', [['plan/README.md', '| b |', '| b |\n| b2 |']]));
    const view = settledView(root);
    assert.deepEqual(view.problems, []);
    assert.equal(view.pending, 2);
    assert.equal(view.read('plan/README.md'), '| a |\n| b |\n| b2 |\n| c |\n');
    assert.equal(fs.readFileSync(path.join(root, 'plan/README.md'), 'utf8'), '| a |\r\n| b |\r\n');
    assert.equal(view.read('plan/gone.md'), null);
  });

  it('names a pending file settle would skip, and applies none of its edits', () => {
    const root = tmp();
    write(root, 'plan/README.md', '| a |\n');
    write(root, 'README.md', '# Project\n');
    const clean = settledView(root);
    assert.deepEqual([clean.problems, clean.pending, clean.changed], [[], 0, []]);
    write(root, 'plan/pending/plot-a.md', '## Edit plan/README.md\n~~~ old\n| a |\n~~~\n~~~ new\n| a |\n| b |\n~~~\n');
    write(root, 'plan/pending/plot-b.md', pendingFile('2026-10-01', [['plan/README.md', '| a |', '| a |\n| x |'], ['README.md', 'no such text', 'y']]));
    const view = settledView(root);
    assert.equal(view.problems.length, 2);
    assert.match(view.problems.join('\n'), /no front matter/);
    assert.match(view.problems.join('\n'), /plot-b\.md: Edit README\.md: the old text isn't there/);
    assert.equal(view.read('plan/README.md'), '| a |\n');
  });
});

describe('a pending ## Add', () => {
  const ADD = [
    '---',
    'date: 2026-10-21',
    '---',
    '## Add plan/07-search.md',
    '~~~ section Design',
    'The strip compares a cached page with a served one.',
    '~~~',
    '~~~ acceptance',
    '- **A?strip** The strip shows when the page is stale.',
    '~~~',
    '~~~ chunks',
    '- [ ] **07.?strip** The strip · S · closes A?strip · needs —',
    '  - Contract first: the compare.',
    '    - Deeper: the served build id.',
    '      wrapped under it.',
    '~~~',
    '~~~ questions',
    '- Dismissable?',
    '~~~',
    '## Edit plan/README.md',
    '~~~ old',
    '**Asap**',
    '~~~',
    '~~~ new',
    '**Asap**',
    '- 07.?strip the strip',
    '~~~',
    '',
  ].join('\n');

  it('reads its parts, sub-bullets at any depth, from CRLF too', () => {
    for (const text of [ADD, ADD.replace(/\n/g, '\r\n')]) {
      const p = parsePending(text, 'plan/pending/plot-strip.md');
      assert.equal(p.adds.length, 1);
      const [a] = p.adds;
      assert.equal(a.path, 'plan/07-search.md');
      assert.equal(a.spec, '07');
      assert.deepEqual(a.acceptance, ['- **A?strip** The strip shows when the page is stale.']);
      assert.equal(a.chunks.length, 1);
      assert.equal(a.chunks[0].split('\n').length, 4);
      assert.deepEqual(a.questions, ['- Dismissable?']);
      assert.deepEqual(a.sections, [{ heading: 'Design', text: 'The strip compares a cached page with a served one.' }]);
      assert.equal(p.edits[0].new, '**Asap**\n- 07.?strip the strip');
    }
  });

  it('names the specs an open pull request extends through its pending file alone', () => {
    const patch = [
      'diff --git a/plan/pending/plot-strip.md b/plan/pending/plot-strip.md',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/plan/pending/plot-strip.md',
      '@@ -0,0 +1,9 @@',
      '+---',
      '+date: 2026-10-21',
      '+---',
      '+## Add plan/07-search.md',
      '+~~~ chunks',
      '+- [ ] **07.?strip** The strip · S',
      '+~~~',
      '+## Edit plan/README.md',
      '+## Edit plan/100-big.md',
      '+## Edit plan/07-search.md',
      '',
    ].join('\r\n');
    assert.deepEqual(pendingSpecs(patch), ['plan/07-search.md', 'plan/100-big.md']);
    assert.deepEqual(pendingSpecs(ADD), ['plan/07-search.md']);
    assert.deepEqual(pendingSpecs('---\ndate: 2026-10-21\n---\n## Notes\n- x\n'), []);
  });

  it('reads a three-digit spec, and refuses a second Add of the same spec in one file', () => {
    const p = parsePending('---\ndate: 2026-10-21\n---\n## Add plan/100-big.md\n~~~ chunks\n- [ ] **100.?x** X · S · needs —\n~~~\n', 'b.md');
    assert.equal(p.adds[0].spec, '100');
    const twice = '---\ndate: 2026-10-21\n---\n## Add plan/07-search.md\n~~~ questions\n- Q\n~~~\n## Add plan/07-search.md\n~~~ questions\n- R\n~~~\n';
    assert.throws(() => parsePending(twice, 't.md'), /twice \(one section per spec\)/);
  });
});

describe('the settled view of an ## Add', () => {
  const SPEC = ['# 07 — Search', '', '## Acceptance', '', '- **A1** One.', '', '## Chunks', 'Measure: 1 open · 0 closed · next A2', '', '- [ ] **07.1** One · S · closes A1 · needs —', ''].join('\n');
  const add = (date, slug) => `---\ndate: ${date}\n---\n## Add plan/07-search.md\n~~~ acceptance\n- **A?${slug}** ${slug}.\n~~~\n~~~ chunks\n- [ ] **07.?${slug}** ${slug} · S · closes A?${slug} · needs —\n~~~\n`;

  it('numbers the adds in date-then-name order, places them, and returns the numbers', () => {
    const root = tmp();
    write(root, 'plan/07-search.md', SPEC);
    write(root, 'plan/README.md', '| 07 | Search | [07-search.md](07-search.md) | planned | 1 left |\n');
    write(root, 'plan/ARCHIVE.md', '- 2026-10-01 · 07.2 · Two · a..b\n');
    write(root, 'plan/pending/plot-b.md', add('2026-10-20', 'b'));
    write(root, 'plan/pending/plot-a.md', add('2026-10-21', 'a'));
    write(root, 'plan/pending/plot-c.md', add('2026-10-20', 'c'));
    const view = settledView(root);
    assert.deepEqual(view.problems, []);
    assert.deepEqual(Object.fromEntries(view.numbers), { 'A?b': 'A2', '07.?b': '07.3', 'A?c': 'A3', '07.?c': '07.4', 'A?a': 'A4', '07.?a': '07.5' });
    const spec = view.read('plan/07-search.md');
    assert.match(spec, /^Measure: 4 open · 0 closed · next A5$/m);
    assert.deepEqual([...spec.matchAll(/\*\*(07\.\d+)\*\* (\w+)/g)].map((m) => `${m[1]}=${m[2]}`), ['07.1=One', '07.3=b', '07.4=c', '07.5=a']);
    assert.match(view.read('plan/README.md'), /\| 4 left \|/);
    assert.equal(fs.readFileSync(path.join(root, 'plan/07-search.md'), 'utf8'), SPEC);
  });

  it('names a broken Add as a problem and applies none of that file', () => {
    const root = tmp();
    write(root, 'plan/07-search.md', SPEC.replace(/^Measure:.*$/m, ''));
    write(root, 'plan/pending/plot-a.md', add('2026-10-21', 'a'));
    write(root, 'plan/pending/plot-u.md', '---\ndate: 2026-10-21\n---\n## Edit plan/README.md\n~~~ old\nx\n~~~\n~~~ new\n07.?gone\n~~~\n');
    const view = settledView(root);
    assert.equal(view.problems.length, 2);
    assert.match(view.problems.join('\n'), /plot-a\.md: Add plan\/07-search\.md: no "Measure: /);
    assert.match(view.problems.join('\n'), /07\.\?gone is used but no "## Add" part defines it/);
    assert.equal(view.numbers.size, 0);
  });

  it('names the last refusals as problems: section Chunks or Acceptance, an undefined placeholder in a footgun line', () => {
    const root = tmp();
    write(root, 'plan/07-search.md', SPEC);
    write(root, 'plan/pending/plot-s.md', '---\ndate: 2026-10-21\n---\n## Add plan/07-search.md\n~~~ section Chunks\nA note.\n~~~\n');
    write(root, 'plan/pending/plot-f.md', '---\ndate: 2026-10-21\n---\n## Footguns\n- **t** · a trap → 07.?nope guards it · seen 1× · last 2026-10-21 · open\n');
    const view = settledView(root);
    assert.equal(view.problems.length, 2);
    assert.match(view.problems.join('\n'), /plot-s\.md: .*use the ~~~ chunks part/);
    assert.match(view.problems.join('\n'), /plot-f\.md: 07\.\?nope is used but no "## Add" part defines it/);
    assert.equal(view.read('plan/07-search.md'), SPEC);
  });
});
