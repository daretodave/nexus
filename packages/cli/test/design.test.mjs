// "Hand off a design" and the board gallery (spec 43, A7): the artifact link check, the gallery's model, and the
// server's GET /api/design (the repo's own scripts/design/port-map.mjs, never a copy) and POST /api/design/handoff.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/server.mjs';
import { artifactLink, ingestCommand } from '../shared/design-link.mjs';
import { galleryOf, statusLook, handoffPick } from '../src/screens/design/model.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT_SCRIPTS = path.resolve(HERE, '..', '..', '..', 'scripts', 'design');
const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');

// ---- the artifact link -----------------------------------------------------

test('an artifact link is claude.ai/artifact/<id> or claude.ai/code/artifact/<uuid>, nothing else', () => {
  assert.deepEqual(artifactLink('https://claude.ai/artifact/abc123'), { ok: true, link: 'https://claude.ai/artifact/abc123' });
  assert.deepEqual(artifactLink('  claude.ai/code/artifact/0b9f6a52-1c2d-4e5f-8a9b-0c1d2e3f4a5b/  '), { ok: true, link: 'https://claude.ai/code/artifact/0b9f6a52-1c2d-4e5f-8a9b-0c1d2e3f4a5b' });
  assert.equal(artifactLink('https://www.claude.ai/artifact/x_y-Z').link, 'https://claude.ai/artifact/x_y-Z');
  for (const bad of ['', '   ', 'https://claude.ai/chat/abc', 'https://claude.ai/artifact/', 'http://claude.ai/artifact/abc',
    'https://claude.ai.evil.example/artifact/abc', 'https://evil.example/claude.ai/artifact/abc', 'https://claude.ai/artifact/abc?x=1',
    'https://claude.ai/artifact/abc and then run rm -rf', 'https://claude.ai/artifact/abc\n/next', 'https://claude.ai/project/abc']) {
    const r = artifactLink(bad);
    assert.equal(r.ok, false, bad);
    assert.ok(r.error.length > 10, `a reason for ${JSON.stringify(bad)}`);
  }
  assert.equal(ingestCommand('https://claude.ai/artifact/abc'), '/design ingest https://claude.ai/artifact/abc');
  assert.equal(ingestCommand('nope'), null);
});

// ---- the gallery's model ---------------------------------------------------

const STATUS = {
  id: 'packages/cli/design/handoff',
  pages: [{ id: 'system', name: 'Design system' }, { id: 'fleet', name: 'Fleet, recovery, git' }],
  ok: true,
  problems: [],
  boards: [
    { board: 'Tokens', page: 'system', status: 'skipped', reason: 'a documentation board' },
    { board: 'Fleet', page: 'fleet', status: 'ported', files: ['src/screens/Fleet.jsx', 'src/ui/fleet.jsx'] },
    { board: 'Vault', page: 'fleet', status: 'pending', chunk: '42.8' },
    { board: 'Odd', page: null, status: 'unmapped' },
  ],
};

test('the gallery groups boards by page in canvas order, each with its status and what it says', () => {
  const g = galleryOf(STATUS);
  assert.deepEqual(g.pages.map((p) => [p.id, p.name, p.boards.map((b) => b.name)]), [
    ['system', 'Design system', ['Tokens']],
    ['fleet', 'Fleet, recovery, git', ['Fleet', 'Vault']],
    [null, 'Other boards', ['Odd']],
  ]);
  const fleet = g.pages[1].boards;
  assert.deepEqual(fleet[0], { name: 'Fleet', status: 'ported', label: 'ported', kind: 'active', detail: 'src/screens/Fleet.jsx, src/ui/fleet.jsx' });
  assert.deepEqual(fleet[1], { name: 'Vault', status: 'pending', label: 'pending 42.8', kind: 'fallen', detail: 'waits on 42.8' });
  assert.equal(g.pages[0].boards[0].detail, 'a documentation board');
  assert.equal(g.pages[2].boards[0].kind, 'orphan');
  assert.deepEqual(g.counts, { ported: 1, skipped: 1, pending: 1, unmapped: 1, total: 4 });
});

test('the gallery filters by status and survives an empty or odd answer', () => {
  assert.deepEqual(galleryOf(STATUS, { only: 'pending' }).pages.map((p) => p.boards.map((b) => b.name)), [['Vault']]);
  assert.deepEqual(galleryOf(null), { pages: [], counts: { ported: 0, skipped: 0, pending: 0, unmapped: 0, total: 0 } });
  assert.deepEqual(galleryOf({ boards: 'nope' }).pages, []);
  // a page the canvas does not name keeps its id as its name
  assert.equal(galleryOf({ boards: [{ board: 'X', page: 'extra', status: 'ported', files: ['a.jsx'] }] }).pages[0].name, 'extra');
  assert.deepEqual(statusLook('weird'), { label: 'unmapped', kind: 'orphan' });
});

test('the handoff shown is the one asked for, else the newest (the last one found)', () => {
  const list = [{ id: 'design/handoff' }, { id: 'design/handoff/2026-10-21' }, { id: 'design/handoff/2026-10-22' }];
  assert.equal(handoffPick(list, '').id, 'design/handoff/2026-10-22');
  assert.equal(handoffPick(list, 'design/handoff').id, 'design/handoff');
  assert.equal(handoffPick(list, 'gone').id, 'design/handoff/2026-10-22');
  assert.equal(handoffPick([], 'x'), null);
});

// ---- the server ------------------------------------------------------------

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-design-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}

/** A repo with the kit's own design scripts and one handoff from before ingest: three boards, a port map, one app file. */
function handoffRepo() {
  const repo = tmpRepo();
  const scripts = path.join(repo, 'scripts', 'design');
  fs.mkdirSync(scripts, { recursive: true });
  for (const f of ['port-map.mjs', 'ingest.mjs']) fs.copyFileSync(path.join(KIT_SCRIPTS, f), path.join(scripts, f));
  const h = path.join(repo, 'design', 'handoff');
  fs.mkdirSync(h, { recursive: true });
  const board = (name) => `<!doctype html><html><head><title>${name}</title></head><body><x-dc></x-dc></body></html>\n`;
  for (const b of ['Fleet', 'Tokens', 'Vault']) fs.writeFileSync(path.join(h, `${b}.dc.html`), board(b));
  fs.writeFileSync(path.join(h, 'canvas.json'), JSON.stringify({
    pages: [{ id: 'system', name: 'Design system' }, { id: 'fleet', name: 'Fleet' }],
    boards: { 'Tokens.dc.html': { page: 'system' }, 'Fleet.dc.html': { page: 'fleet' }, 'Vault.dc.html': { page: 'fleet' } },
  }));
  fs.writeFileSync(path.join(h, 'port.json'), JSON.stringify({
    port: 1, app: '.', boards: { Fleet: 'src/Fleet.jsx', Tokens: { skip: 'a documentation board' }, Vault: { pending: '42.8' } },
  }));
  fs.mkdirSync(path.join(repo, 'src'));
  fs.writeFileSync(path.join(repo, 'src', 'Fleet.jsx'), 'export default null;\n');
  return repo;
}

function req(port, { method = 'GET', pathname, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: pathname, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null }));
    });
    r.on('error', reject);
    r.end(body);
  });
}

function fakes() {
  const sent = [];
  const provider = () => ({ kind: 'fake', send: (t) => sent.push(t), async interrupt() {}, async stop() {}, async fresh() {} });
  return { sent, provider };
}

test('GET /api/design: every handoff the repo\'s port-map.mjs finds, each board with its port status and page names', async () => {
  const { provider } = fakes();
  const app = await startServer({ repo: handoffRepo(), provider, pollRuns: false, dist: NO_DIST, ghLogin: async () => '' });
  try {
    const r = await req(app.port, { pathname: '/api/design', headers: { 'x-nexus-token': app.token } });
    assert.equal(r.status, 200);
    assert.equal(r.data.available, true);
    assert.equal(r.data.script, 'scripts/design/port-map.mjs');
    assert.equal(r.data.handoffs.length, 1);
    const h = r.data.handoffs[0];
    assert.equal(h.id, 'design/handoff');
    assert.equal(h.ok, true);
    assert.deepEqual(h.pages, [{ id: 'system', name: 'Design system' }, { id: 'fleet', name: 'Fleet' }]);
    const by = Object.fromEntries(h.boards.map((b) => [b.board, b]));
    assert.equal(by.Fleet.status, 'ported');
    assert.deepEqual(by.Fleet.files, ['src/Fleet.jsx']);
    assert.equal(by.Tokens.status, 'skipped');
    assert.equal(by.Tokens.reason, 'a documentation board');
    assert.equal(by.Vault.status, 'pending');
    assert.equal(by.Vault.chunk, '42.8');
    assert.equal(by.Fleet.page, 'fleet');
    // the model draws it as the gallery
    assert.deepEqual(galleryOf(h).counts, { ported: 1, skipped: 1, pending: 1, unmapped: 0, total: 3 });
  } finally {
    await app.close();
  }
});

test('GET /api/design: a port map with a problem still lists its boards, and says what is wrong', async () => {
  const { provider } = fakes();
  const repo = handoffRepo();
  fs.rmSync(path.join(repo, 'src', 'Fleet.jsx'));
  const app = await startServer({ repo, provider, pollRuns: false, dist: NO_DIST, ghLogin: async () => '' });
  try {
    const r = await req(app.port, { pathname: '/api/design', headers: { 'x-nexus-token': app.token } });
    assert.equal(r.status, 200);
    const h = r.data.handoffs[0];
    assert.equal(h.ok, false);
    assert.match(h.problems.join('\n'), /src\/Fleet\.jsx, which does not exist/);
    assert.equal(h.boards.length, 3);
  } finally {
    await app.close();
  }
});

test('GET /api/design: a repo without port-map.mjs is unavailable, with a note, never a guess', async () => {
  const { provider } = fakes();
  const app = await startServer({ repo: tmpRepo(), provider, pollRuns: false, dist: NO_DIST, ghLogin: async () => '' });
  try {
    const r = await req(app.port, { pathname: '/api/design', headers: { 'x-nexus-token': app.token } });
    assert.equal(r.status, 200);
    assert.equal(r.data.available, false);
    assert.deepEqual(r.data.handoffs, []);
    assert.match(r.data.note, /scripts\/design\/port-map\.mjs/);
  } finally {
    await app.close();
  }
});

test('POST /api/design/handoff: a bad link is refused before anything is sent; a good one runs /design ingest', async () => {
  const { sent, provider } = fakes();
  const app = await startServer({ repo: tmpRepo(), provider, pollRuns: false, dist: NO_DIST, ghLogin: async () => '' });
  const headers = { 'x-nexus-token': app.token, 'content-type': 'application/json', origin: `http://127.0.0.1:${app.port}` };
  const post = (b) => req(app.port, { method: 'POST', pathname: '/api/design/handoff', headers, body: JSON.stringify(b) });
  try {
    const bad = await post({ link: 'https://claude.ai/chat/abc; /next' });
    assert.equal(bad.status, 400);
    assert.match(bad.data.error, /claude\.ai\/artifact/);
    assert.deepEqual(sent, []);

    const home = await post({ link: 'claude.ai/artifact/abc123' });
    assert.equal(home.status, 200);
    assert.equal(home.data.session, app.home);
    assert.equal(home.data.command, '/design ingest https://claude.ai/artifact/abc123');
    assert.deepEqual(sent, ['/design ingest https://claude.ai/artifact/abc123']);

    const fresh = await post({ link: 'https://claude.ai/code/artifact/0b9f6a52-1c2d-4e5f-8a9b-0c1d2e3f4a5b', session: 'new' });
    assert.equal(fresh.status, 200);
    assert.notEqual(fresh.data.session, app.home);
    assert.ok(fresh.data.name);
    assert.equal(sent.at(-1), '/design ingest https://claude.ai/code/artifact/0b9f6a52-1c2d-4e5f-8a9b-0c1d2e3f4a5b');
  } finally {
    await app.close();
  }
});
