// The local server: 127.0.0.1 only, a random port, a per-launch token,
// and a strict Host + Origin check, so no other site or local page can
// drive the person's Claude Code through it.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createHub } from './hub.mjs';
import { createSwr } from './swr.mjs';
import { PERMISSION_MODES } from './provider.mjs';
import { createSession } from './session.mjs';
import { cleanGit, endLedger, formPlace, ghLoginOnce, heldNames, newSessionId, nextName, planPlace, startLedger, validName, writeStartLedger } from './fleet.mjs';
import { safeHooks } from './cloud.mjs';
import { formNext, formStart } from '../shared/forming.mjs';
import { preflight } from './preflight.mjs';
import * as repoMod from './repo.mjs';
import * as local from './local.mjs';
import * as gh from './gh.mjs';
import { readPlan } from './plan.mjs';
import { landReorder } from './reorder.mjs';
import { createSummaries } from './summaries.mjs';
import { explode, plotPrompt, plotRequest } from './explode.mjs';
import { addWorkflow, loopSchedule, saveSchedule } from './cloud.mjs';
import { createSteering, primaryRoot, readLedgers, parkedItem, transcriptActivity, withHosted } from './sessions.mjs';
import { boardTugs, tugOf } from './tugs.mjs';
import { fleetRows, hasResumeSkill, inboxItems, ledgerFor, markEnded, parseParkedId, resumable, resumePrompt, sameParked } from './fleet-home.mjs';
import { run as shRun, settle as settleChildren } from './sh.mjs';
import { createGitView } from './git.mjs';
import { readRun, recentRuns } from './recover.mjs';
import { claudeHome as defaultClaudeHome, worktreeDirs } from './sessions.mjs';
import { claimsAction, listClaims, SESSION as CLAIMS_SESSION } from './claims.mjs';
import { createStepWatch, sessionTimes } from './session-times.mjs';
import { tonightStart } from '../shared/times.mjs';
import { createMask, createSecrets, parseRequest } from './secrets.mjs';
import { readDesign } from './design.mjs';
import { clearDraftsWith, readDrafts, writeDrafts } from './drafts.mjs';
import { markPlanAnswersSent, readPlanAnswers, writePlanAnswers } from './plan-answers.mjs';
import { artifactLink } from '../shared/design-link.mjs';
import { MAX_SEND_BODY, readAttachments } from '../shared/attachments.mjs';
import { needsFrom } from '../shared/needs.mjs';
import { saveUploads, uploadFile } from './uploads.mjs';
import { EFFORTS, HELPER_MODEL, MODELS, effortsFor, modelLabel, validEffort, validModel } from '../shared/models.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** How often the top bar's needs are looked at again while a tab watches. */
const NEEDS_MS = 10000;
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
 * @param {function|false} [o.explodeQuery]  the SDK's query() for POST /api/explode (tests); under an injected provider none is loaded
 * @param {object} [o.secrets]      the secrets API's seams (tests): { run } a sink's runner, { vault } openVault overrides, { setup } setupVault overrides
 * @param {boolean} [o.swr]         answer the slow reads stale-while-revalidate (swr.mjs). Default: on, and off under an
 *                                  injected provider, where a test reads back what it just wrote
 * @param {object} [o.worktree]     a GUI session's worktree seams (tests): { git(cwd, args, o) } for every git it runs (a
 *                                  delay stands in for a slow checkout), { hooks(repo) } for cloud.mjs safeHooks
 */
export async function startServer({ repo, port = 0, token = crypto.randomBytes(24).toString('base64url'), provider: injected, pollRuns = true, dist = path.join(PKG, 'dist'), claudeHome, ghRun, ghLogin, summaryQuery, explodeQuery, git: gitOpts, secrets: secretsOpts = {}, worktree: wtOpts = {}, swr: keepReads } = {}) {
  const wtGit = wtOpts.git || cleanGit;
  const wtHooks = wtOpts.hooks || safeHooks;
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
  // The vault mask (secrets.mjs, A13): every JSON answer and every SSE frame passes through it, fed by the vault's
  // current values. Under an injected provider (tests) a sink runs only through the injected runner, never a real tool.
  const mask = createMask();
  const noSink = () => ({ status: 127, missing: true });
  const secrets = createSecrets({ repo, mask, run: secretsOpts.run || (injected ? noSink : undefined), vault: secretsOpts.vault, ...(secretsOpts.owner ? { owner: secretsOpts.owner } : {}), setup: secretsOpts.setup || (injected ? { gh: async () => ({ ok: false, out: '', err: 'no gh under a test provider' }) } : undefined) });
  await secrets.refresh().catch(() => null);
  const refreshMask = setInterval(() => { secrets.refresh().catch(() => null); }, 5000);
  refreshMask.unref?.();
  const send = (res, status, data) => sendJson(res, status, mask.deep(data));
  // The slow reads (git, gh, the plan and claims scripts) answer at once with what they last said while one fresh read
  // runs behind it (swr.mjs), so moving between screens never waits on them. Any write forgets them all.
  const reads = createSwr((keepReads ?? !injected) ? {} : { freshMs: 0, keepMs: 0 });
  const sessions = new Map();
  // The SDK's supportedModels() rows, asked once by the first session whose query comes up (spec 54): which efforts
  // each model takes. Null until then; Settings and the badge offer all five meanwhile.
  let modelCatalog = null;
  const noteModels = (rows) => { if (!modelCatalog && Array.isArray(rows) && rows.length) modelCatalog = rows; };
  // A session on Claude Code's default names what that resolved to: Settings labels "Claude Code's default" with it.
  const noteModel = ({ model, requested }) => {
    if (requested || !model || prefs.lastModel === model) return;
    prefs = { ...prefs, lastModel: model };
    repoMod.writePrefs(repo, { lastModel: model }).then((p) => { prefs = p; }, () => null);
  };
  async function host({ id, name = '', cwd, place = {}, listed = false, resume = null, form = null }) {
    const s = await createSession({
      id, name, cwd, place, listed, resume, form,
      env: async () => ({ NEXUS_SESSION: id, NEXUS_GH_LOGIN: await login() }),
      // An injected provider object serves the home session only; a factory serves every session (tests).
      provider: typeof injected === 'function' ? injected : sessions.size ? undefined : injected,
      permissionMode: () => prefs.permissionMode,
      model: () => prefs.model || '',
      effort: () => prefs.effort || '',
      onModel: noteModel,
      onModels: noteModels,
      mask,
    });
    // A question or a permission asked or settled here reaches every screen's top bar now (needsSoon), and the reads
    // that show it are read again.
    const set = s.hub.set;
    s.hub.set = (key, value) => {
      set(key, value);
      if (key === 'asks' || key === 'permissions') { for (const k of ['inbox', 'sessions', 'needs']) reads.forget(k); needsSoon(); }
    };
    sessions.set(id, s);
    return s;
  }
  const home = await host({ id: newSessionId(), cwd: repo });
  const hub = home.hub;
  const provider = home.provider;
  /** The hosted session `key` names (id, Claude Code session id or star; none or `main`: home), or null. */
  const sessionOf = (key) => (!key || key === 'main' ? home : [...sessions.values()].find((s) => s.is(String(key))) || null);
  const hostedRows = () => [...sessions.values()].map((s) => ({
    id: s.id, claude: s.claude, name: s.name, place: s.place, listed: s.listed, pause: s.pause, at: s.at, form: s.form,
    activity: transcriptActivity(s.hub.transcript, { busy: s.busy, held: s.pause.held }),
  }));
  // A session this server does not run (a terminal one) gets a quiet channel: a hello with nothing in it, never
  // another session's stream.
  const elsewhere = createHub({ mask });
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

  // `max`: the body cap (POST /api/send takes images, so it passes a larger one). `beacon`: navigator.sendBeacon
  // posts a string as text/plain; the drafts route takes that JSON too (its token rides in ?t=, as a beacon cannot
  // set a header). A number is read as { max } (the send route's call).
  async function body(req, opts = {}) {
    const { max = MAX_BODY, beacon = false } = typeof opts === 'number' ? { max: opts } : opts;
    const type = req.headers['content-type'] || '';
    if (!/^application\/json\b/.test(type) && !(beacon && /^text\/plain\b/.test(type))) throw Object.assign(new Error('json only'), { status: 415 });
    let size = 0;
    const chunks = [];
    for await (const c of req) {
      size += c.length;
      if (size > max) throw Object.assign(new Error('too large'), { status: 413 });
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
  // A reorder's pull request (47 A11): gh through the injected ghRun; null runs the real gh, never under a test.
  const reorderGh = ghRun || injected ? async (args, o) => { const r = await (ghRun || noGh)('gh', args, o); return { ...r, out: r.stdout, err: r.stderr }; } : null;
  const gitView = createGitView({ repo, root: () => primaryRoot(repo), sessions: () => steering.list(), run: ghRun || (injected ? noGh : undefined), ...gitOpts });
  // The boards' times (41.7): ledgers watched across reads, and the plan's titles, sizes and hours, read at most once a
  // minute (the cockpit polls the detail every few seconds).
  const stepWatch = createStepWatch();
  let planRead = { at: 0, p: null };
  const planForTimes = () => {
    if (!planRead.p || Date.now() - planRead.at > 60000) planRead = { at: Date.now(), p: readPlan(repo).catch(() => null) };
    return planRead.p;
  };

  // GET /api/cloud (gh.cloudLoop): many screens read it for the loop line, so gh is asked at most once a minute.
  let cloudRead = { at: 0, p: null };
  const cloudNow = () => {
    if (!cloudRead.p || Date.now() - cloudRead.at > 60000) {
      // Like the git view: under an injected provider with no ghRun, gh reads as missing, never the real one.
      // The schedule (49.1) is read from the loop workflow at origin/<default branch>, not asked of gh.
      const p = Promise.all([
        gh.cloudLoop(repo, { run: ghRun || (injected ? noGh : undefined), since: tonightStart(new Date()).getTime() }),
        loopSchedule(repo),
      ]).then(([r, s]) => (r.ok && s ? { ...r, schedule: s, next: s.next } : r)).catch((e) => ({ ok: false, status: 502, error: String(e.message || e) }));
      cloudRead = { at: Date.now(), p };
    }
    return cloudRead.p;
  };

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
      if (run.form) out.form = run.form;
    }
    out.git = await gitView.forSession(out);
    const times = sessionTimes({
      ledger: l, beats: run ? run.hub.beats : [], hostedAt: run?.at || null, plan: await planForTimes(),
      watched: stepWatch.observe(l), phase: (await local.localView(repo).catch(() => null))?.phase || null,
    });
    Object.assign(out, times, { chunk: times.chunk || out.chunk || null });
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
    let planned = null;
    if (b.worktree !== false) {
      // Only the place is picked now (a few quick git reads); the worktree forms after this answers (spec 47 A4).
      planned = await planPlace(root, name, ledgers, { git: wtGit, local: local.readLocal(repo) });
      if (planned.error) { note = `no worktree (${planned.error}): it works in ${repo}`; planned = null; } else place = { worktree: planned.worktree, branch: planned.branch };
    }
    const id = newSessionId();
    const cwd = place.worktree || repo;
    writeStartLedger(root, startLedger({ id, name, cwd, place }));
    const form = planned ? formStart(planned) : null;
    const s = await host({ id, name, cwd, place, listed: true, form });
    if (b.prompt && String(b.prompt).trim()) await s.send(String(b.prompt).trim());
    if (planned) formBehind(s, root);
    return { status: 200, id, name, cwd, worktree: place.worktree || '', branch: place.branch || '', ...(form ? { form } : {}), ...(note ? { note } : {}) };
  }

  /**
   * Make a session's planned worktree after its POST has answered: progress, then ready (its provider starts there and
   * what it was sent goes) or failed (the cockpit offers Retry). One form at a time per session.
   */
  const forming = new Map(); // session id -> the promise of its form
  function formBehind(s, root) {
    if (forming.has(s.id)) return forming.get(s.id);
    const job = (async () => {
      const r = await formPlace(root, s.place, { git: wtGit, hooks: wtHooks, onLine: (line) => s.setForm(formNext(s.form, { type: 'progress', line })) })
        .catch((e) => ({ error: String(e?.message || e) }));
      if (!sessions.has(s.id)) return; // closed while it formed
      if (r.error) { s.setForm(formNext(s.form, { type: 'fail', error: r.error })); return; }
      s.setForm(formNext(s.form, { type: 'ready' }));
      await s.formed({ cwd: s.place.worktree });
    })().finally(() => forming.delete(s.id));
    forming.set(s.id, job);
    return job;
  }

  /** POST /api/sessions/:id/retry: form a failed worktree again, in the same place. */
  async function retryForm(id) {
    const s = sessionOf(id);
    if (!s) return { status: 404, error: 'no session by that id runs here' };
    if (s.form?.state !== 'failed') return { status: 409, error: s.form ? `its worktree is ${s.form.state}` : 'it has no worktree to form' };
    s.setForm(formNext(s.form, { type: 'retry' }));
    formBehind(s, await primaryRoot(repo));
    return { status: 200, id: s.id, form: s.form };
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

  /**
   * POST /api/design/handoff { link, session? }: "Hand off a design" (spec 43, A7). The link is checked first
   * (shared/design-link.mjs), then `/design ingest <link>` goes to the home session, or to a new one when `session` is
   * "new" (no worktree of its own: /design ingest plots in the plot's worktree).
   */
  async function designHandoff(b) {
    const l = artifactLink(b.link);
    if (!l.ok) return { status: 400, error: l.error };
    const command = `/design ingest ${l.link}`;
    if (b.session === 'new') {
      const r = await startSession({ worktree: false, prompt: command });
      if (r.status !== 200) return r;
      return { status: 200, ok: true, session: r.id, name: r.name, link: l.link, command };
    }
    await home.send(command);
    return { status: 200, ok: true, session: home.id, name: home.name || '', link: l.link, command };
  }

  /**
   * POST /api/plot { spec, thoughts, chunks }: onboarding's kept ideas go to a /plot run in a new hosted session (no
   * worktree of its own: /plot cuts one), which researches, writes the pending file and lands per owner mode. The
   * answer comes at once; the session does the work (explode.mjs plotPrompt). A repo nexus is not in yet answers 409
   * { error, adopt: true }: /plot has no skill, scripts or plan there, so the Plot step adopts first (spec 52, A1).
   */
  async function plotKept(b) {
    const r = plotRequest(b);
    if (r.error) return { status: 400, error: r.error };
    if (!repoMod.nexusIn(repo)) return { status: 409, error: 'nexus isn\'t in this repo yet: adopt it first (POST /api/adopt), then plot', adopt: true };
    const owner = (await local.localView(repo)).effective;
    const prompt = plotPrompt(r, owner);
    const s = await startSession({ worktree: false, prompt });
    if (s.status !== 200) return s;
    return { status: 200, file: r.spec?.file || null, chunks: r.chunks.map((c) => c.id).filter(Boolean), session: s.id, star: s.name, owner, prompt };
  }

  /** POST /api/sessions/:id/(pause|resume|close|retry) for a session this server runs. */
  async function sessionAction(key, action) {
    if (action === 'retry') return retryForm(key);
    const s = sessionOf(key);
    if (!s) {
      if (action === 'resume') return resumeFallen(key);
      if (action === 'close') return closeEnded(key);
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

  /**
   * Close a session that ended with its server (fleet-home.mjs isEnded, checked again now): its ledger ends, which
   * frees its star, and its worktree closes through the repo's own scripts/worktree.mjs when it has one (never a bare
   * `git worktree remove`). A fallen session with work is refused: resume or inspect it.
   */
  async function closeEnded(key) {
    const list = markEnded(await gitView.withGit(await sessionList()));
    const row = list.find((x) => x.id === key || x.claude === key);
    if (!row) return { status: 404, error: 'no such session' };
    if (!row.ended) return { status: 409, error: `${row.name} has work (commits, changes or claims) or is still running: resume or inspect it` };
    const root = await primaryRoot(repo);
    endLedger(root, row.id);
    const wt = row.git?.worktree || '';
    const script = path.join(root, 'scripts', 'worktree.mjs');
    let worktree = null;
    if (wt && fs.existsSync(wt)) {
      if (!fs.existsSync(script)) worktree = { closed: false, note: 'no scripts/worktree.mjs here: close the worktree with /tidy' };
      else {
        const slash = (p) => p.replace(/\\/g, '/');
        const r = await shRun('node', [slash(script), 'close', slash(wt), '--repo', slash(root)], { cwd: root, timeout: 60000 });
        worktree = r.ok ? { closed: true } : { closed: false, note: (r.stderr || r.stdout || 'worktree.mjs close failed').trim().split('\n').pop() };
      }
    }
    return { status: 200, id: row.id, closed: true, name: row.name, worktree };
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
    id: s.id, claude: s.claude, name: s.name, busy: s.busy, model: s.model.model, effort: s.model.effort,
    asks: [...s.asks.values()].map((a) => a.view), permissions: [...s.permissions.values()].map((p) => p.view),
  }));

  /** GET /api/sessions: the session list with each tile's phase, progress, asks and resume. */
  async function sessionList() {
    const list = await steering.list();
    const hosted = hostedLive().map((h) => ({ ...h, asks: h.asks.length }));
    const ledgers = readLedgers(await primaryRoot(repo));
    for (const l of ledgers) stepWatch.observe(l);
    return fleetRows(list, { ledgers, hosted, resumers, owner: repoMod.isOwner(repo) });
  }

  /**
   * GET /api/needs: who needs the owner now (shared/needs.mjs), without the slow git: only a fallen session the GUI
   * started has its git read, to tell one that stopped with nothing behind it (a Clear, not a resume) from one with work.
   */
  async function needsNow() {
    const rows = await sessionList();
    const odd = rows.filter((r) => r.gui && r.state === 'fallen' && !r.hosted);
    const ended = new Set(odd.length ? markEnded(await gitView.withGit(odd)).filter((r) => r.ended).map((r) => r.id) : []);
    return { at: Date.now(), items: needsFrom(rows.map((r) => (ended.has(r.id) ? { ...r, ended: true } : r)), hostedLive()) };
  }

  // The `needs` event on every live channel: sent when a session asks or is answered, after a write, and every
  // NEEDS_MS while a tab watches (a terminal session's ledger can fall over without this server hearing it).
  let needsTimer = null;
  let needsSent = '';
  // Each look is numbered: two can run at once (a session answered while one was reading), and one that started
  // before the last one sent is older than what the tabs already show, so it is dropped.
  let needsAsked = 0;
  let needsShown = 0;
  function needsSoon(ms = 150) {
    if (needsTimer) return;
    needsTimer = setTimeout(async () => {
      needsTimer = null;
      const look = ++needsAsked;
      const hubs = [...[...sessions.values()].map((s) => s.hub), elsewhere];
      try {
        const v = await reads.get('needs', needsNow, { fresh: true });
        if (look < needsShown) return;
        needsShown = look;
        const key = JSON.stringify(v.value.items);
        if (key === needsSent) return;
        needsSent = key;
        for (const h of hubs) h.set('needs', v.value);
      } catch { /* the next look sends it */ }
    }, ms);
    needsTimer.unref?.();
  }

  /** GET /api/inbox: every session's questions, tagged by star, and the plan's. */
  async function inbox() {
    // A secret request carries its chunk and the names still missing; one whose names are all set has left (secrets.mjs).
    return inboxItems({ hosted: hostedLive(), ledgers: readLedgers(await primaryRoot(repo)), durable: await planQuestions() });
  }

  /**
   * The plan's questions with each secret request marked (secrets.mjs markRequests), for GET /api/inbox and its
   * fallback GET /api/oversight alike. If marking fails, the requests are dropped rather than served unmarked: an
   * unmarked one would draw as a free-text question whose answer goes to a session.
   */
  async function planQuestions() {
    const durable = repoMod.durableQuestions(repo);
    return secrets.markRequests(durable).catch(() => durable.filter((d) => !parseRequest(d.text)));
  }

  /** A secret request is answered by the vault's key card only: a row that is one, by its text or by where it sits. */
  function secretRequestRow(a) {
    if (parseRequest(a.text)) return true;
    const at = `${a.file}:${a.line}`;
    return repoMod.durableQuestions(repo).some((d) => `${d.file}:${d.line}` === at && parseRequest(d.text));
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

  /** POST /api/prefs: each known key checked; model and effort against the list, the effort against the model's levels. */
  async function savePrefs(b) {
    const patch = { ...b };
    delete patch.lastModel; // the server's own note
    if ('permissionMode' in patch && !PERMISSION_MODES.includes(patch.permissionMode)) delete patch.permissionMode;
    if ('model' in patch && !validModel(patch.model)) delete patch.model;
    if ('effort' in patch && !validEffort(patch.effort)) delete patch.effort;
    const m = 'model' in patch ? patch.model : prefs.model;
    const e = 'effort' in patch ? patch.effort : prefs.effort;
    if (e && !effortsFor(m, modelCatalog).includes(e)) patch.effort = ''; // a level this model does not take falls back to its default
    prefs = await repoMod.writePrefs(repo, patch);
    return prefs;
  }

  /** GET /api/models: the list, each model's effort levels (null: not known yet), the helpers' model and the default's. */
  async function modelsView() {
    if (!modelCatalog) {
      for (const s of sessions.values()) {
        const rows = await s.provider?.supportedModels?.().catch(() => null);
        if (rows) { noteModels(rows); break; }
      }
    }
    const def = modelCatalog?.find((r) => r && r.value === 'default');
    return {
      models: MODELS.map((m) => ({ ...m, efforts: modelCatalog ? effortsFor(m.id, modelCatalog) : null })),
      efforts: EFFORTS,
      known: !!modelCatalog,
      helper: { id: HELPER_MODEL, label: modelLabel(HELPER_MODEL) },
      lastModel: prefs.lastModel || def?.resolvedModel || '',
    };
  }

  /** POST /api/sessions/:id/model { model?, effort? }: a hosted session's model and effort, from its next turn. */
  async function switchModel(key, b) {
    const s = sessionOf(key);
    if (!s) return { status: 409, error: 'only a session this server runs switches its model here' };
    const pick = {};
    if (b.model !== undefined) { if (!validModel(b.model)) return { status: 400, error: `unknown model: ${b.model}` }; pick.model = b.model; }
    if (b.effort !== undefined) { if (!validEffort(b.effort)) return { status: 400, error: `unknown effort: ${b.effort}` }; pick.effort = b.effort; }
    if (!('model' in pick) && !('effort' in pick)) return { status: 400, error: 'name a model or an effort' };
    const target = 'model' in pick ? pick.model : s.provider?.chosen?.model ?? s.model.model ?? '';
    const levels = effortsFor(target || s.model.model || '', modelCatalog);
    if (pick.effort && !levels.includes(pick.effort)) {
      if (!('model' in pick)) return { status: 400, error: `${modelLabel(target || s.model.model) || 'this model'} does not take ${pick.effort} effort` };
      pick.effort = ''; // a new model without that level: its own default
    }
    if ('model' in pick && !levels.length) pick.effort = '';
    const r = await s.switchModel(pick);
    if (!r.ok) return { status: 409, error: r.error };
    return { status: 200, id: s.id, pending: r.pending, note: 'applies from the next turn' };
  }

  const answerAsk = (askId, answers) => [...sessions.values()].some((s) => s.answerAsk(askId, answers));
  const answerPermission = (reqId, d) => [...sessions.values()].some((s) => s.answerPermission(reqId, d));

  async function handle(req, res) {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url);
    const bad = guard(req, url);
    if (bad) return send(res, 403, { error: bad });
    const route = `${req.method} ${url.pathname}`;
    // A write forgets every kept read, now and once it has answered (a read that ran across it is not kept). Drafts
    // save as the person types and change nothing a read shows.
    if (req.method !== 'GET' && url.pathname !== '/api/drafts') { reads.forget(); res.once('finish', () => { reads.forget(); needsSoon(); }); }
    // `x-nexus-fresh: 1` waits for the fresh read; otherwise a kept answer comes at once, marked `x-nexus-stale: 1`.
    const kept = async (key, fn) => {
      const r = await reads.get(key, fn, { fresh: req.headers['x-nexus-fresh'] === '1' });
      if (r.stale) res.setHeader('x-nexus-stale', '1');
      return r.value;
    };
    try {
      await secrets.refresh().catch(() => null); // a value set in a terminal since the last answer is masked in this one
      switch (route) {
        case 'GET /api/events': return (sessionOf(url.searchParams.get('session'))?.hub || elsewhere).attach(req, res);
        case 'GET /api/server': return send(res, 200, { nexus: true, pid: process.pid, repo, root: await primaryRoot(repo), home: home.id, sessions: sessions.size });
        case 'GET /api/state': return send(res, 200, { info: await kept('state', () => repoMod.repoInfo(repo)), prefs, commands: repoMod.listCommands(repo), provider: provider.kind, permissionModes: PERMISSION_MODES });
        case 'GET /api/preflight': return send(res, 200, await preflight(repo));
        case 'GET /api/prompts': return send(res, 200, { paste: ADOPT_PASTE, adopt: readPrompt('adopt.md'), pitch: readPrompt('pitch.md') });
        case 'POST /api/prefs': return send(res, 200, await savePrefs(await body(req)));
        case 'GET /api/models': return send(res, 200, await modelsView());
        case 'GET /api/local': return send(res, 200, await local.localView(repo));
        case 'POST /api/local': return send(res, 200, await local.writeLocal(repo, await body(req)));
        case 'POST /api/owner': { const b = await body(req); return send(res, 200, { owner: await repoMod.setOwner(repo, !!b.on) }); }
        case 'POST /api/send': {
          // Images ride along as base64 (spec 51, A2): this route alone takes a body that big.
          const b = await body(req, MAX_SEND_BODY);
          const text = String(b.text || '').trim();
          const att = readAttachments(b.attachments);
          if (att.error) return send(res, / up to /.test(att.error) ? 413 : 400, { error: att.error });
          if (!text && !att.images.length && !att.files.length) return send(res, 400, { error: 'empty prompt' });
          const s = sessionOf(b.session);
          if (!s) return send(res, 404, { error: 'no such session on this server' });
          const refs = saveUploads(await primaryRoot(repo), s.id, att.images);
          const images = att.images.map((img, i) => ({ ...img, ...refs[i] }));
          return send(res, 200, { ok: true, session: s.id, ...(await s.send(text, { images, files: att.files })) });
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
        case 'GET /api/oversight': return send(res, 200, { live: [...sessions.values()].flatMap((s) => [...s.asks.values()].map((a) => a.view)), durable: await planQuestions() });
        case 'POST /api/oversight/answer': {
          const b = await body(req);
          const rows = (Array.isArray(b.answers) ? b.answers : []).filter((a) => a && a.file && a.answer && String(a.answer).trim());
          if (!rows.length) return send(res, 400, { error: 'no answers' });
          // A value never goes through a session: a secret request is set in the Vault (POST /api/secrets/:name).
          if (rows.some(secretRequestRow)) return send(res, 409, { error: 'a secret request is answered in the Vault, never in a session: set the value there or in your terminal' });
          const clean = rows.map((a) => ({ file: String(a.file), line: Number(a.line) || 0, text: String(a.text || ''), answer: String(a.answer) }));
          const ids = clean.map((a) => `${a.file}:${a.line}`);
          if (b.session === 'new') {
            // Continue with no session to go back to (spec 53): a new one starts (in the checkout, as /design and /plot
            // hand-offs do), running /oversight with them all.
            const r = await startSession({ worktree: false, prompt: repoMod.answersPrompt(clean, repoMod.isOwner(repo)) });
            if (r.status === 200) markPlanAnswersSent(repo, ids, r.id);
            return send(res, r.status, { ...r, ok: r.status === 200, session: r.id });
          }
          if (b.session) {
            // Continue (spec 53): every answer in one message to the session that asked (or the one picked), which
            // applies them and goes on. It reaches that session's next turn, and only that session.
            const r = await steering.steer(String(b.session), repoMod.answersPrompt(clean, repoMod.isOwner(repo), { resume: true }), { kind: 'answer' });
            if (r.status === 200) markPlanAnswersSent(repo, ids, r.session || b.session);
            return send(res, r.status, r);
          }
          const prompt = repoMod.answersPrompt(clean, repoMod.isOwner(repo));
          await sendPrompt(prompt);
          return send(res, 200, { ok: true });
        }
        case 'GET /api/sessions': return send(res, 200, await kept('sessions', async () => markEnded(await gitView.withGit(await sessionList()))));
        case 'GET /api/inbox': return send(res, 200, await kept('inbox', inbox));
        case 'GET /api/needs': return send(res, 200, await kept('needs', needsNow));
        // Plan answers kept as given (spec 53, A1; plan-answers.mjs). POST is the same as PUT.
        case 'GET /api/plan-answers': return send(res, 200, { answers: readPlanAnswers(repo, repoMod.durableQuestions(repo)) });
        case 'PUT /api/plan-answers':
        case 'POST /api/plan-answers': {
          const b = await body(req);
          const patch = b.answers && typeof b.answers === 'object' && !Array.isArray(b.answers) ? b.answers : null;
          if (!patch) return send(res, 400, { error: 'answers: { "<file:line>": { answer, how } | null }' });
          const qs = repoMod.durableQuestions(repo);
          // A secret request is answered by the vault's key card only: its value is never kept here.
          const secretIds = new Set(qs.filter((q) => parseRequest(q.text)).map((q) => q.id));
          const r = writePlanAnswers(repo, patch, qs, { skip: (id) => secretIds.has(id) });
          return send(res, 200, { ok: true, ...r });
        }
        // Answers saved as they are typed (spec 51, A1; drafts.mjs). POST is the same as PUT, for sendBeacon.
        case 'GET /api/drafts': return send(res, 200, { drafts: readDrafts(repo) });
        case 'PUT /api/drafts':
        case 'POST /api/drafts': {
          const b = await body(req, { beacon: true });
          if (!b.drafts || typeof b.drafts !== 'object' || Array.isArray(b.drafts)) return send(res, 400, { error: 'drafts: { key: text | null }' });
          return send(res, 200, { ok: true, drafts: writeDrafts(repo, b.drafts) });
        }
        case 'GET /api/git': return send(res, 200, await kept('git', () => gitView.repoGit()));
        case 'GET /api/git/tidy': { const r = await gitView.tidyDry(); return send(res, r.available ? 200 : 404, r); }
        case 'POST /api/git/fetch': { await body(req); const r = await gitView.fetchNow(); return send(res, r.ok ? 200 : 502, r); }
        case 'POST /api/announce': { const b = await body(req); const r = await steering.announce(b.text); return send(res, r.status, r); }
        case 'GET /api/claims': { const who = url.searchParams.get('session') || ''; return send(res, 200, await kept(`claims:${who}`, async () => listClaims(repo, await claimsCtx(who)))); }
        case 'GET /api/plan': { const mark = url.searchParams.get('mark') || ''; return send(res, 200, await kept(`plan:${mark}`, () => readPlan(repo, { mark: mark.split(',').filter(Boolean) }))); }
        case 'POST /api/plan/reorder': { const b = await body(req); return send(res, 200, await landReorder(repo, b, { owner: (await local.localView(repo)).effective, gh: reorderGh })); }
        case 'GET /api/summaries': return send(res, 200, await kept('summaries', () => summaries.get()));
        // Onboarding's Plot step (spec 47, A1; explode.mjs): split thoughts into ideas (no write), and plot the kept ones.
        case 'POST /api/explode': { const b = await body(req); const { status, ...r } = await explode({ repo, text: b.text, team: b.team, query: explodeQuery ?? summaryQuery ?? (injected ? false : undefined) }); return send(res, status, r); }
        case 'POST /api/plot': { const { status, ...r } = await plotKept(await body(req)); return send(res, status, r); }
        case 'GET /api/progress': return send(res, 200, await repoMod.progress(repo, url.searchParams.get('spec')));
        case 'GET /api/actions': { const [r, schedule] = await Promise.all([gh.actionsSetup(repo, ghOpts), loopSchedule(repo)]); return send(res, 200, { ...r, schedule }); }
        case 'POST /api/actions/workflow': { const b = await body(req); const r = await gh.setWorkflow(repo, b.id, !!b.enabled, ghOpts); cloudRead.p = null; return send(res, 200, r); }
        case 'POST /api/cloud/run': {
          const b = await body(req);
          const r = await gh.dispatchWorkflow(repo, b.id, ghOpts);
          cloudRead.p = null;
          return send(res, r.ok ? 200 : r.status || 400, r);
        }
        // Onboarding's Cloud step (spec 47, A16; cloud.mjs): write the loop workflow, set its schedule; each lands per owner mode.
        case 'POST /api/cloud/workflow': { await body(req); const { status, ...r } = await addWorkflow(repo, { owner: (await local.localView(repo)).effective, run: ghRun || (injected ? noGh : undefined) }); cloudRead.p = null; return send(res, status, r); }
        case 'POST /api/cloud/schedule': { const b = await body(req); const { status, ...r } = await saveSchedule(repo, b, { owner: (await local.localView(repo)).effective, run: ghRun || (injected ? noGh : undefined) }); cloudRead.p = null; return send(res, status, r); }
        case 'GET /api/runs': return send(res, 200, await gh.listRuns(repo, ghOpts));
        case 'GET /api/recover': { const r = await recoverRead(url.searchParams.get('dir') || ''); return send(res, r.status, r); }
        case 'POST /api/recover/resume': { const r = await recoverResume(await body(req)); return send(res, r.status, r); }
        // The design handoff (spec 43, A7; design.mjs): the repo's port-map.mjs read as a gallery, and a link sent to /design ingest.
        case 'GET /api/design': return send(res, 200, await readDesign(repo));
        case 'POST /api/design/handoff': { const r = await designHandoff(await body(req)); return send(res, r.status, r); }
        case 'GET /api/cloud': { const r = await cloudNow(); return send(res, r.ok ? 200 : r.status || 502, r); }
        // The vault (spec 42, A13; secrets.mjs): names and status out, a value in only through these POST bodies.
        case 'GET /api/secrets': { const { status, ...r } = await kept('secrets', () => secrets.status()); return send(res, status, r); }
        case 'GET /api/secrets/audit': { const { status, ...r } = await secrets.audit(); return send(res, status, r); }
        case 'POST /api/secrets/import': { const { status, ...r } = await secrets.importEnv(await body(req)); return send(res, status, r); }
        case 'POST /api/secrets/manifest': { const { status, ...r } = await secrets.startManifest(await body(req)); return send(res, status, r); }
        // Set up the vault (47.3): the CLI's own copy of the secrets scripts, landed per owner mode (vault-setup.mjs).
        case 'POST /api/secrets/setup': { await body(req); const { status, ...r } = await secrets.setup(); return send(res, status, r); }
      }
      // An image a person sent (uploads.mjs): the transcript's bubble shows it from here.
      const up = /^GET \/api\/uploads\/([\w.-]+)\/([\w.-]+)$/.exec(route);
      if (up) {
        const f = uploadFile(await primaryRoot(repo), up[1], up[2]);
        if (!f) return send(res, 404, { error: 'no such upload' });
        res.writeHead(200, { 'content-type': f.type, 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' });
        return fs.createReadStream(f.full).pipe(res);
      }
      const secPush = /^POST \/api\/secrets\/([A-Za-z0-9_%]+)\/push$/.exec(route);
      if (secPush) {
        const { status, ...r } = await secrets.push(decodeURIComponent(secPush[1]), await body(req));
        return send(res, status, r);
      }
      const sec = /^POST \/api\/secrets\/([A-Za-z0-9_%]+)$/.exec(route);
      if (sec) {
        const { status, ...r } = await secrets.store(decodeURIComponent(sec[1]), await body(req));
        return send(res, status, r);
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
        try { clearDraftsWith(repo, `${ask[1]}:`); } catch { /* a draft left behind is only a draft */ }
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
      const mdl = /^POST \/api\/sessions\/([\w.%-]+)\/model$/.exec(route);
      if (mdl) {
        const r = await switchModel(decodeURIComponent(mdl[1]), await body(req));
        return send(res, r.status, r);
      }
      const life = /^POST \/api\/sessions\/([\w.%-]+)\/(pause|resume|close|retry)$/.exec(route);
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

  // The top bar's needs, looked at again while a tab watches (needsSoon), and once now so the first hello carries them.
  const needsLook = setInterval(() => {
    if ([...sessions.values()].some((s) => s.hub.clients) || elsewhere.clients) needsSoon(0);
  }, NEEDS_MS);
  needsLook.unref?.();
  needsSoon(0);

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
      clearInterval(refreshMask);
      clearInterval(needsLook);
      clearTimeout(needsTimer);
      const root = await primaryRoot(repo);
      for (const s of sessions.values()) {
        await s.close();
        // A session started here that never took a prompt frees its star; one that worked stays resumable.
        if (s.listed && !s.sent) endLedger(root, s.id);
      }
      elsewhere.close();
      await new Promise((r) => server.close(r));
      // What it started and is still running (a git status a list asked for, a claims read) ends with it: on Windows
      // a program left running holds the repo's folder.
      await settleChildren();
    },
  };
}

function sendJson(res, status, data) {
  if (res.headersSent) return res.end();
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}
