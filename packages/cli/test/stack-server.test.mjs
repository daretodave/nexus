// The stack hand-off's server side (server/stack.mjs) against temp folders: framework and workspace detection, the
// write targets, a save through the vault (the kit's real upsertEnv) and the mirror to the app's own file, no clobber,
// the gitignore and path guards, drift, legacy aliases, a public-prefix attempt refused, scrubbed answers, and Check it
// and an action reading tokens from the vault. Git is a fake check-ignore; fetch is a fake; no test reads a real vault.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openVault, upsertEnv, parseEnv } from '../../../templates/scripts/secrets-vault.mjs';
import { createStack, detectApps, defaultApp, workspaceShape, mirrorDotenv, mirrorJson, scrubber } from '../server/stack.mjs';
import { valueOf } from '../shared/stack/recipes.mjs';
import { removeTreeSync } from './helpers/tmp.mjs';

// Test values only.
const URL_ = 'https://abcdefghijklmnopqrst.supabase.co';
const PUB = 'sb_publishable_TESTONLYserver0';
const SECRET = 'sb_secret_TESTONLYserver00000';
const CF = 'cfut_TESTONLYserver00000000000000';
const VC = 'vcp_TESTONLYserver000000000';

const dirs = [];
test.after(() => removeTreeSync(dirs));

function tmp(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-stack-'));
  dirs.push(root);
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), typeof text === 'string' ? text : `${JSON.stringify(text, null, 2)}\n`);
  }
  return root;
}

/** A fake `git check-ignore`: every path is ignored unless named in `tracked`. */
const fakeGit = (tracked = []) => (args) => ({ status: args[2] === 'check-ignore' && tracked.includes(args.at(-1)) ? 1 : 0, stdout: '' });

function harness(root, { owner = true, sinks = [], tracked = [], fetchImpl, storeFails } = {}) {
  const git = fakeGit(tracked);
  const kit = { openVault: (o) => openVault({ ...o, git }), upsertEnv, parseEnv, localSettings: () => ({}) };
  const stored = [];
  const secrets = {
    status: async () => ({ status: 200, available: true, vaultState: 'ready', owner, vault: { keychain: null }, sinks }),
    store: async (name, b) => {
      if (storeFails) return { status: 409, error: `refused ${b.value}` };
      stored.push({ name, for: b.for, declare: b.declare, destinations: b.destinations });
      kit.openVault({ root }).set([[name, b.value]]);
      return { status: 200, ok: true, pushed: (b.destinations || []).map((d) => ({ destination: d, ok: true })) };
    },
  };
  let t = Date.parse('2026-10-23T10:00:00Z');
  const clock = { now: () => t, tick: (ms) => { t += ms; } };
  const stack = createStack({ repo: root, root, secrets, kit, git, owner: () => owner, fetchImpl, now: clock.now });
  return { stack, stored, clock, env: () => fs.readFileSync(path.join(root, '.env'), 'utf8') };
}

const noValue = (obj, values) => { const s = JSON.stringify(obj); for (const v of values) assert.ok(!s.includes(v), `a value reached an answer: ${v.slice(0, 6)}...`); };

test('detection: a fresh folder, a Next app, a pnpm workspace on Vite, npm workspaces', () => {
  assert.deepEqual(detectApps(tmp()), []);
  assert.deepEqual(defaultApp([]), { dir: '.', framework: 'next' });
  const next = tmp({ 'package.json': { name: 'site', dependencies: { next: '15', react: '19' } } });
  assert.deepEqual(detectApps(next).map((a) => [a.dir, a.framework]), [['.', 'next']]);
  const pnpm = tmp({
    'package.json': { name: 'mono', private: true, devDependencies: { turbo: '2' } },
    'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n  - \"packages/*\" # libs\n",
    'apps/web/package.json': { name: 'web', devDependencies: { vite: '8' } },
    'apps/api/package.json': { name: 'api', dependencies: { express: '5' } },
    'packages/ui/package.json': { name: 'ui' },
  });
  const apps = detectApps(pnpm);
  assert.deepEqual(apps.map((a) => [a.dir, a.framework]).sort(), [['.', 'node'], ['apps/api', 'node'], ['apps/web', 'vite'], ['packages/ui', 'node']]);
  assert.deepEqual(defaultApp(apps), { dir: 'apps/web', framework: 'vite' });
  const npmWs = tmp({ 'package.json': { workspaces: { packages: ['apps/*'] } }, 'apps/site/package.json': { dependencies: { next: '15' } } });
  assert.deepEqual(defaultApp(detectApps(npmWs)), { dir: 'apps/site', framework: 'next' });
});

test('workspace json layouts: flat, env, apps; anything else is unknown', () => {
  assert.equal(workspaceShape({ A: 'x' }), 'flat');
  assert.equal(workspaceShape({}), 'flat');
  assert.equal(workspaceShape({ env: { A: 'x' } }), 'env');
  assert.equal(workspaceShape({ 'apps/web': { A: 'x' }, 'apps/api': {} }), 'apps');
  assert.equal(workspaceShape({ A: 1 }), 'unknown');
  assert.equal(workspaceShape([]), 'unknown');
});

test('a dotenv mirror keeps other keys and comments, and refuses a tracked file or a path outside the root', () => {
  const root = tmp({ 'apps/web/.env.local': '# local dev\nFOO=bar\n\nNEXT_PUBLIC_SUPABASE_URL=old\n# end\n' });
  mirrorDotenv({ root, rel: 'apps/web/.env.local', entries: [['NEXT_PUBLIC_SUPABASE_URL', URL_], ['SUPABASE_URL', URL_]], upsertEnv, git: fakeGit() });
  assert.equal(fs.readFileSync(path.join(root, 'apps/web/.env.local'), 'utf8'), `# local dev\nFOO=bar\n\nNEXT_PUBLIC_SUPABASE_URL=${URL_}\n# end\nSUPABASE_URL=${URL_}\n`);
  assert.throws(() => mirrorDotenv({ root, rel: 'apps/web/.env.local', entries: [['A', 'b']], upsertEnv, git: fakeGit(['apps/web/.env.local']) }), /apps\/web\/\.env\.local is not gitignored\. Add it to \.gitignore first\./);
  assert.throws(() => mirrorDotenv({ root, rel: '../elsewhere/.env', entries: [['A', 'b']], upsertEnv, git: fakeGit() }), /outside the repo/);
  assert.throws(() => mirrorDotenv({ root, rel: 'x/.env', entries: [['A', 'two\nlines']], upsertEnv, git: fakeGit() }), /one line/);
  assert.ok(!fs.readdirSync(path.join(root, 'apps/web')).some((f) => f.includes('nexus-tmp')), 'no temp file left behind');
});

test('a json mirror writes in its layout, keeps indent and newline, refuses unknown and invalid files', () => {
  const root = tmp({
    'flat.json': '{\n    "KEEP": "1"\n}\n',
    'env.json': { env: { KEEP: '1' } },
    'apps.json': { 'apps/web': { KEEP: '1' } },
    'odd.json': { KEEP: 1 },
    'bad.json': '{ nope',
  });
  const put = (rel, appKey = 'apps/web') => mirrorJson({ base: root, rel, entries: [['SUPABASE_URL', URL_]], appKey, git: fakeGit() });
  put('flat.json');
  assert.equal(fs.readFileSync(path.join(root, 'flat.json'), 'utf8'), `{\n    "KEEP": "1",\n    "SUPABASE_URL": "${URL_}"\n}\n`);
  put('env.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'env.json'), 'utf8')), { env: { KEEP: '1', SUPABASE_URL: URL_ } });
  put('apps.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'apps.json'), 'utf8')), { 'apps/web': { KEEP: '1', SUPABASE_URL: URL_ } });
  assert.throws(() => put('odd.json'), /does not know this file's layout/);
  assert.throws(() => put('bad.json'), /not valid JSON; nexus left it alone/);
  assert.equal(fs.readFileSync(path.join(root, 'bad.json'), 'utf8'), '{ nope');
});

test('targets: a root Next app with a .env.local that sets a recipe name has it on; without one, the vault is the app\'s file', async () => {
  const withLocal = tmp({ 'package.json': { dependencies: { next: '15' } }, '.env.local': 'NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co\n' });
  const a = await harness(withLocal, { sinks: ['github-actions'] }).stack.status();
  assert.deepEqual(a.targets.map((t) => [t.id, t.on]), [['vault', true], ['app', true], ['github-actions', true]]);
  assert.ok(a.targets[0].locked);
  assert.ok(!('abs' in a.targets[1]), 'no absolute path in the answer');
  const plain = tmp({ 'package.json': { dependencies: { next: '15' } }, '.env.local': 'OTHER=1\n' });
  assert.equal((await harness(plain).stack.status()).targets.find((t) => t.id === 'app').on, false);
  const bare = tmp({ 'package.json': { dependencies: { next: '15' } } });
  const c = await harness(bare).stack.status();
  assert.deepEqual(c.targets.map((t) => t.id), ['vault']);
  assert.equal(c.appNote, 'Next.js reads .env at the root, so the vault\'s file is the app\'s file.');
  const fresh = await harness(tmp()).stack.status();
  assert.equal(fresh.fresh, true);
  assert.deepEqual(fresh.app, { dir: '.', framework: 'next', label: 'Next.js', prefix: 'NEXT_PUBLIC_' });
  const ws = tmp({ 'package.json': {}, '.env.workspace.json': { A: 1 } });
  const w = (await harness(ws).stack.status()).targets.find((t) => t.id === 'workspaceJson');
  assert.equal(w.disabled, true);
  assert.equal(w.on, false);
});

test('save: the URL goes to the vault and the app\'s file under both names; the secret under one; the ref rides along', async () => {
  const root = tmp({
    'package.json': { workspaces: ['apps/*'] },
    'apps/web/package.json': { dependencies: { next: '15' } },
    'apps/web/.env.local': '# mine\nOTHER=keep\n',
    '.env': 'GH_TOKEN=ghp_TESTONLYkeep\n',
  });
  const h = harness(root, { sinks: ['github-actions'] });
  await h.stack.pick({ picked: ['cloudflare', 'supabase', 'vercel'] });
  const r = await h.stack.save({ service: 'supabase', key: 'url', value: ` ${URL_} ` });
  assert.equal(r.status, 200, r.error);
  assert.deepEqual(r.names, ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL']);
  assert.deepEqual(r.written.map((w) => w.label), ['.env (the vault)', 'apps/web/.env.local']);
  const env = parseEnv(h.env());
  assert.equal(env.get('GH_TOKEN'), 'ghp_TESTONLYkeep', 'other keys never clobbered');
  assert.equal(env.get('NEXT_PUBLIC_SUPABASE_URL'), URL_);
  assert.equal(env.get('SUPABASE_PROJECT_REF'), 'abcdefghijklmnopqrst', 'the ref is parsed from the URL');
  assert.equal(fs.readFileSync(path.join(root, 'apps/web/.env.local'), 'utf8'), `# mine\nOTHER=keep\nNEXT_PUBLIC_SUPABASE_URL=${URL_}\nSUPABASE_URL=${URL_}\nSUPABASE_PROJECT_REF=abcdefghijklmnopqrst\n`);
  const s = await h.stack.save({ service: 'supabase', key: 'secret', value: SECRET });
  assert.deepEqual(s.names, ['SUPABASE_SECRET_KEY']);
  noValue(s, [SECRET]);
  assert.ok(h.stored.every((x) => x.declare === true && /Set up a stack/.test(x.for)), 'each name is declared with what it is for');
  assert.deepEqual(h.stored.find((x) => x.name === 'SUPABASE_SECRET_KEY').destinations, [], 'Supabase names do not go to Actions');
  await h.stack.save({ service: 'vercel', key: 'token', value: VC });
  assert.deepEqual(h.stored.find((x) => x.name === 'VERCEL_TOKEN').destinations, ['github-actions'], 'CI names go to Actions when it is ticked');
  const st = await h.stack.status();
  assert.equal(st.names.SUPABASE_URL.vault, true);
  assert.equal(st.names.SUPABASE_URL.app, true);
  assert.equal(st.values['supabase.url'].saved, true);
  noValue(st, [URL_.slice(8), SECRET, VC]);
});

test('drift: the app\'s file holds a different value than the vault, said by name only', async () => {
  const root = tmp({ 'package.json': { workspaces: ['apps/*'] }, 'apps/web/package.json': { dependencies: { vite: '8' } } });
  const h = harness(root);
  await h.stack.pick({ picked: ['supabase'] });
  await h.stack.save({ service: 'supabase', key: 'publishable', value: PUB });
  fs.writeFileSync(path.join(root, 'apps/web/.env.local'), 'VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_TESTONLYdifferent\n');
  const st = await h.stack.status();
  assert.equal(st.names.VITE_SUPABASE_PUBLISHABLE_KEY.drift, true);
  assert.equal(st.names.SUPABASE_PUBLISHABLE_KEY.drift, false);
  noValue(st, [PUB, 'sb_publishable_TESTONLYdifferent']);
  // Re-sync: the vault's value goes back to the file, read on the server, never posted.
  const r = await h.stack.save({ service: 'supabase', key: 'publishable', resync: true });
  assert.equal(r.status, 200, r.error);
  noValue(r, [PUB]);
  assert.equal(parseEnv(fs.readFileSync(path.join(root, 'apps/web/.env.local'), 'utf8')).get('VITE_SUPABASE_PUBLISHABLE_KEY'), PUB);
  assert.equal((await h.stack.status()).names.VITE_SUPABASE_PUBLISHABLE_KEY.drift, false);
});

test('aliases: a repo that reads SUPABASE_SERVICE_ROLE_KEY keeps it', async () => {
  const root = tmp({ 'package.json': { dependencies: { next: '15' } }, '.env': 'SUPABASE_SERVICE_ROLE_KEY=old_TESTONLY\n' });
  const h = harness(root);
  await h.stack.pick({ picked: ['supabase'] });
  const r = await h.stack.save({ service: 'supabase', key: 'secret', value: SECRET });
  assert.deepEqual(r.names, ['SUPABASE_SERVICE_ROLE_KEY']);
  assert.match(r.notes.join(' '), /Using SUPABASE_SERVICE_ROLE_KEY, the name this repo already reads\./);
  assert.ok(!parseEnv(h.env()).has('SUPABASE_SECRET_KEY'), 'never both unless asked');
  const both = await h.stack.save({ service: 'supabase', key: 'secret', value: SECRET, alsoNew: true });
  assert.deepEqual(both.names, ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY']);
});

test('refusals: a bad shape, a public name for a secret, a contributor, and a scrubbed store error', async () => {
  const root = tmp({ 'package.json': { dependencies: { next: '15' } } });
  const h = harness(root);
  const bad = await h.stack.save({ service: 'supabase', key: 'publishable', value: SECRET });
  assert.equal(bad.status, 400);
  assert.match(bad.error, /That is the secret key/);
  noValue(bad, [SECRET]);
  const v = valueOf('supabase', 'secret');
  v.env.public = 'SUPABASE_SECRET_KEY';
  try {
    const pub = await h.stack.save({ service: 'supabase', key: 'secret', value: SECRET });
    assert.equal(pub.status, 400);
    assert.equal(pub.error, 'A secret never gets a public name.');
  } finally { delete v.env.public; }
  assert.ok(!fs.existsSync(path.join(root, '.env')), 'nothing written');
  const contrib = await harness(root, { owner: false }).stack.save({ service: 'vercel', key: 'token', value: VC });
  assert.equal(contrib.status, 403);
  assert.match(contrib.error, /Local keys/);
  const fails = await harness(root, { storeFails: true }).stack.save({ service: 'vercel', key: 'token', value: VC });
  assert.equal(fails.status, 409);
  noValue(fails, [VC]);
  assert.match(fails.error, /\[secret\]/);
  assert.equal(scrubber([])({ a: 1 }).a, 1);
});

test('pick: the domain is checked as a hostname; an app folder stays inside the repo', async () => {
  const h = harness(tmp());
  assert.match((await h.stack.pick({ inputs: { domain: 'www.fieldday.dev' } })).error, /bare domain/);
  const ok = await h.stack.pick({ inputs: { domain: 'https://FieldDay.dev/' }, app: { dir: '.', framework: 'vite' } });
  assert.equal(ok.inputs.domain, 'fieldday.dev');
  assert.equal(ok.app.framework, 'vite');
  assert.equal((await h.stack.pick({ app: { dir: '../x', framework: 'next' } })).status, 400);
  assert.equal((await h.stack.tick({ step: 'sb.auth', on: true })).ticks['sb.auth'], true);
  assert.equal((await h.stack.tick({ step: 'cf.token', on: true })).status, 400);
});

/** A fake fetch for the server's own calls. */
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, init });
    for (const [m, re, a] of routes) if ((init.method || 'GET') === m && re.test(url)) { const x = typeof a === 'function' ? a(url, init) : a; return { status: x.status ?? 200, headers: new Headers(), text: async () => JSON.stringify(x.json ?? {}) }; }
    return { status: 404, headers: new Headers(), text: async () => '{}' };
  };
  fn.calls = calls;
  return fn;
}

test('check: a saved token is read from the vault, the facts land in stack.json, the answer holds no token', async () => {
  const root = tmp({ 'package.json': { dependencies: { next: '15' } } });
  const f = fakeFetch([
    ['GET', /user\/tokens\/verify/, { json: { success: true, result: { status: 'active' } } }],
    ['GET', /zones\?name=fieldday\.dev/, { json: { success: true, result: [{ id: '0123456789abcdef0123456789abcdef', status: 'pending', name_servers: ['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com'], account: { id: 'fedcba9876543210fedcba9876543210', name: CF } }] } }],
  ]);
  const h = harness(root, { fetchImpl: f });
  await h.stack.pick({ picked: ['cloudflare'], inputs: { domain: 'fieldday.dev' } });
  await h.stack.save({ service: 'cloudflare', key: 'apiToken', value: CF });
  const bad = await h.stack.check('cloudflare', { values: { apiToken: 'nope' } });
  assert.equal(bad.status, 400, 'a bad shape makes no request');
  assert.equal(f.calls.length, 0);
  const r = await h.stack.check('cloudflare', {});
  assert.equal(r.status, 200);
  assert.equal(r.ok, true);
  assert.deepEqual(r.fill, { zoneId: '0123456789abcdef0123456789abcdef', accountId: 'fedcba9876543210fedcba9876543210' });
  assert.equal(f.calls[0].init.headers.authorization, `Bearer ${CF}`);
  noValue(r, [CF]);
  const disk = fs.readFileSync(path.join(root, '.nexus/stack.json'), 'utf8');
  assert.ok(!disk.includes(CF), 'no token in stack.json, even one echoed in an allowlisted field');
  assert.equal(JSON.parse(disk).checks.cloudflare.facts.status, 'pending');
  assert.equal((await h.stack.check('cloudflare', {})).status, 429, 'a short cooldown');
  h.clock.tick(3100);
  assert.equal((await h.stack.check('cloudflare', {})).status, 200);
});

test('apply: a plan first (nothing written), then the change; a stale plan is refused; tokens never leave', async () => {
  const root = tmp({ 'package.json': { dependencies: { next: '15' } } });
  let posted = null;
  const f = fakeFetch([
    ['GET', /v2\/user/, { status: 403 }],
    ['GET', /v10\/projects\?limit/, { json: [{ id: 'prj_TESTONLYweb000', name: 'fieldday-web', accountId: 'team_TESTONLYteam00' }] }],
    ['POST', /v10\/projects\/prj_TESTONLYweb000\/env\?upsert=true/, (u, init) => { posted = JSON.parse(init.body); return { status: 201, json: { failed: [] } }; }],
  ]);
  const h = harness(root, { fetchImpl: f });
  await h.stack.pick({ picked: ['supabase', 'vercel'] });
  for (const [s, k, v] of [['supabase', 'url', URL_], ['supabase', 'publishable', PUB], ['supabase', 'secret', SECRET], ['vercel', 'token', VC], ['vercel', 'projectId', 'prj_TESTONLYweb000'], ['vercel', 'teamId', 'team_TESTONLYteam00']]) {
    assert.equal((await h.stack.save({ service: s, key: k, value: v })).status, 200);
  }
  const chk = await h.stack.check('vercel', {});
  assert.equal(chk.ok, true, JSON.stringify(chk));
  assert.equal((await h.stack.apply('vercel.env', { confirm: true })).status, 409, 'no plan yet');
  const plan = await h.stack.apply('vercel.env', {});
  assert.equal(plan.ok, true);
  assert.match(plan.plan.summary, /Send 5 names to fieldday-web/);
  assert.equal(posted, null, 'a plan writes nothing');
  const done = await h.stack.apply('vercel.env', { confirm: true });
  assert.equal(done.ok, true, done.reason);
  assert.deepEqual(posted.map((p) => [p.key, p.type]), [
    ['NEXT_PUBLIC_SUPABASE_URL', 'encrypted'], ['SUPABASE_URL', 'encrypted'], ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'encrypted'], ['SUPABASE_PUBLISHABLE_KEY', 'encrypted'], ['SUPABASE_SECRET_KEY', 'sensitive'],
  ]);
  assert.equal(posted.find((p) => p.key === 'SUPABASE_SECRET_KEY').value, SECRET, 'the value went to Vercel, read from the vault');
  noValue([plan, done], [SECRET, VC, PUB]);
  assert.equal((await h.stack.status()).actions['vercel.env'].ok, true);
  await h.stack.apply('vercel.env', {});
  h.clock.tick(11 * 60 * 1000);
  assert.equal((await h.stack.apply('vercel.env', { confirm: true })).error, 'Things changed; check the plan again.');
  assert.equal((await harness(root, { owner: false }).stack.apply('vercel.env', {})).status, 403);
});

test('the routes: GET /api/stack, pick, save and check through the live server, answers holding no value', async () => {
  const { execFileSync } = await import('node:child_process');
  const http = await import('node:http');
  const { startServer } = await import('../server/server.mjs');
  const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-stack-live-'));
  dirs.push(ws);
  const repo = path.join(ws, 'app');
  fs.mkdirSync(repo);
  execFileSync('git', ['init', '-q'], { cwd: repo });
  fs.writeFileSync(path.join(repo, '.gitignore'), '.env\n.env.local\n.nexus/\n.owner\n');
  fs.cpSync(path.join(KIT, 'templates', 'scripts'), path.join(repo, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.owner'), 'owner\n');
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ dependencies: { vite: '8' } }));
  const f = fakeFetch([['GET', /auth\/v1\/health/, { json: { version: 'v2' } }]]);
  const app = await startServer({ repo, provider: () => ({ kind: 'fake', send() {}, async interrupt() {}, async stop() {}, async fresh() {} }), pollRuns: false, dist: path.join(os.tmpdir(), 'nexus-cli-no-dist'), ghLogin: async () => '', secrets: { run: () => ({ status: 0 }), fetch: f } });
  const seen = [];
  const call = (method, pathname, body) => new Promise((resolve, reject) => {
    const headers = { host: `127.0.0.1:${app.port}`, 'x-nexus-token': app.token, ...(method === 'GET' ? {} : { 'content-type': 'application/json', origin: `http://127.0.0.1:${app.port}` }) };
    const r = http.request({ host: '127.0.0.1', port: app.port, method, path: pathname, headers }, (res) => { let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => { seen.push(d); resolve({ status: res.statusCode, json: JSON.parse(d) }); }); });
    r.on('error', reject);
    r.end(body === undefined ? undefined : JSON.stringify(body));
  });
  try {
    const first = await call('GET', '/api/stack');
    assert.equal(first.status, 200);
    assert.equal(first.json.app.framework, 'vite');
    assert.equal((await call('POST', '/api/stack/pick', { picked: ['supabase'] })).json.picked[0], 'supabase');
    const s = await call('POST', '/api/stack/save', { service: 'supabase', key: 'publishable', value: PUB });
    assert.equal(s.status, 200, JSON.stringify(s.json));
    assert.deepEqual(s.json.names, ['VITE_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_PUBLISHABLE_KEY']);
    assert.equal(parseEnv(fs.readFileSync(path.join(repo, '.env'), 'utf8')).get('VITE_SUPABASE_PUBLISHABLE_KEY'), PUB);
    await call('POST', '/api/stack/save', { service: 'supabase', key: 'url', value: URL_ });
    const c = await call('POST', '/api/stack/check/supabase', {});
    assert.equal(c.json.ok, true, JSON.stringify(c.json));
    assert.equal(f.calls[0].init.headers.apikey, PUB, 'the saved key, read from the vault on the server');
    assert.equal((await call('POST', '/api/stack/apply/nope.thing', {})).status, 404);
    const man = JSON.parse(fs.readFileSync(path.join(repo, 'nexus.secrets.json'), 'utf8'));
    assert.ok(man.secrets.some((e) => e.name === 'VITE_SUPABASE_PUBLISHABLE_KEY'), 'the manifest declares the name');
    for (const d of seen) assert.ok(!d.includes(PUB), 'no answer carries the value');
  } finally {
    await app.close();
  }
});
