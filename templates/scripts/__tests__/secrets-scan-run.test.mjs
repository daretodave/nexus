// secrets.mjs scan, end to end in a scratch git repo: a commit-to-be that holds a vault value is refused by file, line
// and name, never by the value; a clean tree, and a checkout with no vault, pass. Every value below is a fake.
// node:test, no deps (spawns git: an opt-in suite, like the other *-run tests).
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, '..', 'secrets.mjs');
const A = 'fake-scan-value-424242';

function repo() {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'secrets scan '));
  const dir = path.join(ws, 'repo');
  fs.mkdirSync(dir);
  const git = (...args) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' });
  git('init', '-q');
  fs.writeFileSync(path.join(dir, '.gitignore'), '.env\n');
  fs.writeFileSync(path.join(dir, 'nexus.secrets.json'), JSON.stringify({ version: 1, secrets: [{ name: 'A_TOKEN', for: 'A test secret.', where: null, destinations: ['local'], provider: 'owner', chunk: null }] }));
  fs.writeFileSync(path.join(dir, 'app.js'), 'export const token = process.env.A_TOKEN\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  return { dir, git, done: () => fs.rmSync(ws, { recursive: true, force: true }) };
}

const scan = (dir, ...args) => spawnSync(process.execPath, [CLI, 'scan', '--root', dir, ...args], { cwd: dir, encoding: 'utf8' });

describe('secrets scan', () => {
  it('passes with no vault, and passes a clean tree with one', () => {
    const r = repo();
    try {
      const none = scan(r.dir);
      assert.equal(none.status, 0, none.stderr);
      assert.match(none.stdout, /no vault values here/);
      fs.writeFileSync(path.join(r.dir, '.env'), `A_TOKEN=${A}\n`);
      fs.appendFileSync(path.join(r.dir, 'app.js'), 'export const name = "A_TOKEN"\n');
      const clean = scan(r.dir);
      assert.equal(clean.status, 0, clean.stdout);
      assert.match(clean.stdout, /green/);
      assert.ok(!clean.stdout.includes(A));
    } finally { r.done(); }
  });

  it('refuses a modified file, an untracked file and a staged change that hold a value, naming file, line and secret', () => {
    const r = repo();
    try {
      fs.writeFileSync(path.join(r.dir, '.env'), `A_TOKEN=${A}\n`);
      fs.appendFileSync(path.join(r.dir, 'app.js'), `export const oops = '${A}'\n`);
      fs.writeFileSync(path.join(r.dir, 'notes.md'), `# notes\n\npasted ${A} here\n`);
      const red = scan(r.dir);
      assert.equal(red.status, 1);
      assert.match(red.stdout, /app\.js:2: holds the value of A_TOKEN/);
      assert.match(red.stdout, /notes\.md:3: holds the value of A_TOKEN/);
      assert.ok(!(red.stdout + red.stderr).includes(A));
      const unstaged = scan(r.dir, '--staged');
      assert.equal(unstaged.status, 0, unstaged.stdout);
      r.git('add', 'app.js');
      const staged = scan(r.dir, '--staged');
      assert.equal(staged.status, 1);
      assert.match(staged.stdout, /app\.js:2: holds the value of A_TOKEN/);
      assert.ok(!staged.stdout.includes('notes.md'));
    } finally { r.done(); }
  });

  it('scans a repo with no commit yet against the empty tree', () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'secrets scan '));
    const dir = path.join(ws, 'repo');
    try {
      fs.mkdirSync(dir);
      execFileSync('git', ['-C', dir, 'init', '-q']);
      fs.writeFileSync(path.join(dir, '.gitignore'), '.env\n');
      fs.writeFileSync(path.join(dir, '.env'), `A_TOKEN=${A}\n`);
      fs.writeFileSync(path.join(dir, 'a.txt'), `${A}\n`);
      execFileSync('git', ['-C', dir, 'add', 'a.txt']);
      const r = scan(dir, '--staged');
      assert.equal(r.status, 1, r.stdout + r.stderr);
      assert.match(r.stdout, /a\.txt:1: holds the value of A_TOKEN/);
    } finally { fs.rmSync(ws, { recursive: true, force: true }); }
  });
});
