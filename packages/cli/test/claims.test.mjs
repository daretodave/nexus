// The claims panel (spec 40 A5): claim, release, hold, unhold, assign, reassign and request, each through the repo's
// own scripts/claims.mjs as the acting session, never a second copy of its rules. Every run here writes a temp repo's
// own `claims` branch on a temp bare origin; nothing reaches a real remote. Request opens a GitHub issue through an
// injected gh function (never PATH: identity/footguns.md fake-gh-path), so no real issue is ever filed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { childEnv, claimsAction, listClaims, requestIssue, validName, PRIVILEGED } from '../server/claims.mjs';
import { startServer } from '../server/server.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');
const FAKE = { kind: 'fake', send() {}, async interrupt() {}, async stop() {}, async fresh() {} };
const SCRIPTS = ['claims.mjs', 'claims-codec.mjs', 'owner.mjs', 'plan/pending.mjs', 'plan/config.mjs', 'plan/footguns.mjs'];

// A base environment as a server started from inside a Claude Code session would carry: its variables must not reach
// the CLI (with them, `claim` refuses for want of that session's hook marker).
const BASE = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^NEXUS_/.test(k)));
Object.assign(BASE, { CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'leaky-claude-session', GIT_TERMINAL_PROMPT: '0' });
for (const k of Object.keys(process.env)) if (/^NEXUS_/.test(k)) delete process.env[k];

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** A temp bare origin and two clones of it: the owner's (with .owner) and a contributor's. */
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-cli-claims-'));
  const origin = path.join(dir, 'origin.git');
  git(dir, 'init', '-q', '--bare', '-b', 'main', origin);
  const seed = path.join(dir, 'seed');
  git(dir, 'init', '-q', '-b', 'main', seed);
  for (const f of SCRIPTS) {
    fs.mkdirSync(path.dirname(path.join(seed, 'scripts', f)), { recursive: true });
    fs.copyFileSync(path.join(KIT, 'templates', 'scripts', f), path.join(seed, 'scripts', f));
  }
  fs.writeFileSync(path.join(seed, '.gitignore'), '.owner\n.nexus/\n');
  git(seed, '-c', 'user.name=seed', '-c', 'user.email=s@x', 'add', '-A');
  git(seed, '-c', 'user.name=seed', '-c', 'user.email=s@x', 'commit', '-qm', 'seed');
  git(seed, 'remote', 'add', 'origin', origin);
  git(seed, 'push', '-q', 'origin', 'main');
  const clone = (name, who) => {
    const p = path.join(dir, name);
    git(dir, 'clone', '-q', origin, p);
    git(p, 'config', 'user.name', who);
    git(p, 'config', 'user.email', `${name}@x`);
    return p;
  };
  const owner = clone('owner', 'Dave');
  fs.writeFileSync(path.join(owner, '.owner'), 'owner\n');
  const contrib = clone('contrib', 'Sam Lee');
  return { dir, origin, owner, contrib, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

const claimsOn = (origin) => {
  try {
    return JSON.parse(git(path.dirname(origin), '--git-dir', origin, 'show', 'claims:claims.json'));
  } catch {
    return {};
  }
};

test('the CLI environment drops Claude Code\'s variables and carries the acting session', () => {
  const env = childEnv({ PATH: '/bin', CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'x', CLAUDE_CODE_ENTRYPOINT: 'cli', NEXUS_SESSION: 'old' }, { session: 'ab12cd34', login: 'dave' });
  assert.deepEqual(env, { PATH: '/bin', NEXUS_SESSION: 'ab12cd34', NEXUS_GH_LOGIN: 'dave' });
  // the login is always set, '' when unknown, so the CLI never asks gh on its own
  assert.equal(childEnv({}, { session: 's' }).NEXUS_GH_LOGIN, '');
});

test('names and the request issue', () => {
  assert.equal(validName(' Sam Lee '), 'Sam Lee');
  assert.equal(validName('a|b'), '');
  assert.equal(validName('a\nb'), '');
  const i = requestIssue({ id: '40.5', title: 'The claims  panel', me: { who: 'Sam Lee', session: 'ab12', star: 'vega', host: 'pc' }, login: 'samlee' });
  assert.equal(i.title, 'Claim request: 40.5 · The claims panel');
  assert.match(i.body, /Sam Lee \(@samlee\) asks to build \*\*40\.5\*\*/);
  assert.match(i.body, /Session `ab12~vega` on pc/);
  assert.match(i.body, /node scripts\/claims\.mjs assign 40\.5 --to "Sam Lee" --login samlee/);
  assert.match(requestIssue({ id: '7' }).body, /--login <their GitHub login>/);
});

test('owner: claim, list by session, hold, release, assign, reassign and unhold, all through claims.mjs', async () => {
  const fx = fixture();
  try {
    const own = { session: 'ownr0001', login: 'dave', base: BASE };
    const sam = { session: 'sam00001', login: 'samlee', base: BASE };

    const c = await claimsAction(fx.owner, 'claim', { id: '07.1' }, own);
    assert.equal(c.ok, true, c.error);
    assert.match(claimsOn(fx.origin)['07.1'], new RegExp(`^${PRIVILEGED}\\|.*\\|s:ownr0001`));

    const list = await listClaims(fx.owner, own);
    assert.equal(list.available, true);
    assert.equal(list.me.owner, true);
    assert.equal(list.me.session, 'ownr0001');
    const row = list.rows.find((r) => r.id === '07.1');
    assert.equal(row.session, 'ownr0001');
    assert.equal(row.mine, true);
    // another session of the owner's sees the claim as someone else's session
    assert.equal((await listClaims(fx.owner, { ...own, session: 'ownr0002' })).rows.find((r) => r.id === '07.1').mine, false);

    // hold: the owner's assign, for the owner, keyed to the owner's login; never stale
    const h = await claimsAction(fx.owner, 'hold', { id: '07.2' }, own);
    assert.equal(h.ok, true, h.error);
    const held = (await listClaims(fx.owner, own)).rows.find((r) => r.id === '07.2');
    assert.equal(held.state, 'held');
    assert.equal(held.held, 'dave');
    assert.equal(held.mine, true);
    assert.match((await claimsAction(fx.owner, 'hold', { id: '07.9' }, { ...own, login: '' })).error, /GitHub login/);

    // a contributor's claim, which the owner reassigns (anyone's, --force) and releases (--force)
    assert.equal((await claimsAction(fx.contrib, 'claim', { id: '07.3' }, sam)).ok, true);
    assert.match(claimsOn(fx.origin)['07.3'], /^Sam Lee\|/);
    const plainAssign = await claimsAction(fx.owner, 'assign', { id: '07.3', to: 'Jun', login: 'jun' }, own);
    assert.equal(plainAssign.ok, false);
    assert.match(plainAssign.error, /07\.3: held by Sam Lee/);
    const re = await claimsAction(fx.owner, 'reassign', { id: '07.3', to: 'Jun Park', login: '@junpark' }, own);
    assert.equal(re.ok, true, re.error);
    assert.match(claimsOn(fx.origin)['07.3'], /^Jun Park\|.*\|held:junpark/);
    assert.equal((await claimsAction(fx.owner, 'assign', { id: '07.4', to: 'Sam Lee', login: 'samlee' }, own)).ok, true);
    assert.equal((await claimsAction(fx.owner, 'assign', { id: '07.5', login: 'bad login!' }, own)).status, 400);

    assert.equal((await claimsAction(fx.owner, 'unhold', { id: '07.3' }, own)).ok, true);
    assert.equal((await claimsAction(fx.owner, 'release', { id: '07.1' }, own)).ok, true);
    const left = claimsOn(fx.origin);
    assert.deepEqual(Object.keys(left).sort(), ['07.2', '07.4']);

    // owner never requests: it claims
    assert.match((await claimsAction(fx.owner, 'request', { id: '07.6' }, { ...own, ghRun: () => assert.fail('no gh') })).error, /claim it instead/);
    assert.equal((await claimsAction(fx.owner, 'claim', { id: 'nope' }, own)).status, 400);
    assert.equal((await claimsAction(fx.owner, 'smash', { id: '07.1' }, own)).status, 404);
  } finally {
    fx.done();
  }
});

test('contributor: holds and others\' claims are refused in the CLI\'s words; a held chunk is theirs to unhold', async () => {
  const fx = fixture();
  try {
    const own = { session: 'ownr0001', login: 'dave', base: BASE };
    const sam = { session: 'sam00001', login: 'samlee', base: BASE };
    assert.equal((await claimsAction(fx.owner, 'claim', { id: '08.1' }, own)).ok, true);

    const hold = await claimsAction(fx.contrib, 'hold', { id: '08.2' }, sam);
    assert.equal(hold.ok, false);
    assert.match(hold.error, /only the owner assigns/);
    const rel = await claimsAction(fx.contrib, 'release', { id: '08.1' }, sam);
    assert.equal(rel.ok, false);
    assert.match(rel.error, /not this session's claim: 08\.1/);
    const taken = await claimsAction(fx.contrib, 'claim', { id: '08.1' }, sam);
    assert.equal(taken.ok, false);
    assert.match(taken.error, /08\.1:/);

    // the owner holds 08.3 for sam; sam's own login takes it off from any session
    assert.equal((await claimsAction(fx.owner, 'assign', { id: '08.3', to: 'Sam Lee', login: 'samlee' }, own)).ok, true);
    assert.equal((await listClaims(fx.contrib, { ...sam, session: 'other999' })).rows.find((r) => r.id === '08.3').mine, true);
    assert.equal((await claimsAction(fx.contrib, 'unhold', { id: '08.3' }, { ...sam, session: 'other999' })).ok, true);
    assert.equal(claimsOn(fx.origin)['08.3'], undefined);
    assert.ok(claimsOn(fx.origin)['08.1'], 'the owner\'s claim is untouched');
  } finally {
    fx.done();
  }
});

test('request opens one issue through the injected gh, and writes nothing to the claims branch', async () => {
  const fx = fixture();
  try {
    const calls = [];
    const ghRun = async (cmd, args, opts) => {
      calls.push({ cmd, args, opts, input: JSON.parse(opts.input) });
      return { ok: true, stdout: JSON.stringify({ number: 77, html_url: 'https://github.com/o/r/issues/77' }), stderr: '' };
    };
    const r = await claimsAction(fx.contrib, 'request', { id: '09.2', title: 'Search box' }, { session: 'sam00001', login: 'samlee', base: BASE, ghRun });
    assert.equal(r.ok, true, r.error);
    assert.deepEqual(r.issue, { number: 77, url: 'https://github.com/o/r/issues/77' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].cmd, 'gh');
    assert.deepEqual(calls[0].args, ['api', 'repos/{owner}/{repo}/issues', '--method', 'POST', '--input', '-']);
    assert.equal(calls[0].opts.cwd, fx.contrib);
    assert.equal(calls[0].input.title, 'Claim request: 09.2 · Search box');
    assert.match(calls[0].input.body, /Sam Lee \(@samlee\).*\n[\s\S]*`sam00001` on /);
    assert.deepEqual(claimsOn(fx.origin), {});

    const refused = await claimsAction(fx.contrib, 'request', { id: '09.2' }, { session: 's', login: 'samlee', base: BASE, ghRun: async () => ({ ok: false, stdout: '', stderr: 'HTTP 410: Issues are disabled' }) });
    assert.equal(refused.ok, false);
    assert.match(refused.error, /Issues are disabled/);
  } finally {
    fx.done();
  }
});

test('a repo with no claims module says so, and runs nothing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-cli-noclaims-'));
  try {
    assert.equal((await listClaims(dir, { base: BASE })).available, false);
    const r = await claimsAction(dir, 'claim', { id: '1.1' }, { base: BASE });
    assert.equal(r.ok, false);
    assert.match(r.error, /No claims module/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function req(port, token, method, pathname, body) {
  return new Promise((resolve, reject) => {
    const headers = { host: `127.0.0.1:${port}`, 'x-nexus-token': token };
    if (body !== undefined) Object.assign(headers, { origin: `http://127.0.0.1:${port}`, 'content-type': 'application/json' });
    const r = http.request({ host: '127.0.0.1', port, method, path: pathname, headers }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null }));
    });
    r.on('error', reject);
    r.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

test('the server acts as its home session (or the one named), with the gh login it asked once', async () => {
  const fx = fixture();
  const issues = [];
  const app = await startServer({
    repo: fx.contrib, pollRuns: false, dist: NO_DIST, provider: FAKE, ghLogin: async () => 'samlee',
    ghRun: async (cmd, args, opts) => { issues.push(JSON.parse(opts.input)); return { ok: true, stdout: '{"number":5,"html_url":"u"}', stderr: '' }; },
  });
  // The server's own environment carries Claude Code's variables, as when it is started from a Claude Code Bash call.
  const saved = { CLAUDECODE: process.env.CLAUDECODE, CLAUDE_CODE_SESSION_ID: process.env.CLAUDE_CODE_SESSION_ID };
  Object.assign(process.env, { CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'leaky-claude-session' });
  const call = (m, p, b) => req(app.port, app.token, m, p, b);
  try {
    const c = await call('POST', '/api/claims/claim', { id: '10.1' });
    assert.equal(c.status, 200);
    assert.equal(c.data.ok, true, c.data.error);
    assert.match(claimsOn(fx.origin)['10.1'], new RegExp(`\\|s:${app.home}`));

    const l = await call('GET', '/api/claims');
    assert.equal(l.data.me.session, app.home);
    assert.equal(l.data.me.login, 'samlee');
    assert.equal(l.data.rows.find((r) => r.id === '10.1').mine, true);

    // a terminal session's own claims id: its claims stay its own
    assert.equal((await call('POST', '/api/claims/claim', { id: '10.2', session: 'term0001' })).data.ok, true);
    assert.match(claimsOn(fx.origin)['10.2'], /\|s:term0001/);
    assert.equal((await call('POST', '/api/claims/release', { id: '10.2' })).data.ok, false);
    assert.equal((await call('POST', '/api/claims/release', { id: '10.2', session: 'term0001' })).data.ok, true);

    const r = await call('POST', '/api/claims/request', { id: '10.3', title: 'Three' });
    assert.equal(r.data.ok, true, r.data.error);
    assert.equal(issues[0].title, 'Claim request: 10.3 · Three');
    assert.equal((await call('POST', '/api/claims/claim', { id: '../x' })).status, 400);
    assert.equal((await call('POST', '/api/claims/nope', { id: '10.1' })).status, 404);
  } finally {
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    await app.close();
    fx.done();
  }
});
