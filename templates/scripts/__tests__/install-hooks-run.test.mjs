// The installed hooks end to end: git hands a hook GIT_DIR (a worktree's own git dir), GIT_INDEX_FILE and friends,
// and a gate that makes scratch repos (`git init --bare` for a fake origin) would inherit them and write into the
// real repository (its core.bare set true: the checkout broken). Every hook body unsets them first; the hook's cwd
// is already the worktree root, so git finds the same repo and index again. Both installers are checked: the
// template adopters copy and nexus's own. Spawns git (the opt-in `scripts-git` gate leg). node:test, no deps.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

const SCRIPTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(SCRIPTS, '..', '..');
const INSTALLERS = { template: path.join(SCRIPTS, 'install-hooks.mjs'), nexus: path.join(ROOT, 'scripts', 'install-hooks.mjs') };
const UNSET = 'unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_PREFIX';
// This test's own git calls never inherit a hook's GIT_* (it may itself run under one).
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));

function run(cwd, cmd, args) {
  return spawnSync(cmd, args, { cwd, encoding: 'utf8', env: ENV });
}
function git(cwd, ...args) {
  const res = run(cwd, 'git', args);
  if (res.status !== 0) throw new Error(`git ${args.join(' ')}: ${res.stderr}`);
  return res.stdout.trim();
}

const dirs = [];
after(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });

/** A repo whose gate (`pnpm verify` / `node scripts/verify.mjs`) makes a bare scratch repo, as a gate's tests do. */
function fixture(installer) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-install-hooks-'));
  dirs.push(dir);
  const work = path.join(dir, 'work');
  git(dir, 'init', '-q', '-b', 'main', work);
  git(work, 'config', 'user.name', 'alex');
  git(work, 'config', 'user.email', 'alex@example.com');
  const gate = [
    "import { execFileSync } from 'node:child_process'",
    "import fs from 'node:fs'",
    "import os from 'node:os'",
    "import path from 'node:path'",
    "const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-gate-scratch-'))",
    "fs.mkdirSync(path.join(d, 'origin.git'))",
    "execFileSync('git', ['init', '-q', '--bare'], { cwd: path.join(d, 'origin.git') })",
    "fs.rmSync(d, { recursive: true, force: true })",
    '',
  ].join('\n');
  fs.mkdirSync(path.join(work, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(work, 'scripts', 'verify.mjs'), gate);
  fs.writeFileSync(path.join(work, 'package.json'), JSON.stringify({ name: 'x', private: true, scripts: { verify: 'node scripts/verify.mjs' } }));
  fs.copyFileSync(installer, path.join(work, 'scripts', 'install-hooks.mjs'));
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '--no-verify', '-m', 'seed');
  const res = run(work, 'node', ['scripts/install-hooks.mjs', '--only', 'pre-commit']);
  assert.equal(res.status, 0, res.stderr);
  return { dir, work, hook: path.join(work, '.git', 'hooks', 'pre-commit') };
}

const bare = (work) => run(work, 'git', ['config', '--get', 'core.bare']).stdout.trim();

for (const [name, installer] of Object.entries(INSTALLERS)) {
  describe(`the ${name} installer's hooks`, () => {
    it('every hook body first unsets the git variables a hook inherits', () => {
      const { work } = fixture(installer);
      for (const h of ['pre-commit', 'pre-push']) {
        assert.equal(run(work, 'node', ['scripts/install-hooks.mjs', '--only', h]).status, 0);
        const body = fs.readFileSync(path.join(work, '.git', 'hooks', h), 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
        assert.equal(body[0], UNSET, `${h} starts with the unset`);
      }
    });

    it('a commit from a linked worktree runs the gate without touching the main repo\'s config', () => {
      const { dir, work } = fixture(installer);
      // pnpm may be absent: the template's `pnpm verify` falls back to the same gate through a shim on PATH.
      const before = bare(work);
      const wt = path.join(dir, 'wt');
      git(work, 'worktree', 'add', '-q', '--detach', wt);
      fs.writeFileSync(path.join(wt, 'a.txt'), 'a\n');
      git(wt, 'add', 'a.txt');
      const shim = path.join(dir, 'bin');
      fs.mkdirSync(shim);
      fs.writeFileSync(path.join(shim, 'pnpm'), '#!/bin/sh\nexec node scripts/verify.mjs\n', { mode: 0o755 });
      fs.writeFileSync(path.join(shim, 'pnpm.cmd'), '@node scripts\\verify.mjs\r\n');
      const env = { ...ENV, PATH: `${shim}${path.delimiter}${ENV.PATH || ENV.Path || ''}` };
      delete env.Path;
      const c = spawnSync('git', ['commit', '-q', '-m', 'work'], { cwd: wt, encoding: 'utf8', env });
      assert.equal(c.status, 0, c.stderr);
      assert.equal(bare(work), before, 'core.bare unchanged');
      assert.notEqual(bare(work), 'true');
      assert.equal(git(work, 'rev-parse', '--is-inside-work-tree'), 'true', 'the main checkout still works');
      assert.equal(git(wt, 'log', '-1', '--format=%s'), 'work');
    });
  });
}
