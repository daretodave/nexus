// The pre-push hook end to end: install-hooks.mjs arms it in a scratch clone with a bare origin, and a real `git push`
// runs push-policy.mjs. A contributor's push to main is refused, a branch and the claims ref go through, the owner's
// push to main goes through (from a worktree too), owner mode switched off is refused again, and a checkout without
// the script skips the step. Offline, but every case spawns git (the opt-in `scripts-git` gate leg). node:test, no deps.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';

const SCRIPTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// A git hook's GIT_DIR or GIT_WORK_TREE would point these commands at the real repository: never inherit them.
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_') && k !== 'NEXUS_CONTRIBUTOR' && k !== 'NEXUS_MAIN_BRANCH'));

function run(cwd, cmd, args, env = {}) {
  return spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...ENV, ...env } });
}
function git(cwd, ...args) {
  const res = run(cwd, 'git', args);
  if (res.status !== 0) throw new Error(`git ${args.join(' ')}: ${res.stderr}`);
  return res.stdout.trim();
}
const push = (cwd, ref, env) => run(cwd, 'git', ['push', '-q', 'origin', `HEAD:${ref}`], env);
const commit = (cwd) => git(cwd, 'commit', '-q', '--allow-empty', '-m', 'work');

let dir, work;
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-push-policy-'));
  const origin = path.join(dir, 'origin.git');
  git(dir, 'init', '-q', '--bare', '-b', 'main', origin);
  work = path.join(dir, 'work');
  git(dir, 'init', '-q', '-b', 'main', work);
  git(work, 'config', 'user.name', 'alex');
  git(work, 'config', 'user.email', 'alex@example.com');
  git(work, 'remote', 'add', 'origin', origin);
  for (const f of ['install-hooks.mjs', 'owner.mjs', 'claims-codec.mjs', 'git/push-policy.mjs']) {
    fs.mkdirSync(path.dirname(path.join(work, 'scripts', f)), { recursive: true });
    fs.copyFileSync(path.join(SCRIPTS, f), path.join(work, 'scripts', f));
  }
  fs.writeFileSync(path.join(work, '.gitignore'), '.owner\n.nexus/\n');
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'seed');
  git(work, 'push', '-q', 'origin', 'main');
  const res = run(work, 'node', ['scripts/install-hooks.mjs', '--only', 'pre-push']);
  assert.equal(res.status, 0, res.stderr);
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('the pre-push hook', () => {
  it("refuses a contributor's push to main, lets a branch and the claims ref through", () => {
    commit(work);
    const refused = push(work, 'main');
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /push-policy: only the owner's checkout pushes main/);
    assert.equal(push(work, 'refs/heads/next/16.3').status, 0);
    assert.equal(push(work, 'refs/heads/claims').status, 0);
  });

  it("lets the owner's checkout push main, and its worktree", () => {
    fs.writeFileSync(path.join(work, '.owner'), '');
    assert.equal(push(work, 'main').status, 0);
    const wt = path.join(dir, 'wt');
    git(work, 'worktree', 'add', '-q', '-b', 'feat', wt);
    commit(wt);
    const res = push(wt, 'main');
    assert.equal(res.status, 0, res.stderr);
  });

  it('refuses main again with owner mode switched off, or NEXUS_CONTRIBUTOR=1', () => {
    commit(work);
    assert.notEqual(push(work, 'main', { NEXUS_CONTRIBUTOR: '1' }).status, 0);
    fs.mkdirSync(path.join(work, '.nexus'), { recursive: true });
    fs.writeFileSync(path.join(work, '.nexus', 'local.json'), '{ "ownerMode": false }\n');
    assert.notEqual(push(work, 'main').status, 0);
    fs.rmSync(path.join(work, '.nexus'), { recursive: true, force: true });
  });

  it('a checkout without the script skips the step', () => {
    fs.rmSync(path.join(work, '.owner'));
    fs.rmSync(path.join(work, 'scripts', 'git'), { recursive: true, force: true });
    git(work, 'fetch', '-q', 'origin');
    git(work, 'merge', '-q', '--no-edit', 'origin/main'); // the worktree's push moved main
    commit(work);
    const res = push(work, 'main');
    assert.equal(res.status, 0, res.stderr);
  });
});
