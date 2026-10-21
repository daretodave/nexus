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
  '- **clock-edge** · a test reads the wall clock → pass the time in · seen 1× · last 2026-10-01 · open',
  '',
  '## Watch (seen once: searched before adding a line, not read before building)',
  '',
  '- **old-trap** · an old trap → a rule · seen 1× · last 2026-01-01 · watch',
  '',
  '## Guarded',
  '',
  '- **guarded-one** · a trap → a rule · seen 3× · last 2026-09-01 · guarded by scripts/x.test.mjs',
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
  put('identity/decisions/2026.md', '# 2026\n\n- **D4** · 2026-01-01 · An old one.\n');
  put('.gitignore', '.owner\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  put('src.txt', 'the work\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'feat: the resolver');
  put('plan/pending/07.3.md', '---\nclose: 07.3\ndate: 2026-10-14\nsays: Where an office is\nfootguns: clock-edge\n---\n## Decisions\n- **D?resolver** · 2026-10-14 · The resolver is ours.\n');
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
    assert.match(r.read('plan/ARCHIVE.md'), new RegExp(`^- 2026-10-14 · 07\\.3 · Where an office is · \\w{8}\\.\\.${work}\\w*$`, 'm'));
    assert.match(r.read('identity/decisions/2026.md'), /- \*\*D5\*\* · 2026-10-14 · The resolver is ours\./);
    assert.match(r.read('identity/footguns.md'), /clock-edge.* seen 2× · last 2026-10-14 · open/);
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
    r.put('plan/pending/zz-bad.md', '---\ndate: 2026-10-13\n---\n## Edit plan/README.md\n~~~ old\nno such text\n~~~\n~~~ new\nx\n~~~\n');
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
  });
});
