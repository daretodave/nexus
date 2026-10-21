// A plot, end to end in a scratch git repository in the temp folder (offline): a contributor's branch writes the new
// spec directly and its roadmap row and lane entry as plan/pending/plot-<slug>.md; plan-check passes it unsettled,
// order.mjs --mark shows its chunks in line, and once the owner settles it, all three agree on the same plan (the same
// chunks, the same order, the same counts). Spawns git, so it runs in the scripts-git leg. node:test, no deps.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { settledView } from '../plan/settled.mjs';

const SCRIPTS = fileURLToPath(new URL('..', import.meta.url));

const SPEC_07 = [
  '# 07 — Search',
  '',
  '## Acceptance',
  '',
  '- **A1** A query finds places.',
  '- **A2** Near you.',
  '',
  '## Chunks',
  '',
  'Measure: 2 open · 0 closed · next A3',
  '',
  '- [ ] **07.3** Where an office is · S · closes A1 · needs —',
  '- [ ] **07.4** Near you · M · closes A2 · needs 07.3',
  '',
].join('\n');

const README = [
  '# Roadmap',
  '',
  '## Lanes',
  '',
  '**Asap** (built before the table):',
  '',
  '- (none)',
  '',
  '**Held** (waits on the owner):',
  '',
  '- (none)',
  '',
  '## Specs',
  '',
  '| # | Initiative | Spec | Status | Progress |',
  '|---|---|---|---|---|',
  '| 07 | Search | [07-search.md](07-search.md) | in progress | 2 left |',
  '',
].join('\n');

// The plot: a new spec, written directly.
const SPEC_08 = [
  '# 08 — Maps',
  '',
  '## Acceptance',
  '',
  '- **A1** A map of the offices.',
  '- **A2** The map follows the search.',
  '',
  '## Chunks',
  '',
  'Measure: 2 open · 0 closed · next A3',
  '',
  '- [ ] **08.1** The map · S · closes A1 · needs —',
  '- [ ] **08.2** The map follows the search · M · closes A2 · needs 07.4',
  '',
].join('\n');

// Its shared edits, waiting for settle: the lane entry, the roadmap rows, and a chunk for the spec it extends.
const PLOT = [
  '---',
  'date: 2000-10-21',
  '---',
  '## Edit plan/07-search.md',
  '~~~ old',
  '- **A2** Near you.',
  '~~~',
  '~~~ new',
  '- **A2** Near you.',
  '- **A3** Search by zip.',
  '~~~',
  '',
  '## Edit plan/07-search.md',
  '~~~ old',
  'Measure: 2 open · 0 closed · next A3',
  '~~~',
  '~~~ new',
  'Measure: 3 open · 0 closed · next A4',
  '~~~',
  '',
  '## Edit plan/07-search.md',
  '~~~ old',
  '- [ ] **07.4** Near you · M · closes A2 · needs 07.3',
  '~~~',
  '~~~ new',
  '- [ ] **07.4** Near you · M · closes A2 · needs 07.3',
  '- [ ] **07.5** Search by zip · S · closes A3 · needs 07.3',
  '~~~',
  '',
  '## Edit plan/README.md',
  '~~~ old',
  '**Asap** (built before the table):',
  '',
  '- (none)',
  '~~~',
  '~~~ new',
  '**Asap** (built before the table):',
  '',
  '- **08.1** · the map first.',
  '~~~',
  '',
  '## Edit plan/README.md',
  '~~~ old',
  '| 07 | Search | [07-search.md](07-search.md) | in progress | 2 left |',
  '~~~',
  '~~~ new',
  '| 07 | Search | [07-search.md](07-search.md) | in progress | 3 left |',
  '| 08 | Maps | [08-maps.md](08-maps.md) | planned | 2 left |',
  '~~~',
  '',
].join('\n');

const FOOTGUNS = '# Footguns\n\n## Open\n\n## Watch (seen once)\n\n## Guarded\n';

const temps = [];
after(() => {
  for (const d of temps) fs.rmSync(d, { recursive: true, force: true });
});
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_') && k !== 'NEXUS_CONTRIBUTOR'));

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-plot-'));
  temps.push(dir);
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', env: ENV, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'me@example.com');
  git('config', 'user.name', 'Sam Lee');
  git('config', 'core.hooksPath', 'no-hooks');
  const put = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  };
  // The scripts as an adopter has them: the plan gate, the plan folder's scripts, settle's owner check (no claims
  // module: nothing is in flight, and nothing reaches for a network).
  fs.cpSync(path.join(SCRIPTS, 'plan'), path.join(dir, 'scripts/plan'), { recursive: true });
  for (const f of ['plan-check.mjs', 'owner.mjs']) fs.copyFileSync(path.join(SCRIPTS, f), path.join(dir, 'scripts', f));
  put('plan/07-search.md', SPEC_07);
  put('plan/README.md', README);
  put('plan/ARCHIVE.md', '# Archive\n\n');
  put('identity/footguns.md', FOOTGUNS);
  put('.gitignore', '.owner\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  const node = (script, ...args) => {
    const r = spawnSync(process.execPath, [path.join(dir, 'scripts', script), ...args], { cwd: dir, encoding: 'utf8', env: ENV });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  };
  const read = (rel) => (fs.existsSync(path.join(dir, rel)) ? fs.readFileSync(path.join(dir, rel), 'utf8') : null);
  return { dir, git, put, node, read };
}

/** What each script says the plan is: plan-check's verdict and counts, order's pick list as JSON and as text. */
function picture(r) {
  const check = r.node('plan-check.mjs', '--since', 'HEAD~1');
  const json = r.node('plan/order.mjs', '--mark', '07.5,08.1,08.2', '--json');
  const text = r.node('plan/order.mjs', '--mark', '07.5,08.1,08.2');
  assert.equal(json.code, 0, json.out);
  assert.equal(text.code, 0, text.out);
  const sim = JSON.parse(json.out);
  return {
    check,
    next: sim.next.map((c) => `${c.id} ${c.lane} ${c.eta}`),
    blocked: sim.blocked.map((c) => `${c.id} ${c.why}`),
    marked: text.out.split('\n').filter((l) => l.includes('<-- just plotted')).map((l) => l.trim().split(/\s+/)[1]),
  };
}

it('settle, plan-check and order --mark agree on a plot, before and after it settles', () => {
  const r = repo();
  r.put('plan/08-maps.md', SPEC_08);
  r.put('plan/pending/plot-maps.md', PLOT);
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'plan: plot maps');

  // The contributor's branch, unsettled: the files on disk still lack the row and the new chunk, the view has them.
  assert.ok(!r.read('plan/README.md').includes('08-maps.md'));
  assert.ok(!r.read('plan/07-search.md').includes('07.5'));
  const view = settledView(r.dir);
  assert.deepEqual(view.problems, []);
  const before = picture(r);
  assert.equal(before.check.code, 0, before.check.out);
  assert.match(before.check.out, /plan-check: green \(2 specs, 5 chunks\)/);
  assert.deepEqual(before.next, ['08.1 asap 1', '07.3 table 2', '07.4 table 4.5', '07.5 table 5.5', '08.2 table 8']);
  assert.deepEqual(before.blocked, []);
  assert.deepEqual(before.marked, ['08.1', '07.5', '08.2']);

  // The owner settles it on main: the pending edits land as written.
  r.put('.owner', '');
  const settle = r.node('plan/settle.mjs');
  assert.equal(settle.code, 0, settle.out);
  assert.equal(r.read('plan/pending/plot-maps.md'), null);
  assert.equal(r.git('status', '--porcelain'), '');
  for (const f of ['plan/README.md', 'plan/07-search.md']) assert.equal(r.read(f), view.read(f), f);
  assert.match(r.read('plan/README.md'), /\| 08 \| Maps \| \[08-maps\.md\]\(08-maps\.md\) \| planned \| 2 left \|/);
  assert.equal(r.read('plan/08-maps.md'), SPEC_08);

  // Settled, all three read the same plan they read before.
  const after = picture(r);
  assert.equal(after.check.code, 0, after.check.out);
  assert.equal(after.check.out, before.check.out);
  assert.deepEqual(after, { ...before, check: after.check });
});

// The same plot with its chunk for spec 07 as an `## Add`: no line of 07 quoted, numbered at settle, so a second
// branch adding to 07 at the same time never collides with it.
const PLOT_ADD = [
  '---',
  'date: 2000-10-21',
  '---',
  '## Add plan/07-search.md',
  '~~~ acceptance',
  '- **A?zip** Search by zip.',
  '~~~',
  '~~~ chunks',
  '- [ ] **07.?zip** Search by zip · S · closes A?zip · needs 07.3',
  '~~~',
  '',
  '## Edit plan/README.md',
  '~~~ old',
  '**Asap** (built before the table):',
  '',
  '- (none)',
  '~~~',
  '~~~ new',
  '**Asap** (built before the table):',
  '',
  '- **08.1** · the map first.',
  '~~~',
  '',
  '## Edit plan/README.md',
  '~~~ old',
  '| 07 | Search | [07-search.md](07-search.md) | in progress | 2 left |',
  '~~~',
  '~~~ new',
  '| 07 | Search | [07-search.md](07-search.md) | in progress | 2 left |',
  '| 08 | Maps | [08-maps.md](08-maps.md) | planned | 2 left |',
  '~~~',
  '',
].join('\n');

it('reads a plot that extends a spec with an ## Add as settled: plan-check, --mark with its placeholder, then settle', () => {
  const r = repo();
  r.put('plan/08-maps.md', SPEC_08);
  r.put('plan/pending/plot-maps.md', PLOT_ADD);
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'plan: plot maps');

  // Unsettled: 07 on disk is untouched, the view has 07.5, A3, the Measure line and "3 left".
  assert.equal(r.read('plan/07-search.md'), SPEC_07);
  const view = settledView(r.dir);
  assert.deepEqual(view.problems, []);
  assert.deepEqual(Object.fromEntries(view.numbers), { 'A?zip': 'A3', '07.?zip': '07.5' });
  assert.match(view.read('plan/07-search.md'), /^Measure: 3 open · 0 closed · next A4$/m);
  assert.match(view.read('plan/README.md'), /\| 07 \| Search \| \[07-search\.md\]\(07-search\.md\) \| in progress \| 3 left \|/);
  const check = r.node('plan-check.mjs', '--since', 'HEAD~1');
  assert.equal(check.code, 0, check.out);
  assert.match(check.out, /plan-check: green \(2 specs, 5 chunks\)/);
  const text = r.node('plan/order.mjs', '--mark', '07.?zip,08.1');
  assert.equal(text.code, 0, text.out);
  assert.deepEqual(text.out.split('\n').filter((l) => l.includes('<-- just plotted')).map((l) => l.trim().split(/\s+/)[1]), ['08.1', '07.5']);

  // Settled on main: the files read as the view did.
  r.put('.owner', '');
  const settle = r.node('plan/settle.mjs');
  assert.equal(settle.code, 0, settle.out);
  assert.match(settle.out, /07\.\?zip is 07\.5/);
  assert.equal(r.git('status', '--porcelain'), '');
  for (const f of ['plan/README.md', 'plan/07-search.md']) assert.equal(r.read(f), view.read(f), f);
  const after = r.node('plan-check.mjs', '--since', 'HEAD~1');
  assert.equal(after.code, 0, after.out);
});
