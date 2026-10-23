// `nexus --demo <scenario>` (spec 44 A1): the real UI over a scenario's
// fixtures and its timed beat script, with no repo, no Claude session and
// no network. It answers the endpoints the page calls with the shapes the
// live server sends (server.mjs), so the screens draw as they do in
// production; an endpoint the demo does not stage answers 404, which the
// page reads as "not served" and draws the design's empty state for.
//
// Nothing here writes to disk, opens a connection out or starts a process:
// every write the page makes (prefs, run mode, an answer, a send) lands in
// memory and is gone when the demo stops. The same guards as the live
// server stand: 127.0.0.1, a per-launch token, strict Host and Origin.
//
// Two calls of its own, for recorders and tests:
//   GET  /api/demo           { scenario, title, summary, duration, elapsed, speed, log }
//   POST /api/demo/restart   start the scenario over (open pages keep their channels and replay)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PERMISSION_MODES } from './provider.mjs';
import { ADOPT_PASTE } from './server.mjs';
import { createWorld } from './demo/world.mjs';
import { SCENARIOS, scenarioNames } from './demo/scenarios.mjs';
import { realClock } from './demo/clock.mjs';
import { createDemoVault, DEMO_REQUEST } from './demo/vault.mjs';
import { createDemoStack } from './demo/stack.mjs';
import { applyDrafts } from './drafts.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, '..');
const MAX_BODY = 1024 * 1024;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.ico': 'image/x-icon' };

export { scenarioNames };

/**
 * @param {object} o
 * @param {string} o.scenario       a name from scenarioNames()
 * @param {number} [o.port=0]
 * @param {string} [o.token]
 * @param {object} [o.clock]        server/demo/clock.mjs; default realClock({ speed })
 * @param {number} [o.speed=1]      script time against the wall (realClock only)
 * @param {boolean} [o.loop=false]  start over once the script ends (plus a 2 s hold)
 * @param {string} [o.dist]
 */
export async function startDemo({ scenario, port = 0, token = crypto.randomBytes(24).toString('base64url'), clock, speed = 1, loop = false, dist = path.join(PKG, 'dist'), hub } = {}) {
  const sc = SCENARIOS[scenario];
  if (!sc) throw Object.assign(new Error(`no demo scenario "${scenario}" (try: ${scenarioNames().join(', ')})`), { code: 'NO_SCENARIO' });
  const clk = clock || realClock({ speed });
  const world = createWorld(sc, { clock: clk, hub });
  let prefs = { onboarded: true, aiSummaries: true, theme: 'night' };
  let local = null;
  // The vault (spec 42): names and status in memory; a posted value is dropped the moment it is read.
  const vault = createDemoVault({ now: () => Date.now(), owner: () => !!(local ? local.effective : world.info().owner) });
  // The stack hand-off (server/stack.mjs's shapes, in memory): the zone and the domain move with script time.
  const stack = createDemoStack({ now: () => clk.now(), script: () => world.elapsed, vault, owner: () => !!(local ? local.effective : world.info().owner) });
  /** The plan with the chunk the vault holds back: it waits on a secret until the value is set. */
  const planWithSecret = () => {
    const p = world.plan();
    const sp = p.specs.find((x) => x.id === '15');
    if (!sp || sp.chunks.some((c) => c.id === DEMO_REQUEST.chunk)) return p;
    const waits = DEMO_REQUEST.names.filter((n) => !vault.isSet(n));
    sp.chunks.push({ id: DEMO_REQUEST.chunk, title: DEMO_REQUEST.title, size: 'M', state: 'ready', closedOn: null, claim: null, plotted: null, secrets: DEMO_REQUEST.names, ...(waits.length ? { why: `needs secret ${waits.join(', ')}`, needsSecret: waits } : {}) });
    if (waits.length) p.blocked = [...(p.blocked || []), { id: DEMO_REQUEST.chunk, why: `needs secret ${waits.join(', ')}` }];
    p.order = [...(p.order || []), DEMO_REQUEST.chunk];
    return p;
  };
  /** The inbox with the vault's request row, marked as the live server marks it (gone once the value is set). */
  const inboxWithSecret = () => {
    const row = vault.mark(DEMO_REQUEST.durable);
    const rest = world.inbox();
    return row && local?.effective !== false ? [...rest, { id: `plan:${row.id}`, kind: 'plan', src: 'durable', question: row.text, durable: row, at: null }] : rest;
  };
  let loopTimer = null;
  const begin = () => {
    world.start();
    stack.reset();
    local = { owner: world.info().owner, ownerMode: true, effective: world.info().owner, runMode: 'size', phase: 'std' };
    if (loop) {
      if (loopTimer) clk.cancel(loopTimer);
      loopTimer = clk.after(world.duration + 2000, begin);
    }
  };
  begin();

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => send(res, 500, { error: String(e && e.message ? e.message : e) }));
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  const actual = server.address().port;
  const origins = new Set([`http://127.0.0.1:${actual}`, `http://localhost:${actual}`]);
  const hosts = new Set([`127.0.0.1:${actual}`, `localhost:${actual}`]);

  function guard(req, url) {
    if (!hosts.has(req.headers.host || '')) return 'bad host';
    const origin = req.headers.origin;
    if (origin && !origins.has(origin)) return 'bad origin';
    if (req.method !== 'GET' && !origin) return 'missing origin';
    const a = Buffer.from(String(req.headers['x-nexus-token'] || url.searchParams.get('t') || ''));
    const b = Buffer.from(token);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return 'bad token';
    return null;
  }

  async function body(req) {
    if (!/^application\/json\b/.test(req.headers['content-type'] || '')) throw Object.assign(new Error('json only'), { status: 415 });
    let size = 0;
    const chunks = [];
    for await (const c of req) {
      size += c.length;
      if (size > MAX_BODY) throw Object.assign(new Error('too large'), { status: 413 });
      chunks.push(c);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw Object.assign(new Error('bad json'), { status: 400 }); }
  }

  let demoDrafts = {};
  const repoPath = `/demo/${world.info().name}`;
  const state = () => {
    const i = world.info();
    return {
      info: { repo: repoPath, isGit: true, name: i.name, branch: i.branch, remote: null, lastCommit: i.lastCommit, owner: i.owner, adopted: true, demo: sc.name },
      prefs,
      commands: ['bug', 'explode', 'heads-down', 'next', 'oversight', 'plot'].map((name) => ({ name, hint: '' })),
      provider: 'demo',
      permissionModes: PERMISSION_MODES,
    };
  };
  const preflight = () => ({
    checks: [
      { id: 'claude', label: 'Claude Code installed', ok: true, detail: 'demo', fix: null },
      { id: 'login', label: 'Logged in', ok: true, detail: 'demo', fix: null },
      { id: 'gh', label: 'GitHub CLI signed in', ok: true, optional: true, detail: 'demo', fix: null },
      { id: 'remote', label: 'Git remote', ok: true, optional: true, detail: 'demo', fix: null },
      { id: 'adopted', label: 'nexus adopted', ok: true, optional: true, detail: 'agents.md, plan/ and .claude/commands present.', fix: null },
    ],
    info: state().info,
    ready: true,
  });
  const demoInfo = () => ({ scenario: sc.name, title: sc.title, summary: sc.summary, duration: world.duration, elapsed: world.elapsed, speed: clk.speed, loop, log: world.log });

  async function handle(req, res) {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url);
    const bad = guard(req, url);
    if (bad) return send(res, 403, { error: bad });
    const route = `${req.method} ${url.pathname}`;
    try {
      switch (route) {
        case 'GET /api/events': return world.hubFor(url.searchParams.get('session') || sc.home).attach(req, res);
        case 'GET /api/demo': return send(res, 200, demoInfo());
        case 'POST /api/demo/restart': await body(req); begin(); return send(res, 200, demoInfo());
        case 'GET /api/server': return send(res, 200, { nexus: true, demo: sc.name, pid: process.pid, repo: repoPath, root: repoPath, home: world.session(sc.home)?.id || null, sessions: world.sessions().length });
        case 'GET /api/state': return send(res, 200, state());
        case 'GET /api/preflight': return send(res, 200, preflight());
        case 'GET /api/prompts': return send(res, 200, { paste: ADOPT_PASTE, adopt: '', pitch: '' });
        case 'POST /api/prefs': { const b = await body(req); prefs = { ...prefs, ...b }; return send(res, 200, prefs); }
        case 'GET /api/local': return send(res, 200, local);
        case 'POST /api/local': {
          const b = await body(req);
          for (const k of ['ownerMode', 'runMode', 'phase']) if (k in b) local[k] = b[k];
          local.effective = local.owner && local.ownerMode !== false;
          return send(res, 200, local);
        }
        case 'GET /api/sessions': return send(res, 200, world.rows());
        case 'GET /api/inbox': return send(res, 200, inboxWithSecret());
        case 'GET /api/oversight': { const row = vault.mark(DEMO_REQUEST.durable); return send(res, 200, { live: world.asks(), durable: [...world.durable(), ...(row && local?.effective !== false ? [row] : [])] }); }
        case 'GET /api/plan': return send(res, 200, planWithSecret());
        case 'GET /api/secrets': { const { status, ...r } = vault.status(); return send(res, 200, r); }
        case 'GET /api/secrets/audit': return send(res, 200, vault.audit());
        case 'POST /api/secrets/import': { const { status, ...r } = vault.importEnv(await body(req)); return send(res, status, r); }
        case 'POST /api/secrets/manifest': await body(req); return send(res, 200, { ok: true, created: false, manifest: 'nexus.secrets.json' });
        case 'GET /api/stack': { const { status, ...r } = stack.status(); return send(res, status, r); }
        case 'POST /api/stack/pick': { const { status, ...r } = stack.pick(await body(req)); return send(res, status, r); }
        case 'POST /api/stack/save': { const { status, ...r } = stack.save(await body(req)); return send(res, status, r); }
        case 'POST /api/stack/tick': { const { status, ...r } = stack.tick(await body(req)); return send(res, status, r); }
        case 'GET /api/claims': return send(res, 200, world.claims());
        case 'GET /api/summaries': return send(res, 200, {});
        // Drafts (spec 51, A1; drafts.mjs), kept in memory for the demo's life.
        case 'GET /api/drafts': return send(res, 200, { drafts: demoDrafts });
        case 'PUT /api/drafts': { const b = await body(req); demoDrafts = applyDrafts(demoDrafts, b.drafts || {}); return send(res, 200, { ok: true, drafts: demoDrafts }); }
        case 'POST /api/send': {
          const b = await body(req);
          const text = String(b.text || '').trim();
          if (!text) return send(res, 400, { error: 'empty prompt' });
          const s = world.session(b.session || sc.home);
          if (!s) return send(res, 404, { error: 'no such session on this server' });
          world.send(s.id, text);
          return send(res, 200, { ok: true, session: s.id, held: false });
        }
        case 'POST /api/announce':
        case 'POST /api/oversight/answer': await body(req); return send(res, 200, { ok: true });
      }
      const stk = /^POST \/api\/stack\/(check|apply)\/([a-z]+(?:\.[a-z]+)?)$/.exec(route);
      if (stk) {
        const b = await body(req);
        const { status, ...r } = stk[1] === 'check' ? stack.check(stk[2], b) : await stack.apply(stk[2], b);
        return send(res, status, r);
      }
      const sec = /^POST \/api\/secrets\/([A-Za-z0-9_%]+)(\/push)?$/.exec(route);
      if (sec) {
        const b = await body(req);
        const name = decodeURIComponent(sec[1]);
        const { status, ...r } = sec[2] ? vault.push(name, b) : vault.store(name, b);
        return send(res, status, r);
      }
      const ask = /^POST \/api\/ask\/([\w-]+)$/.exec(route);
      if (ask) {
        const b = await body(req);
        if (!world.answer(ask[1], b.answers && typeof b.answers === 'object' ? b.answers : null)) return send(res, 404, { error: 'no such question (already answered or expired)' });
        return send(res, 200, { ok: true });
      }
      const ibx = /^POST \/api\/inbox\/([\w.%:-]+)$/.exec(route);
      if (ibx) {
        const b = await body(req);
        const id = decodeURIComponent(ibx[1]);
        const live = world.asks().find((a) => id === a.id || id.startsWith(`${a.id}:`));
        if (!live) return send(res, 409, { error: 'nothing to settle there in this demo' });
        const q = live.questions[Number(id.split(':').pop()) || 0] || live.questions[0];
        world.answer(live.id, { [q.question]: String(b.answer ?? '') });
        return send(res, 200, { ok: true });
      }
      const one = /^GET \/api\/sessions\/([\w.%-]+)$/.exec(route);
      if (one) {
        const d = world.detail(decodeURIComponent(one[1]));
        return d ? send(res, 200, d) : send(res, 404, { error: 'no such live session' });
      }
      const act = /^POST \/api\/sessions\/([\w.%-]+)\/(pause|resume|close|link|steer|parked)$/.exec(route);
      if (act) {
        await body(req);
        const s = world.session(decodeURIComponent(act[1]));
        if (!s) return send(res, 404, { error: 'no such live session' });
        if (act[2] === 'resume' && world.resume(s.id)) return send(res, 200, { status: 200, id: s.id, name: s.name, resumes: s.id, star: s.name });
        return send(res, 200, { ok: true, id: s.id });
      }
      return send(res, 404, { error: 'not staged in this demo' });
    } catch (e) {
      return send(res, e.status || 500, { error: String(e.message || e) });
    }
  }

  function serveStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method' });
    if (!hosts.has(req.headers.host || '')) return send(res, 403, { error: 'bad host' });
    let rel;
    try { rel = decodeURIComponent(url.pathname); } catch { return send(res, 400, { error: 'bad path' }); }
    if (rel === '/' || !path.extname(rel) || /^\/s\/[^/]+\/?$/.test(rel)) rel = '/index.html';
    const file = path.resolve(dist, `.${rel}`);
    if (!file.startsWith(path.resolve(dist) + path.sep)) return send(res, 403, { error: 'path' });
    if (!fs.existsSync(file)) {
      if (rel === '/index.html') {
        res.writeHead(200, { 'content-type': TYPES['.html'] });
        return res.end('<!doctype html><meta charset="utf-8"><title>nexus</title><p>The UI is not built. Run <code>npm run build</code> in packages/cli.</p>');
      }
      return send(res, 404, { error: 'not found' });
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
      'cache-control': rel === '/index.html' ? 'no-store' : 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      ...(rel === '/index.html' ? { 'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'" } : {}),
    });
    fs.createReadStream(file).pipe(res);
  }

  return {
    url: `http://127.0.0.1:${actual}/?t=${encodeURIComponent(token)}`,
    port: actual,
    token,
    world,
    scenario: sc,
    urlFor: (id) => `http://127.0.0.1:${actual}/s/${encodeURIComponent(id)}?t=${encodeURIComponent(token)}`,
    restart: begin,
    async close() {
      if (loopTimer) clk.cancel(loopTimer);
      world.close();
      await new Promise((r) => { server.close(r); server.closeAllConnections?.(); });
    },
  };
}

function send(res, status, data) {
  if (res.headersSent) return res.end();
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}
