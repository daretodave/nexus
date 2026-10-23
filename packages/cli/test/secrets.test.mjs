// The GUI server's secrets API and the vault mask (spec 42, A13): names and status out, a value in only through a
// POST body, into the vault and a sink's stdin, and never back out: no response body, header or log carries it.
// Every repo here is a temp one with the kit's own secrets scripts copied in, a fake vault (.env in the temp repo,
// .env.workspace in its temp workspace), and a sink runner that records its calls: no test runs gh, vercel or
// wrangler, and none reads a real vault.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/server.mjs';
import { createMask, createSecrets, maskFor } from '../server/secrets.mjs';
import { runCli } from '../server/headless.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');
// Test values only: secret-shaped (8+ characters, not one plain word), never a real token.
const GH = 'ghp_TESTONLY_a1b2c3d4e5f6g7h8';
const VERCEL = 'vrc_TESTONLY_zz99yy88xx77';
const DEV = 'dev-key-TESTONLY-4242';
const MANIFEST = {
  version: 1,
  secrets: [
    { name: 'GH_TOKEN', for: 'gh in the loop.', where: 'https://github.com/settings/tokens', destinations: ['local', 'github-actions'], provider: 'owner', chunk: '07.3' },
    { name: 'VERCEL_TOKEN', for: 'Deploys.', where: null, destinations: ['local', 'vercel'], provider: 'owner', chunk: null },
  ],
};

function vaultRepo({ owner = true, env = '', manifest = MANIFEST, scripts = true } = {}) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-vault-'));
  const repo = path.join(ws, 'app');
  fs.mkdirSync(repo);
  execFileSync('git', ['init', '-q'], { cwd: repo });
  fs.writeFileSync(path.join(repo, '.gitignore'), '.env\n.env.workspace\n.nexus/\n.owner\n');
  if (scripts) fs.cpSync(path.join(KIT, 'templates', 'scripts'), path.join(repo, 'scripts'), { recursive: true });
  if (owner) fs.writeFileSync(path.join(repo, '.owner'), 'owner\n');
  if (manifest) fs.writeFileSync(path.join(repo, 'nexus.secrets.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  if (env) fs.writeFileSync(path.join(repo, '.env'), env);
  return { ws, repo };
}

function fakeRun() {
  const calls = [];
  const run = (cmd, args, { input } = {}) => { calls.push({ cmd, args, input }); return { status: 0 }; };
  return { calls, run };
}

const FAKE = () => ({ kind: 'fake', send() {}, async interrupt() {}, async stop() {}, async fresh() {} });

function req(port, { method = 'GET', pathname, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: pathname, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, data, headers: JSON.stringify(res.headers) }));
    });
    r.on('error', reject);
    r.end(body);
  });
}

async function serve(repo, run) {
  const app = await startServer({ repo, provider: FAKE, pollRuns: false, dist: NO_DIST, ghLogin: async () => '', secrets: { run } });
  const seen = [];
  const headers = { 'x-nexus-token': app.token };
  const post = { ...headers, 'content-type': 'application/json', origin: `http://127.0.0.1:${app.port}` };
  const call = async (method, pathname, body) => {
    const r = await req(app.port, { method, pathname, headers: method === 'GET' ? headers : post, body: body === undefined ? undefined : JSON.stringify(body) });
    seen.push(r.data, r.headers);
    return { status: r.status, json: JSON.parse(r.data) };
  };
  const hello = () => new Promise((resolve, reject) => {
    const r = http.get({ host: '127.0.0.1', port: app.port, path: `/api/events?t=${app.token}`, headers: { host: `127.0.0.1:${app.port}` } }, (res) => {
      res.once('data', (d) => { resolve(String(d)); r.destroy(); });
    });
    r.on('error', reject);
  });
  return { app, call, hello, seen };
}

/** Everything this process writes to stdout and stderr (and console) while `fn` runs: the server's log. */
async function logged(fn) {
  const out = [];
  const keep = { o: process.stdout.write, e: process.stderr.write };
  const tap = (orig) => function (chunk, ...rest) { out.push(String(chunk)); return orig.call(this, chunk, ...rest); };
  process.stdout.write = tap(keep.o);
  process.stderr.write = tap(keep.e);
  try { await fn(); } finally { process.stdout.write = keep.o; process.stderr.write = keep.e; }
  return out;
}

const noValues = (texts, values = [GH, VERCEL, DEV]) => {
  for (const t of texts) for (const v of values) assert.ok(!String(t).includes(v), 'a value reached a response');
};

test('the mask replaces each secret-shaped value by name, deep, and leaves short and configuration values alone', () => {
  const m = createMask();
  assert.deepEqual(m.deep({ a: 'x' }), { a: 'x' }, 'nothing to mask: the same data');
  m.set([['GH_TOKEN', GH], ['LONGER', `${GH}-and-more`]]);
  assert.equal(m.text(`a ${GH}-and-more b ${GH}`), 'a [secret LONGER] b [secret GH_TOKEN]', 'the longer value first');
  assert.deepEqual(m.deep({ list: [{ text: `token ${GH}` }], [GH]: 1, n: 3, ok: true, none: null }), { list: [{ text: 'token [secret GH_TOKEN]' }], '[secret GH_TOKEN]': 1, n: 3, ok: true, none: null });
});

test('a repo without the secrets scripts reads as a missing vault (not a failure), its writes answer 409, and the mask stays empty', async () => {
  const { repo } = vaultRepo({ scripts: false });
  const { app, call } = await serve(repo, fakeRun().run);
  try {
    const r = await call('GET', '/api/secrets');
    assert.equal(r.status, 200);
    assert.equal(r.json.available, false);
    assert.equal(r.json.vaultState, 'missing');
    assert.doesNotMatch(JSON.stringify(r.json), /templates\/scripts/, 'no kit path in the answer');
    assert.equal((await call('POST', '/api/secrets/GH_TOKEN', { value: GH })).status, 409);
    assert.equal((await call('POST', '/api/secrets/import', { text: `GH_TOKEN=${GH}\n` })).status, 409);
    assert.ok(!fs.existsSync(path.join(repo, '.env')), 'nothing stored');
    const old = vaultRepo();
    fs.writeFileSync(path.join(old.repo, 'scripts', 'secrets.mjs'), 'export const USAGE = "";\n');
    const s = createSecrets({ repo: old.repo, owner: () => true });
    const st = await s.status();
    assert.equal(st.status, 409);
    assert.match(st.error, /scripts\/secrets\.mjs is older than the GUI needs \(no main\)/);
    assert.equal((await s.refresh()).size, 0);
  } finally {
    await app.close();
  }
});

test('owner: a masked POST stores the value, pushes it through the sink on stdin, and nothing echoes it', async () => {
  const { repo } = vaultRepo();
  const sink = fakeRun();
  const { app, call, hello, seen } = await serve(repo, sink.run);
  try {
    const before = await call('GET', '/api/secrets');
    assert.equal(before.status, 200);
    assert.equal(before.json.mode, 'owner');
    assert.equal(before.json.projectSecretsNeeded, 2);
    const gh0 = before.json.secrets.find((s) => s.name === 'GH_TOKEN');
    assert.deepEqual({ set: gh0.set, chunk: gh0.chunk, dest: gh0.destinations.map((d) => `${d.destination}:${d.state}`) }, { set: false, chunk: '07.3', dest: ['local:missing', 'github-actions:not pushed'] });

    let r;
    const log = await logged(async () => { r = await call('POST', '/api/secrets/GH_TOKEN', { value: GH, destinations: ['github-actions'], repo: 'me/app' }); });
    noValues(log, [GH]);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.stored, true);
    assert.equal(r.json.ring, 'local');
    assert.deepEqual(r.json.pushed.map((p) => [p.destination, p.ok]), [['github-actions', true]]);
    assert.equal(sink.calls.length, 1);
    assert.equal(sink.calls[0].cmd, 'gh');
    assert.equal(sink.calls[0].input, GH, 'the value goes on stdin');
    assert.ok(!sink.calls[0].args.includes(GH), 'never on argv');
    assert.deepEqual(sink.calls[0].args.slice(-2), ['--repo', 'me/app']);
    assert.match(fs.readFileSync(path.join(repo, '.env'), 'utf8'), /^GH_TOKEN=/m, 'into the vault');

    const after = await call('GET', '/api/secrets');
    const gh1 = after.json.secrets.find((s) => s.name === 'GH_TOKEN');
    assert.deepEqual(gh1.rings, ['local']);
    assert.deepEqual(gh1.destinations.map((d) => `${d.destination}:${d.state}`), ['local:set', 'github-actions:pushed']);
    assert.deepEqual(gh1.destinations[1].detail, { repo: 'me/app' });
    assert.equal(after.json.audit.at(-1)?.via, 'gui', 'the audit line says the GUI pushed it (the change feed reads that)');
    assert.deepEqual(after.json.audit.map((e) => `${e.action} ${e.name} ${e.destination}`), ['set GH_TOKEN local', 'push GH_TOKEN github-actions']);
    const audit = await call('GET', '/api/secrets/audit');
    assert.equal(audit.status, 200);
    assert.deepEqual(audit.json.events.map((e) => e.action), ['set', 'push']);
    assert.equal(audit.json.rotateDays, 90);

    // a second set is a rotation
    await call('POST', '/api/secrets/GH_TOKEN', { value: `${GH}x` });
    assert.equal((await call('GET', '/api/secrets/audit')).json.events.at(-1).action, 'rotate');

    // the transcript a tab reads is masked
    app.hub.tx({ kind: 'text', id: 't1', agent: 'main', text: `the token is ${GH}x, keep it` });
    const h = await hello();
    assert.match(h, /the token is \[secret GH_TOKEN\], keep it/);
    noValues([h, ...seen], [GH]);
  } finally {
    await app.close();
  }
});

test('a push is checked before anything is stored, and a bad value is refused without echoing it', async () => {
  const { repo } = vaultRepo();
  const sink = fakeRun();
  const { app, call, seen } = await serve(repo, sink.run);
  try {
    const wrong = await call('POST', '/api/secrets/GH_TOKEN', { value: GH, destinations: ['vercel'] });
    assert.equal(wrong.status, 400);
    assert.match(wrong.json.error, /GH_TOKEN does not go to vercel/);
    const undeclared = await call('POST', '/api/secrets/OTHER_TOKEN', { value: GH, destinations: ['github-actions'] });
    assert.equal(undeclared.status, 400);
    assert.match(undeclared.json.error, /not declared/);
    assert.ok(!fs.existsSync(path.join(repo, '.env')), 'nothing stored when a push could not go');
    const multi = await call('POST', '/api/secrets/GH_TOKEN', { value: `${GH}\nsecond-line` });
    assert.equal(multi.status, 409);
    assert.match(multi.json.error, /GH_TOKEN: a value on one line only/);
    const short = 'ab12';
    const name = await call('POST', '/api/secrets/lower', { value: short });
    assert.equal(name.status, 400);
    const empty = await call('POST', '/api/secrets/GH_TOKEN', { value: '' });
    assert.equal(empty.status, 400);
    assert.equal(sink.calls.length, 0);
    noValues(seen, [GH, 'second-line', short]);
    // a failed sink names its exit code, never what it printed; the value is stored all the same
    const failing = await startServer({ repo, provider: FAKE, pollRuns: false, dist: NO_DIST, ghLogin: async () => '', secrets: { run: () => ({ status: 4 }) } });
    try {
      const headers = { 'x-nexus-token': failing.token, 'content-type': 'application/json', origin: `http://127.0.0.1:${failing.port}` };
      const r = await req(failing.port, { method: 'POST', pathname: '/api/secrets/VERCEL_TOKEN', headers, body: JSON.stringify({ value: VERCEL, destinations: ['vercel'], environments: ['preview'] }) });
      const j = JSON.parse(r.data);
      assert.equal(r.status, 200);
      assert.equal(j.ok, false);
      assert.match(j.pushed[0].error, /vercel exited 4 \(preview\)/);
      noValues([r.data, r.headers], [VERCEL]);
    } finally {
      await failing.close();
    }
  } finally {
    await app.close();
  }
});

test('contributor: sinks refuse, a value stays local, and the view says no project secrets are needed', async () => {
  const { repo } = vaultRepo({ owner: false });
  const sink = fakeRun();
  const { app, call, seen } = await serve(repo, sink.run);
  try {
    const push = await call('POST', '/api/secrets/GH_TOKEN', { value: GH, destinations: ['github-actions'] });
    assert.equal(push.status, 403);
    assert.match(push.json.error, /refused in a contributor checkout/);
    assert.ok(!fs.existsSync(path.join(repo, '.env')));
    const ws = await call('POST', '/api/secrets/DEV_API_KEY', { value: DEV, ring: 'workspace' });
    assert.equal(ws.status, 409);
    assert.match(ws.json.error, /shared with sibling repos/);
    const ok = await call('POST', '/api/secrets/DEV_API_KEY', { value: DEV });
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    assert.equal(ok.json.ring, 'local');
    const view = await call('GET', '/api/secrets');
    assert.equal(view.json.mode, 'contributor');
    assert.equal(view.json.projectSecretsNeeded, 0);
    assert.deepEqual(view.json.localKeys, [{ name: 'DEV_API_KEY', rings: ['local'] }]);
    assert.equal(sink.calls.length, 0);
    assert.deepEqual((await call('GET', '/api/secrets/audit')).json.events, [], 'a contributor\'s own keys are not recorded');
    noValues(seen, [GH, DEV]);
  } finally {
    await app.close();
  }
});

test('import: a .env body previews names only, then stores on confirm and adds the names to the manifest', async () => {
  const { repo } = vaultRepo();
  const { app, call, seen } = await serve(repo, fakeRun().run);
  try {
    const text = `# Deploys\nVERCEL_TOKEN=${VERCEL}\nNEW_KEY="${DEV}" # a dev key\nlower=${GH}\nEMPTY=\n`;
    const p = await call('POST', '/api/secrets/import', { text });
    assert.equal(p.status, 200);
    assert.equal(p.json.preview, true);
    assert.deepEqual(p.json.names.map((n) => [n.name, n.declared, n.skip ?? null]), [['VERCEL_TOKEN', true, null], ['NEW_KEY', false, null], ['lower', false, 'not an env-var name']]);
    assert.ok(!fs.existsSync(path.join(repo, '.env')), 'a preview writes nothing');
    const c = await call('POST', '/api/secrets/import', { text, confirm: true });
    assert.equal(c.status, 200, JSON.stringify(c.json));
    assert.deepEqual(c.json.stored, ['VERCEL_TOKEN', 'NEW_KEY']);
    assert.deepEqual(c.json.added, ['NEW_KEY']);
    assert.deepEqual(c.json.skipped, [{ name: 'lower', why: 'not an env-var name' }]);
    const man = JSON.parse(fs.readFileSync(path.join(repo, 'nexus.secrets.json'), 'utf8'));
    assert.equal(man.secrets.find((e) => e.name === 'NEW_KEY').for, 'a dev key');
    const env = fs.readFileSync(path.join(repo, '.env'), 'utf8');
    assert.ok(env.includes(VERCEL) && env.includes(DEV));
    // the imported values are masked from then on
    app.hub.tx({ kind: 'system', text: `saw ${DEV}` });
    const o = await call('GET', '/api/secrets');
    assert.ok(o.json.secrets.some((s) => s.name === 'NEW_KEY' && s.set));
    noValues(seen, [VERCEL, DEV, GH]);
  } finally {
    await app.close();
  }
});

test('every JSON answer and SSE frame is masked, a terminal set included, but short and configuration values are not', async () => {
  const { repo } = vaultRepo({ env: `GH_TOKEN=${GH}\nMODE=production\nPIN=12345678\nSHORT=ab12cd\n` });
  fs.mkdirSync(path.join(repo, 'plan'));
  fs.writeFileSync(path.join(repo, 'plan', 'AUDIT.md'), `# Audit\n\n- [needs-user-call] the run printed ${GH} and ${VERCEL} in production\n`);
  const { app, call, hello, seen } = await serve(repo, fakeRun().run);
  try {
    const o = await call('GET', '/api/oversight');
    assert.equal(o.json.durable[0].text, `the run printed [secret GH_TOKEN] and ${VERCEL} in production`, 'set before the server started: masked; configuration: not');
    // a value set in a terminal while the server runs is masked on the next answer
    const later = new Date(Date.now() + 5000);
    fs.appendFileSync(path.join(repo, '.env'), `VERCEL_TOKEN=${VERCEL}\n`);
    fs.utimesSync(path.join(repo, '.env'), later, later);
    const o2 = await call('GET', '/api/oversight');
    assert.equal(o2.json.durable[0].text, 'the run printed [secret GH_TOKEN] and [secret VERCEL_TOKEN] in production');
    app.hub.tx({ kind: 'text', id: 'a', agent: 'main', text: `pin 12345678 short ab12cd key ${VERCEL}` });
    const h = await hello();
    assert.match(h, /pin 12345678 short ab12cd key \[secret VERCEL_TOKEN\]/);
    noValues([h, ...seen], [GH]);
    noValues([h, ...seen.slice(2)], [VERCEL]); // the first answer came before VERCEL_TOKEN was in the vault
  } finally {
    await app.close();
  }
});

test('nexus run masks a vault value in its output', async () => {
  const { repo } = vaultRepo({ env: `GH_TOKEN=${GH}\n` });
  let out = '';
  const stdout = { write: (s) => { out += s; } };
  const query = () => (async function* () { yield { type: 'result', subtype: 'success', session_id: 's', result: `echoed ${GH}`, is_error: false }; })();
  const code = await runCli(['x'], { stdout, stderr: { write() {} }, query, cwd: repo });
  assert.equal(code, 0);
  assert.equal(JSON.parse(out).result, 'echoed [secret GH_TOKEN]');
  const plain = await maskFor(fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-novault-')));
  assert.equal(plain.size, 0, 'no vault: nothing to mask');
});

test('the gh list is read in the background, once, and kept: the vault reads GitHub without holding the server', async () => {
  const { repo } = vaultRepo({ env: `GH_TOKEN=${GH}\n` });
  execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/example/app.git'], { cwd: repo });
  const calls = [];
  const ghRun = async (cmd, args, opts) => {
    calls.push({ cmd, args, cwd: opts.cwd });
    await new Promise((r) => setTimeout(r, 30));
    return { code: 0, stdout: JSON.stringify([{ name: 'GH_TOKEN', updatedAt: '2026-01-02T03:04:05Z' }]) };
  };
  const s = createSecrets({ repo, owner: () => true, ghRun });
  const remoteOf = (st) => st.secrets.find((x) => x.name === 'GH_TOKEN').destinations.find((d) => d.destination === 'github-actions');
  const [a, b] = await Promise.all([s.status(), s.status()]);
  for (const st of [a, b]) {
    assert.equal(st.status, 200);
    assert.equal(remoteOf(st).remote, 'set', 'the first look waits for gh and shows what it said');
  }
  assert.equal(calls.length, 1, 'two looks at once share one gh read');
  assert.deepEqual(calls[0].args.slice(0, 3), ['secret', 'list', '--json']);
  assert.equal(remoteOf(await s.status()).remote, 'set');
  assert.equal(calls.length, 1, 'kept: a look a moment later asks gh nothing');
});
