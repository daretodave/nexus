// The vault screens' server side (spec 42, 42.8): what GET /api/secrets adds for the GUI (out-of-sync destinations,
// the plan's open secret requests, the importable dotenv files), Sync's push of a stored value, the Vault's "Add a
// secret" (declare, store, push), the import's per-name places and its "looks public" hint, the inbox's key rows,
// and the board's secret gate fields. Every repo is a temp one with the kit's secrets scripts copied in; every sink
// is a fake that records its calls; no test reads a real vault or runs gh, vercel or wrangler.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/server.mjs';
import { importableEnv, looksOf, parseRequest } from '../server/secrets.mjs';
import { boardFrom, secretsOf } from '../server/plan.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');
// Test values only: secret-shaped, never a real token.
const GH = 'ghp_TESTONLY_v4ult_a1b2c3d4';
const VERCEL = 'vrc_TESTONLY_v4ult_zz99yy88';
const DB = 'postgres://dev:TESTONLY_pw_42@db.internal:5432/app';
const MANIFEST = {
  version: 1,
  secrets: [
    { name: 'GH_TOKEN', for: 'gh in the loop.', where: 'https://github.com/settings/tokens', destinations: ['local', 'github-actions'], provider: 'owner', chunk: '07.3' },
    { name: 'VERCEL_TOKEN', for: 'Deploys.', where: 'https://vercel.com/account/tokens', destinations: ['local', 'vercel'], provider: 'owner', chunk: '07.1' },
  ],
};
const DOTENV = '.env';

function vaultRepo({ owner = true, manifest = MANIFEST } = {}) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-vault-ui-'));
  const repo = path.join(ws, 'app');
  fs.mkdirSync(repo);
  execFileSync('git', ['init', '-q'], { cwd: repo });
  fs.writeFileSync(path.join(repo, '.gitignore'), `${DOTENV}\n${DOTENV}.workspace\n${DOTENV}.local\n.nexus/\n.owner\n`);
  fs.cpSync(path.join(KIT, 'templates', 'scripts'), path.join(repo, 'scripts'), { recursive: true });
  if (owner) fs.writeFileSync(path.join(repo, '.owner'), 'owner\n');
  if (manifest) fs.writeFileSync(path.join(repo, 'nexus.secrets.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { ws, repo };
}

function fakeRun() {
  const calls = [];
  return { calls, run: (cmd, args, { input } = {}) => { calls.push({ cmd, args, input }); return { status: 0 }; } };
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

async function serve(repo, run) {
  const app = await startServer({ repo, provider: FAKE, pollRuns: false, dist: NO_DIST, ghLogin: async () => '', secrets: { run } });
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
  for (const t of texts) for (const v of values) assert.ok(!String(t).includes(v), 'a value reached a response');
};

function request(repo, id, names) {
  fs.mkdirSync(path.join(repo, 'plan', 'pending'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'plan', 'pending', `secrets-${id}.md`), `---\ndate: 2026-10-20\n---\n## Notes\n- [needs-user-call] secret request ${id}: set ${names.join(', ')} in your terminal or the GUI's vault (never in a session), and ${id} is ready again. Then delete this row.\n`);
}

test('parseRequest, looksOf and importableEnv: the pure rules', () => {
  assert.deepEqual(parseRequest('secret request 07.1: set VERCEL_TOKEN, GH_TOKEN in your terminal or the GUI\'s vault'), { chunk: '07.1', names: ['VERCEL_TOKEN', 'GH_TOKEN'], to: [] }, 'a service only when the request names one (resolveRequest matches the rest against the picks)');
  assert.equal(parseRequest('Should 7.1 deploy on push?'), null);
  assert.equal(looksOf('PUBLIC_SITE_URL', 'https://lantern.example'), 'public');
  assert.equal(looksOf('MAP_STYLE_URL', 'https://tiles.example/style.json'), 'public');
  assert.equal(looksOf('DATABASE_URL', DB), 'secret');
  assert.equal(looksOf('LOG_LEVEL', 'info'), 'setting');
  assert.equal(looksOf('DEBUG', 'true'), 'setting');
  assert.equal(looksOf('FEATURE', 'on'), 'setting');
  assert.equal(looksOf('SMTP_PASSWORD', 'TESTONLY-hunter2-x'), 'secret');
  assert.ok(importableEnv(`${DOTENV}.local`) && importableEnv(`${DOTENV}.production`));
  for (const no of [DOTENV, `${DOTENV}.workspace`, `${DOTENV}.example`, 'secrets.txt', `${DOTENV}/../x`]) assert.equal(importableEnv(no), false, no);
});

test('secretsOf: the board learns what a chunk waits on; a contributor sees every secret chunk as the owner\'s', () => {
  assert.deepEqual(secretsOf({ secrets: ['VERCEL_TOKEN'], needsSecret: ['VERCEL_TOKEN'], why: 'needs secret VERCEL_TOKEN' }), { secrets: ['VERCEL_TOKEN'], needsSecret: ['VERCEL_TOKEN'] });
  assert.deepEqual(secretsOf({ secrets: ['TIDES_API_KEY'], why: 'owner only (secrets TIDES_API_KEY)' }), { secrets: ['TIDES_API_KEY'], needsSecret: ['TIDES_API_KEY'], ownerOnly: true });
  assert.deepEqual(secretsOf({ secrets: [] }), {});
  const board = boardFrom(
    { next: [], inFlight: [], blocked: [{ id: '07.1', spec: '07', why: 'needs secret VERCEL_TOKEN', secrets: ['VERCEL_TOKEN'], needsSecret: ['VERCEL_TOKEN'] }] },
    { specs: [{ spec: '07', title: 'Deploys', file: 'plan/07-deploys.md', chunks: [{ id: '07.1', title: 'Preview deploys', size: 'M', state: 'ready' }] }] },
  );
  assert.deepEqual(board.specs[0].chunks[0].needsSecret, ['VERCEL_TOKEN']);
});

test('status: a push older than the value is out of sync, Sync pushes the stored value again, and requests and dotenv files show by name', async () => {
  const { repo } = vaultRepo();
  request(repo, '07.1', ['VERCEL_TOKEN']);
  fs.writeFileSync(path.join(repo, `${DOTENV}.local`), `GH_TOKEN=${GH}\n`);
  const sink = fakeRun();
  const { app, call, seen } = await serve(repo, sink.run);
  try {
    let s = await call('GET', '/api/secrets');
    assert.equal(s.status, 200);
    assert.deepEqual(s.json.requests.map((r) => [r.chunk, r.missing.join(), r.file, r.date]), [['07.1', 'VERCEL_TOKEN', 'plan/pending/secrets-07.1.md', '2026-10-20']]);
    assert.deepEqual(s.json.envFiles, [`${DOTENV}.local`]);

    assert.equal((await call('POST', '/api/secrets/GH_TOKEN', { value: GH, destinations: ['github-actions'] })).status, 200);
    await new Promise((r) => setTimeout(r, 15));
    assert.equal((await call('POST', '/api/secrets/GH_TOKEN', { value: `${GH}2` })).status, 200); // a rotation, not pushed
    s = await call('GET', '/api/secrets');
    const gh = s.json.secrets.find((x) => x.name === 'GH_TOKEN');
    assert.equal(gh.destinations.find((d) => d.destination === 'github-actions').stale, true);
    assert.ok(gh.setAt);

    const p = await call('POST', '/api/secrets/GH_TOKEN/push', { destinations: ['github-actions'] });
    assert.equal(p.status, 200, JSON.stringify(p.json));
    assert.equal(sink.calls.at(-1).input, `${GH}2`, 'the stored value, on stdin');
    s = await call('GET', '/api/secrets');
    assert.equal(s.json.secrets.find((x) => x.name === 'GH_TOKEN').destinations.find((d) => d.destination === 'github-actions').stale, undefined);
    assert.equal((await call('POST', '/api/secrets/GH_TOKEN/push', { destinations: [] })).status, 400);

    // the request leaves once its names are set
    assert.equal((await call('POST', '/api/secrets/VERCEL_TOKEN', { value: VERCEL })).status, 200);
    assert.deepEqual((await call('GET', '/api/secrets')).json.requests, []);
    noValues(seen, [GH, `${GH}2`, VERCEL]);
  } finally {
    await app.close();
  }
});

test('Add a secret declares the name and the places ticked, stores it, then pushes; a contributor cannot declare', async () => {
  const { repo } = vaultRepo();
  const sink = fakeRun();
  const { app, call, seen } = await serve(repo, sink.run);
  try {
    const r = await call('POST', '/api/secrets/SEARCH_ADMIN_KEY', { value: GH, declare: true, for: 'Rebuilds the search index', destinations: ['github-actions'] });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const man = JSON.parse(fs.readFileSync(path.join(repo, 'nexus.secrets.json'), 'utf8'));
    assert.deepEqual(man.secrets.find((e) => e.name === 'SEARCH_ADMIN_KEY'), { name: 'SEARCH_ADMIN_KEY', for: 'Rebuilds the search index', where: null, destinations: ['local', 'github-actions'], provider: 'owner', chunk: null });
    assert.deepEqual(r.json.pushed.map((p) => [p.destination, p.ok]), [['github-actions', true]]);
    // an existing name gains a place
    assert.equal((await call('POST', '/api/secrets/VERCEL_TOKEN', { value: VERCEL, declare: true, destinations: ['github-actions'] })).status, 200);
    const man2 = JSON.parse(fs.readFileSync(path.join(repo, 'nexus.secrets.json'), 'utf8'));
    assert.deepEqual(man2.secrets.find((e) => e.name === 'VERCEL_TOKEN').destinations, ['local', 'vercel', 'github-actions']);
    noValues(seen, [GH, VERCEL]);
  } finally {
    await app.close();
  }
  const c = vaultRepo({ owner: false });
  const s2 = await serve(c.repo, fakeRun().run);
  try {
    const r = await s2.call('POST', '/api/secrets/MY_KEY', { value: GH, declare: true });
    assert.equal(r.status, 403);
    assert.equal(fs.existsSync(path.join(c.repo, DOTENV)), false, 'nothing stored');
  } finally {
    await s2.app.close();
  }
});

test('import: a dotenv at the root by name, each name\'s look, and the places ticked per name', async () => {
  const { repo } = vaultRepo();
  fs.writeFileSync(path.join(repo, `${DOTENV}.production`), `# deploys\nVERCEL_TOKEN=${VERCEL}\nPUBLIC_SITE_URL=https://lantern.example\nDATABASE_URL=${DB}\nLOG_LEVEL=info\n`);
  const sink = fakeRun();
  const { app, call, seen } = await serve(repo, sink.run);
  try {
    assert.equal((await call('POST', '/api/secrets/import', { file: DOTENV })).status, 400, 'never the vault itself');
    assert.equal((await call('POST', '/api/secrets/import', { file: `${DOTENV}.nope` })).status, 404);
    const p = await call('POST', '/api/secrets/import', { file: `${DOTENV}.production` });
    assert.equal(p.status, 200);
    assert.equal(p.json.comments, 1);
    assert.deepEqual(p.json.names.map((n) => [n.name, n.looks]), [['VERCEL_TOKEN', 'secret'], ['PUBLIC_SITE_URL', 'public'], ['DATABASE_URL', 'secret'], ['LOG_LEVEL', 'setting']]);
    const c = await call('POST', '/api/secrets/import', { file: `${DOTENV}.production`, confirm: true, names: ['VERCEL_TOKEN', 'DATABASE_URL'], destinations: { VERCEL_TOKEN: ['local', 'vercel'], DATABASE_URL: ['local', 'github-actions'] } });
    assert.equal(c.status, 200, JSON.stringify(c.json));
    assert.deepEqual(c.json.stored, ['VERCEL_TOKEN', 'DATABASE_URL']);
    assert.deepEqual(c.json.pushed.map((x) => [x.name, x.destination, x.ok]), [['VERCEL_TOKEN', 'vercel', true], ['DATABASE_URL', 'github-actions', true]]);
    const man = JSON.parse(fs.readFileSync(path.join(repo, 'nexus.secrets.json'), 'utf8'));
    assert.deepEqual(man.secrets.find((e) => e.name === 'DATABASE_URL').destinations, ['local', 'github-actions']);
    assert.equal(sink.calls.find((x) => x.cmd === 'gh').input, DB);
    noValues(seen, [VERCEL, DB]);
  } finally {
    await app.close();
  }
});

test('inbox: a secret request is a key row with its chunk and names, and leaves once the value is set', async () => {
  const { repo } = vaultRepo();
  request(repo, '07.1', ['VERCEL_TOKEN']);
  const { app, call } = await serve(repo, fakeRun().run);
  try {
    let rows = (await call('GET', '/api/inbox')).json;
    const k = rows.find((x) => x.src === 'durable' && x.durable.secret);
    assert.ok(k, JSON.stringify(rows));
    assert.deepEqual(k.durable.secret, { chunk: '07.1', names: ['VERCEL_TOKEN'], to: [], toByName: { VERCEL_TOKEN: [] }, services: {}, missing: ['VERCEL_TOKEN'] });
    await call('POST', '/api/secrets/VERCEL_TOKEN', { value: VERCEL });
    rows = (await call('GET', '/api/inbox')).json;
    assert.equal(rows.filter((x) => x.src === 'durable' && /secret request/.test(x.question)).length, 0);
  } finally {
    await app.close();
  }
});

test('Start empty writes an empty manifest once (owner only); one that exists stays', async () => {
  const { repo } = vaultRepo({ manifest: null });
  const { app, call } = await serve(repo, fakeRun().run);
  try {
    const r = await call('POST', '/api/secrets/manifest', {});
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.created, true);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(repo, 'nexus.secrets.json'), 'utf8')).secrets, []);
    assert.equal((await call('POST', '/api/secrets/manifest', {})).json.created, false);
  } finally {
    await app.close();
  }
  const c = vaultRepo({ owner: false, manifest: null });
  const s2 = await serve(c.repo, fakeRun().run);
  try {
    assert.equal((await s2.call('POST', '/api/secrets/manifest', {})).status, 403);
    assert.equal(fs.existsSync(path.join(c.repo, 'nexus.secrets.json')), false);
  } finally {
    await s2.app.close();
  }
});

test('a contributor\'s inbox never carries a secret request', async () => {
  const { repo } = vaultRepo({ owner: false });
  request(repo, '07.1', ['VERCEL_TOKEN']);
  const { app, call } = await serve(repo, fakeRun().run);
  try {
    const rows = (await call('GET', '/api/inbox')).json;
    assert.equal(rows.filter((x) => x.src === 'durable' && /secret request/.test(x.question)).length, 0);
  } finally {
    await app.close();
  }
});

test('import: replacing a declared name goes to its own places; an undeclared place is refused before anything is stored', async () => {
  const { repo } = vaultRepo();
  const sink = fakeRun();
  const { app, call, seen } = await serve(repo, sink.run);
  const NEW = 'vrc_TESTONLY_v4ult_new_77xx66';
  try {
    assert.equal((await call('POST', '/api/secrets/VERCEL_TOKEN', { value: VERCEL })).status, 200);
    const text = `VERCEL_TOKEN=${NEW}\n`;
    const r = await call('POST', '/api/secrets/import', { text, confirm: true, names: ['VERCEL_TOKEN'], destinations: { VERCEL_TOKEN: ['local', 'github-actions'] } });
    assert.equal(r.status, 400, JSON.stringify(r.json));
    assert.match(r.json.error, /VERCEL_TOKEN does not go to github-actions/);
    assert.deepEqual(sink.calls, [], 'nothing pushed');
    const man = JSON.parse(fs.readFileSync(path.join(repo, 'nexus.secrets.json'), 'utf8'));
    assert.deepEqual(man.secrets.find((e) => e.name === 'VERCEL_TOKEN').destinations, ['local', 'vercel'], 'the manifest is untouched');
    assert.ok(!fs.readFileSync(path.join(repo, DOTENV), 'utf8').includes(NEW), 'the old value stays');
    const ok = await call('POST', '/api/secrets/import', { text, confirm: true, names: ['VERCEL_TOKEN'], destinations: { VERCEL_TOKEN: ['local', 'vercel'] } });
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    assert.deepEqual(ok.json.pushed.map((p) => [p.name, p.destination, p.ok]), [['VERCEL_TOKEN', 'vercel', true]]);
    assert.ok(!sink.calls.some((c) => c.cmd === 'gh'), 'never Actions');
    noValues(seen, [VERCEL, NEW]);
  } finally {
    await app.close();
  }
});

test('the vault keeps every value: Add a secret and the import declare local even when it is unticked', async () => {
  const { repo } = vaultRepo();
  const { app, call } = await serve(repo, fakeRun().run);
  try {
    assert.equal((await call('POST', '/api/secrets/NEW_KEY', { value: GH, declare: true, local: false, destinations: ['github-actions'] })).status, 200);
    let man = JSON.parse(fs.readFileSync(path.join(repo, 'nexus.secrets.json'), 'utf8'));
    assert.deepEqual(man.secrets.find((e) => e.name === 'NEW_KEY').destinations, ['local', 'github-actions']);
    const st = (await call('GET', '/api/secrets')).json;
    assert.equal(st.secrets.find((s) => s.name === 'NEW_KEY').destinations[0].state, 'set', 'the table draws Local set');
    assert.equal((await call('POST', '/api/secrets/import', { text: `OTHER_KEY=${DB}\n`, confirm: true, names: ['OTHER_KEY'], destinations: { OTHER_KEY: ['github-actions'] } })).status, 200);
    man = JSON.parse(fs.readFileSync(path.join(repo, 'nexus.secrets.json'), 'utf8'));
    assert.deepEqual(man.secrets.find((e) => e.name === 'OTHER_KEY').destinations, ['local', 'github-actions']);
  } finally {
    await app.close();
  }
});

test('a secret request is open in the Inbox and the Vault alike, whatever the server\'s own environment holds', async () => {
  const { repo } = vaultRepo();
  request(repo, '07.1', ['VERCEL_TOKEN']);
  const had = Object.prototype.hasOwnProperty.call(process.env, 'VERCEL_TOKEN');
  const was = process.env.VERCEL_TOKEN;
  process.env.VERCEL_TOKEN = 'x';
  const { app, call } = await serve(repo, fakeRun().run);
  try {
    const st = (await call('GET', '/api/secrets')).json;
    assert.deepEqual(st.requests.map((r) => [r.chunk, r.missing]), [['07.1', ['VERCEL_TOKEN']]]);
    const rows = (await call('GET', '/api/inbox')).json;
    assert.equal(rows.filter((x) => x.src === 'durable' && x.durable.secret).length, 1);
  } finally {
    await app.close();
    if (had) process.env.VERCEL_TOKEN = was; else delete process.env.VERCEL_TOKEN;
  }
});

test('the oversight fallback marks a secret request like the inbox, and its answer route refuses one', async () => {
  const { repo } = vaultRepo();
  request(repo, '07.1', ['VERCEL_TOKEN']);
  request(repo, '07.3', ['GH_TOKEN']);
  fs.writeFileSync(path.join(repo, 'plan', 'pending', 'q.md'), '## Notes\n- [needs-user-call] Should 07.1 deploy on push?\n');
  const sent = [];
  const provider = () => ({ kind: 'fake', send(t) { sent.push(t); }, async interrupt() {}, async stop() {}, async fresh() {} });
  const app = await startServer({ repo, provider, pollRuns: false, dist: NO_DIST, ghLogin: async () => '', secrets: { run: fakeRun().run } });
  const headers = { 'x-nexus-token': app.token };
  const post = { ...headers, 'content-type': 'application/json', origin: `http://127.0.0.1:${app.port}` };
  const call = async (method, pathname, body) => {
    const r = await req(app.port, { method, pathname, headers: method === 'GET' ? headers : post, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, json: JSON.parse(r.data) };
  };
  try {
    assert.equal((await call('POST', '/api/secrets/GH_TOKEN', { value: GH })).status, 200);
    const { durable } = (await call('GET', '/api/oversight')).json;
    const asks = durable.filter((d) => parseRequest(d.text));
    assert.deepEqual(asks.map((d) => d.secret), [{ chunk: '07.1', names: ['VERCEL_TOKEN'], to: [], toByName: { VERCEL_TOKEN: [] }, services: {}, missing: ['VERCEL_TOKEN'] }], 'marked, and the one already set has left');
    const row = asks[0];
    const r = await call('POST', '/api/oversight/answer', { answers: [{ file: row.file, line: row.line, text: row.text, answer: 'PASTED_VALUE_xyz123' }] });
    assert.ok(r.status >= 400 && r.status < 500, JSON.stringify(r.json));
    // The same row with its text dropped or changed: refused by where it sits in the plan.
    const r2 = await call('POST', '/api/oversight/answer', { answers: [{ file: row.file, line: row.line, text: 'ok', answer: 'PASTED_VALUE_xyz123' }] });
    assert.ok(r2.status >= 400 && r2.status < 500, JSON.stringify(r2.json));
    assert.ok(!sent.some((t) => String(t).includes('PASTED_VALUE_xyz123')), 'the value never reached a session');
    const plain = durable.find((d) => !parseRequest(d.text));
    assert.equal((await call('POST', '/api/oversight/answer', { answers: [{ file: plain.file, line: plain.line, text: plain.text, answer: 'yes' }] })).status, 200);
  } finally {
    await app.close();
  }
});

test('49.5: the Actions column is read from gh secret list (names only), kept briefly, asked again after a push; unknown when gh cannot tell', async () => {
  const { repo } = vaultRepo({ manifest: { version: 1, secrets: [
    MANIFEST.secrets[0],
    { name: 'ACTIONS_PAT', for: 'The cloud loop.', where: null, destinations: ['github-actions'], provider: 'owner', chunk: null },
  ] } });
  execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/me/app.git'], { cwd: repo });
  fs.writeFileSync(path.join(repo, DOTENV), `GH_TOKEN=${GH}\n`);
  const calls = [];
  let answer = { status: 0, stdout: JSON.stringify([{ name: 'ACTIONS_PAT' }]) };
  const run = (cmd, args, opts = {}) => {
    calls.push({ cmd, args: args.join(' '), input: opts.input });
    return cmd === 'gh' && args[1] === 'list' ? answer : { status: 0 };
  };
  const { app, call, seen } = await serve(repo, run);
  const lists = () => calls.filter((c) => c.args.startsWith('secret list')).length;
  const actions = (st, n) => st.json.secrets.find((x) => x.name === n).destinations.find((d) => d.destination === 'github-actions');
  try {
    let s = await call('GET', '/api/secrets');
    assert.equal(s.status, 200, JSON.stringify(s.json));
    assert.equal(actions(s, 'ACTIONS_PAT').remote, 'set', 'GitHub lists it: set, though the vault never pushed it');
    assert.equal(actions(s, 'GH_TOKEN').remote, 'not set');
    assert.equal(calls.find((c) => c.args.startsWith('secret list')).args, 'secret list --json name,updatedAt', 'names and dates only');
    assert.ok(calls.filter((c) => c.args.startsWith('secret list')).every((c) => !c.input), 'no value goes to a list');
    await call('GET', '/api/secrets');
    assert.equal(lists(), 1, 'kept briefly: the vault polls');

    answer = { status: 0, stdout: JSON.stringify([{ name: 'ACTIONS_PAT' }, { name: 'GH_TOKEN' }]) };
    assert.equal((await call('POST', '/api/secrets/GH_TOKEN/push', { destinations: ['github-actions'] })).status, 200);
    s = await call('GET', '/api/secrets');
    assert.equal(lists(), 2, 'a push asks GitHub again');
    assert.equal(actions(s, 'GH_TOKEN').remote, 'set');
    noValues(seen, [GH]);
  } finally {
    await app.close();
  }

  answer = { status: 4 };
  const again = await serve(repo, run);
  try {
    const s = await again.call('GET', '/api/secrets');
    assert.equal(actions(s, 'ACTIONS_PAT').remote, 'unknown', 'gh not signed in: unknown, never missing');
  } finally {
    await again.app.close();
  }
});

test('49.5 follow-up: GET /api/secrets carries gh\'s updatedAt per destination, a date and never a value', async () => {
  const { repo } = vaultRepo({ manifest: { version: 1, secrets: [
    { name: 'ACTIONS_PAT', for: 'The cloud loop.', where: null, destinations: ['github-actions'], provider: 'owner', chunk: null },
  ] } });
  execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/me/app.git'], { cwd: repo });
  const run = (cmd, args) => (cmd === 'gh' && args[1] === 'list' ? { status: 0, stdout: JSON.stringify([{ name: 'ACTIONS_PAT', updatedAt: '2026-08-23T10:00:00Z' }]) } : { status: 0 });
  const { app, call } = await serve(repo, run);
  try {
    const s = await call('GET', '/api/secrets');
    const d = s.json.secrets[0].destinations[0];
    assert.deepEqual([d.remote, d.remoteAt], ['set', '2026-08-23T10:00:00Z']);
  } finally {
    await app.close();
  }
});
