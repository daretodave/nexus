// secrets-vault.mjs, secrets-keychain.mjs and the CLI's vault commands: values live in `.env` (local), the OS keychain
// (opt-in) and `.env.workspace` (the workspace root); code reads them, a terminal never does. The keychain is tested
// through a recording runner only: no test touches a real keychain. Every value below is a fake, and each one is
// searched for in every byte the CLI prints.
// node:test, no deps.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { keychain } from '../secrets-keychain.mjs';
import { formatEnvValue, openVault, parseEnv, upsertEnv, vaultConfig } from '../secrets-vault.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, '..', 'secrets.mjs');
const FAKES = ['fake-local-0001', 'fake ws "quoted" 0002', 'fake-chain-0003', 'fake-dropped-0004', "fake-it's-0005"];

function workspace() {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'secrets vault '));
  const repo = path.join(ws, 'repo');
  fs.mkdirSync(repo);
  return { ws, repo, done: () => fs.rmSync(ws, { recursive: true, force: true }) };
}

const notRepo = () => ({ status: 128, stdout: '' });

function fakeChain() {
  const items = new Map();
  return { items, get: (n) => items.get(n) ?? null, set: (n, v) => items.set(n, v), has: (names) => new Set(names.filter((n) => items.has(n))) };
}

describe('the .env format', () => {
  it('parses live lines (export, quotes, trailing comments) and skips commented-out ones', () => {
    const env = parseEnv([
      '# A_TOKEN=commented-out',
      'A_TOKEN=bare-value # a comment',
      'export B_TOKEN="two words # kept \\" and \\\\"',
      "C_TOKEN='single # kept'",
      'D_TOKEN=',
      'A_TOKEN=last-wins',
    ].join('\r\n'));
    assert.deepEqual([...env], [['A_TOKEN', 'last-wins'], ['B_TOKEN', 'two words # kept " and \\'], ['C_TOKEN', 'single # kept'], ['D_TOKEN', '']]);
  });

  it('writes a value it reads back, and updates in place without touching other lines', () => {
    for (const v of FAKES) assert.equal(parseEnv(`X_TOKEN=${formatEnvValue(v)}\n`).get('X_TOKEN'), v);
    assert.equal(formatEnvValue('github_pat_abc-123'), 'github_pat_abc-123');
    const before = '# keep me\nA_TOKEN=old\n\nB_TOKEN=keep\nA_TOKEN=dupe\n';
    assert.equal(upsertEnv(before, [['A_TOKEN', 'new'], ['C_TOKEN', 'two words']]), '# keep me\nA_TOKEN=new\n\nB_TOKEN=keep\nC_TOKEN="two words"\n');
    assert.equal(upsertEnv('', [['A_TOKEN', 'x']]), 'A_TOKEN=x\n');
  });
});

describe('the vault', () => {
  it('puts local at the checkout and workspace at its parent unless configured, and the keychain off', () => {
    const c = vaultConfig('/w/repo');
    assert.equal(c.local, path.resolve('/w/repo/.env'));
    assert.equal(c.workspace, path.resolve('/w/.env.workspace'));
    assert.equal(c.keychain, false);
    assert.equal(c.service, 'nexus/repo');
    const d = vaultConfig('/w/a/repo', { secrets: { workspace: '../..', keychain: true, keychainService: 'nexus/mine' } });
    assert.equal(d.workspace, path.resolve('/w/.env.workspace'));
    assert.equal(d.keychain, true);
    assert.equal(d.service, 'nexus/mine');
  });

  it('writes both rings owner-only, reads local before keychain before workspace, and reports names only', () => {
    const t = workspace();
    try {
      const kc = fakeChain();
      const v = openVault({ root: t.repo, settings: { secrets: { keychain: true } }, git: notRepo, keychain: kc });
      assert.deepEqual(v.set([['SHARED_TOKEN', FAKES[1]], ['WS_ONLY', FAKES[1]]], 'workspace'), { ring: 'workspace', names: ['SHARED_TOKEN', 'WS_ONLY'] });
      assert.equal(v.get('SHARED_TOKEN').ring, 'workspace');
      v.set([['SHARED_TOKEN', FAKES[2]]]);
      assert.equal(kc.items.get('SHARED_TOKEN'), FAKES[2], 'the keychain is the default ring once it is on');
      assert.deepEqual(v.get('SHARED_TOKEN'), { value: FAKES[2], ring: 'keychain' });
      v.set([['SHARED_TOKEN', FAKES[0]], ['LOCAL_ONLY', FAKES[0]]], 'local');
      assert.deepEqual(v.get('SHARED_TOKEN'), { value: FAKES[0], ring: 'local' });
      assert.equal(v.get('NOPE'), null);
      assert.deepEqual(v.resolve(['WS_ONLY', 'NOPE']), { values: new Map([['WS_ONLY', FAKES[1]]]), missing: ['NOPE'] });
      assert.equal(fs.readFileSync(path.join(t.ws, '.env.workspace'), 'utf8'), `SHARED_TOKEN=${formatEnvValue(FAKES[1])}\nWS_ONLY=${formatEnvValue(FAKES[1])}\n`);
      if (process.platform !== 'win32') {
        assert.equal(fs.statSync(path.join(t.repo, '.env')).mode & 0o777, 0o600);
        assert.equal(fs.statSync(path.join(t.ws, '.env.workspace')).mode & 0o777, 0o600);
      }
      const rows = v.status(['SHARED_TOKEN', 'MISSING_TOKEN']);
      assert.deepEqual(rows, [
        { name: 'SHARED_TOKEN', rings: ['local', 'keychain', 'workspace'] },
        { name: 'MISSING_TOKEN', rings: [] },
        { name: 'LOCAL_ONLY', rings: ['local'] },
        { name: 'WS_ONLY', rings: ['workspace'] },
      ]);
      assert.ok(!FAKES.some((f) => JSON.stringify(rows).includes(f)));
    } finally {
      t.done();
    }
  });

  it('refuses an ungitignored .env, a .env.workspace inside a repo, the keychain unless opted in, and a bad value', () => {
    const t = workspace();
    try {
      const ignored = (status) => (args) => (args.includes('check-ignore') ? { status, stdout: '' } : { status: 0, stdout: 'true\n' });
      assert.throws(() => openVault({ root: t.repo, git: ignored(1) }).set([['A_TOKEN', 'x']], 'local'), /\.env is not gitignored/);
      assert.throws(() => openVault({ root: t.repo, git: ignored(1) }).set([['A_TOKEN', 'x']], 'workspace'), /inside a git repo/);
      assert.equal(openVault({ root: t.repo, git: ignored(0) }).set([['A_TOKEN', 'x']], 'workspace').ring, 'workspace');
      const off = openVault({ root: t.repo, git: notRepo });
      assert.throws(() => off.set([['A_TOKEN', 'x']], 'keychain'), /opt-in/);
      assert.throws(() => off.set([['A_TOKEN', 'two\nlines']]), /one line only/);
      assert.throws(() => off.set([['A_TOKEN', '']]), /empty value/);
      assert.throws(() => off.set([['lower', 'x']]), /not an env-var name/);
      assert.throws(() => off.set([['A_TOKEN', 'x']], 'cloud'), /no ring cloud/);
      assert.throws(() => openVault({ root: t.repo, settings: { secrets: { workspace: 'nowhere' } }, git: notRepo }).set([['A_TOKEN', 'x']], 'workspace'), /no workspace folder/);
      try { off.set([['A_TOKEN', `${FAKES[0]}\n`]]); } catch (e) { assert.ok(!e.message.includes(FAKES[0])); }
    } finally {
      t.done();
    }
  });
});

describe('the keychain, through a recording runner', () => {
  function recorder(reply = () => ({ status: 0, stdout: '' })) {
    const calls = [];
    return { calls, run: (cmd, args, input = '') => { calls.push({ cmd, args, input }); return reply(cmd, args, input); } };
  }
  const value = FAKES[4];

  for (const [platform, cmd] of [['darwin', 'security'], ['linux', 'secret-tool'], ['win32', 'powershell.exe']]) {
    it(`${platform}: ${cmd}, the value on stdin only, never in argv`, () => {
      const r = recorder();
      keychain({ platform, run: r.run, service: 'nexus/repo' }).set('A_TOKEN', value);
      assert.equal(r.calls.length, 1);
      assert.equal(r.calls[0].cmd, cmd);
      assert.ok(!r.calls[0].args.join(' ').includes(value), 'the value reached argv');
      assert.ok(r.calls[0].args.join(' ').includes('A_TOKEN') || r.calls[0].input.includes('A_TOKEN'));
      const carried = platform === 'win32' ? Buffer.from(r.calls[0].input, 'base64').toString('utf8') : r.calls[0].input;
      assert.ok(carried.includes(platform === 'darwin' ? value.replace(/"/g, '\\"') : value));
    });

    it(`${platform}: get reads stdout, a miss is null, a failed write throws without the value`, () => {
      const out = platform === 'win32' ? Buffer.from(value, 'utf8').toString('base64') : `${value}\n`;
      const hit = recorder(() => ({ status: 0, stdout: out }));
      assert.equal(keychain({ platform, run: hit.run, service: 'nexus/repo' }).get('A_TOKEN'), value);
      const miss = recorder(() => ({ status: platform === 'win32' ? 3 : 44, stdout: '' }));
      assert.equal(keychain({ platform, run: miss.run, service: 'nexus/repo' }).get('A_TOKEN'), null);
      const broken = recorder(() => ({ status: 1, stdout: value }));
      assert.throws(() => keychain({ platform, run: broken.run, service: 'nexus/repo' }).set('A_TOKEN', value), (e) => /exited 1/.test(e.message) && !e.message.includes(value));
    });

    it(`${platform}: has names which are stored`, () => {
      const r = recorder((c, args) => (platform === 'win32' ? { status: 0, stdout: 'B_TOKEN\r\n' } : { status: args.includes('B_TOKEN') ? 0 : 1, stdout: '' }));
      assert.deepEqual([...keychain({ platform, run: r.run, service: 'nexus/repo' }).has(['A_TOKEN', 'B_TOKEN'])], ['B_TOKEN']);
    });
  }

  it('refuses another platform, a bad service and a bad name before running anything', () => {
    const r = recorder();
    assert.throws(() => keychain({ platform: 'aix', run: r.run, service: 'nexus/repo' }), /no keychain on aix/);
    assert.throws(() => keychain({ platform: 'linux', run: r.run, service: "x'; rm -rf" }), /the service is/);
    assert.throws(() => keychain({ platform: 'win32', run: r.run, service: 'nexus/repo' }).get("A'B"), /not an env-var name/);
    assert.equal(r.calls.length, 0);
  });
});

describe('the CLI', () => {
  const run = (repo, input, ...args) => spawnSync(process.execPath, [CLI, ...args, '--root', repo], { input, encoding: 'utf8' });
  const clean = (r) => { for (const f of FAKES) assert.ok(!(r.stdout + r.stderr).includes(f), `a value reached the terminal: ${r.stdout}${r.stderr}`); return r; };

  it('sets from stdin, says where each name is set, imports a dropped .env, and never prints a value', () => {
    const t = workspace();
    try {
      fs.writeFileSync(path.join(t.repo, 'nexus.secrets.json'), JSON.stringify({ version: 1, secrets: [
        { name: 'GH_TOKEN', for: 'The issue mirror.', where: null, destinations: ['github-actions'], provider: 'owner', chunk: null },
        { name: 'MISSING_TOKEN', for: 'Not set yet.', where: null, destinations: ['local'], provider: 'owner', chunk: null },
      ] }));
      const set = clean(run(t.repo, `${FAKES[0]}\n`, 'set', 'GH_TOKEN'));
      assert.equal(set.status, 0, set.stderr);
      assert.match(set.stdout, /GH_TOKEN -> local/);
      assert.equal(parseEnv(fs.readFileSync(path.join(t.repo, '.env'), 'utf8')).get('GH_TOKEN'), FAKES[0]);
      assert.equal(clean(run(t.repo, FAKES[1], 'set', 'SHARED_TOKEN', '--ring', 'workspace')).status, 0);
      assert.equal(parseEnv(fs.readFileSync(path.join(t.ws, '.env.workspace'), 'utf8')).get('SHARED_TOKEN'), FAKES[1]);

      const status = clean(run(t.repo, '', 'status'));
      assert.equal(status.status, 0, status.stderr);
      assert.match(status.stdout, /2 declared · 1 set · 1 missing/);
      assert.match(status.stdout, /GH_TOKEN\s+set · local\s+-> github-actions/);
      assert.match(status.stdout, /MISSING_TOKEN\s+missing\s+-> local/);
      assert.match(status.stdout, /SHARED_TOKEN\s+set · workspace\s+\(not declared/);
      const json = JSON.parse(clean(run(t.repo, '', 'status', '--json')).stdout);
      assert.deepEqual(json.secrets.map((s) => [s.name, s.rings]), [['GH_TOKEN', ['local']], ['MISSING_TOKEN', []], ['SHARED_TOKEN', ['workspace']]]);

      const get = clean(run(t.repo, '', 'get', 'GH_TOKEN'));
      assert.equal(get.status, 64);
      assert.match(get.stderr, /no such command/);

      fs.writeFileSync(path.join(t.repo, 'dropped.env'), `# the deploy token\nVERCEL_TOKEN=${FAKES[3]}\nGH_TOKEN=${formatEnvValue(FAKES[4])}\n# OFF_TOKEN=${FAKES[3]}\nEMPTY_TOKEN=\n`);
      const imp = clean(run(t.repo, '', 'import', 'dropped.env', '--store'));
      assert.equal(imp.status, 0, imp.stderr);
      assert.match(imp.stdout, /stored 2 in local: VERCEL_TOKEN, GH_TOKEN/);
      assert.match(imp.stdout, /delete dropped\.env/);
      assert.match(imp.stdout, /added 3: VERCEL_TOKEN, OFF_TOKEN, EMPTY_TOKEN/);
      const manifest = fs.readFileSync(path.join(t.repo, 'nexus.secrets.json'), 'utf8');
      assert.ok(!FAKES.some((f) => manifest.includes(f)));
      const env = parseEnv(fs.readFileSync(path.join(t.repo, '.env'), 'utf8'));
      assert.deepEqual([env.get('GH_TOKEN'), env.get('VERCEL_TOKEN'), env.has('OFF_TOKEN')], [FAKES[4], FAKES[3], false]);
      assert.match(clean(run(t.repo, '', 'import', '.env', '--store')).stdout, /\.env is the local vault already/);

      assert.equal(clean(run(t.repo, '', 'set', 'GH_TOKEN')).status, 1, 'an empty value is refused');
      assert.equal(run(t.repo, '', 'set', 'GH_TOKEN', '--ring', 'keychain').status, 1, 'the keychain is opt-in');
      assert.equal(run(t.repo, '', 'set').status, 64);
      assert.equal(run(t.repo, '', 'import', '--store').status, 64, 'a store names its file');
      assert.equal(run(t.repo, '', 'status', '--ring', 'local').status, 64);
    } finally {
      t.done();
    }
  });

  it('refuses to write a .env that git would commit', () => {
    const t = workspace();
    try {
      if (spawnSync('git', ['init', '-q', t.repo]).status !== 0) return;
      const refused = clean(run(t.repo, FAKES[0], 'set', 'GH_TOKEN'));
      assert.equal(refused.status, 1);
      assert.match(refused.stderr, /not gitignored/);
      assert.ok(!fs.existsSync(path.join(t.repo, '.env')));
      fs.writeFileSync(path.join(t.repo, '.gitignore'), '.env\n.env.workspace\n');
      assert.equal(clean(run(t.repo, FAKES[0], 'set', 'GH_TOKEN')).status, 0);
    } finally {
      t.done();
    }
  });
});
