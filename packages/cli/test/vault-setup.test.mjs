// A mature repo's vault (spec 47, A2): GET /api/secrets tells an existing vault from a missing one and counts the
// root .env's names (never a value); "Write the manifest" declares those names; "Set up the vault" lands the CLI's
// copy of the secrets scripts per owner mode from a temporary worktree (owner: a commit pushed to main; contributor: a
// branch and a pull request). Every repo is a temp one with a bare temp origin; gh is a fake; no real vault is read.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/server.mjs';
import { envNames } from '../server/secrets.mjs';
import { BRANCH, SUBJECT, vaultFiles, vaultSource } from '../server/vault-setup.mjs';
import { gitEnv } from '../server/cloud.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');
// A sentinel test value: it must never appear in any answer or written file.
const SENTINEL = 'sk_TESTONLY_sentinel_9f8e7d6c5b4a';
const DOTENV = `# the app\nAPI_KEY=${SENTINEL}\nexport DB_URL="postgres://u:${SENTINEL}@h/db"\nlower_name=${SENTINEL}\n\n#COMMENTED=${SENTINEL}\n`;

const env = gitEnv();
const git = (cwd, ...args) => execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim();

/** A repo with a bare origin and one commit on main; scripts copied in when `scripts`; .env written when `dotenv`. */
function mature({ owner = true, scripts = false, dotenv = DOTENV, ignoreEnv = true } = {}) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-mature-'));
  const origin = path.join(ws, 'origin.git');
  const repo = path.join(ws, 'app');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin], { env });
  fs.mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.name', 'Test');
  git(repo, 'config', 'user.email', 'test@example.com');
  git(repo, 'config', 'core.autocrlf', 'false');
  fs.writeFileSync(path.join(repo, '.gitignore'), `${ignoreEnv ? '.env\n' : ''}.owner\n`);
  fs.writeFileSync(path.join(repo, 'README.md'), '# app\n');
  if (scripts) fs.cpSync(path.join(KIT, 'templates', 'scripts'), path.join(repo, 'scripts'), { recursive: true });
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'init');
  git(repo, 'remote', 'add', 'origin', origin);
  git(repo, 'push', '-q', 'origin', 'main');
  if (owner) fs.writeFileSync(path.join(repo, '.owner'), 'owner\n');
  if (dotenv) fs.writeFileSync(path.join(repo, '.env'), dotenv);
  return { ws, repo, origin };
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

async function serve(repo, setup) {
  const app = await startServer({ repo, provider: FAKE, pollRuns: false, dist: NO_DIST, ghLogin: async () => '', secrets: { run: () => ({ status: 0 }), ...(setup ? { setup } : {}) } });
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

const noSentinel = (texts) => { for (const t of texts) assert.ok(!String(t).includes(SENTINEL), 'a value reached an answer'); };

test('envNames: live lines only, names only', () => {
  assert.deepEqual(envNames(DOTENV), ['API_KEY', 'DB_URL', 'lower_name']);
  assert.ok(!JSON.stringify(envNames(DOTENV)).includes(SENTINEL));
});

test('vaultFiles: the closure of scripts/secrets.mjs, the vault itself in it', () => {
  const src = vaultSource();
  assert.ok(src, 'the kit\'s templates are a source inside the nexus repo');
  const files = vaultFiles(src);
  for (const f of ['secrets.mjs', 'secrets-vault.mjs', 'secrets-sinks.mjs', 'secrets-scan.mjs', 'plan/secrets-manifest.mjs', 'owner.mjs', 'ledger.mjs', 'plan-check.mjs']) assert.ok(files.includes(f), f);
  assert.ok(!files.includes('claims.mjs'), 'only what the vault needs');
});

test('status: root .env + vault reads "already the vault" with a name count, and Write the manifest declares names only', async () => {
  const { repo } = mature({ scripts: true });
  const { app, call, seen } = await serve(repo);
  try {
    const r = await call('GET', '/api/secrets');
    assert.equal(r.status, 200);
    assert.equal(r.json.vaultState, 'ready');
    assert.deepEqual(r.json.rootEnv, { exists: true, names: 3, undeclared: 2 }, 'lower_name is not a declarable name');
    assert.ok(!r.json.envFiles.includes('.env'), 'the vault\'s own file is never offered for import');
    const w = await call('POST', '/api/secrets/manifest', { fromEnv: true });
    assert.equal(w.status, 200);
    assert.deepEqual(w.json.added, ['API_KEY', 'DB_URL']);
    const man = fs.readFileSync(path.join(repo, 'nexus.secrets.json'), 'utf8');
    assert.ok(!man.includes(SENTINEL), 'the manifest holds names, never a value');
    assert.deepEqual(JSON.parse(man).secrets.map((e) => [e.name, e.destinations]), [['API_KEY', ['local']], ['DB_URL', ['local']]]);
    assert.equal((await call('GET', '/api/secrets')).json.rootEnv.undeclared, 0);
    const again = await call('POST', '/api/secrets/manifest', { fromEnv: true });
    assert.deepEqual(again.json.added, []);
    noSentinel(seen);
  } finally {
    await app.close();
  }
});

test('status: a root .env and no vault reads missing with the count; no .env and no vault reads missing and none', async () => {
  const a = mature();
  const s1 = await serve(a.repo);
  try {
    const r = await s1.call('GET', '/api/secrets');
    assert.equal(r.status, 200);
    assert.equal(r.json.vaultState, 'missing');
    assert.equal(r.json.available, false);
    assert.equal(r.json.owner, true);
    assert.deepEqual(r.json.rootEnv, { exists: true, names: 3 });
    assert.match(r.json.docs, /customization\/secrets\.md$/);
    const imp = await s1.call('POST', '/api/secrets/import', { text: `X_KEY=${SENTINEL}\n` });
    assert.equal(imp.status, 409);
    assert.doesNotMatch(imp.json.error, /templates|nexus\//, 'no kit path');
    noSentinel(s1.seen);
  } finally {
    await s1.app.close();
  }
  const b = mature({ owner: false, dotenv: '' });
  const s2 = await serve(b.repo);
  try {
    const r = await s2.call('GET', '/api/secrets');
    assert.equal(r.json.vaultState, 'missing');
    assert.equal(r.json.mode, 'contributor');
    assert.deepEqual(r.json.rootEnv, { exists: false, names: 0 });
  } finally {
    await s2.app.close();
  }
});

test('Set up the vault, owner: one commit on main from a temp worktree, the hook sees no GIT_DIR or GIT_CONFIG_PARAMETERS, this checkout fast-forwards, and the vault is ready', async () => {
  const { repo, origin } = mature({ ignoreEnv: false });
  // A hook written before anyone knew: it fails the commit if git pinned it to another repo.
  const hooks = git(repo, 'rev-parse', '--path-format=absolute', '--git-path', 'hooks');
  fs.writeFileSync(path.join(hooks, 'pre-commit'), '#!/bin/sh\nif [ -n "$GIT_DIR" ]; then echo "pinned: $GIT_DIR" >&2; exit 1; fi\nif [ -n "$GIT_CONFIG_PARAMETERS" ]; then echo "leaked: $GIT_CONFIG_PARAMETERS" >&2; exit 1; fi\nexit 0\n', { mode: 0o755 });
  const { app, call, seen } = await serve(repo);
  try {
    const r = await call('POST', '/api/secrets/setup', {});
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.landed, 'main');
    assert.equal(r.json.here, true);
    assert.equal(git(origin, 'log', '-1', '--format=%s', 'main'), SUBJECT);
    const tree = git(origin, 'ls-tree', '-r', '--name-only', 'main');
    assert.match(tree, /^scripts\/secrets-vault\.mjs$/m);
    assert.match(tree, /^scripts\/plan\/secrets-manifest\.mjs$/m);
    assert.match(git(origin, 'show', 'main:.gitignore'), /^\.env$/m, '.env is ignored before anything is set in it');
    assert.equal(git(repo, 'rev-parse', 'HEAD'), git(origin, 'rev-parse', 'main'));
    assert.equal(git(repo, 'worktree', 'list').split('\n').length, 1, 'the temp worktree is gone');
    assert.equal(git(repo, 'status', '--porcelain'), '', 'this checkout is clean');
    const st = await call('GET', '/api/secrets');
    assert.equal(st.json.vaultState, 'ready');
    assert.equal(st.json.rootEnv.names, 3);
    assert.equal((await call('POST', '/api/secrets/setup', {})).json.already, true);
    noSentinel(seen);
    noSentinel([git(origin, 'log', '-p', 'main')]);
  } finally {
    await app.close();
  }
});

test('Set up the vault, contributor: a branch and a pull request, main untouched', async () => {
  const { repo, origin } = mature({ owner: false });
  const before = git(origin, 'rev-parse', 'main');
  const prs = [];
  const gh = async (cwd, args) => { prs.push(args); return { ok: true, out: 'https://github.com/example/app/pull/7', err: '' }; };
  const { app, call } = await serve(repo, { gh });
  try {
    const r = await call('POST', '/api/secrets/setup', {});
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.landed, 'branch');
    assert.equal(r.json.branch, BRANCH);
    assert.equal(r.json.pr, 'https://github.com/example/app/pull/7');
    assert.equal(git(origin, 'rev-parse', 'main'), before, 'main is untouched');
    assert.equal(git(origin, 'log', '-1', '--format=%s', BRANCH), SUBJECT);
    assert.deepEqual(prs[0].slice(0, 6), ['pr', 'create', '--head', BRANCH, '--base', 'main']);
    assert.equal(git(repo, 'worktree', 'list').split('\n').length, 1);
    assert.equal((await call('GET', '/api/secrets')).json.vaultState, 'missing', 'it lands when the owner merges');
    const again = await call('POST', '/api/secrets/setup', {});
    assert.equal(again.json.already, true);
    assert.equal(prs.length, 1, 'no second pull request');
  } finally {
    await app.close();
  }
});

test('49.4: Declare adds only the names listed, names only; a name the root .env does not set is refused; a contributor is refused', async () => {
  const { repo } = mature({ scripts: true });
  fs.writeFileSync(path.join(repo, 'nexus.secrets.json'), `${JSON.stringify({ version: 1, secrets: [{ name: 'API_KEY', for: 'The app.', where: null, destinations: ['local'], provider: 'owner', chunk: null }] }, null, 2)}\n`);
  const { app, call, seen } = await serve(repo);
  try {
    const st = await call('GET', '/api/secrets');
    const db = st.json.secrets.find((s) => s.name === 'DB_URL');
    assert.equal(db.declared, false, 'an undeclared vault name is listed, marked');
    assert.equal(db.set, true);
    assert.equal(st.json.secrets.filter((s) => s.declared).length, 1);
    const bad = await call('POST', '/api/secrets/manifest', { fromEnv: true, names: ['NOPE_KEY'] });
    assert.equal(bad.status, 400);
    assert.match(bad.json.error, /NOPE_KEY: not a name the root \.env sets/);
    const w = await call('POST', '/api/secrets/manifest', { fromEnv: true, names: ['DB_URL'] });
    assert.equal(w.status, 200);
    assert.deepEqual(w.json.added, ['DB_URL']);
    const man = fs.readFileSync(path.join(repo, 'nexus.secrets.json'), 'utf8');
    assert.ok(!man.includes(SENTINEL), 'names only');
    assert.deepEqual(JSON.parse(man).secrets.map((e) => e.name), ['API_KEY', 'DB_URL']);
    assert.equal((await call('GET', '/api/secrets')).json.secrets.find((s) => s.name === 'DB_URL').declared, true);
    noSentinel(seen);
  } finally {
    await app.close();
  }
  fs.rmSync(path.join(repo, '.owner'));
  const c = await serve(repo);
  try {
    assert.equal((await c.call('POST', '/api/secrets/manifest', { fromEnv: true, names: ['API_KEY'] })).status, 403);
  } finally {
    await c.app.close();
  }
});
