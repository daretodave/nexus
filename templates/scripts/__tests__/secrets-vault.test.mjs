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
import { main } from '../secrets.mjs';
import { LOCAL_KEYS_FILE, formatEnvValue, openVault, parseEnv, readLocalKeys, recordLocalKeys, removeEnv, sinkRefusal, upsertEnv, vaultConfig } from '../secrets-vault.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, '..', 'secrets.mjs');
const FAKES = ['fake-local-0001', 'fake ws "quoted" 0002', 'fake-chain-0003', 'fake-dropped-0004', "fake-it's-0005"];

function workspace() {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'secrets vault '));
  const repo = path.join(ws, 'repo');
  fs.mkdirSync(repo);
  return { ws, repo, done: () => fs.rmSync(ws, { recursive: true, force: true }) };
}

const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_') && k !== 'NEXUS_CONTRIBUTOR'));

/** A git checkout that ignores the vault files: the owner's (an untracked .owner) or a contributor's (none). False
 * when git can't run here (the test then has nothing to check). */
function checkout(repo, { owner }) {
  if (spawnSync('git', ['init', '-q', repo], { env: ENV }).status !== 0) return false;
  fs.writeFileSync(path.join(repo, '.gitignore'), '.env\n.env.workspace\n.owner\n.nexus/\n');
  if (owner) fs.writeFileSync(path.join(repo, '.owner'), '');
  return true;
}

const notRepo = () => ({ status: 128, stdout: '' });

function fakeChain() {
  const items = new Map();
  return { items, get: (n) => items.get(n) ?? null, set: (n, v) => items.set(n, v), has: (names) => new Set(names.filter((n) => items.has(n))), remove: (n) => items.delete(n) };
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
    assert.equal(upsertEnv(before, [['A_TOKEN', 'new'], ['C_TOKEN', 'two words']]), "# keep me\nA_TOKEN=new\n\nB_TOKEN=keep\nC_TOKEN='two words'\n");
    assert.equal(upsertEnv('', [['A_TOKEN', 'x']]), 'A_TOKEN=x\n');
  });

  it('round-trips the awkward values, single-quoting so no reader expands a $ or a backslash', () => {
    const odd = ['pa$$word', 'back\\slash', 'has "double"', "it's", "both ' and \"", 'x # y', 'two  spaces', '=lead=', '  pad  ', '#hash', 'é ünï', '`tick`', 'a=b=c'];
    for (const v of odd) assert.equal(parseEnv(`X_TOKEN=${formatEnvValue(v)}\n`).get('X_TOKEN'), v, v);
    assert.equal(formatEnvValue('pa$$word'), "'pa$$word'");
    assert.equal(formatEnvValue('back\\slash'), "'back\\slash'");
    assert.equal(formatEnvValue("it's"), '"it\'s"');
    assert.equal(formatEnvValue('a=b=c'), 'a=b=c');
  });

  it('keeps export, a trailing comment and the line ending when it replaces a name, and is idempotent', () => {
    assert.equal(upsertEnv('export A_TOKEN=old # from the dashboard\n', [['A_TOKEN', 'new']]), 'export A_TOKEN=new # from the dashboard\n');
    assert.equal(upsertEnv('A_TOKEN="old" # note\n', [['A_TOKEN', 'two words']]), "A_TOKEN='two words' # note\n");
    assert.equal(upsertEnv('# c\r\nA_TOKEN=1\r\nB_TOKEN=2\r\n', [['A_TOKEN', 'x'], ['C_TOKEN', 'y']]), '# c\r\nA_TOKEN=x\r\nB_TOKEN=2\r\nC_TOKEN=y\r\n');
    assert.equal(upsertEnv('A_TOKEN=1', [['B_TOKEN', '2']]), 'A_TOKEN=1\nB_TOKEN=2\n');
    const once = upsertEnv('# top\nA_TOKEN=1\n', [['A_TOKEN', 'two words'], ['B_TOKEN', "it's"]]);
    assert.equal(upsertEnv(once, [['A_TOKEN', 'two words'], ['B_TOKEN', "it's"]]), once);
  });

  it('reads and replaces a quoted value that runs over several lines as one, never leaving its tail behind', () => {
    const text = 'A_TOKEN=1\nKEY_PEM="-----BEGIN KEY-----\nabc\n-----END KEY-----"\nB_TOKEN=2\n';
    assert.equal(parseEnv(text).get('KEY_PEM'), '-----BEGIN KEY-----\nabc\n-----END KEY-----');
    assert.equal(parseEnv(text).get('B_TOKEN'), '2');
    assert.equal(upsertEnv(text, [['KEY_PEM', 'path/to/key.pem']]), 'A_TOKEN=1\nKEY_PEM=path/to/key.pem\nB_TOKEN=2\n');
    assert.equal(removeEnv(text, ['KEY_PEM']), 'A_TOKEN=1\nB_TOKEN=2\n');
    // A quote that never closes is its own line only: the rest of the file still reads.
    assert.deepEqual([...parseEnv('A_TOKEN="open\nB_TOKEN=2\n')], [['A_TOKEN', 'open'], ['B_TOKEN', '2']]);
  });

  it('removes every assignment of a name and nothing else', () => {
    assert.equal(removeEnv('# keep\nA_TOKEN=1\nexport B_TOKEN=2 # b\nA_TOKEN=dupe\n', ['A_TOKEN']), '# keep\nexport B_TOKEN=2 # b\n');
    assert.equal(removeEnv('A_TOKEN=1\n', ['A_TOKEN']), '');
    assert.equal(removeEnv('A_TOKEN=1\r\nB_TOKEN=2\r\n', ['B_TOKEN']), 'A_TOKEN=1\r\n');
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

  it('rewrites a ring whole (no temp file left, other lines kept), removes from every ring or one, and follows a symlink', () => {
    const t = workspace();
    try {
      const kc = fakeChain();
      const v = openVault({ root: t.repo, settings: { secrets: { keychain: true } }, git: notRepo, keychain: kc });
      const local = path.join(t.repo, '.env');
      fs.writeFileSync(local, '# mine\nexport KEEP_TOKEN=keep # by hand\n');
      v.set([['A_TOKEN', FAKES[0]]], 'local');
      v.set([['A_TOKEN', FAKES[1]]], 'workspace');
      v.set([['A_TOKEN', FAKES[2]]], 'keychain');
      assert.equal(fs.readFileSync(local, 'utf8'), `# mine\nexport KEEP_TOKEN=keep # by hand\nA_TOKEN=${FAKES[0]}\n`);
      assert.deepEqual(fs.readdirSync(t.repo).filter((f) => f.endsWith('.tmp') || f.endsWith('.lock')), []);
      assert.deepEqual(v.remove(['A_TOKEN'], 'workspace'), [{ name: 'A_TOKEN', rings: ['workspace'] }]);
      assert.deepEqual(v.status(['A_TOKEN'])[0].rings, ['local', 'keychain']);
      assert.deepEqual(v.remove(['A_TOKEN', 'NOPE_TOKEN']), [{ name: 'A_TOKEN', rings: ['local', 'keychain'] }, { name: 'NOPE_TOKEN', rings: [] }]);
      assert.equal(v.get('A_TOKEN'), null);
      assert.equal(kc.items.has('A_TOKEN'), false);
      assert.equal(fs.readFileSync(local, 'utf8'), '# mine\nexport KEEP_TOKEN=keep # by hand\n');
      assert.throws(() => v.remove(['bad name']), /not an env-var name/);
      // A .env that is a link to a shared file: the file it points at changes, the link stays a link.
      const shared = path.join(t.ws, 'shared.env');
      fs.writeFileSync(shared, 'S_TOKEN=one\n');
      fs.rmSync(local);
      let linked = true;
      try { fs.symlinkSync(shared, local); } catch { linked = false; }
      if (linked) {
        v.set([['S_TOKEN', 'two']], 'local');
        assert.ok(fs.lstatSync(local).isSymbolicLink());
        assert.equal(fs.readFileSync(shared, 'utf8'), 'S_TOKEN=two\n');
      }
    } finally {
      t.done();
    }
  });

  it('refuses an ungitignored .env, a .env.workspace inside a repo, the keychain unless opted in, and a bad value', () => {
    const t = workspace();
    try {
      const ignored = (status, tracked = 1) => (args) => (args.includes('check-ignore') ? { status, stdout: '' } : args.includes('ls-files') ? { status: tracked, stdout: '' } : { status: 0, stdout: 'true\n' });
      assert.throws(() => openVault({ root: t.repo, git: ignored(1) }).set([['A_TOKEN', 'x']], 'local'), /\.env is not gitignored/);
      assert.throws(() => openVault({ root: t.repo, git: ignored(1, 0) }).set([['A_TOKEN', 'x']], 'local'), /\.env is tracked by git here: untrack it/);
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

    it(`${platform}: remove deletes the item by name, takes no value, and a failure throws`, () => {
      const r = recorder();
      keychain({ platform, run: r.run, service: 'nexus/repo' }).remove('A_TOKEN');
      assert.equal(r.calls.length, 1);
      assert.equal(r.calls[0].cmd, cmd);
      assert.ok(`${r.calls[0].args.join(' ')}`.includes('A_TOKEN'));
      assert.equal(r.calls[0].input, '');
      const broken = recorder(() => ({ status: 1, stdout: '' }));
      assert.throws(() => keychain({ platform, run: broken.run, service: 'nexus/repo' }).remove('A_TOKEN'), /exited 1/);
      assert.throws(() => keychain({ platform, run: r.run, service: 'nexus/repo' }).remove("A'B"), /not an env-var name/);
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
  const run = (repo, input, ...args) => spawnSync(process.execPath, [CLI, ...args, '--root', repo], { input, encoding: 'utf8', env: ENV });
  const clean = (r) => { for (const f of FAKES) assert.ok(!(r.stdout + r.stderr).includes(f), `a value reached the terminal: ${r.stdout}${r.stderr}`); return r; };

  it('sets from stdin, says where each name is set, imports a dropped .env, and never prints a value', () => {
    const t = workspace();
    try {
      if (!checkout(t.repo, { owner: true })) return;
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

  it('unsets a name from every ring that holds it (or one), records the removal, and never prints a value', () => {
    const t = workspace();
    try {
      if (!checkout(t.repo, { owner: true })) return;
      fs.writeFileSync(path.join(t.repo, 'nexus.secrets.json'), JSON.stringify({ version: 1, secrets: [
        { name: 'GH_TOKEN', for: 'The issue mirror.', where: null, destinations: ['local', 'github-actions'], provider: 'owner', chunk: null },
      ] }));
      fs.writeFileSync(path.join(t.repo, '.env'), '# by hand\nOTHER_TOKEN=keep\n');
      assert.equal(clean(run(t.repo, FAKES[0], 'set', 'GH_TOKEN')).status, 0);
      assert.equal(clean(run(t.repo, FAKES[1], 'set', 'GH_TOKEN', '--ring', 'workspace')).status, 0);
      const one = clean(run(t.repo, '', 'unset', 'GH_TOKEN', '--ring', 'workspace'));
      assert.equal(one.status, 0, one.stderr);
      assert.match(one.stdout, /GH_TOKEN taken out of workspace/);
      assert.match(one.stdout, /still set in local/);
      const all = clean(run(t.repo, '', 'unset', 'GH_TOKEN'));
      assert.equal(all.status, 0, all.stderr);
      assert.match(all.stdout, /taken out of local/);
      assert.match(all.stdout, /places it was pushed to keep their copy/);
      assert.equal(fs.readFileSync(path.join(t.repo, '.env'), 'utf8'), '# by hand\nOTHER_TOKEN=keep\n');
      assert.match(clean(run(t.repo, '', 'unset', 'GH_TOKEN')).stdout, /not in the vault: nothing to take out/);
      const log = fs.readFileSync(path.join(t.repo, '.nexus', 'secrets-audit.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      assert.deepEqual(log.filter((e) => e.action === 'remove').map((e) => e.ring), ['workspace', 'local']);
      assert.equal(run(t.repo, '', 'unset').status, 64);
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

// A15: a contributor (not effective owner mode, scripts/owner.mjs) keeps their own local-only keys. The vault and the
// import work, the names stay on this machine (never the tracked manifest, so no chunk can require one), the shared
// workspace ring and every sink are refused, and status leads with "No project secrets needed".
describe('a contributor checkout', () => {
  const run = (repo, input, args, env = {}) => spawnSync(process.execPath, [CLI, ...args, '--root', repo], { input, encoding: 'utf8', env: { ...ENV, ...env } });
  const clean = (r) => { for (const f of FAKES) assert.ok(!(r.stdout + r.stderr).includes(f), `a value reached the terminal: ${r.stdout}${r.stderr}`); return r; };
  const PROJECT = JSON.stringify({ version: 1, secrets: [
    { name: 'GH_TOKEN', for: 'The issue mirror.', where: null, destinations: ['github-actions'], provider: 'owner', chunk: null },
  ] }, null, 2);

  it('records local key names on this machine only: deduped, sorted, names and never a value', () => {
    const t = workspace();
    try {
      assert.deepEqual(readLocalKeys(t.repo), []);
      assert.deepEqual(recordLocalKeys(t.repo, ['B_KEY', 'A_KEY']), ['A_KEY', 'B_KEY']);
      assert.deepEqual(recordLocalKeys(t.repo, ['A_KEY', 'C_KEY', 'bad-name']), ['A_KEY', 'B_KEY', 'C_KEY']);
      assert.deepEqual(readLocalKeys(t.repo), ['A_KEY', 'B_KEY', 'C_KEY']);
      assert.ok(!fs.existsSync(path.join(t.repo, `${LOCAL_KEYS_FILE}.lock`)), 'the lock is released');
      fs.writeFileSync(path.join(t.repo, LOCAL_KEYS_FILE), '{ not json');
      assert.deepEqual(readLocalKeys(t.repo), []);
      assert.match(sinkRefusal('push'), /contributor/);
    } finally {
      t.done();
    }
  });

  it('sets and imports into the local ring, keeps the names out of the manifest, and leads status with no project secrets', () => {
    const t = workspace();
    try {
      if (!checkout(t.repo, { owner: false })) return;
      const manifestFile = path.join(t.repo, 'nexus.secrets.json');
      fs.writeFileSync(manifestFile, PROJECT);

      const empty = clean(run(t.repo, '', ['status']));
      assert.equal(empty.status, 0, empty.stderr);
      assert.match(empty.stdout, /^secrets status: No project secrets needed/);
      assert.match(empty.stdout, /Your local keys \(this machine only\)/);
      assert.match(empty.stdout, /None\. Add one if the app needs it to run locally\./);
      assert.doesNotMatch(empty.stdout, /missing/, 'a project secret is the owner\'s, never missing for a contributor');

      const set = clean(run(t.repo, `${FAKES[0]}\n`, ['set', 'DEV_API_KEY']));
      assert.equal(set.status, 0, set.stderr);
      assert.match(set.stdout, /DEV_API_KEY -> local \(this machine only\)/);
      assert.equal(parseEnv(fs.readFileSync(path.join(t.repo, '.env'), 'utf8')).get('DEV_API_KEY'), FAKES[0]);

      const shared = clean(run(t.repo, FAKES[1], ['set', 'SHARED_TOKEN', '--ring', 'workspace']));
      assert.equal(shared.status, 1);
      assert.match(shared.stderr, /workspace ring is shared/);
      assert.ok(!fs.existsSync(path.join(t.ws, '.env.workspace')));

      fs.writeFileSync(path.join(t.repo, 'dropped.env'), `LOCAL_DB_URL=${FAKES[3]}\nGH_TOKEN=${FAKES[2]}\n`);
      const imp = clean(run(t.repo, '', ['import', 'dropped.env', '--store']));
      assert.equal(imp.status, 0, imp.stderr);
      assert.match(imp.stdout, /stored 2 in local: LOCAL_DB_URL, GH_TOKEN/);
      assert.match(imp.stdout, /kept 2 names on this machine, not in nexus\.secrets\.json/);
      assert.doesNotMatch(imp.stdout, /added/);
      assert.equal(fs.readFileSync(manifestFile, 'utf8'), PROJECT, 'the tracked manifest is untouched');
      assert.equal(clean(run(t.repo, '', ['import', 'dropped.env', '--store', '--ring', 'workspace'])).status, 1);

      assert.deepEqual(readLocalKeys(t.repo), ['DEV_API_KEY', 'GH_TOKEN', 'LOCAL_DB_URL']);
      assert.equal(run(t.repo, '', ['names']).stdout, 'GH_TOKEN\n', 'no chunk can require a local key: the manifest never names one');

      const status = clean(run(t.repo, '', ['status']));
      assert.match(status.stdout, /^secrets status: No project secrets needed/);
      assert.match(status.stdout, /DEV_API_KEY\s+set · local/);
      assert.match(status.stdout, /LOCAL_DB_URL\s+set · local/);
      const json = JSON.parse(clean(run(t.repo, '', ['status', '--json'])).stdout);
      assert.equal(json.mode, 'contributor');
      assert.equal(json.projectSecretsNeeded, 0);
      assert.deepEqual(json.localKeys.map((k) => [k.name, k.rings]), [['DEV_API_KEY', ['local']], ['GH_TOKEN', ['local']], ['LOCAL_DB_URL', ['local']]]);

      const push = clean(run(t.repo, '', ['push', 'DEV_API_KEY']));
      assert.equal(push.status, 1);
      assert.match(push.stderr, /refused in a contributor checkout/);

      // Unset: out of this machine's places and off the list; never the shared workspace ring.
      fs.writeFileSync(path.join(t.ws, '.env.workspace'), `DEV_API_KEY=${FAKES[1]}\n`);
      const unset = clean(run(t.repo, '', ['unset', 'DEV_API_KEY']));
      assert.equal(unset.status, 0, unset.stderr);
      assert.match(unset.stdout, /taken out of local/);
      assert.equal(parseEnv(fs.readFileSync(path.join(t.ws, '.env.workspace'), 'utf8')).get('DEV_API_KEY'), FAKES[1], 'the shared ring is left alone');
      assert.deepEqual(readLocalKeys(t.repo), ['GH_TOKEN', 'LOCAL_DB_URL']);
      assert.equal(run(t.repo, '', ['unset', 'DEV_API_KEY', '--ring', 'workspace']).status, 1);
    } finally {
      t.done();
    }
  });

  it('treats the owner switched off, or NEXUS_CONTRIBUTOR=1, as a contributor; the owner keeps the project view', () => {
    const t = workspace();
    try {
      if (!checkout(t.repo, { owner: true })) return;
      fs.writeFileSync(path.join(t.repo, 'nexus.secrets.json'), PROJECT);
      const owner = clean(run(t.repo, '', ['status', '--json']));
      assert.equal(JSON.parse(owner.stdout).mode, 'owner');
      assert.match(clean(run(t.repo, '', ['status'])).stdout, /1 declared · 0 set · 1 missing/);
      assert.match(clean(run(t.repo, '', ['push', 'GH_TOKEN'])).stderr, /GH_TOKEN is not in the vault/, 'the owner reaches the sink path');
      assert.match(clean(run(t.repo, '', ['status'], { NEXUS_CONTRIBUTOR: '1' })).stdout, /No project secrets needed/);
      fs.mkdirSync(path.join(t.repo, '.nexus'));
      fs.writeFileSync(path.join(t.repo, '.nexus', 'local.json'), JSON.stringify({ ownerMode: false }));
      assert.match(clean(run(t.repo, '', ['push', 'GH_TOKEN'])).stderr, /refused in a contributor checkout/);
    } finally {
      t.done();
    }
  });

  it('writes the keychain when it is on, and records the name (the keychain cannot be listed)', async () => {
    const t = workspace();
    try {
      fs.writeFileSync(path.join(t.repo, 'nexus.secrets.json'), PROJECT);
      fs.mkdirSync(path.join(t.repo, '.nexus'));
      fs.writeFileSync(path.join(t.repo, '.nexus', 'local.json'), JSON.stringify({ secrets: { keychain: true } }));
      const chain = fakeChain();
      const lines = [];
      const io = { out: (s) => lines.push(s), err: (s) => lines.push(s), owner: () => false, vault: { keychain: chain, git: notRepo } };
      assert.equal(await main(['set', 'DEV_API_KEY', '--root', t.repo], { ...io, input: async () => FAKES[2] }), 0);
      assert.equal(chain.items.get('DEV_API_KEY'), FAKES[2]);
      assert.deepEqual(readLocalKeys(t.repo), ['DEV_API_KEY']);
      lines.length = 0;
      assert.equal(await main(['status', '--root', t.repo], io), 0);
      assert.match(lines.join('\n'), /DEV_API_KEY\s+set · keychain/);
      assert.ok(!lines.join('\n').includes(FAKES[2]));
    } finally {
      t.done();
    }
  });
});

describe('an optional secret (spec 49, A6)', () => {
  const MANIFEST_TEXT = JSON.stringify({ version: 1, secrets: [
    { name: 'GH_TOKEN', for: 'Optional locally.', where: null, destinations: ['local'], provider: 'owner', chunk: null, optional: true },
    { name: 'ACTIONS_PAT', for: 'The cloud loop.', where: null, destinations: ['github-actions'], provider: 'owner', chunk: null },
  ] }, null, 2);

  it('reads "optional · not set", never missing, and does not count as missing; set, it reads set', async () => {
    const t = workspace();
    try {
      fs.writeFileSync(path.join(t.repo, 'nexus.secrets.json'), MANIFEST_TEXT);
      const lines = [];
      const io = { out: (s) => lines.push(s), err: (s) => lines.push(s), owner: () => true, vault: { git: notRepo } };
      assert.equal(await main(['status', '--root', t.repo], io), 0);
      const text = lines.join('\n');
      assert.match(text, /2 declared · 0 set · 1 missing · 1 optional, not set/);
      assert.match(text, /GH_TOKEN\s+optional · not set/);
      assert.match(text, /ACTIONS_PAT\s+missing/);
      lines.length = 0;
      assert.equal(await main(['status', '--json', '--root', t.repo], io), 0);
      const json = JSON.parse(lines.join('\n'));
      assert.deepEqual(json.secrets.map((s) => [s.name, s.optional === true]), [['GH_TOKEN', true], ['ACTIONS_PAT', false]]);
      fs.writeFileSync(path.join(t.repo, '.env'), `GH_TOKEN=${FAKES[0]}\n`);
      lines.length = 0;
      assert.equal(await main(['status', '--root', t.repo], io), 0);
      assert.match(lines.join('\n'), /2 declared · 1 set · 1 missing \(/);
      assert.match(lines.join('\n'), /GH_TOKEN\s+set · local/);
      assert.ok(!lines.join('\n').includes(FAKES[0]));
    } finally {
      t.done();
    }
  });
});
