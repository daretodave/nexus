// The local server: 127.0.0.1 only, a random port, a per-launch token,
// and a strict Host + Origin check, so no other site or local page can
// drive the person's Claude Code through it.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createHub } from './hub.mjs';
import { PERMISSION_MODES } from './provider.mjs';
import { createSession } from './session.mjs';
import { endLedger, ghLoginOnce, heldNames, newSessionId, nextName, openPlace, startLedger, validName, writeStartLedger } from './fleet.mjs';
import { preflight } from './preflight.mjs';
import * as repoMod from './repo.mjs';
import * as local from './local.mjs';
import * as gh from './gh.mjs';
import { readPlan } from './plan.mjs';
import { createSummaries } from './summaries.mjs';
import { createSteering, primaryRoot, readLedgers, parkedItem, withHosted } from './sessions.mjs';
import { boardTugs, tugOf } from './tugs.mjs';
import { fleetRows, hasResumeSkill, inboxItems, ledgerFor, parseParkedId, resumable, resumePrompt, sameParked } from './fleet-home.mjs';
import { createGitView } from './git.mjs';
import { readRun, recentRuns } from './recover.mjs';
import { claudeHome as defaultClaudeHome, worktreeDirs } from './sessions.mjs';
import { claimsAction, listClaims, SESSION as CLAIMS_SESSION } from './claims.mjs';

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
 * @param {function} [o.ghRun]       run(cmd, args, opts) for every gh call (tests inject a fake gh; never PATH)
 * @param {() => Promise<string>} [o.ghLogin]  how to learn the gh login once (tests stub it; default asks gh)
 * @param {object} [o.git]          createGitView overrides (tests: claims, ttl)
 */
export async function startServer({ repo, port = 0, token = crypto.randomBytes(24).toString('base64url'), provider: injected, pollRuns = true, dist = path.join(PKG, 'dist'), claudeHome, ghRun, ghLogin, summaryQuery, git: gitOpts } = {}) {
  const ghOpts = ghRun ? { run: ghRun } : {};
  let prefs = await repoMod.readPrefs(repo);
  // Run mode moved to .nexus/local.json (A11): carry an older GUI's prefs copy over once.
  await local.migrateRunMode(repo, prefs, async () => { prefs = await repoMod.forgetPrefs(repo, ['agents', 'workflows']); }).catch(() => null);
  const summaries = createSummaries({ repo, readPlan: (r) => readPlan(r), enabled: () => prefs.aiSummaries !== false, query: summaryQuery });

  // Many sessions, one server (spec 40): each its own query(), claims session id, worktree and SSE channel. The
  // home session is the one the server starts with: every call that names no session reaches it.
  // The gh login is asked once, early, so a first prompt never waits on it. An injected provider is the test seam:
  // nothing there calls out to gh unless the test hands a ghLogin.
  const login = ghLoginOnce(ghLogin || (injected ? async () => '' : undefined));
  if (!injected) login();
  const sessions = new Map();
  async function host({ id, name = '', cwd, place = {}, listed = false, resume = null }) {
    const s = await createSession({
      id, name, cwd, place, listed, resume,
      env: async () => ({ NEXUS_SESSION: id, NEXUS_GH_LOGIN: await login() }),
      // An injected provider object serves the home session only; a factory serves every session (tests).
      provider: typeof injected === 'function' ? injected : sessions.size ? undefined : injected,
      permissionMode: () => prefs.permissionMode,
    });
    sessions.set(id, s);
    return s;
  }
  const home = await host({ id: newSessionId(), cwd: repo });
  const hub = home.hub;
  const provider = home.provider;
  /** The hosted session `key` names (id, Claude Code session id or star; none or `main`: home), or null. */
  const sessionOf = (key) => (!key || key === 'main' ? home : [...sessions.values()].find((s) => s.is(String(key))) || null);
  const hostedRows = () => [...sessions.values()].map((s) => ({ id: s.id, claude: s.claude, name: s.name, place: s.place, listed: s.listed, pause: s.pause, at: s.at }));
  // A session this server does not run (a terminal one) gets a quiet channel: a hello with nothing in it, never
  // another session's stream.
  const elsewhere = createHub();
  elsewhere.setStatus({ state: 'idle', hosted: false });

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

  // The home session's input stream, for calls that name no session.
  const sendPrompt = (text) => home.send(text);

  // Live local sessions and steering a linked one (spec 41): the SDK stream for a session this server runs, an
  // addressed owner line on the notice board (handed over by the steer hook) for a terminal one.
  const steering = createSteering({
    repo,
    // A steer aimed at a session this server runs is drawn on its stage with its state (tugs.mjs).
    send: (t, row) => (sessionOf(row?.id) || sessionOf(row?.claude) || home).send(t, { steered: true }),
    guiSession: () => [...sessions.values()].flatMap((s) => [s.id, s.claude]).filter(Boolean),
    hosted: hostedRows,
    home: claudeHome,
  });

  // Git per session and the repo panel (spec 40 A6): read-only, gh through the injected ghRun.
  // Under an injected provider (tests) with no ghRun, gh reads as missing: a test never reaches the real one.
  const noGh = async () => ({ ok: false, code: -1, stdout: '', stderr: 'gh is not stubbed in this test', missing: true });
  const gitView = createGitView({ repo, root: () => primaryRoot(repo), sessions: () => steering.list(), run: ghRun || (injected ? noGh : undefined), ...gitOpts });

  async function sessionDetail(id) {
    const h = sessionOf(id);
    const s = await steering.find(id) || (h && withHosted([], [{ ...hostedRows().find((x) => x.id === h.id), listed: true }])[0]);
    if (!s) return null;
    const l = readLedgers(await primaryRoot(repo)).find((x) => x.id === s.id) || {};
    const out = { ...s, parked: (Array.isArray(l.parked) ? l.parked : []).map(parkedItem), defaults: Array.isArray(l.defaults) ? l.defaults : [], started: l.started || null, tugs: await tugsFor(s) };
    const run = h || sessionOf(s.id) || sessionOf(s.claude);
    if (run) {
      const p = run.pause;
      // The cockpit reads `state` paused | pausing for its pause control.
      if (p.state !== 'run') Object.assign(out, { state: p.state, pausedAt: p.at, held: p.held });
      Object.assign(out, { hosted: true, cwd: run.cwd, worktree: run.place.worktree || '', branch: run.place.branch || out.git?.branch || '' });
    }
    out.git = await gitView.forSession(out);
    return out;
  }

  /** The tugs aimed at (or taken by) one session, newest first: the board's for a terminal one, its own stream's for one this server runs. */
  async function tugsFor(s) {
    const me = { id: s.id, name: s.name, kind: s.kind };
    const run = s.steer === 'sdk' ? sessionOf(s.id) || sessionOf(s.claude) : null;
    if (run) return run.tugs.list().filter((t) => !t.to || t.to === s.claude || t.to === s.id || t.to === run.claude).map((t) => ({ ...t, session: me, takenBy: t.takenBy ? me : null }));
    try {
      return (await boardTugs({ repo, sessions: await steering.list(), home: claudeHome })).filter((t) => tugOf(t, s));
    } catch {
      return []; // a board that cannot be read draws no tugs; the session detail still loads
    }
  }

  /** POST /api/sessions: start a hosted session in its own worktree, under the next free star (or `name`). */
  async function startSession(b) {
    const root = await primaryRoot(repo);
    const ledgers = readLedgers(root);
    const taken = heldNames(ledgers, [...sessions.values()].map((s) => s.name));
    let name = b.name == null || b.name === '' ? null : String(b.name).trim().toLowerCase();
    if (name && !validName(name)) return { status: 400, error: 'a session name is lowercase letters, digits and dashes' };
    if (name && taken.includes(name)) name = null; // the screen's guess went stale: take the next free star
    name ||= nextName(taken);
    let place = {};
    let note = null;
    if (b.worktree !== false) {
      const p = await openPlace(root, name, ledgers);
      if (p.error) note = `no worktree (${p.error}): it works in ${repo}`;
      else place = { worktree: p.worktree, branch: p.branch };
    }
    const id = newSessionId();
    const cwd = place.worktree || repo;
    writeStartLedger(root, startLedger({ id, name, cwd, place }));
    const s = await host({ id, name, cwd, place, listed: true });
    if (b.prompt && String(b.prompt).trim()) await s.send(String(b.prompt).trim());
    return { status: 200, id, name, cwd, worktree: place.worktree || '', branch: place.branch || '', ...(note ? { note } : {}) };
  }

  // Recover (spec 40 A10; recover.mjs): read a Workflow run folder, and resume it in a hosted session that resumes
  // the run's own Claude Code session, in its folder, and asks it to call the Workflow tool. One per run at a time.
  const recoverHome = claudeHome || defaultClaudeHome();
  const resumed = new Map(); // runId -> hosted session id
  async function recoverRead(dir) {
    const recent = recentRuns({ home: recoverHome, dirs: await worktreeDirs(repo) });
    if (!dir) return { status: 200, run: null, agents: [], recent };
    const r = readRun(dir, { home: recoverHome });
    if (r.error) return { status: 400, error: r.error, recent };
    const sid = resumed.get(r.run.runId);
    if (sid && sessions.has(sid)) r.run.resumedBy = { id: sid, name: sessions.get(sid).name };
    return { status: 200, ...r, recent };
  }
  async function recoverResume(b) {
    const r = readRun(String(b.dir || ''), { home: recoverHome });
    if (r.error) return { status: 400, error: r.error };
    const manual = { prompt: r.resume.prompt, command: r.resume.command };
    const sid = resumed.get(r.run.runId);
    if (sid && sessions.has(sid)) return { status: 409, error: `already resuming in ${sessions.get(sid).name}`, id: sid, ...manual };
    if (!r.agents.some((a) => a.resume)) return { status: 409, error: r.run.state === 'running' ? 'the run is still going' : 'nothing to resume: every agent finished', ...manual };
    if (!r.resume.hostable || !/^[A-Za-z0-9-]{8,64}$/.test(r.resume.sessionId)) return { status: 409, error: r.resume.why || 'cannot resume that session here', ...manual };
    const root = await primaryRoot(repo);
    const ledgers = readLedgers(root);
    const name = nextName(heldNames(ledgers, [...sessions.values()].map((s) => s.name)));
    const id = newSessionId();
    writeStartLedger(root, startLedger({ id, name, cwd: r.resume.cwd }));
    const s = await host({ id, name, cwd: r.resume.cwd, listed: true, resume: r.resume.sessionId });
    resumed.set(r.run.runId, id);
    await s.send(r.resume.prompt);
    return { status: 200, ok: true, id, name, cwd: r.resume.cwd, runId: r.run.runId, ...manual };
  }

  /** POST /api/sessions/:id/(pause|resume|close) for a session this server runs. */
  async function sessionAction(key, action) {
    const s = sessionOf(key);
    if (!s) {
      if (action === 'resume') return resumeFallen(key);
      return { status: 409, error: 'only a session this server runs pauses, resumes or closes here' };
    }
    if (action === 'pause') return { status: 200, id: s.id, pause: s.pauseAfterStep() };
    if (action === 'resume') return { status: 200, id: s.id, pause: await s.resume() };
    if (s === home) return { status: 409, error: 'the home session stays while the server runs: stop it instead' };
    await s.close();
    sessions.delete(s.id);
    if (s.listed) endLedger(await primaryRoot(repo), s.id);
    return { status: 200, id: s.id, closed: true, worktree: s.place.worktree || '', note: s.place.worktree ? 'its worktree stays: close it with /tidy' : undefined };
  }

  /**
   * The claims CLI's acting session: a session this server runs (by id, Claude Code id or star; none is home), else a
   * terminal session's own claims id (the CLI still matches the person, so it never reaches another's claims), plus
   * the gh login the server asked once. server/claims.mjs strips Claude Code's variables from the child's environment.
   */
  async function claimsCtx(key) {
    const s = sessionOf(key);
    const session = s ? s.id : CLAIMS_SESSION.test(String(key || '')) ? String(key) : home.id;
    return { session, login: await login() };
  }

  // Resume from a fallen tile (A2): a new hosted session takes the ledger through /reboot-resume. One resumer per
  // ledger while this server runs; the ledger's own `take` refuses a second one from anywhere else.
  const resumers = new Map();
  async function resumeFallen(key) {
    const root = await primaryRoot(repo);
    const l = ledgerFor(readLedgers(root), key);
    const by = l && resumers.get(l.id);
    if (by && sessions.has(by.id)) return { status: 409, error: `${l.star} is already resuming as ${by.name}`, id: by.id, name: by.name };
    const ok = resumable(l);
    if (!ok.ok) return ok;
    if (!hasResumeSkill(root)) return { status: 409, error: 'this repo has no /reboot-resume (copy it from the nexus templates): nothing started' };
    const prompt = resumePrompt(l);
    const r = await startSession({ worktree: false, prompt });
    if (r.status !== 200) return r;
    resumers.set(l.id, { id: r.id, name: r.name });
    return { status: 200, id: r.id, name: r.name, resumes: l.id, star: l.star, prompt, loop: !!l.loop };
  }

  /** The hosted sessions as the fleet and the inbox read them. */
  const hostedLive = () => [...sessions.values()].map((s) => ({
    id: s.id, claude: s.claude, name: s.name, busy: s.busy,
    asks: [...s.asks.values()].map((a) => a.view), permissions: [...s.permissions.values()].map((p) => p.view),
  }));

  /** GET /api/sessions: the session list with each tile's phase, progress, asks and resume. */
  async function sessionList() {
    const list = await steering.list();
    const hosted = hostedLive().map((h) => ({ ...h, asks: h.asks.length }));
    return fleetRows(list, { ledgers: readLedgers(await primaryRoot(repo)), hosted, resumers, owner: repoMod.isOwner(repo) });
  }

  /** GET /api/inbox: every session's questions, tagged by star, and the plan's. */
  async function inbox() {
    return inboxItems({ hosted: hostedLive(), ledgers: readLedgers(await primaryRoot(repo)), durable: repoMod.durableQuestions(repo) });
  }

  /** POST /api/inbox/:id { answer, how }: a parked question (to its session, off its ledger) or a permission. */
  async function settleInbox(id, b) {
    const answer = b.answer == null ? '' : String(b.answer);
    if (id.startsWith('perm:')) {
      const ok = answerPermission(id.slice(5), { allow: answer !== 'Deny', always: answer === 'Always allow' });
      return ok ? { status: 200, ok: true } : { status: 404, error: 'no such request' };
    }
    const ref = parseParkedId(id);
    if (!ref) return { status: 409, error: 'answer an ask through POST /api/ask/:id, a plan question through POST /api/oversight/answer' };
    const l = readLedgers(await primaryRoot(repo)).find((x) => x.id === ref.ledger);
    const raw = l && Array.isArray(l.parked) ? l.parked[ref.index] : undefined;
    const q = raw === undefined ? null : parkedItem(raw).q;
    if (q == null || !sameParked(ref, q)) return { status: 409, error: 'the parked list changed; reload and try again' };
    const action = b.how === 'approved' || b.how === 'default' ? 'approve' : 'change';
    return steering.settleParked(ref.ledger, { index: ref.index, q, action, answer: answer || undefined });
  }

  const answerAsk = (askId, answers) => [...sessions.values()].some((s) => s.answerAsk(askId, answers));
  const answerPermission = (reqId, d) => [...sessions.values()].some((s) => s.answerPermission(reqId, d));

  async function handle(req, res) {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url);
    const bad = guard(req, url);
    if (bad) return send(res, 403, { error: bad });
    const route = `${req.method} ${url.pathname}`;
    try {
      switch (route) {
        case 'GET /api/events': return (sessionOf(url.searchParams.get('session'))?.hub || elsewhere).attach(req, res);
        case 'GET /api/server': return send(res, 200, { nexus: true, pid: process.pid, repo, root: await primaryRoot(repo), home: home.id, sessions: sessions.size });
        case 'GET /api/state': return send(res, 200, { info: await repoMod.repoInfo(repo), prefs, commands: repoMod.listCommands(repo), provider: provider.kind, permissionModes: PERMISSION_MODES });
        case 'GET /api/preflight': return send(res, 200, await preflight(repo));
        case 'GET /api/prompts': return send(res, 200, { paste: ADOPT_PASTE, adopt: readPrompt('adopt.md'), pitch: readPrompt('pitch.md') });
        case 'POST /api/prefs': { const b = await body(req); if (b.permissionMode && !PERMISSION_MODES.includes(b.permissionMode)) delete b.permissionMode; prefs = await repoMod.writePrefs(repo, b); return send(res, 200, prefs); }
        case 'GET /api/local': return send(res, 200, await local.localView(repo));
        case 'POST /api/local': return send(res, 200, await local.writeLocal(repo, await body(req)));
        case 'POST /api/owner': { const b = await body(req); return send(res, 200, { owner: await repoMod.setOwner(repo, !!b.on) }); }
        case 'POST /api/send': {
          const b = await body(req);
          const text = String(b.text || '').trim();
          if (!text) return send(res, 400, { error: 'empty prompt' });
          const s = sessionOf(b.session);
          if (!s) return send(res, 404, { error: 'no such session on this server' });
          return send(res, 200, { ok: true, session: s.id, ...(await s.send(text)) });
        }
        case 'POST /api/adopt': await body(req); await sendPrompt(ADOPT_PASTE); return send(res, 200, { ok: true, session: home.id });
        case 'POST /api/interrupt':
        case 'POST /api/stop':
        case 'POST /api/fresh': {
          const s = sessionOf((await body(req)).session);
          if (!s) return send(res, 404, { error: 'no such session on this server' });
          await s[route.slice('POST /api/'.length)]();
          return send(res, 200, { ok: true, session: s.id });
        }
        case 'POST /api/sessions': { const r = await startSession(await body(req)); return send(res, r.status, r); }
        case 'GET /api/oversight': return send(res, 200, { live: [...sessions.values()].flatMap((s) => [...s.asks.values()].map((a) => a.view)), durable: repoMod.durableQuestions(repo) });
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
          await sendPrompt(prompt);
          return send(res, 200, { ok: true });
        }
        case 'GET /api/sessions': return send(res, 200, await gitView.withGit(await sessionList()));
        case 'GET /api/inbox': return send(res, 200, await inbox());
        case 'GET /api/git': return send(res, 200, await gitView.repoGit());
        case 'GET /api/git/tidy': { const r = await gitView.tidyDry(); return send(res, r.available ? 200 : 404, r); }
        case 'POST /api/git/fetch': { await body(req); const r = await gitView.fetchNow(); return send(res, r.ok ? 200 : 502, r); }
        case 'POST /api/announce': { const b = await body(req); const r = await steering.announce(b.text); return send(res, r.status, r); }
        case 'GET /api/claims': return send(res, 200, await listClaims(repo, await claimsCtx(url.searchParams.get('session'))));
        case 'GET /api/plan': return send(res, 200, await readPlan(repo, { mark: (url.searchParams.get('mark') || '').split(',').filter(Boolean) }));
        case 'GET /api/summaries': return send(res, 200, await summaries.get());
        case 'GET /api/progress': return send(res, 200, await repoMod.progress(repo, url.searchParams.get('spec')));
        case 'GET /api/actions': return send(res, 200, await gh.actionsSetup(repo, ghOpts));
        case 'POST /api/actions/workflow': { const b = await body(req); return send(res, 200, await gh.setWorkflow(repo, b.id, !!b.enabled, ghOpts)); }
        case 'POST /api/cloud/run': {
          const b = await body(req);
          const r = await gh.dispatchWorkflow(repo, b.id, ghOpts);
          return send(res, r.ok ? 200 : r.status || 400, r);
        }
        case 'GET /api/runs': return send(res, 200, await gh.listRuns(repo, ghOpts));
        case 'GET /api/recover': { const r = await recoverRead(url.searchParams.get('dir') || ''); return send(res, r.status, r); }
        case 'POST /api/recover/resume': { const r = await recoverResume(await body(req)); return send(res, r.status, r); }
      }
      // The claims panel (spec 40 A5): each verb is one run of the repo's claims CLI as the acting session (claims.mjs).
      const cv = /^POST \/api\/claims\/([a-z]+)$/.exec(route);
      if (cv) {
        const b = await body(req);
        const r = await claimsAction(repo, cv[1], b, { ...(await claimsCtx(b.session)), ghRun });
        return send(res, r.status, r);
      }
      const ask = /^POST \/api\/ask\/([\w-]+)$/.exec(route);
      if (ask) {
        const b = await body(req);
        const answers = b.answers && typeof b.answers === 'object' ? Object.fromEntries(Object.entries(b.answers).map(([k, v]) => [String(k), String(v)])) : null;
        if (!answerAsk(ask[1], answers)) return send(res, 404, { error: 'no such question (already answered or expired)' });
        return send(res, 200, { ok: true });
      }
      const ibx = /^POST \/api\/inbox\/([\w.%:-]+)$/.exec(route);
      if (ibx) {
        const r = await settleInbox(decodeURIComponent(ibx[1]), await body(req));
        return send(res, r.status, r);
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
      const life = /^POST \/api\/sessions\/([\w.%-]+)\/(pause|resume|close)$/.exec(route);
      if (life) {
        await body(req);
        const r = await sessionAction(decodeURIComponent(life[1]), life[2]);
        return send(res, r.status, r);
      }
      const perm =/^POST \/api\/permission\/([\w-]+)$/.exec(route);
      if (perm) {
        const b = await body(req);
        if (!answerPermission(perm[1], { allow: !!b.allow, always: !!b.always })) return send(res, 404, { error: 'no such request' });
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
    // A deep link (/s/<id>) is the app's own route, even when the id carries a dot.
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

  // Live Actions runs -> loop beats on every session's channel, only while a tab is watching one.
  const seenRuns = new Map();
  let ghBroken = 0;
  const poll = pollRuns ? setInterval(async () => {
    const hubs = [...sessions.values()].map((s) => s.hub);
    if (!hubs.some((h) => h.clients) || Date.now() < ghBroken) return;
    const r = await gh.listRuns(repo, ghOpts);
    if (!r.ok) { ghBroken = Date.now() + 60000; return; }
    const beats = gh.runBeats(r.runs, seenRuns);
    for (const h of hubs) {
      h.set('runs', r.runs);
      for (const b of beats) h.beat(b);
    }
  }, gh.POLL_MS) : null;

  return {
    url: `http://127.0.0.1:${actual}/?t=${encodeURIComponent(token)}`,
    port: actual,
    token,
    hub,
    home: home.id,
    sessions,
    /** A deep link to one session's cockpit, carrying this launch's token. */
    urlFor: (id) => `http://127.0.0.1:${actual}/s/${encodeURIComponent(id)}?t=${encodeURIComponent(token)}`,
    async close() {
      if (poll) clearInterval(poll);
      const root = await primaryRoot(repo);
      for (const s of sessions.values()) {
        await s.close();
        // A session started here that never took a prompt frees its star; one that worked stays resumable.
        if (s.listed && !s.sent) endLedger(root, s.id);
      }
      elsewhere.close();
      await new Promise((r) => server.close(r));
    },
  };
}

function send(res, status, data) {
  if (res.headersSent) return res.end();
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}
