// cloud/tick.mjs over git: pick claims the first ready chunk for this run's session as the contributor nexus-cloud
// (two runs take two chunks), release gives it back, and fence refuses a branch that edits a shared plan file. Each
// case builds scratch repositories in the temp folder: offline, but every case spawns git (the opt-in `scripts-git`
// gate leg). node:test, no deps.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import { fetchClaims, parse } from '../claims.mjs';
import { main } from '../cloud/tick.mjs';

// A runner, not a Claude Code session: drop this shell's session vars too, or claims would ask for its hook marker.
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_') && k !== 'CLAUDECODE' && k !== 'CLAUDE_CODE_SESSION_ID'));
for (const k of Object.keys(process.env)) if (k.startsWith('GIT_')) delete process.env[k];
const dirs = [];
after(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

function git(cwd, ...args) {
  const res = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: ENV });
  if (res.status !== 0) throw new Error(`git ${args.join(' ')}: ${res.stderr}`);
  return res.stdout.trim();
}

const README = [
  '# roadmap', '', '## Lanes', '', '**Asap** (first):', '', '- (none)', '', '**Held** (waits):', '', '- (none)', '', '## Specs', '',
  '| # | Initiative | Spec | Status | Progress |', '|---|---|---|---|---|', '| 16 | Search | [16-search.md](16-search.md) | planned | 3 left |', '',
].join('\n');
const SPEC = ['# 16 · Search', '', '## Acceptance', '', '- **A1** a', '- **A2** b', '- **A3** c', '', '## Chunks', 'Measure: 3 open · 0 closed · next A4', '',
  '- [ ] **16.1** a · S · closes A1 · needs —', '- [ ] **16.2** b · S · closes A2 · needs —', '- [ ] **16.3** c · S · closes A3 · needs 16.1', ''].join('\n');

let dir, repo, out;
const run = async (session, ...argv) => {
  const logs = [];
  const log = console.log;
  console.log = (...a) => logs.push(a.join(' '));
  try {
    const env = { ...ENV, GITHUB_ACTIONS: 'true', NEXUS_SESSION: session, GITHUB_OUTPUT: out, GH_TOKEN: '', PATH: ENV.PATH };
    return { code: await main(argv, { cwd: repo, env }), logs };
  } finally {
    console.log = log;
  }
};
const lastId = () => (fs.readFileSync(out, 'utf8').trim().split(/\r?\n/).at(-1) ?? '').replace(/^id=/, '');

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-tick-'));
  dirs.push(dir);
  const origin = path.join(dir, 'origin.git');
  git(dir, 'init', '-q', '--bare', '-b', 'main', origin);
  const seed = path.join(dir, 'seed');
  git(dir, 'init', '-q', '-b', 'main', seed);
  fs.mkdirSync(path.join(seed, 'plan', 'pending'), { recursive: true });
  fs.writeFileSync(path.join(seed, 'plan', 'README.md'), README);
  fs.writeFileSync(path.join(seed, 'plan', '16-search.md'), SPEC);
  fs.writeFileSync(path.join(seed, 'plan', 'pending', 'README.md'), '# pending\n');
  git(seed, 'add', '-A');
  git(seed, '-c', 'user.name=s', '-c', 'user.email=s@example.com', 'commit', '-q', '-m', 'seed');
  git(seed, 'push', '-q', origin, 'main');
  repo = path.join(dir, 'runner');
  git(dir, 'clone', '-q', origin, repo);
  git(repo, 'config', 'core.hooksPath', path.join(dir, 'no-hooks'));
  out = path.join(dir, 'github-output');
  fs.writeFileSync(out, '');
});

describe('a pull-request-mode tick over git', () => {
  it('claims the first ready chunk for the run, then the next for another run, then releases', async () => {
    assert.equal((await run('cloud-1', 'pick')).code, 0);
    assert.equal(lastId(), '16.1');
    const c = parse(fetchClaims(repo).map['16.1']);
    assert.equal(c.who, 'nexus-cloud');
    assert.equal(c.session, 'cloud-1');
    assert.equal(git(repo, 'config', 'user.name'), 'nexus-cloud');

    assert.equal((await run('cloud-2', 'pick')).code, 0);
    assert.equal(lastId(), '16.2', '16.1 is the first run\'s, and 16.3 needs it');

    assert.equal((await run('cloud-1', 'release', '16.1')).code, 0);
    assert.equal(fetchClaims(repo).map['16.1'], undefined);
    assert.ok(fetchClaims(repo).map['16.2'], 'the other run keeps its claim');
  });

  it('claims an asked-for chunk, and refuses a bad id', async () => {
    assert.equal((await run('cloud-3', 'pick', '--chunk', '16.3')).code, 0);
    assert.equal(lastId(), '16.3');
    await assert.rejects(run('cloud-3', 'pick', '--chunk', 'nope'), /not a chunk id/);
  });

  it('fences a branch that edits a shared plan file, and passes one with a pending close', async () => {
    git(repo, 'switch', '-q', '-c', 'nexus/1');
    git(repo, 'config', 'user.name', 't');
    git(repo, 'config', 'user.email', 't@example.com');
    fs.writeFileSync(path.join(repo, 'plan', 'pending', '16.1.md'), '---\nclose: 16.1\ndate: 2026-10-20\nsays: a\n---\n');
    fs.writeFileSync(path.join(repo, 'src.txt'), 'work\n');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'feat: a');
    const err = console.error;
    console.error = () => {};
    try {
      assert.equal((await run('cloud-1', 'fence', 'origin/main', 'nexus/1')).code, 0);
      fs.appendFileSync(path.join(repo, 'plan', 'README.md'), '\nedited\n');
      git(repo, 'commit', '-q', '-am', 'plan: edit the roadmap');
      assert.equal((await run('cloud-1', 'fence', 'origin/main', 'nexus/1')).code, 1);
    } finally {
      console.error = err;
    }
  });
});
