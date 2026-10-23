// The vault's write loop, end to end (0.5.1): through the GUI server's routes into a temp repo's real files and back.
// For each place a value can live (the repo's .env, the workspace's .env.workspace, the keychain through a fake, and
// GitHub Actions through a fake sink): write, read it back from the status the Vault draws, rewrite, remove. The
// awkward values (spaces, quotes, #, =, $, backslashes) round-trip byte for byte, every other line of a hand-kept
// .env survives, an edit made outside the GUI shows on the next read, and no response ever carries a value. Every
// value below is a fake; no test reads a real vault or runs gh.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer } from '../server/server.mjs';
import { createSecrets } from '../server/secrets.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');
const DOTENV = '.env';
const WS_FILE = `${DOTENV}.workspace`;
const { parseEnv } = await import(pathToFileURL(path.join(KIT, 'templates', 'scripts', 'secrets-vault.mjs')).href);

// Test values only: secret-shaped, never a real token. The odd ones are the ones a .env gets wrong.
const ODD = [
  'TESTONLY with spaces 0001',
  'TESTONLY"double"quotes0002',
  "TESTONLY'single'quote0003",
  'TESTONLY#hash # and more 0004',
  'TESTONLY=equals==0005',
  'TESTONLY$dollar$HOME0006',
  'TESTONLY\\back\\slash0007',
  '  TESTONLY padded 0008  ',
  "TESTONLY both ' and \" 0009",
];
const GH = 'ghp_TESTONLY_l00p_a1b2c3d4';
const MANIFEST = {
  version: 1,
  secrets: [
    { name: 'GH_TOKEN', for: 'gh in the loop.', where: null, destinations: ['local', 'github-actions'], provider: 'owner', chunk: null },
    { name: 'SHARED_TOKEN', for: 'Shared by the sibling repos.', where: null, destinations: ['local'], provider: 'owner', chunk: null },
  ],
};

function vaultRepo({ owner = true, keychain = false, ignore = true } = {}) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-vault-loop-'));
  const repo = path.join(ws, 'app');
  fs.mkdirSync(repo);
  execFileSync('git', ['init', '-q'], { cwd: repo });
  // A GitHub remote, so the kit asks gh (a fake) what the Actions sink holds; nothing is ever fetched from it.
  execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/example/app.git'], { cwd: repo });
  fs.writeFileSync(path.join(repo, '.gitignore'), `${ignore ? `${DOTENV}\n` : ''}.nexus/\n.owner\n`);
  fs.cpSync(path.join(KIT, 'templates', 'scripts'), path.join(repo, 'scripts'), { recursive: true });
  if (owner) fs.writeFileSync(path.join(repo, '.owner'), 'owner\n');
  if (keychain) { fs.mkdirSync(path.join(repo, '.nexus'), { recursive: true }); fs.writeFileSync(path.join(repo, '.nexus', 'local.json'), JSON.stringify({ secrets: { keychain: true } })); }
  fs.writeFileSync(path.join(repo, 'nexus.secrets.json'), `${JSON.stringify(MANIFEST, null, 2)}\n`);
  return { ws, repo, done: () => fs.rmSync(ws, { recursive: true, force: true }) };
}

function fakeChain() {
  const items = new Map();
  return { items, get: (n) => items.get(n) ?? null, set: (n, v) => items.set(n, v), has: (names) => new Set(names.filter((n) => items.has(n))), remove: (n) => items.delete(n) };
}

/** A fake gh: `secret set` keeps the stdin value by name, `secret list` lists the names it holds. */
function fakeGh() {
  const held = new Map();
  const calls = [];
  const run = (cmd, args, { input } = {}) => {
    calls.push({ cmd, args: [...args] });
    if (cmd === 'gh' && args[0] === 'secret' && args[1] === 'set') { held.set(args[2], input); return { status: 0 }; }
    if (cmd === 'gh' && args[0] === 'secret' && args[1] === 'list') return { status: 0, stdout: JSON.stringify([...held.keys()].map((name) => ({ name, updatedAt: new Date().toISOString() }))) };
    return { status: 0 };
  };
  return { held, calls, run };
}

const FAKE = () => ({ kind: 'fake', send() {}, async interrupt() {}, async stop() {}, async fresh() {} });

function req(port, { method = 'GET', pathname, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: pathname, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    r.on('error', reject);
    r.end(body);
  });
}

async function serve(repo, secrets) {
  const app = await startServer({ repo, provider: FAKE, pollRuns: false, dist: NO_DIST, ghLogin: async () => '', secrets });
  const seen = [];
  const headers = { 'x-nexus-token': app.token };
  const post = { ...headers, 'content-type': 'application/json', origin: `http://127.0.0.1:${app.port}` };
  const call = async (method, pathname, body) => {
    const r = await req(app.port, { method, pathname, headers: method === 'GET' ? headers : post, body: body === undefined ? undefined : JSON.stringify(body) });
    seen.push(r.data);
    return { status: r.status, json: JSON.parse(r.data) };
  };
  return { app, call, seen };
}

const noValues = (texts, values) => {
  for (const t of texts) for (const v of values) assert.ok(!String(t).includes(v.trim()), `a value reached a response: ${String(t).slice(0, 200)}`);
};
const read = (file) => fs.readFileSync(file, 'utf8');
const row = (st, name) => st.json.secrets.find((s) => s.name === name);

test('local (.env): write, read, rewrite and remove keep a hand-kept file whole, and every awkward value round-trips', async () => {
  const t = vaultRepo();
  const env = path.join(t.repo, DOTENV);
  // A .env kept by hand: comments, an export, a trailing comment, a pasted key over several lines, CRLF endings.
  const before = ['# the app', 'export KEEP_TOKEN=keep-me # by hand', 'PEM_BLOCK="-----BEGIN-----', 'abc', '-----END-----"', '', '# GH_TOKEN goes below', ''].join('\r\n');
  fs.writeFileSync(env, before);
  const { app, call, seen } = await serve(t.repo, { run: fakeGh().run });
  try {
    let st = await call('GET', '/api/secrets');
    assert.equal(st.status, 200);
    assert.equal(st.json.envIgnore, 'ignored');
    assert.equal(row(st, 'GH_TOKEN').set, false);

    for (const [i, v] of ODD.entries()) {
      const name = `ODD_${i}_TOKEN`;
      const w = await call('POST', `/api/secrets/${name}`, { value: v });
      assert.equal(w.status, 200, JSON.stringify(w.json));
      assert.equal(w.json.ring, 'local');
      assert.equal(parseEnv(read(env)).get(name), v, `${name} round-trips`);
    }
    // Rewriting the same values changes nothing in the file: idempotent.
    const once = read(env);
    for (const [i, v] of ODD.entries()) assert.equal((await call('POST', `/api/secrets/ODD_${i}_TOKEN`, { value: v })).status, 200);
    assert.equal(read(env), once);

    assert.equal((await call('POST', '/api/secrets/GH_TOKEN', { value: GH })).status, 200);
    st = await call('GET', '/api/secrets');
    assert.deepEqual(row(st, 'GH_TOKEN').rings, ['local']);
    assert.equal(row(st, 'GH_TOKEN').set, true);

    // Rewrite: replaced where it was, nothing else touched.
    assert.equal((await call('POST', '/api/secrets/GH_TOKEN', { value: `${GH}-2` })).status, 200);
    let text = read(env);
    assert.equal(parseEnv(text).get('GH_TOKEN'), `${GH}-2`);
    assert.ok(text.startsWith('# the app\r\nexport KEEP_TOKEN=keep-me # by hand\r\nPEM_BLOCK="-----BEGIN-----\r\nabc\r\n-----END-----"\r\n'), 'the hand-kept lines and CRLF stay');
    assert.equal(text.split(/\r?\n/).filter((l) => l.startsWith('GH_TOKEN=')).length, 1);
    assert.equal(parseEnv(text).get('PEM_BLOCK'), '-----BEGIN-----\nabc\n-----END-----');
    assert.deepEqual(fs.readdirSync(t.repo).filter((f) => /\.(tmp|lock)$/.test(f)), [], 'no temp file or lock left');
    if (process.platform !== 'win32') assert.equal(fs.statSync(env).mode & 0o777, 0o600);

    // Remove: out of .env, the audit says so, the status reads not set, every other line stays.
    const rm = await call('POST', '/api/secrets/GH_TOKEN/remove', {});
    assert.equal(rm.status, 200, JSON.stringify(rm.json));
    assert.deepEqual(rm.json.removed, ['local']);
    assert.ok(rm.json.notes.some((n) => /pushed to keep their copy/.test(n)), 'GitHub keeps its copy, and the answer says so');
    text = read(env);
    assert.equal(parseEnv(text).has('GH_TOKEN'), false);
    assert.ok(text.includes('export KEEP_TOKEN=keep-me # by hand') && text.includes('# GH_TOKEN goes below'));
    st = await call('GET', '/api/secrets');
    assert.equal(row(st, 'GH_TOKEN').set, false);
    assert.ok(st.json.audit.some((e) => e.action === 'remove' && e.name === 'GH_TOKEN' && e.ring === 'local'));
    const again = await call('POST', '/api/secrets/GH_TOKEN/remove', {});
    assert.deepEqual(again.json.removed, [], 'a second remove is a no-op');
    assert.equal((await call('POST', '/api/secrets/bad-name/remove', {})).status, 404, 'a bad name never reaches the kit');

    noValues(seen, [GH, ...ODD]);
  } finally {
    await app.close();
    t.done();
  }
});

test('workspace (.env.workspace): a value read from there is replaced there, and removed from there', async () => {
  const t = vaultRepo();
  const wsFile = path.join(t.ws, WS_FILE);
  fs.writeFileSync(wsFile, `# shared by the sibling repos\nSHARED_TOKEN=${ODD[0].replace(/ /g, '_')}\nOTHER_REPO_TOKEN=theirs-0001\n`);
  const { app, call, seen } = await serve(t.repo, { run: fakeGh().run });
  try {
    let st = await call('GET', '/api/secrets');
    assert.deepEqual(row(st, 'SHARED_TOKEN').rings, ['workspace']);
    // Replace (no ring named, as the Vault's Replace sends it): lands in the workspace file, not a new copy in .env.
    const w = await call('POST', '/api/secrets/SHARED_TOKEN', { value: ODD[3] });
    assert.equal(w.status, 200, JSON.stringify(w.json));
    assert.equal(w.json.ring, 'workspace');
    assert.equal(parseEnv(read(wsFile)).get('SHARED_TOKEN'), ODD[3]);
    assert.equal(fs.existsSync(path.join(t.repo, DOTENV)), false, 'no shadow copy in .env');
    assert.ok(read(wsFile).startsWith('# shared by the sibling repos\n'));
    assert.equal(parseEnv(read(wsFile)).get('OTHER_REPO_TOKEN'), 'theirs-0001');
    // A ring named explicitly still wins.
    assert.equal((await call('POST', '/api/secrets/SHARED_TOKEN', { value: ODD[4], ring: 'local' })).json.ring, 'local');
    st = await call('GET', '/api/secrets');
    assert.deepEqual(row(st, 'SHARED_TOKEN').rings, ['local', 'workspace']);
    // Remove from every ring that holds it.
    const rm = await call('POST', '/api/secrets/SHARED_TOKEN/remove', {});
    assert.deepEqual(rm.json.removed.sort(), ['local', 'workspace']);
    assert.equal(parseEnv(read(wsFile)).has('SHARED_TOKEN'), false);
    assert.equal(parseEnv(read(wsFile)).get('OTHER_REPO_TOKEN'), 'theirs-0001');
    assert.equal(row(await call('GET', '/api/secrets'), 'SHARED_TOKEN').set, false);
    noValues(seen, [ODD[3], ODD[4]]);
  } finally {
    await app.close();
    t.done();
  }
});

test('keychain (a fake): write, read, rewrite and remove, with no file written', async () => {
  const t = vaultRepo({ keychain: true });
  const kc = fakeChain();
  const { app, call, seen } = await serve(t.repo, { run: fakeGh().run, vault: { keychain: kc } });
  try {
    const w = await call('POST', '/api/secrets/GH_TOKEN', { value: ODD[1] });
    assert.equal(w.status, 200, JSON.stringify(w.json));
    assert.equal(w.json.ring, 'keychain');
    assert.equal(kc.items.get('GH_TOKEN'), ODD[1]);
    assert.equal(fs.existsSync(path.join(t.repo, DOTENV)), false);
    assert.deepEqual(row(await call('GET', '/api/secrets'), 'GH_TOKEN').rings, ['keychain']);
    assert.equal((await call('POST', '/api/secrets/GH_TOKEN', { value: ODD[2] })).json.ring, 'keychain');
    assert.equal(kc.items.get('GH_TOKEN'), ODD[2]);
    const rm = await call('POST', '/api/secrets/GH_TOKEN/remove', {});
    assert.deepEqual(rm.json.removed, ['keychain']);
    assert.equal(kc.items.has('GH_TOKEN'), false);
    assert.equal(row(await call('GET', '/api/secrets'), 'GH_TOKEN').set, false);
    noValues(seen, [ODD[1], ODD[2]]);
  } finally {
    await app.close();
    t.done();
  }
});

test('GitHub Actions (a fake gh): the value goes on stdin, the status reads it back, a rewrite rotates it there', async () => {
  const t = vaultRepo();
  const gh = fakeGh();
  const { app, call, seen } = await serve(t.repo, { run: gh.run });
  try {
    const w = await call('POST', '/api/secrets/GH_TOKEN', { value: ODD[5], destinations: ['github-actions'] });
    assert.equal(w.status, 200, JSON.stringify(w.json));
    assert.deepEqual(w.json.pushed.map((p) => [p.destination, p.ok]), [['github-actions', true]]);
    assert.equal(gh.held.get('GH_TOKEN'), ODD[5], 'the value went to gh on stdin');
    assert.ok(!gh.calls.some((c) => c.args.join(' ').includes(ODD[5].trim())), 'never in argv');
    // The status is read back from what gh lists (and the vault), not from what was sent.
    let st = await call('GET', '/api/secrets');
    const dest = row(st, 'GH_TOKEN').destinations.find((d) => d.destination === 'github-actions');
    assert.equal(dest.remote, 'set');
    assert.equal(dest.state, 'pushed');
    // Rewrite and push again: gh holds the new value.
    assert.equal((await call('POST', '/api/secrets/GH_TOKEN', { value: ODD[6], destinations: ['github-actions'] })).status, 200);
    assert.equal(gh.held.get('GH_TOKEN'), ODD[6]);
    st = await call('GET', '/api/secrets');
    assert.equal(row(st, 'GH_TOKEN').destinations.find((d) => d.destination === 'github-actions').stale, undefined);
    // A refusing sink is said plainly, the value still stored, and the error never carries it.
    const refusing = (cmd, args, o) => (args[1] === 'set' ? { status: 1 } : gh.run(cmd, args, o));
    await app.close();
    const again = await serve(t.repo, { run: refusing });
    try {
      const r = await again.call('POST', '/api/secrets/GH_TOKEN', { value: ODD[7], destinations: ['github-actions'] });
      assert.equal(r.status, 200);
      assert.equal(r.json.ok, false);
      assert.match(r.json.pushed[0].error, /gh exited 1/);
      assert.equal(parseEnv(read(path.join(t.repo, DOTENV))).get('GH_TOKEN'), ODD[7]);
      noValues(again.seen, [ODD[7]]);
    } finally {
      await again.app.close();
    }
    noValues(seen, [ODD[5], ODD[6]]);
  } finally {
    await app.close().catch(() => {});
    t.done();
  }
});

test('the read side: an edit made outside the GUI (a terminal, an editor) shows on the next read, and is masked', async () => {
  const t = vaultRepo();
  const env = path.join(t.repo, DOTENV);
  const { app, call } = await serve(t.repo, { run: fakeGh().run });
  try {
    assert.equal(row(await call('GET', '/api/secrets'), 'GH_TOKEN').set, false);
    fs.writeFileSync(env, `GH_TOKEN=${GH}\n`);
    assert.deepEqual(row(await call('GET', '/api/secrets'), 'GH_TOKEN').rings, ['local']);
    fs.writeFileSync(env, '# emptied by hand\n');
    assert.equal(row(await call('GET', '/api/secrets'), 'GH_TOKEN').set, false);
  } finally {
    await app.close();
    t.done();
  }
});

test('gitignore: a .env git would commit is warned about, refused, and fixed in one click; a tracked one says how', async () => {
  const t = vaultRepo({ ignore: false });
  const { app, call, seen } = await serve(t.repo, { run: fakeGh().run });
  try {
    let st = await call('GET', '/api/secrets');
    assert.equal(st.json.envIgnore, 'not ignored');
    const refused = await call('POST', '/api/secrets/GH_TOKEN', { value: GH });
    assert.equal(refused.status, 409);
    assert.match(refused.json.error, /not gitignored/);
    assert.equal(fs.existsSync(path.join(t.repo, DOTENV)), false, 'nothing written before it is ignored');
    const fix = await call('POST', '/api/secrets/gitignore', {});
    assert.equal(fix.status, 200, JSON.stringify(fix.json));
    assert.equal(fix.json.envIgnore, 'ignored');
    assert.ok(read(path.join(t.repo, '.gitignore')).split(/\r?\n/).includes(DOTENV));
    st = await call('GET', '/api/secrets');
    assert.equal(st.json.envIgnore, 'ignored');
    assert.equal((await call('POST', '/api/secrets/GH_TOKEN', { value: GH })).status, 200);
    assert.equal((await call('POST', '/api/secrets/gitignore', {})).json.already, true);
    noValues(seen, [GH]);
  } finally {
    await app.close();
    t.done();
  }

  const u = vaultRepo({ ignore: false });
  fs.writeFileSync(path.join(u.repo, DOTENV), 'PLAIN=1\n');
  execFileSync('git', ['add', DOTENV], { cwd: u.repo });
  const two = await serve(u.repo, { run: fakeGh().run });
  try {
    assert.equal((await two.call('GET', '/api/secrets')).json.envIgnore, 'tracked');
    const no = await two.call('POST', '/api/secrets/gitignore', {});
    assert.equal(no.status, 409);
    assert.match(no.json.error, /git rm --cached/);
    assert.match((await two.call('POST', '/api/secrets/GH_TOKEN', { value: GH })).json.error, /tracked by git/);
  } finally {
    await two.app.close();
    u.done();
  }
});

test('the Actions list is asked ahead, off the event loop, once, and kept for the next read', async () => {
  const t = vaultRepo();
  let asked = 0;
  let release;
  const runAsync = () => { asked++; return new Promise((r) => { release = () => r({ status: 0, stdout: JSON.stringify([{ name: 'GH_TOKEN', updatedAt: '2026-10-01T00:00:00Z' }]) }); }); };
  const s = createSecrets({ repo: t.repo, owner: () => true, runAsync, run: undefined });
  try {
    const first = s.status();
    for (let i = 0; i < 500 && !asked; i++) await new Promise((r) => setTimeout(r, 10));
    assert.equal(asked, 1);
    release();
    const st = await first;
    assert.equal(st.secrets.find((x) => x.name === 'GH_TOKEN').destinations.find((d) => d.destination === 'github-actions').remote, 'set');
    await s.status();
    assert.equal(asked, 1, 'kept for a minute: no second ask');
  } finally {
    t.done();
  }
});
