// settle.mjs run end to end in a scratch git repository in the temp folder (offline): only the owner settles, on
// main; a close leaves the plan with its archive line and commit range; one file's error skips that file; --no-commit
// stages for the gate. Slower than the pure suite (settle.test.mjs): every case spawns git. node:test, no deps.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SETTLE = fileURLToPath(new URL('../plan/settle.mjs', import.meta.url));
const OWNER_MJS = fileURLToPath(new URL('../owner.mjs', import.meta.url));

const SPEC = [
  '# 07 — Search',
  '',
  '## Acceptance',
  '',
  '- **A6** A query finds places',
  '  with a zip.',
  '- **A7** Near you',
  '- **A8** The index',
  '',
  '## Chunks',
  '',
  'Measure: 3 open · 5 closed · next A9',
  '',
  '- [ ] **07.3** Where an office is · S · closes A6 · needs —',
  '  - Contract first: the resolver.',
  '- [ ] **07.4** Near you · M · closes A7, A8 (partial) · needs 07.3',
  '- [ ] **07.5** The index · M · closes A8 · needs 07.4, 07.3',
  '',
].join('\n');

const README = [
  '# Roadmap',
  '',
  '## Lanes',
  '',
  '**Asap** (built before the table):',
  '',
  '- **07.3** · the resolver first.',
  '- 07.4, then 07.5: near me.',
  '',
  '**Held** (waits on the owner):',
  '',
  '- (none)',
  '',
  '## Specs',
  '',
  '| # | Initiative | Spec | Status | Progress |',
  '|---|---|---|---|---|',
  '| 07 | Search | [07-search.md](07-search.md) | in progress (07.3 to 07.5) | 3 left |',
  '',
].join('\n');

const FOOTGUNS = [
  '# Footguns',
  '',
  '## Open',
  '',
  '- **clock-edge** · a test reads the wall clock → pass the time in · seen 1× · last 2000-10-01 · open',
  '',
  '## Watch (seen once: searched before adding a line, not read before building)',
  '',
  '- **old-trap** · an old trap → a rule · seen 1× · last 2000-01-01 · watch',
  '',
  '## Guarded',
  '',
  '- **guarded-one** · a trap → a rule · seen 3× · last 2000-09-01 · guarded by scripts/x.test.mjs',
  '',
].join('\n');

const temps = [];
after(() => {
  for (const d of temps) fs.rmSync(d, { recursive: true, force: true });
});
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_') && k !== 'NEXUS_CONTRIBUTOR'));

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-settle-'));
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
  put('plan/07-search.md', SPEC);
  put('plan/README.md', README);
  put('plan/ARCHIVE.md', '# Archive\n\n');
  put('identity/footguns.md', FOOTGUNS);
  put('identity/decisions/2000.md', '# 2000\n\n- **D4** · 2000-01-01 · An old one.\n');
  put('.gitignore', '.owner\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  put('src.txt', 'the work\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'feat: the resolver');
  put('plan/pending/07.3.md', '---\nclose: 07.3\ndate: 2000-10-14\nsays: Where an office is\nfootguns: clock-edge\n---\n## Decisions\n- **D?resolver** · 2000-10-14 · The resolver is ours.\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'plan: close 07.3');
  const run = (...args) => {
    const r = spawnSync(process.execPath, [SETTLE, ...args], { cwd: dir, encoding: 'utf8', env: ENV });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  };
  const read = (rel) => (fs.existsSync(path.join(dir, rel)) ? fs.readFileSync(path.join(dir, rel), 'utf8') : null);
  return { dir, git, put, run, read };
}

describe('the settle run', () => {
  it('refuses an unknown argument before any write', () => {
    const r = repo();
    for (const args of [['--help'], ['now'], ['--dry-run', '--no-commit']]) {
      const res = r.run(...args);
      assert.equal(res.code, 64, args.join(' '));
      assert.match(res.out, /usage/);
    }
    assert.ok(r.read('plan/pending/07.3.md'));
  });

  it('is the owner\'s: a contributor\'s checkout or another branch is refused, a dry run is anyone\'s', () => {
    const r = repo();
    const none = r.run();
    assert.equal(none.code, 3);
    assert.match(none.out, /only the owner settles/);
    const dry = r.run('--dry-run');
    assert.equal(dry.code, 0);
    assert.match(dry.out, /would write plan\/07-search\.md/);
    r.put('.owner', '');
    r.git('checkout', '-q', '-b', 'next/07.3');
    const branch = r.run();
    assert.equal(branch.code, 3);
    assert.match(branch.out, /runs on main/);
    r.git('checkout', '-q', 'main');
    r.put('.nexus/local.json', '{ "ownerMode": false }');
    assert.equal(r.run().code, 3);
  });

  it('settles a close: the spec, the roadmap, the archive with its commit, the decision and the footgun', () => {
    const r = repo();
    r.put('.owner', '');
    const work = r.git('log', '-1', '--format=%h', 'HEAD~1').slice(0, 7);
    const res = r.run();
    assert.equal(res.code, 0, res.out);
    assert.match(r.git('log', '-1', '--format=%s'), /^plan: settle 07\.3$/);
    assert.equal(r.read('plan/pending/07.3.md'), null);
    assert.ok(!r.read('plan/07-search.md').includes('**07.3**'));
    assert.match(r.read('plan/README.md'), /\| 2 left \|/);
    assert.ok(!r.read('plan/README.md').includes('- **07.3**'));
    assert.match(r.read('plan/ARCHIVE.md'), new RegExp(`^- 2000-10-14 · 07\\.3 · Where an office is · \\w{8}\\.\\.${work}\\w*$`, 'm'));
    assert.match(r.read('identity/decisions/2000.md'), /- \*\*D5\*\* · 2000-10-14 · The resolver is ours\./);
    assert.match(r.read('identity/footguns.md'), /clock-edge.* seen 2× · last 2000-10-14 · open/);
    assert.match(r.read('plan/99-guard-the-traps.md'), /\*\*99\.1\*\* Automate footgun `clock-edge`/);
    assert.match(r.read('plan/README.md'), /- \*\*99\.1\*\* · automate footgun `clock-edge`/);
    assert.match(r.read('plan/README.md'), /\[99-guard-the-traps\.md\]\(99-guard-the-traps\.md\) \| planned \(\*\*Asap\*\*: each chunk\) \| 1 left \|/);
    assert.equal(r.git('status', '--porcelain'), '');
    assert.equal(r.run().code, 0);
  });

  it('with --no-commit, stages the edits and prints the commit to make after the gate', () => {
    const r = repo();
    r.put('.owner', '');
    const res = r.run('--no-commit');
    assert.equal(res.code, 0, res.out);
    assert.match(res.out, /staged, not committed \(--no-commit\)/);
    assert.match(res.out, /git commit -q -m "plan: settle 07\.3" -- /);
    assert.match(r.git('log', '-1', '--format=%s'), /^plan: close 07\.3$/);
    assert.match(r.git('diff', '--cached', '--name-only'), /plan\/ARCHIVE\.md/);
  });

  it('skips a file it cannot settle, saying why, and settles the rest', () => {
    const r = repo();
    r.put('.owner', '');
    r.put('plan/pending/zz-bad.md', '---\ndate: 2000-10-13\n---\n## Edit plan/README.md\n~~~ old\nno such text\n~~~\n~~~ new\nx\n~~~\n');
    r.git('add', '-A');
    r.git('commit', '-q', '-m', 'plan: a bad edit');
    const res = r.run();
    assert.equal(res.code, 1);
    assert.match(res.out, /skipped .*the old text isn't there/);
    assert.ok(r.read('plan/pending/zz-bad.md'));
    assert.equal(r.read('plan/pending/07.3.md'), null);
  });

  it('refuses footguns in a repo with no footgun list, settling nothing of that file', () => {
    const r = repo();
    r.put('.owner', '');
    r.git('rm', '-q', 'identity/footguns.md');
    r.git('commit', '-q', '-m', 'no list');
    const res = r.run();
    assert.equal(res.code, 1);
    assert.match(res.out, /no identity\/footguns\.md to settle its footguns into/);
  });

  it('archives the right commits: an old archive write bounds the run; work and its close in one commit count', async () => {
    const r = repo();
    const { commitRange } = await import(pathToFileURL(SETTLE).href);
    // An unrelated commit before the work, then a close written straight into the archive (the v1 way).
    r.put('old.txt', 'old\n');
    r.git('add', '-A');
    r.git('commit', '-q', '-m', 'feat: old work');
    r.put('plan/ARCHIVE.md', '# Archive\n\n- 2000-01-01 · 01 · an old close · abc\n');
    r.git('add', '-A');
    r.git('commit', '-q', '-m', 'plan: archive 01');
    r.put('src.txt', 'more work\n');
    r.put('plan/pending/07.4.md', '---\nclose: 07.4\ndate: 2000-10-15\nsays: One commit\n---\n');
    r.git('add', '-A');
    r.git('commit', '-q', '-m', 'feat: work and close at once');
    const one = r.git('rev-parse', 'HEAD').slice(0, 8);
    assert.equal(commitRange(r.dir, 'plan/pending/07.4.md'), `${one}..${one}`);
  });

  it('archives each close of a package pull request with its own commits', async () => {
    const r = repo();
    const { commitRange } = await import(pathToFileURL(SETTLE).href);
    r.git('checkout', '-q', '-b', 'pkg/s1');
    const step = (file, text, msg) => {
      r.put(file, text);
      r.git('add', '-A');
      r.git('commit', '-q', '-m', msg);
      return r.git('rev-parse', 'HEAD').slice(0, 8);
    };
    const a1 = step('a.txt', 'a\n', 'feat: a');
    step('plan/pending/07.4.md', '---\nclose: 07.4\ndate: 2000-10-15\nsays: A\n---\n', 'plan: close 07.4');
    const b1 = step('b.txt', 'b\n', 'feat: b');
    step('plan/pending/07.5.md', '---\nclose: 07.5\ndate: 2000-10-15\nsays: B\n---\n', 'plan: close 07.5');
    const fix = step('b.txt', 'b fixed\n', 'fix: review');
    r.git('checkout', '-q', 'main');
    r.git('merge', '-q', '--no-ff', '-m', 'Merge pkg/s1', 'pkg/s1');
    assert.equal(commitRange(r.dir, 'plan/pending/07.4.md'), `${a1}..${a1}`);
    assert.equal(commitRange(r.dir, 'plan/pending/07.5.md'), `${b1}..${fix}`);
  });

  it('sees a worktree of the owner\'s checkout as the owner\'s', async () => {
    const r = repo();
    r.put('.owner', '');
    const wt = path.join(r.dir, '..', `${path.basename(r.dir)}-wt`);
    temps.push(wt);
    r.git('worktree', 'add', '-q', '--detach', wt, 'HEAD');
    const { isOwner } = await import(pathToFileURL(OWNER_MJS).href);
    assert.equal(isOwner(wt, {}), true);
    assert.equal(isOwner(wt, { NEXUS_CONTRIBUTOR: '1' }), false);
    const res = spawnSync(process.execPath, [SETTLE], { cwd: wt, encoding: 'utf8', env: ENV });
    assert.equal(res.status, 0, `${res.stdout}${res.stderr}`);
    // A committed .owner counts for no one.
    r.git('add', '-f', '.owner');
    assert.equal(isOwner(r.dir, {}), false);
  });
});

describe('a settle run over several ## Add files at once', () => {
  it('numbers them in date-then-name order, keeps the counts, and commits them in one settle', () => {
    const r = repo();
    r.put('.owner', '');
    r.put('plan/ARCHIVE.md', '# Archive\n\n- 2000-10-12 · 07.9 · Search on the web · abc12345..def67890\n');
    for (const s of ['c', 'a', 'b']) {
      const add = ['---', 'date: 2000-10-21', '---', '## Add plan/07-search.md', '~~~ acceptance', `- **A?${s}** Bug ${s} works.`, '~~~', '~~~ chunks', `- [ ] **07.?${s}** Bug ${s} · S · closes A?${s} · needs —`, '~~~', ''];
      r.put(`plan/pending/plot-${s}.md`, add.join('\n'));
    }
    // The close already pending settles first (an older date); these three follow it.
    r.git('rm', '-q', 'plan/pending/07.3.md');
    r.git('add', '-A');
    r.git('commit', '-q', '-m', 'plan: plot three');
    const res = r.run();
    assert.equal(res.code, 0, res.out);
    assert.match(res.out, /settle: 07\.\?a is 07\.10/);
    const after = r.read('plan/07-search.md');
    assert.deepEqual([...after.matchAll(/\*\*(07\.\d+)\*\* Bug (\w) · S · closes (A\d+)/g)].map((m) => `${m[1]}=${m[2]}/${m[3]}`), ['07.10=a/A9', '07.11=b/A10', '07.12=c/A11']);
    assert.match(after, /^Measure: 6 open · 5 closed · next A12$/m);
    assert.match(r.read('plan/README.md'), /\| 6 left \|/);
    assert.equal(r.git('status', '--porcelain'), '');
    assert.equal(r.git('log', '-1', '--format=%s'), 'plan: settle plot-a, plot-b, plot-c');
  });

  it("writes the numbers into the file's own notes and decisions", () => {
    const r = repo();
    r.put('.owner', '');
    r.put('plan/notes.md', '# Notes\n\n## Inbox\n\n');
    r.git('rm', '-q', 'plan/pending/07.3.md');
    const add = ['---', 'date: 2000-10-21', '---', '## Add plan/07-search.md', '~~~ chunks', '- [ ] **07.?d** D · S · needs —', '~~~', '## Notes', '- 07.?d waits on the vendor.', '## Decisions', '- **D?vendor** · 2000-10-21 · 07.?d uses the vendor.', ''];
    r.put('plan/pending/plot-d.md', add.join('\n'));
    r.git('add', '-A');
    r.git('commit', '-q', '-m', 'plan: plot d');
    const res = r.run();
    assert.equal(res.code, 0, res.out);
    assert.match(r.read('plan/notes.md'), /^- 07\.6 waits on the vendor\.$/m);
    assert.match(r.read('identity/decisions/2000.md'), /^- \*\*D5\*\* · 2000-10-21 · 07\.6 uses the vendor\.$/m);
    assert.doesNotMatch(r.read('plan/07-search.md'), /\?d/);
  });
});

describe('a plot and the close of the chunk it adds, in one settle run', () => {
  /** A `/plot … and do` run: the plot adds 07.?fix (07.6) with an Asap lane entry, and the build closes 07.6. */
  function plotAndDo(r, { plotDate, closeDate }) {
    r.put('.owner', '');
    r.git('rm', '-q', 'plan/pending/07.3.md');
    const plot = ['---', `date: ${plotDate}`, '---', '## Add plan/07-search.md', '~~~ acceptance', '- **A?fix** The fix works.', '~~~', '~~~ chunks', '- [ ] **07.?fix** The fix · S · closes A?fix · needs —', '~~~', '## Edit plan/README.md', '~~~ old', '- **07.3** · the resolver first.', '~~~', '~~~ new', '- **07.3** · the resolver first.', '- **07.?fix** · the fix.', '~~~', ''];
    r.put('plan/pending/plot-fix.md', plot.join('\n'));
    r.git('add', '-A');
    r.git('commit', '-q', '-m', 'plan: plot the fix');
    r.put('fix.txt', 'fixed\n');
    r.git('add', '-A');
    r.git('commit', '-q', '-m', 'fix: the fix');
    r.put('plan/pending/07.6.md', `---\nclose: 07.6\ndate: ${closeDate}\nsays: The fix works\n---\n`);
    r.git('add', '-A');
    r.git('commit', '-q', '-m', 'plan: close 07.6');
  }

  const settledClean = (r, res) => {
    assert.equal(res.code, 0, res.out);
    assert.doesNotMatch(res.out, /skipped/);
    const spec = r.read('plan/07-search.md');
    assert.doesNotMatch(spec, /07\.6|A9\b|\?fix/);
    assert.match(spec, /^Measure: 3 open · 6 closed · next A10$/m);
    const readme = r.read('plan/README.md');
    assert.match(readme, /\| 3 left \|/);
    assert.doesNotMatch(readme, /07\.6|\?fix/);
    assert.match(r.read('plan/ARCHIVE.md'), / · 07\.6 · The fix works · /);
    assert.equal(r.git('status', '--porcelain'), '');
  };

  it('settles the plot first on the same date (07.6.md sorts before plot-fix.md by name)', () => {
    const r = repo();
    plotAndDo(r, { plotDate: '2000-10-21', closeDate: '2000-10-21' });
    settledClean(r, r.run());
    assert.equal(r.git('log', '-1', '--format=%s'), 'plan: settle plot-fix, 07.6');
  });

  it('holds a close dated before the plot until the plot numbers its chunk', () => {
    const r = repo();
    plotAndDo(r, { plotDate: '2000-10-22', closeDate: '2000-10-21' });
    settledClean(r, r.run());
    assert.equal(r.git('log', '-1', '--format=%s'), 'plan: settle plot-fix, 07.6');
  });

  it('still skips a close no spec lists once nothing left to settle adds it', () => {
    const r = repo();
    r.put('.owner', '');
    r.put('plan/pending/07.8.md', '---\nclose: 07.8\ndate: 2000-10-13\nsays: Nothing\n---\n');
    r.git('add', '-A');
    r.git('commit', '-q', '-m', 'plan: close 07.8');
    const res = r.run();
    assert.equal(res.code, 1, res.out);
    assert.match(res.out, /settle: skipped plan\/pending\/07\.8\.md: plan\/07-search\.md doesn't list 07\.8/);
    assert.equal(r.git('log', '-1', '--format=%s'), 'plan: settle 07.3');
  });
});
