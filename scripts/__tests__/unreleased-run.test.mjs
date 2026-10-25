// scripts/plan/unreleased.mjs (spec 56.8) against a scratch git repo: only packages/cli commits after the newest
// cli-v* tag reachable from the ref count; no tag means all of them; a ref git cannot resolve reads `unreadable`.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { main, unreleased } from '../plan/unreleased.mjs';

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-unreleased-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'tag.gpgsign', 'false');
  const commit = (file, subject) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.appendFileSync(path.join(dir, file), `${subject}\n`);
    git('add', '-A');
    git('commit', '-q', '--message', subject);
    return git('rev-parse', '--short', 'HEAD');
  };
  return { dir, git, commit };
}

describe('unreleased against a scratch repo', () => {
  it('lists every packages/cli commit when no cli-v* tag exists', () => {
    const { dir, commit } = repo();
    commit('packages/cli/a.js', 'feat: one');
    commit('README.md', 'docs: kit only');
    const r = unreleased({ cwd: dir });
    assert.equal(r.tag, null);
    assert.deepEqual(r.commits.map((c) => c.subject), ['feat: one']);
  });

  it('lists only packages/cli commits since the newest reachable cli-v* tag, newest first', () => {
    const { dir, git, commit } = repo();
    commit('packages/cli/a.js', 'feat: before');
    git('tag', 'cli-v0.1.0');
    commit('packages/cli/a.js', 'feat: released');
    git('tag', 'cli-v0.2.0');
    commit('skills/x.md', 'docs: not the cli');
    commit('packages/cli/src/b.js', 'fix(cli): the hello answers');
    const sha = commit('packages/cli/a.js', 'feat: the walk');
    git('tag', 'v9.9.9');
    const r = unreleased({ cwd: dir });
    assert.equal(r.tag, 'cli-v0.2.0');
    assert.deepEqual(r.commits.map((c) => c.subject), ['feat: the walk', 'fix(cli): the hello answers']);
    assert.equal(r.commits[0].sha, sha);
    const lines = [];
    assert.equal(main([], { cwd: dir, out: (l) => lines.push(l) }), 0);
    assert.equal(lines[0], 'unreleased CLI fixes: 2 since cli-v0.2.0');
  });

  it('ignores a cli-v* tag on a branch the ref never reached', () => {
    const { dir, git, commit } = repo();
    commit('packages/cli/a.js', 'feat: base');
    git('tag', 'cli-v0.1.0');
    git('switch', '-q', '-c', 'side');
    commit('packages/cli/a.js', 'feat: side only');
    git('tag', 'cli-v0.9.0');
    git('switch', '-q', 'main');
    commit('packages/cli/a.js', 'fix: on main');
    const r = unreleased({ cwd: dir, ref: 'main' });
    assert.equal(r.tag, 'cli-v0.1.0');
    assert.deepEqual(r.commits.map((c) => c.subject), ['fix: on main']);
  });

  it('says none once the tag is current, and --json carries the same', () => {
    const { dir, git, commit } = repo();
    commit('packages/cli/a.js', 'feat: one');
    git('tag', 'cli-v1.0.0');
    const lines = [];
    main(['--json'], { cwd: dir, out: (l) => lines.push(l) });
    assert.deepEqual(JSON.parse(lines[0]), { tag: 'cli-v1.0.0', ref: 'HEAD', commits: [] });
  });

  it('reads unreadable, exit 0, when the ref does not resolve', () => {
    const { dir, commit } = repo();
    commit('packages/cli/a.js', 'feat: one');
    const lines = [];
    assert.equal(main(['--ref', 'origin/main'], { cwd: dir, out: (l) => lines.push(l) }), 0);
    assert.match(lines[0], /unreadable/);
  });
});
