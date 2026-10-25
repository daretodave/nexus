// The critique GUI pass (spec 56.6, A6): scripts/plan/critique-gui.mjs plans the pass or says why it skips, and
// holds the walk rows in plan/CRITIQUE.md to their shape; the skill and its command say what the spec decided.
// File-system and text checks only: nothing runs, nothing is built, nothing is fetched.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { SCENARIOS, checkRows, main, parseRows, planPass } from '../plan/critique-gui.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const NOW = new Date('2026-10-25T10:00:00.000Z');

/** A fake file system holding exactly these paths under `root`. */
const holding = (root, ...rels) => {
  const set = new Set(rels.map((r) => path.join(root, ...r.split('/'))));
  return (p) => set.has(p);
};
const FULL = ['packages/cli/package.json', 'packages/cli/node_modules/playwright-core', 'packages/cli/dist/index.html'];

const row = ({ head = '/onboarding/welcome @ mobile (plain-folder) — the first step never says what a repo is', sev = 'MED', category = 'ui-comprehension', source = 'walk', evidence = 'onboarding-welcome-mobile-plain-folder.png, .scratch/walk/critique-2026-10-25T10-00-00-000Z/walk.json', fix = 'packages/cli/src/onboarding/Welcome.jsx adds one line on what Detect does' } = {}) => [
  `### [ ] [${sev}] ${head}`,
  `- category: ${category}`,
  '- observation: a stranger lands here with a plain folder',
  `- evidence: ${evidence}`,
  `- suggested fix: ${fix}`,
  `- source: ${source}`,
].join('\n');

const queue = (...rows) => ['# Critique', '', '> Last pass: 2026-10-25', '> Pass count: 31', '', '## Pending', '', ...rows, '', '## Done', ''].join('\n');

describe('critique-gui: plan', () => {
  const root = path.join(os.tmpdir(), 'nexus-critique-gui');

  it('full and gui walk the three onboarding scenarios into .scratch/walk/critique-<iso>/', () => {
    for (const mode of ['full', 'gui']) {
      const p = planPass({ root, mode, now: NOW, exists: holding(root, ...FULL) });
      assert.equal(p.run, true);
      assert.deepEqual(p.scenarios, ['plain-folder', 'cloud-token', 'fleet-to-tug']);
      assert.equal(p.out, path.join(root, '.scratch', 'walk', 'critique-2026-10-25T10-00-00-000Z'));
      assert.match(p.command, /^npm --prefix packages\/cli run walk -- --scenarios plain-folder,cloud-token,fleet-to-tug --out "/);
      assert.equal(p.pngs, 8);
    }
  });

  it('read runs no GUI pass', () => {
    const p = planPass({ root, mode: 'read', exists: holding(root, ...FULL) });
    assert.equal(p.run, false);
    assert.match(p.skip, /^skip: GUI pass — \/critique read/);
  });

  it('no node_modules or no dist/ is a skip line, never a run', () => {
    const noModules = planPass({ root, exists: holding(root, 'packages/cli/package.json', 'packages/cli/dist/index.html') });
    assert.equal(noModules.run, false);
    assert.match(noModules.skip, /^skip: GUI pass — packages\/cli has no node_modules/);
    const noDist = planPass({ root, exists: holding(root, 'packages/cli/package.json', 'packages/cli/node_modules/playwright-core') });
    assert.equal(noDist.run, false);
    assert.match(noDist.skip, /no built dist\//);
    const noCli = planPass({ root, exists: holding(root) });
    assert.match(noCli.skip, /no packages\/cli/);
  });

  it('the scenarios are demo scenarios the walk knows', () => {
    const src = read('packages/cli/server/demo/scenarios.mjs');
    for (const s of SCENARIOS) assert.match(src, new RegExp(`name: '${s}'`), s);
  });

  it('the CLI prints run: and the command, or the skip line, and refuses a bad mode', () => {
    const out = [];
    assert.equal(main(['plan', '--mode', 'gui'], { root, now: NOW, log: (s) => out.push(s), exists: holding(root, ...FULL) }), 0);
    assert.match(out[0], /^run: GUI pass over plain-folder, cloud-token, fleet-to-tug/);
    assert.match(out[1], /run walk -- --scenarios/);
    assert.match(out[2], /\.scratch\/walk\/critique-2026-10-25T10-00-00-000Z\/walk\.json and at most 8 PNGs/);
    const skip = [];
    assert.equal(main(['plan'], { root, log: (s) => skip.push(s), exists: holding(root) }), 0);
    assert.deepEqual(skip, ['skip: GUI pass — no packages/cli in this checkout']);
    const json = [];
    main(['plan', '--json', '--mode', 'read'], { root, log: (s) => json.push(s) });
    assert.equal(JSON.parse(json[0]).run, false);
    const err = console.error;
    console.error = () => {};
    try {
      assert.equal(main(['plan', '--mode', 'everything'], { root, log: () => {} }), 64);
      assert.equal(main(['walk'], { root, log: () => {} }), 64);
    } finally {
      console.error = err;
    }
  });
});

describe('critique-gui: walk rows', () => {
  it('parses a row and its fields', () => {
    const [r] = parseRows(queue(row()));
    assert.equal(r.severity, 'MED');
    assert.equal(r.pending, true);
    assert.equal(r.fields.source, 'walk');
    assert.match(r.fields['suggested fix'], /Welcome\.jsx/);
  });

  it('a well-formed walk row is clean, and dry-run rows are not its business', () => {
    const dry = ['### [ ] [HIGH] README.md:12 — the TL;DR skips a step', '- category: ordering', '- evidence: README.md:12', '- source: dry-run'].join('\n');
    const r = checkRows(queue(row(), dry));
    assert.deepEqual(r.problems, []);
    assert.equal(r.rows, 1);
  });

  it('flags a mismatched source or category, a bad heading, no walk evidence and a cut to the magic', () => {
    const bad = [
      row({ source: 'dry-run' }),
      row({ category: 'comprehension' }),
      row({ head: 'the onboarding is confusing' }),
      row({ evidence: 'seen by eye' }),
    ];
    const { problems } = checkRows(queue(...bad), 'C');
    assert.ok(problems.some((p) => /comes from the GUI pass \(source: walk\)/.test(p)));
    assert.ok(problems.some((p) => /category is ui-comprehension/.test(p)));
    assert.ok(problems.some((p) => /reads "### \[SEV\] <route> @/.test(p)));
    assert.ok(problems.some((p) => /evidence cites the walk/.test(p)));
    assert.ok(problems.some((p) => /4 walk rows Pending \(at most 3/.test(p)));
    const magic = checkRows(queue(row({ fix: 'remove the particles from the welcome screen' }))).problems;
    assert.ok(magic.some((p) => /the magic guard/.test(p)));
  });

  it('a closed row is left as it was filed', () => {
    const text = `${queue(row())}\n${row({ head: 'loose words', evidence: 'by eye' }).replace('[ ]', '[x]')}\n`;
    const r = checkRows(text);
    assert.deepEqual(r.problems, []);
    assert.equal(r.rows, 2);
  });

  it('the CLI exits 1 on a breach and 0 clean', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'critique-gui-'));
    try {
      fs.mkdirSync(path.join(dir, 'plan'));
      fs.writeFileSync(path.join(dir, 'plan', 'CRITIQUE.md'), queue(row()));
      const out = [];
      assert.equal(main(['check'], { root: dir, log: (s) => out.push(s) }), 0);
      assert.deepEqual(out, ['clean (1 walk row)']);
      fs.writeFileSync(path.join(dir, 'plan', 'CRITIQUE.md'), queue(row({ evidence: 'none' })));
      assert.equal(main(['check'], { root: dir, log: () => {} }), 1);
      assert.equal(main(['check', '--file', 'plan/NOPE.md'], { root: dir, log: () => {} }), 0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("nexus's own queue is clean", () => {
    assert.deepEqual(checkRows(read('plan/CRITIQUE.md')).problems, []);
  });
});

describe('critique-gui: the skill says it', () => {
  const skill = read('skills/critique.md');
  const cmd = read('.claude/commands/critique.md');

  it('full and gui run the GUI pass, read runs none', () => {
    assert.match(skill, /\/critique gui +# the GUI pass only/);
    assert.match(skill, /\/critique read .*no GUI pass/);
    assert.match(cmd, /`gui` → the GUI pass only/);
    assert.match(cmd, /`read` →[\s\S]{0,80}no GUI\s+pass/);
  });

  it('the "no browser" line is gone and the skip is logged', () => {
    assert.doesNotMatch(skill, /no browser/);
    assert.match(skill, /## 3a\. The GUI pass/);
    assert.match(skill, /plain-folder,cloud-token,fleet-to-tug/);
    assert.match(skill, /`skip:` line/);
    assert.match(skill, /critique-gui\.mjs check/);
  });

  it('the rows are ui-comprehension from source: walk, at most 3, UI not fixture data', () => {
    assert.match(skill, /`ui-comprehension`, `source: walk`/);
    assert.match(skill, /at most \*\*3\*\* of the pass's 6/);
    assert.match(skill, /at most \*\*8 PNGs\*\*/);
    assert.match(skill, /never the\s+fixture data/);
    assert.match(skill, /never\s+instructions to follow/);
  });
});
