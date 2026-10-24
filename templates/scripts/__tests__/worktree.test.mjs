// worktree.mjs: a link out of a worktree keeps what it points at, a worktree holding work git doesn't or a locked one
// stays whole, a branch main holds goes and one it doesn't stays, neither the main checkout nor a stranger path is a
// target, and `list` sorts worktrees into safe, holds work and locked, saying whether a lock's pid lives. Each case
// builds a scratch repository in the temp folder (offline, but it spawns git: the opt-in scripts-git leg).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { finish, parseWorktrees, pidAlive } from '../worktree.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'worktree.mjs');
const KEPT = "the owner's file";
// A git hook's GIT_DIR or GIT_WORK_TREE would point these commands at the real repository: never inherit them.
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
let dir, repo, outside;

function git(cwd, ...args) {
  const res = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: ENV });
  if (res.status !== 0) throw new Error(`git ${args.join(' ')}: ${res.stderr}`);
  return res.stdout.trim();
}

function run(args) {
  const res = spawnSync(process.execPath, [SCRIPT, ...args, '--repo', repo], { cwd: dir, encoding: 'utf8', env: ENV });
  return { code: res.status, out: res.stdout, err: res.stderr };
}

/** A linked worktree on a new branch whose ignored node_modules holds a link out and one back into the worktree. */
function worktree(name, branch) {
  const wt = path.join(dir, name);
  git(repo, 'worktree', 'add', '-q', '-b', branch, wt);
  fs.mkdirSync(path.join(wt, 'node_modules', '@x'), { recursive: true });
  const type = process.platform === 'win32' ? 'junction' : 'dir';
  fs.symlinkSync(outside, path.join(wt, 'node_modules', '@x', 'precious'), type);
  fs.symlinkSync(wt, path.join(wt, 'node_modules', 'loop'), type);
  return wt;
}

const branchExists = (b) => spawnSync('git', ['-C', repo, 'rev-parse', '--verify', '--quiet', `refs/heads/${b}`], { env: ENV }).status === 0;
const kept = () => fs.readFileSync(path.join(outside, 'keep.txt'), 'utf8');

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-worktree-'));
  repo = path.join(dir, 'repo');
  outside = path.join(dir, 'precious');
  fs.mkdirSync(repo);
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'keep.txt'), KEPT);
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 'dev@example.invalid');
  git(repo, 'config', 'user.name', 'Dev');
  git(repo, 'config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(repo, '.gitignore'), 'node_modules/\n');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'init');
});

afterEach(() => {
  if (fs.existsSync(dir)) finish(dir); // a failed case can leave a link out: unlink before deleting here too
});

describe('worktree.mjs', () => {
  it('cuts a worktree on a new branch at the resolved ref, no shell assignment needed', () => {
    const target = path.join(dir, 'wt-cut');
    const sha = git(repo, 'rev-parse', 'main');
    const res = run(['cut', target, '--ref', 'main', '--branch', 'next/09.1']);
    assert.equal(res.code, 0, res.err);
    assert.match(res.out, new RegExp(`cut from main \\(${sha.slice(0, 10)}\\) on branch next/09\\.1`));
    assert.equal(git(target, 'rev-parse', 'HEAD'), sha);
    assert.ok(branchExists('next/09.1'));
  });

  it('cuts a detached worktree when no branch is given', () => {
    const target = path.join(dir, 'wt-cut-detached');
    const res = run(['cut', target, '--ref', 'main']);
    assert.equal(res.code, 0, res.err);
    assert.match(res.out, /detached\r?\n$/);
    assert.equal(git(target, 'rev-parse', '--abbrev-ref', 'HEAD'), 'HEAD');
  });

  it('refuses a ref that does not resolve, and a missing --ref', () => {
    const bad = run(['cut', path.join(dir, 'wt-nope'), '--ref', 'not-a-ref']);
    assert.equal(bad.code, 1);
    assert.match(bad.err, /not-a-ref: doesn't resolve/);
    assert.equal(run(['cut', path.join(dir, 'wt-nope')]).code, 2);
  });

  it('parses the porcelain listing, the main checkout first', () => {
    const rows = parseWorktrees('worktree /r\nHEAD abc\nbranch refs/heads/main\n\nworktree /r-wt/7\nHEAD def\ndetached\nlocked by pid 9\n');
    assert.deepEqual(rows.map((r) => [r.path, r.branch, r.locked]), [['/r', 'main', false], ['/r-wt/7', undefined, true]]);
    assert.deepEqual(rows.map((r) => [r.lockReason, r.pid]), [[null, null], ['by pid 9', 9]]);
  });

  it('reads a pid out of the usual lock reasons, and none from a bare lock', () => {
    const lock = (reason) => parseWorktrees(`worktree /r\n\nworktree /w\nlocked${reason === null ? '' : ` ${reason}`}\n`)[1];
    assert.equal(lock('claude agent agent-a1 (pid 4242)').pid, 4242);
    assert.equal(lock('pid=77').pid, 77);
    assert.equal(lock('PID: 31').pid, 31);
    assert.equal(lock('moving it by hand').pid, null);
    assert.equal(lock(null).pid, null);
  });

  it('tells a live pid from a dead one', () => {
    assert.equal(pidAlive(process.pid), true);
    const gone = spawnSync(process.execPath, ['-e', '0']).pid;
    assert.equal(pidAlive(gone), false);
    assert.equal(pidAlive(null), null);
  });

  it('unlinks every link before anything deletes, so a link out keeps its target', () => {
    const wt = worktree('wt-one', 'next/01.1');
    assert.equal(fs.readFileSync(path.join(wt, 'node_modules', '@x', 'precious', 'keep.txt'), 'utf8'), KEPT);
    const res = run(['close', wt]);
    assert.equal(res.code, 0, res.err);
    assert.match(res.out, /unlinked 2 links; removed; deleted branch next\/01\.1/);
    assert.equal(fs.existsSync(wt), false);
    assert.equal(kept(), KEPT);
  });

  it('closes a worktree holding a committed symlink (unlinked, yet not called modified)', (t) => {
    git(repo, 'config', 'core.symlinks', 'true');
    try {
      fs.symlinkSync('a.txt', path.join(repo, 'link'), 'file');
    } catch {
      return t.skip('this machine cannot make a file symlink');
    }
    git(repo, 'add', 'link');
    git(repo, 'commit', '-q', '-m', 'a committed symlink');
    const wt = worktree('wt-link', 'next/01.5');
    assert.ok(fs.lstatSync(path.join(wt, 'link')).isSymbolicLink());
    const res = run(['close', wt]);
    assert.equal(res.code, 0, res.err);
    assert.match(res.out, /unlinked 3 links; removed; deleted branch next\/01\.5/);
    assert.equal(fs.existsSync(wt), false);
    assert.equal(kept(), KEPT);
  });

  it('keeps a branch main does not hold, and names it', () => {
    const wt = worktree('wt-two', 'next/01.2');
    fs.writeFileSync(path.join(wt, 'b.txt'), 'b\n');
    git(wt, 'add', 'b.txt');
    git(wt, 'commit', '-q', '-m', 'work');
    const res = run(['close', wt]);
    assert.equal(res.code, 0, res.err);
    assert.match(res.out, /kept branch next\/01\.2: main doesn't hold it/);
    assert.ok(branchExists('next/01.2'));
  });

  it('refuses a worktree holding uncommitted work, a locked one, the main checkout and a stranger', () => {
    const dirty = worktree('wt-dirty', 'next/01.3');
    fs.writeFileSync(path.join(dirty, 'wip.txt'), 'wip\n');
    const locked = worktree('wt-locked', 'next/01.4');
    git(repo, 'worktree', 'lock', locked);
    const res = run(['close', dirty, locked, repo, path.join(dir, 'nowhere')]);
    assert.equal(res.code, 1);
    assert.match(res.err, /holds work git doesn't/);
    assert.match(res.err, /locked/);
    assert.match(res.err, /that's the main checkout/);
    assert.match(res.err, /not a worktree of/);
    assert.ok(fs.existsSync(path.join(dirty, 'wip.txt')));
    assert.ok(fs.existsSync(locked));
    assert.equal(kept(), KEPT);
  });

  it('lists each linked worktree with a verdict', () => {
    worktree('wt-safe', 'next/02.1');
    const busy = worktree('wt-busy', 'next/02.2');
    fs.writeFileSync(path.join(busy, 'wip.txt'), 'wip\n');
    const res = run(['list', '--json']);
    assert.equal(res.code, 0, res.err);
    const rows = JSON.parse(res.out);
    assert.deepEqual(rows.map((r) => [r.branch, r.verdict]).sort(), [['next/02.1', 'safe'], ['next/02.2', 'holds work']]);
  });

  it("says whether a locked worktree's pid still lives, in the text and the --json", () => {
    const gone = spawnSync(process.execPath, ['-e', '0']).pid;
    git(repo, 'worktree', 'lock', '--reason', `claude agent agent-x (pid ${gone})`, worktree('wt-dead', 'next/03.1'));
    git(repo, 'worktree', 'lock', '--reason', `claude agent agent-y (pid ${process.pid})`, worktree('wt-live', 'next/03.2'));
    git(repo, 'worktree', 'lock', worktree('wt-bare', 'next/03.3'));
    const rows = JSON.parse(run(['list', '--json']).out);
    assert.deepEqual(
      rows.map((r) => [r.branch, r.verdict, r.pid, r.pidAlive]).sort(),
      [['next/03.1', 'locked', gone, false], ['next/03.2', 'locked', process.pid, true], ['next/03.3', 'locked', null, null]],
    );
    const res = run(['list']);
    assert.equal(res.code, 0, res.err);
    assert.match(res.out, new RegExp(`next/03\\.1 .*· locked by pid ${gone} \\(dead\\)`));
    assert.match(res.out, new RegExp(`next/03\\.2 .*· locked by pid ${process.pid} \\(alive\\)`));
    assert.match(res.out, /next\/03\.3 .*· locked\r?$/m);
  });

  it('prints the usage for a bad call', () => {
    assert.equal(run(['remove', 'x']).code, 2);
  });
});
