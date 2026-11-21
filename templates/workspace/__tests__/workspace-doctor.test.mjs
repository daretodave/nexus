// workspace-doctor.mjs: table parsing skips unswept placeholders, every
// check flags its own failure shape, and the leak scan never prints a
// secret's value. The leak and clone checks spawn real git repos (offline,
// no network): the opt-in scripts-git leg, same as worktree.test.mjs.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  checkClones, checkKeysInEnv, checkLeakedValues, checkSelfRepo,
  diagnose, extractTables, readEnvWorkspace, readKeys, readRepos,
} from '../workspace-doctor.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'workspace-doctor.mjs');
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));

function git(cwd, ...args) {
  const res = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: ENV });
  if (res.status !== 0) throw new Error(`git ${args.join(' ')}: ${res.stderr}`);
  return res.stdout.trim();
}

function initRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'dev@example.invalid');
  git(dir, 'config', 'user.name', 'Dev');
  git(dir, 'config', 'commit.gpgsign', 'false');
}

function commitFile(dir, rel, contents) {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contents);
  git(dir, 'add', rel);
  git(dir, 'commit', '-q', '-m', rel);
}

let root;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workspace-doctor-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('table parsing', () => {
  it('reads real rows and skips unswept placeholders', () => {
    const text = [
      '| Repo | Purpose |',
      '|---|---|',
      '| `plan` | The ledger |',
      '| `<PROJECT>` | <one line> |',
      '| `<add more rows as the workspace grows>` | |',
    ].join('\n');
    assert.deepEqual(extractTables(text)[0].rows.map((r) => r[0]), ['`plan`', '`<PROJECT>`', '`<add more rows as the workspace grows>`']);
    fs.writeFileSync(path.join(root, 'REPOS.md'), text);
    assert.deepEqual(readRepos(root), ['plan']);
  });

  it('reads KEYS.md names the same way', () => {
    fs.writeFileSync(path.join(root, 'KEYS.md'), [
      '| Key | Which sibling repos read it | Minted by |',
      '|---|---|---|',
      '| `CF_API_TOKEN` | plan, app | dash.cloudflare.com |',
      '| `<add more rows as the workspace grows>` | | |',
    ].join('\n'));
    assert.deepEqual(readKeys(root), ['CF_API_TOKEN']);
  });

  it('missing REPOS.md or KEYS.md reads as no rows, not a crash', () => {
    assert.deepEqual(readRepos(root), []);
    assert.deepEqual(readKeys(root), []);
  });
});

describe('.env.workspace parsing', () => {
  it('reads bare, quoted and exported values; skips comments and blanks', () => {
    fs.writeFileSync(path.join(root, '.env.workspace'), [
      '# a comment',
      '',
      'CF_API_TOKEN=abc123',
      "export QUOTED='needs quoting'",
      'DQUOTE="has a \\"quote\\" inside"',
    ].join('\n'));
    const env = readEnvWorkspace(root);
    assert.equal(env.get('CF_API_TOKEN'), 'abc123');
    assert.equal(env.get('QUOTED'), 'needs quoting');
    assert.equal(env.get('DQUOTE'), 'has a "quote" inside');
  });

  it('a missing file reads as an empty map', () => {
    assert.equal(readEnvWorkspace(root).size, 0);
  });
});

describe('checkSelfRepo', () => {
  it('flags the root being its own git repo', () => {
    assert.deepEqual(checkSelfRepo(root), []);
    fs.mkdirSync(path.join(root, '.git'));
    assert.equal(checkSelfRepo(root).length, 1);
  });
});

describe('checkClones', () => {
  it('flags a missing clone and a non-git directory; passes a real one', () => {
    initRepo(path.join(root, 'plan'));
    fs.mkdirSync(path.join(root, 'not-a-repo'));
    const failures = checkClones(root, ['plan', 'not-a-repo', 'never-cloned']);
    assert.equal(failures.length, 2);
    assert.match(failures.find((f) => f.includes('not-a-repo')), /not a git repo/);
    assert.match(failures.find((f) => f.includes('never-cloned')), /not cloned on disk/);
  });
});

describe('checkKeysInEnv', () => {
  it('flags a KEYS.md name absent from .env.workspace', () => {
    const env = new Map([['SET_ONE', 'x']]);
    assert.deepEqual(checkKeysInEnv(['SET_ONE', 'MISSING_ONE'], env), ['KEYS.md lists MISSING_ONE, missing from .env.workspace']);
  });
});

describe('checkLeakedValues', () => {
  it('flags a secret value committed into a sibling repo, naming the file but never the value', () => {
    initRepo(path.join(root, 'leaky'));
    commitFile(path.join(root, 'leaky'), 'config.yml', 'token: s3cr3t-value\n');
    initRepo(path.join(root, 'clean'));
    commitFile(path.join(root, 'clean'), 'README.md', 'nothing here\n');
    const env = new Map([['CF_API_TOKEN', 's3cr3t-value']]);
    const failures = checkLeakedValues(root, ['leaky', 'clean'], ['CF_API_TOKEN'], env);
    assert.equal(failures.length, 1);
    assert.match(failures[0], /CF_API_TOKEN.*leaky\/config\.yml/);
    assert.ok(!failures[0].includes('s3cr3t-value'), 'never prints the leaked value itself');
  });

  it('a key with no live value is never scanned for', () => {
    initRepo(path.join(root, 'leaky'));
    commitFile(path.join(root, 'leaky'), 'config.yml', 'token: s3cr3t-value\n');
    assert.deepEqual(checkLeakedValues(root, ['leaky'], ['CF_API_TOKEN'], new Map()), []);
  });
});

describe('diagnose', () => {
  it('is green when every check passes', () => {
    initRepo(path.join(root, 'plan'));
    commitFile(path.join(root, 'plan'), 'a.txt', 'a\n');
    fs.writeFileSync(path.join(root, 'REPOS.md'), ['| Repo | Purpose |', '|---|---|', '| `plan` | The ledger |'].join('\n'));
    fs.writeFileSync(path.join(root, 'KEYS.md'), ['| Key | Which sibling repos read it | Minted by |', '|---|---|---|', '| `CF_API_TOKEN` | plan | example |'].join('\n'));
    fs.writeFileSync(path.join(root, '.env.workspace'), 'CF_API_TOKEN=abc123\n');
    assert.deepEqual(diagnose(root).failures, []);
  });

  it('collects every failing check at once', () => {
    fs.mkdirSync(path.join(root, '.git'));
    fs.writeFileSync(path.join(root, 'REPOS.md'), ['| Repo | Purpose |', '|---|---|', '| `app` | Product |'].join('\n'));
    fs.writeFileSync(path.join(root, 'KEYS.md'), ['| Key | Which sibling repos read it | Minted by |', '|---|---|---|', '| `TOKEN` | app | example |'].join('\n'));
    const { failures } = diagnose(root);
    assert.equal(failures.length, 3); // self-repo + missing clone + missing key (no .env.workspace at all)
  });
});

describe('CLI', () => {
  it('exits 0 and prints green on a clean workspace', () => {
    const res = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8', env: ENV });
    assert.equal(res.status, 0);
    assert.match(res.stdout, /green/);
  });

  it('exits 1 and lists issues on a dirty one', () => {
    fs.mkdirSync(path.join(root, '.git'));
    const res = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8', env: ENV });
    assert.equal(res.status, 1);
    assert.match(res.stdout, /its own git repo/);
  });
});
