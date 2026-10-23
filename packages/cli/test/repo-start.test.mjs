// A folder that is not a repo yet (server/repo-start.mjs, server/place.mjs): where it stands, and each step a click
// makes. Real git in temp folders (identity isolated: an empty global config, no system config); gh is a recording
// fake, so nothing here creates a GitHub repo or reaches the network.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { removeTree } from './helpers/tmp.mjs';

const TEMPS = [];
const tempDir = (prefix = 'nexus-rs-') => { const d = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix))); TEMPS.push(d); return d; };
after(() => removeTree(TEMPS));

// No identity from this machine: every test starts as a person git does not know.
const GLOBAL = path.join(tempDir('nexus-rs-global-'), 'gitconfig');
fs.writeFileSync(GLOBAL, '');
process.env.GIT_CONFIG_GLOBAL = GLOBAL;
process.env.GIT_CONFIG_NOSYSTEM = '1';

const { parseRemote, placeOf, refusedAs, repoPlace } = await import('../server/place.mjs');
const RS = await import('../server/repo-start.mjs');
const { SAFE_ARG } = await import('../server/sh.mjs');
const { startServer } = await import('../server/server.mjs');

const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };

/** gh as a recording fake. `signedIn`, `taken` (repos that exist), `create` (what gh repo create does). */
function fakeGh({ signedIn = true, missing = false, taken = [], scopes = "'gist', 'read:org', 'repo', 'workflow'", create } = {}) {
  const calls = [];
  const run = async (cmd, args, opts = {}) => {
    calls.push({ args, opts });
    const ok = (stdout) => ({ ok: true, code: 0, stdout: typeof stdout === 'string' ? stdout : JSON.stringify(stdout), stderr: '' });
    const no = (stderr) => ({ ok: false, code: 1, stdout: '', stderr });
    if (missing) return { ok: false, code: -1, stdout: '', stderr: 'not found', missing: true };
    const a = args.join(' ');
    if (a === 'auth status') return signedIn ? ok(`github.com\n  Logged in to github.com account ada-park (keyring)\n  - Token scopes: ${scopes}\n`) : no('You are not logged into any GitHub hosts.');
    if (a === 'api user') return ok({ login: 'ada-park', name: 'Ada Park', id: 4815162 });
    if (a === 'api user/orgs') return ok([{ login: 'lantern-labs' }]);
    if (a === 'config get git_protocol') return ok('https\n');
    const repo = /^api repos\/(.+)$/.exec(a);
    if (repo) return taken.includes(repo[1]) ? ok({ full_name: repo[1] }) : no('gh: Not Found (HTTP 404)');
    if (args[0] === 'repo' && args[1] === 'create') return create ? create(args, opts) : ok(`https://github.com/${args[2]}\n`);
    return no(`unexpected gh ${a}`);
  };
  return { run, calls };
}

test('parseRemote reads https, ssh and scp forms, with and without .git', () => {
  for (const u of ['https://github.com/ada-park/lantern.git', 'https://github.com/ada-park/lantern', 'git@github.com:ada-park/lantern.git', 'ssh://git@github.com/ada-park/lantern', 'git@github.com:ada-park/lantern']) {
    assert.deepEqual(parseRemote(u), { host: 'github.com', owner: 'ada-park', name: 'lantern', web: 'https://github.com/ada-park/lantern' }, u);
  }
  assert.equal(parseRemote('git@gitlab.com:x/y.git').host, 'gitlab.com');
  assert.equal(parseRemote('git@gitlab.com:x/y.git').web, null);
  assert.equal(parseRemote(''), null);
});

test('the place: none, nested (with top), refused (home), local, other, github', async () => {
  const plain = tempDir();
  assert.equal((await repoPlace(plain)).place, 'none');
  const repo = tempDir();
  sh(repo, 'init', '-q', '-b', 'main');
  assert.equal((await repoPlace(repo)).place, 'local');
  const sub = path.join(repo, 'sub');
  fs.mkdirSync(sub);
  const n = await repoPlace(sub);
  assert.equal(n.place, 'nested');
  assert.ok(n.top);
  assert.equal(placeOf({ folder: plain, home: plain }).place, 'refused');
  assert.equal(refusedAs(plain, { home: plain }), 'home');
  assert.equal(refusedAs(path.parse(plain).root), 'root');
  sh(repo, 'remote', 'add', 'origin', 'git@gitlab.com:x/y.git');
  assert.equal((await repoPlace(repo)).place, 'other');
  sh(repo, 'remote', 'set-url', 'origin', 'https://github.com/ada-park/lantern.git');
  assert.equal((await repoPlace(repo)).place, 'github');
});

test('probe: a plain folder reads init next, counts its files, and names the identity that is missing', async () => {
  const dir = tempDir();
  write(path.join(dir, 'notes.txt'), 'hi\n');
  write(path.join(dir, 'node_modules', 'x', 'index.js'), '');
  const gh = fakeGh();
  const p = await RS.probe(dir, { run: gh.run });
  assert.equal(p.place, 'none');
  assert.equal(p.next, 'init');
  assert.equal(p.why, 'no-identity');
  assert.equal(p.preview.files, 1, 'node_modules is not counted');
  assert.equal(p.gh.login, 'ada-park');
  assert.deepEqual(p.gh.orgs, ['lantern-labs']);
  assert.ok(p.gh.scopes.includes('workflow'));
  assert.deepEqual(p.plan.init, ['git', 'init', '-b', 'main']);
  assert.ok(p.guide['no-identity'][0].startsWith('git config --global user.name'));
  assert.ok(p.manual.some((l) => l.startsWith('gh repo create ada-park/')));
  assert.ok(!gh.calls.some((c) => c.args[0] === 'repo'), 'reading never creates');
});

test('guidance per platform: PowerShell Add-Content on win32, printf elsewhere; installs per OS', () => {
  assert.match(RS.manualFor({ platform: 'win32' })[1], /^Add-Content \.gitignore/);
  assert.match(RS.manualFor({ platform: 'linux' })[1], /^printf /);
  assert.deepEqual(RS.guideFor('git-missing', { platform: 'win32' }), ['winget install --id Git.Git -e']);
  assert.deepEqual(RS.guideFor('git-missing', { platform: 'darwin' }), ['xcode-select --install']);
  assert.deepEqual(RS.guideFor('gh-missing', { platform: 'darwin' }), ['brew install gh', 'gh auth login']);
  assert.deepEqual(RS.guideFor('push-auth'), ['gh auth setup-git']);
  assert.match(RS.guideFor('refused', { platform: 'win32', slug: 'lantern' })[0], /mkdir lantern; cd lantern/);
});

test('init: -b main and a .gitignore that keeps .env and .nexus/ out; a second init writes nothing', async () => {
  const dir = tempDir();
  write(path.join(dir, 'a.txt'), 'a\n');
  const r = await RS.initRepo(dir, {}, { run: fakeGh().run });
  assert.equal(r.status, 200);
  assert.equal(sh(dir, 'symbolic-ref', '--short', 'HEAD'), 'main');
  const gi = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8');
  for (const l of ['.env', '.env.*', '!.env.example', '.nexus/', '.owner']) assert.ok(gi.split('\n').includes(l), l);
  assert.ok(!gi.includes('\r'), 'written with \\n line endings');
  assert.ok(r.gitignore.wrote);
  const again = await RS.initRepo(dir, {}, { run: fakeGh().run });
  assert.equal(again.already, true);
  assert.equal(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), gi);
});

test('init appends only what an existing .gitignore misses, never twice', async () => {
  const dir = tempDir();
  write(path.join(dir, '.gitignore'), 'dist/\n.env\n');
  const r = await RS.initRepo(dir, {}, { run: fakeGh().run });
  assert.ok(r.gitignore.appended);
  const text = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8');
  assert.equal(text.split('\n').filter((l) => l === '.env').length, 1);
  assert.ok(text.includes('.nexus/'));
  assert.ok(text.startsWith('dist/\n'));
});

test('init refuses nested and refused folders', async () => {
  const repo = tempDir();
  sh(repo, 'init', '-q', '-b', 'main');
  const sub = path.join(repo, 'sub');
  fs.mkdirSync(sub);
  const r = await RS.initRepo(sub, {}, { run: fakeGh().run });
  assert.equal(r.status, 409);
  assert.equal(r.why, 'nested');
  assert.ok(!fs.existsSync(path.join(sub, '.git')));
  const home = tempDir();
  const h = await RS.initRepo(home, {}, { run: fakeGh().run, home });
  assert.equal(h.status, 409);
  assert.equal(h.why, 'refused');
  assert.ok(!fs.existsSync(path.join(home, '.git')));
});

test('commit: refused with no identity; identity gh sets repo-level config only; flagged files left out; .nexus never committed', async () => {
  const dir = tempDir();
  write(path.join(dir, 'src', 'index.js'), 'x\n');
  write(path.join(dir, 'config', 'secrets.json'), '{}\n');
  write(path.join(dir, '.nexus', 'server.json'), '{"token":"launch"}\n');
  write(path.join(dir, '.env'), 'A=1\n');
  const gh = fakeGh();
  await RS.initRepo(dir, {}, { run: gh.run });
  const no = await RS.firstCommit(dir, {}, { run: gh.run });
  assert.equal(no.status, 409);
  assert.equal(no.why, 'no-identity');
  assert.ok(no.guide.length);
  const id = await RS.setIdentity(dir, { run: gh.run });
  assert.equal(id.status, 200);
  assert.equal(sh(dir, 'config', '--local', 'user.email'), '4815162+ada-park@users.noreply.github.com');
  assert.equal(fs.readFileSync(GLOBAL, 'utf8'), '', 'the global config is untouched');
  const p = await RS.probe(dir, { run: gh.run });
  assert.deepEqual(p.preview.flagged.map((f) => f.path), ['config/secrets.json']);
  assert.ok(p.preview.ignoredTop.includes('.nexus/'));
  const bad = await RS.firstCommit(dir, { leaveOut: ['src/index.js'] }, { run: gh.run });
  assert.equal(bad.status, 400, 'leaveOut takes only flagged paths');
  const c = await RS.firstCommit(dir, { leaveOut: ['config/secrets.json'] }, { run: gh.run });
  assert.equal(c.status, 200);
  const files = sh(dir, 'ls-files').split(/\r?\n/);
  assert.ok(files.includes('src/index.js'));
  assert.ok(!files.some((f) => f.startsWith('.nexus/')), '.nexus/server.json holds the launch token');
  assert.ok(!files.includes('.env'));
  assert.ok(!files.includes('config/secrets.json'));
  assert.equal((await RS.firstCommit(dir, {}, { run: gh.run })).already, true);
});

test('commit: a file over 100 MB blocks the step', async () => {
  const dir = tempDir();
  sh(dir, 'init', '-q', '-b', 'main');
  sh(dir, 'config', 'user.name', 'T');
  sh(dir, 'config', 'user.email', 't@example.com');
  const fd = fs.openSync(path.join(dir, 'big.bin'), 'w');
  fs.ftruncateSync(fd, 101 * 1024 * 1024); // sparse where the disk allows
  fs.closeSync(fd);
  const r = await RS.firstCommit(dir, {}, { run: fakeGh().run });
  assert.equal(r.status, 409);
  assert.equal(r.why, 'large');
  assert.equal(sh(dir, 'rev-list', '--all', '--count'), '0');
});

function committed() {
  const dir = tempDir();
  write(path.join(dir, 'a.txt'), 'a\n');
  sh(dir, 'init', '-q', '-b', 'main');
  sh(dir, 'config', 'user.name', 'T');
  sh(dir, 'config', 'user.email', 't@example.com');
  sh(dir, 'add', '-A');
  sh(dir, 'commit', '-q', '-m', 'first');
  return dir;
}

test('remote: exact gh args, every one SAFE_ARG; owners only from the probe; a taken name is 409', async () => {
  const dir = committed();
  const gh = fakeGh({ taken: ['ada-park/taken'], create: async (args, opts) => { sh(opts.cwd, 'remote', 'add', 'origin', `https://github.com/${args[2]}.git`); return { ok: true, code: 0, stdout: '', stderr: '' }; } });
  assert.equal((await RS.createRemote(dir, { owner: 'someone-else', name: 'lantern', visibility: 'private' }, { run: gh.run })).status, 400);
  assert.equal((await RS.createRemote(dir, { owner: 'ada-park', name: 'bad name', visibility: 'private' }, { run: gh.run })).status, 400);
  const t = await RS.createRemote(dir, { owner: 'ada-park', name: 'taken', visibility: 'private' }, { run: gh.run });
  assert.equal(t.status, 409);
  assert.equal(t.exists, true);
  assert.ok(!gh.calls.some((c) => c.args[0] === 'repo'), 'nothing created yet');
  const r = await RS.createRemote(dir, { owner: 'ada-park', name: 'lantern', visibility: 'private' }, { run: gh.run });
  assert.equal(r.status, 200);
  const create = gh.calls.find((c) => c.args[0] === 'repo');
  assert.deepEqual(create.args, ['repo', 'create', 'ada-park/lantern', '--private', '--source', '.', '--remote', 'origin']);
  assert.ok(create.args.every((a) => SAFE_ARG.test(a)));
  assert.equal(create.opts.cwd, dir);
  const again = await RS.createRemote(dir, { owner: 'ada-park', name: 'lantern', visibility: 'private' }, { run: gh.run });
  assert.equal(again.already, true);
  assert.equal(gh.calls.filter((c) => c.args[0] === 'repo').length, 1, 'never created twice');
  assert.equal(RS.remoteArgs({ owner: 'a', name: '..', visibility: 'private' }), null);
});

test('push: to a local bare origin; a repeat is already; the env carries no prompts; auth failures are classified', async () => {
  const dir = committed();
  const bare = path.join(tempDir(), 'origin.git');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare]);
  sh(dir, 'remote', 'add', 'origin', bare);
  const seen = [];
  const git = async (cwd, args, o = {}) => { seen.push({ args, env: o.env }); return RS.gitRun(cwd, args, o); };
  const r = await RS.pushMain(dir, { run: fakeGh().run, git });
  assert.equal(r.status, 200);
  assert.equal(sh(bare, 'rev-parse', 'main'), sh(dir, 'rev-parse', 'HEAD'));
  const push = seen.find((s) => s.args[0] === 'push');
  assert.deepEqual(push.args, ['push', '-u', 'origin', 'main']);
  assert.equal(push.env.GIT_TERMINAL_PROMPT, '0');
  assert.equal(push.env.GCM_INTERACTIVE, 'never');
  assert.equal((await RS.pushMain(dir, { run: fakeGh().run })).already, true);
  assert.equal(RS.classifyPush('remote: Invalid username or password.\nfatal: Authentication failed for ...').why, 'push-auth');
  assert.deepEqual(RS.classifyPush('fatal: could not read Username for https://github.com: terminal prompts disabled').guide, ['gh auth setup-git']);
  assert.equal(RS.classifyPush('git@github.com: Permission denied (publickey).').why, 'push-ssh');
  assert.equal(RS.classifyPush(' ! [rejected] main -> main (fetch first)').why, 'push-rejected');
});

// ---- the routes ------------------------------------------------------------------------------

function req(port, { method = 'GET', pathname, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: pathname, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data || '{}') }));
    });
    r.on('error', reject);
    r.end(body);
  });
}

test('the routes: confirm required, one at a time; init persists the prefs kept in memory; actions say place none', async () => {
  const dir = tempDir();
  write(path.join(dir, 'notes.txt'), 'hi\n');
  const gh = fakeGh();
  const provider = { kind: 'fake', send() {}, async interrupt() {}, async stop() {}, async fresh() {} };
  const app = await startServer({ repo: dir, provider, pollRuns: false, dist: path.join(os.tmpdir(), 'nexus-cli-no-dist'), ghRun: gh.run, ghLogin: async () => '' });
  const h = { 'x-nexus-token': app.token, 'content-type': 'application/json', origin: `http://127.0.0.1:${app.port}` };
  try {
    const st = await req(app.port, { pathname: '/api/state', headers: h });
    assert.equal(st.data.info.place, 'none');
    const start = await req(app.port, { pathname: '/api/repo/start', headers: h });
    assert.equal(start.status, 200);
    assert.equal(start.data.next, 'init');
    const actions = await req(app.port, { pathname: '/api/actions', headers: h });
    assert.equal(actions.data.place, 'none');
    assert.ok(!gh.calls.some((c) => /^(secret|api repos\/\{owner\}|repo view)/.test(c.args.join(' '))), 'no secret, ruleset or role call outside GitHub');
    for (const p of ['/api/cloud/workflow', '/api/cloud/schedule', '/api/cloud/run']) {
      const r = await req(app.port, { method: 'POST', pathname: p, headers: h, body: '{"schedule":"night","cron":"0 2 * * *"}' });
      assert.equal(r.status, 409, `${p}: ${JSON.stringify(r.data)}`);
      assert.equal(r.data.place, 'none');
    }
    assert.equal((await req(app.port, { method: 'POST', pathname: '/api/prefs', headers: h, body: '{"onboarded":true}' })).data.onboarded, true);
    const noConfirm = await req(app.port, { method: 'POST', pathname: '/api/repo/init', headers: h, body: '{}' });
    assert.equal(noConfirm.status, 400);
    assert.ok(!fs.existsSync(path.join(dir, '.git')));
    const [a, b] = await Promise.all([
      req(app.port, { method: 'POST', pathname: '/api/repo/init', headers: h, body: '{"confirm":true}' }),
      req(app.port, { method: 'POST', pathname: '/api/repo/init', headers: h, body: '{"confirm":true}' }),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409], 'the second call while the first runs is 409');
    const prefs = JSON.parse(fs.readFileSync(path.join(dir, '.git', 'nexus-gui.json'), 'utf8'));
    assert.equal(prefs.onboarded, true, 'the in-memory prefs now live in .git');
    const git = await req(app.port, { pathname: '/api/git', headers: h });
    assert.equal(git.status, 200);
  } finally {
    await app.close();
  }
});

test('GET /api/git answers isGit false in a plain folder, not git\'s fatal', async () => {
  const dir = tempDir();
  const provider = { kind: 'fake', send() {}, async interrupt() {}, async stop() {}, async fresh() {} };
  const app = await startServer({ repo: dir, provider, pollRuns: false, dist: path.join(os.tmpdir(), 'nexus-cli-no-dist'), ghRun: fakeGh().run, ghLogin: async () => '' });
  try {
    const r = await req(app.port, { pathname: '/api/git', headers: { 'x-nexus-token': app.token } });
    assert.equal(r.status, 200);
    assert.equal(r.data.isGit, false);
    assert.equal(r.data.ghNote, undefined);
  } finally {
    await app.close();
  }
});
