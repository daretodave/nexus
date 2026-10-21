// The local server: 127.0.0.1 only, a random port, a per-launch token,
// and a strict Host + Origin check, so no other site or local page can
// drive the person's Claude Code through it.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createHub } from './hub.mjs';
import { createProvider, PERMISSION_MODES } from './provider.mjs';
import { txFromMessage, newTxContext } from './normalize.mjs';
import { beatsFromMessage, newBeatContext, MAIN } from '../shared/beats.mjs';
import { preflight } from './preflight.mjs';
import * as repoMod from './repo.mjs';
import * as gh from './gh.mjs';
import { readPlan } from './plan.mjs';
import { createSteering, primaryRoot, readLedgers, parkedItem } from './sessions.mjs';
import { boardTugs, createTugLog, tugOf } from './tugs.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PKG = path.resolve(HERE, '..');
const MAX_BODY = 1024 * 1024;

export const ADOPT_PASTE = [
  'Clone https://github.com/daretodave/nexus.git to',
  "../nexus (or use ./.nexus if submoduled) if you haven't",
  'already, then read and follow ../nexus/prompts/adopt.md',
  'exactly, in order. Do not skip steps or invent scope beyond',
  'what it says.',
].join('\n');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.ico': 'image/x-icon' };

function readPrompt(name) {
  for (const dir of [path.join(PKG, 'prompts'), path.resolve(PKG, '..', '..', 'prompts')]) {
    const f = path.join(dir, name);
    if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
  }
  return '';
}

/**
 * @param {object} o
 * @param {string} o.repo            the adopter repo (cwd for sessions)
 * @param {number} [o.port=0]        0 = any free port
 * @param {string} [o.token]         defaults to a fresh random token
 * @param {object|function} [o.provider]  inject a provider, or a factory given the hooks (tests)
 * @param {boolean} [o.pollRuns=true]
 * @param {string} [o.claudeHome]    Claude Code's config folder (sessions under projects/); tests point it elsewhere
 */
export async function startServer({ repo, port = 0, token = crypto.randomBytes(24).toString('base64url'), provider: injected, pollRuns = true, dist = path.join(PKG, 'dist'), claudeHome } = {}) {
  const hub = createHub();
  const asks = new Map();
  const permissions = new Map();
  let txCtx = newTxContext();
  let beatCtx = newBeatContext();
  let prefs = await repoMod.readPrefs(repo);
  let busy = false;
  let guiSession = null;
  const tugLog = createTugLog();

  const publishAsks = () => hub.set('asks', [...asks.values()].map((a) => a.view));
  const publishPerms = () => hub.set('permissions', [...permissions.values()].map((a) => a.view));

  const onMessage = (msg) => {
    if (msg.session_id) guiSession = msg.session_id;
    tugLog.onMessage(msg);
    for (const item of txFromMessage(msg, txCtx)) hub.tx(item);
    for (const b of beatsFromMessage(msg, beatCtx)) hub.beat(b);
    if (msg.type === 'result') {
      busy = false;
      hub.setStatus({ state: 'idle', cost: msg.total_cost_usd ?? null, session: msg.session_id || null });
    }
  };

  const onAsk = ({ id, agent, questions, signal }) => new Promise((resolve) => {
    const view = { id, agent, questions, at: Date.now() };
    asks.set(id, { view, resolve });
    // The SDK's agentID is a subagent's own id, not the tool_use id the stage
    // draws it under, so stage beats attach questions to the session orb.
    hub.beat({ k: 'oversight', p: 'ask', id, agent: MAIN });
    publishAsks();
    signal?.addEventListener('abort', () => {
      if (!asks.has(id)) return;
      asks.delete(id);
      hub.beat({ k: 'oversight', p: 'answer', id });
      publishAsks();
      resolve(null);
    });
  });

  const onPermission = ({ id, agent, tool, input, suggestions, reason, signal }) => new Promise((resolve) => {
    const view = { id, agent, tool, summary: JSON.stringify(input).slice(0, 400), reason: reason || null, canAlways: !!(suggestions && suggestions.length) };
    permissions.set(id, { view, resolve });
    if (!agent || agent === MAIN) hub.beat({ k: 'agent', p: 'wait', id: MAIN });
    publishPerms();
    signal?.addEventListener('abort', () => {
      if (!permissions.delete(id)) return;
      publishPerms();
      resolve({ allow: false });
    });
  });

  const hooks = {
    repo,
    onMessage,
    onAsk,
    onPermission,
    onStatus: (s) => { if (s.state === 'idle') busy = false; hub.setStatus(s); },
    permissionMode: () => prefs.permissionMode,
  };
  const provider = typeof injected === 'function' ? injected(hooks) : injected || await createProvider(hooks);
  hub.setStatus({ state: 'idle', provider: provider.kind });

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
    const given = req.headers['x-nexus-token'] || url.searchParams.get('t') || '';
    const a = Buffer.from(String(given));
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

  // A send while a turn is under way is a tug (steering mid-run); the
  // session itself stays open between turns, so "active" is not "busy".
  function sendPrompt(text, steered = false) {
    const running = busy;
    // A tug (or a steer aimed at this session) is drawn on the stage with its state (tugs.mjs).
    if (running || steered) tugLog.sent(text, { session: guiSession, busy: running });
    busy = true;
    hub.tx({ kind: 'user', text });
    if (running) hub.beat({ k: 'oversight', p: 'tug', agent: MAIN });
    else hub.beat({ k: 'agent', p: 'start', id: MAIN, label: 'session' });
    provider.send(text);
  }

  // Live local sessions and steering a linked one (spec 41): the SDK stream for this server's own session, an
  // addressed owner line on the notice board (handed over by the steer hook) for a terminal one.
  const steering = createSteering({ repo, send: (t) => sendPrompt(t, true), guiSession: () => guiSession, home: claudeHome });

  async function sessionDetail(id) {
    const s = await steering.find(id);
    if (!s) return null;
    const l = readLedgers(await primaryRoot(repo)).find((x) => x.id === s.id) || {};
    return { ...s, parked: (Array.isArray(l.parked) ? l.parked : []).map(parkedItem), defaults: Array.isArray(l.defaults) ? l.defaults : [], started: l.started || null, tugs: await tugsFor(s) };
  }

  /** The tugs aimed at (or taken by) one session, newest first: the board's for a terminal one, the stream's for this server's own. */
  async function tugsFor(s) {
    const me = { id: s.id, name: s.name, kind: s.kind };
    if (s.steer === 'sdk') return tugLog.list().filter((t) => !t.to || t.to === s.claude || t.to === s.id).map((t) => ({ ...t, session: me, takenBy: t.takenBy ? me : null }));
    try {
      return (await boardTugs({ repo, sessions: await steering.list(), home: claudeHome })).filter((t) => tugOf(t, s));
    } catch {
      return []; // a board that cannot be read draws no tugs; the session detail still loads
    }
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url);
    const bad = guard(req, url);
    if (bad) return send(res, 403, { error: bad });
    const route = `${req.method} ${url.pathname}`;
    try {
      switch (route) {
        case 'GET /api/events': return hub.attach(req, res);
        case 'GET /api/state': return send(res, 200, { info: await repoMod.repoInfo(repo), prefs, commands: repoMod.listCommands(repo), provider: provider.kind, permissionModes: PERMISSION_MODES });
        case 'GET /api/preflight': return send(res, 200, await preflight(repo));
        case 'GET /api/prompts': return send(res, 200, { paste: ADOPT_PASTE, adopt: readPrompt('adopt.md'), pitch: readPrompt('pitch.md') });
        case 'POST /api/prefs': { const b = await body(req); if (b.permissionMode && !PERMISSION_MODES.includes(b.permissionMode)) delete b.permissionMode; prefs = await repoMod.writePrefs(repo, b); return send(res, 200, prefs); }
        case 'POST /api/owner': { const b = await body(req); return send(res, 200, { owner: await repoMod.setOwner(repo, !!b.on) }); }
        case 'POST /api/send': {
          const b = await body(req);
          const text = String(b.text || '').trim();
          if (!text) return send(res, 400, { error: 'empty prompt' });
          sendPrompt(text);
          return send(res, 200, { ok: true });
        }
        case 'POST /api/adopt': await body(req); sendPrompt(ADOPT_PASTE); return send(res, 200, { ok: true });
        case 'POST /api/interrupt': await body(req); await provider.interrupt(); return send(res, 200, { ok: true });
        case 'POST /api/stop': await body(req); await provider.stop(); return send(res, 200, { ok: true });
        case 'POST /api/fresh': {
          await body(req);
          await provider.fresh();
          txCtx = newTxContext();
          beatCtx = newBeatContext();
          hub.reset();
          return send(res, 200, { ok: true });
        }
        case 'GET /api/oversight': return send(res, 200, { live: [...asks.values()].map((a) => a.view), durable: repoMod.durableQuestions(repo) });
        case 'POST /api/oversight/answer': {
          const b = await body(req);
          const rows = (Array.isArray(b.answers) ? b.answers : []).filter((a) => a && a.file && a.answer && String(a.answer).trim());
          if (!rows.length) return send(res, 400, { error: 'no answers' });
          const prompt = repoMod.answersPrompt(rows.map((a) => ({ file: String(a.file), line: Number(a.line) || 0, text: String(a.text || ''), answer: String(a.answer) })), repoMod.isOwner(repo));
          if (b.session) {
            // Aimed at one linked session: it reaches that session's next turn, and only that session.
            const r = await steering.steer(String(b.session), prompt, { kind: 'answer' });
            return send(res, r.status, r);
          }
          sendPrompt(repoMod.answersPrompt(rows.map((a) => ({ file: String(a.file), line: Number(a.line) || 0, text: String(a.text || ''), answer: String(a.answer) })), repoMod.isOwner(repo)));
          return send(res, 200, { ok: true });
        }
        case 'GET /api/sessions': return send(res, 200, await steering.list());
        case 'GET /api/claims': return send(res, 200, await repoMod.claims(repo));
        case 'POST /api/claims/release': { const b = await body(req); return send(res, 200, await repoMod.releaseClaim(repo, String(b.id || ''))); }
        case 'GET /api/plan': return send(res, 200, await readPlan(repo, { mark: (url.searchParams.get('mark') || '').split(',').filter(Boolean) }));
        case 'GET /api/progress': return send(res, 200, await repoMod.progress(repo, url.searchParams.get('spec')));
        case 'GET /api/actions': return send(res, 200, await gh.actionsSetup(repo));
        case 'POST /api/actions/workflow': { const b = await body(req); return send(res, 200, await gh.setWorkflow(repo, b.id, !!b.enabled)); }
        case 'GET /api/runs': return send(res, 200, await gh.listRuns(repo));
      }
      const ask = /^POST \/api\/ask\/([\w-]+)$/.exec(route);
      if (ask) {
        const b = await body(req);
        const entry = asks.get(ask[1]);
        if (!entry) return send(res, 404, { error: 'no such question (already answered or expired)' });
        asks.delete(ask[1]);
        hub.beat({ k: 'oversight', p: 'answer', id: ask[1] });
        publishAsks();
        const answers = b.answers && typeof b.answers === 'object' ? Object.fromEntries(Object.entries(b.answers).map(([k, v]) => [String(k), String(v)])) : null;
        entry.resolve(answers);
        return send(res, 200, { ok: true });
      }
      const one = /^GET \/api\/sessions\/([\w.%-]+)$/.exec(route);
      if (one) {
        const d = await sessionDetail(decodeURIComponent(one[1]));
        return d ? send(res, 200, d) : send(res, 404, { error: 'no such live session' });
      }
      const sact = /^POST \/api\/sessions\/([\w.%-]+)\/(link|steer|parked)$/.exec(route);
      if (sact) {
        const b = await body(req);
        const id = decodeURIComponent(sact[1]);
        const r = sact[2] === 'link' ? await steering.link(id, b.on !== false)
          : sact[2] === 'steer' ? await steering.steer(id, b.text, { kind: b.kind === 'answer' ? 'answer' : 'tug' })
            : await steering.settleParked(id, { index: Number(b.index), q: b.q, action: b.action, pick: b.pick, answer: b.answer });
        return send(res, r.status, r);
      }
      const perm = /^POST \/api\/permission\/([\w-]+)$/.exec(route);
      if (perm) {
        const b = await body(req);
        const entry = permissions.get(perm[1]);
        if (!entry) return send(res, 404, { error: 'no such request' });
        permissions.delete(perm[1]);
        publishPerms();
        entry.resolve({ allow: !!b.allow, always: !!b.always });
        return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: 'not found' });
    } catch (e) {
      return send(res, e.status || 500, { error: String(e.message || e) });
    }
  }

  function serveStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method' });
    if (!hosts.has(req.headers.host || '')) return send(res, 403, { error: 'bad host' });
    let rel;
    try { rel = decodeURIComponent(url.pathname); } catch { return send(res, 400, { error: 'bad path' }); }
    if (rel === '/' || !path.extname(rel)) rel = '/index.html';
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

  // Live Actions runs -> loop beats, only while a tab is watching.
  const seenRuns = new Map();
  let ghBroken = 0;
  const poll = pollRuns ? setInterval(async () => {
    if (!hub.clients || Date.now() < ghBroken) return;
    const r = await gh.listRuns(repo);
    if (!r.ok) { ghBroken = Date.now() + 60000; return; }
    hub.set('runs', r.runs);
    for (const b of gh.runBeats(r.runs, seenRuns)) hub.beat(b);
  }, gh.POLL_MS) : null;

  return {
    url: `http://127.0.0.1:${actual}/?t=${encodeURIComponent(token)}`,
    port: actual,
    token,
    hub,
    async close() {
      if (poll) clearInterval(poll);
      await provider.stop?.();
      hub.close();
      await new Promise((r) => server.close(r));
    },
  };
}

function send(res, status, data) {
  if (res.headersSent) return res.end();
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}
