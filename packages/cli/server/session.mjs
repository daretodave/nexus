// One hosted session: its own SDK query() (through the provider seam), its own event hub (the SSE channel
// /api/events?session=<id>), its live questions and permission requests, and its pause. The server keeps one per
// session it runs (server.mjs); the session it starts with is the home session, which every call without a
// `session` reaches.
//
// Identity: `id` is the session's claims session and ledger id. The session's environment carries it as
// NEXUS_SESSION, plus NEXUS_GH_LOGIN (resolved once per server) so `claims.mjs whoami` never calls out to gh.
//
// Pause is "after this step": a session mid-turn reads `pausing` until its turn's result, then `paused`; a paused
// session holds what is sent to it and hands it over, in order, on resume.
//
// Tugs: each session keeps its own tug log (tugs.mjs createTugLog), fed from its own message stream: a send while a
// turn runs, or a steer aimed at it, is logged and moves sent -> seen -> applied.
import { createHub } from './hub.mjs';
import { createProvider } from './provider.mjs';
import { txFromMessage, newTxContext } from './normalize.mjs';
import { beatsFromMessage, newBeatContext, MAIN } from '../shared/beats.mjs';
import { createTugLog } from './tugs.mjs';
import { ASK_DEFAULT_MS, askDefaults } from '../shared/times.mjs';

/**
 * @param {object} o
 * @param {string} o.id               claims session and ledger id (NEXUS_SESSION)
 * @param {string} [o.name]           star name
 * @param {string} o.cwd              where the session works (its worktree, or the repo)
 * @param {object} [o.place]          { worktree, branch } when the server opened one for it
 * @param {() => Promise<object>} [o.env]  extra environment, resolved before the first prompt
 * @param {object|function} [o.provider]   a provider, or a factory given the hooks (tests)
 * @param {() => string} [o.permissionMode]
 * @param {boolean} [o.listed]        shown in the session list before it has run (started from the GUI)
 * @param {string} [o.resume]        a Claude Code session id its first turn resumes (Recover: a Workflow run's own)
 * @param {object} [o.mask]         the server's vault mask (secrets.mjs): every frame this session's channel sends
 * @param {number} [o.askDefaultMs]   how long a live question waits before the session takes its default (0: never)
 * @param {object} [o.form]          a worktree still forming (shared/forming.mjs): no provider yet, and what is sent
 *                                   waits until formed({ cwd }) (POST /api/sessions answers before git has made it)
 */
export async function createSession({ id, name = '', cwd, place = {}, env = async () => ({}), provider: injected, permissionMode = () => 'default', listed = false, resume = null, now = () => Date.now(), askDefaultMs = ASK_DEFAULT_MS, mask = null, form: startForm = null }) {
  const hub = createHub({ mask });
  const asks = new Map();
  const permissions = new Map();
  let txCtx = newTxContext({ now });
  let beatCtx = newBeatContext();
  let busy = false;
  let claude = null;
  let sent = 0;
  let pause = { state: 'run', at: null };
  const held = [];
  let extraEnv = null;
  const tugLog = createTugLog({ now });
  let form = startForm;
  let here = cwd;
  const waiting = []; // sent while the worktree forms: delivered, in order, once it is ready

  const publishAsks = () => hub.set('asks', [...asks.values()].map((a) => a.view));
  const publishPerms = () => hub.set('permissions', [...permissions.values()].map((a) => a.view));
  const publishPause = () => hub.setStatus({ pause: pause.state, pausedAt: pause.at });

  const onMessage = (msg) => {
    if (msg.session_id) claude = msg.session_id;
    tugLog.onMessage(msg);
    for (const item of txFromMessage(msg, txCtx)) hub.tx(item);
    // Stream beats carry when they were read, so the stage knows when a chunk was claimed and closed.
    for (const b of beatsFromMessage(msg, beatCtx)) hub.beat({ ...b, at: now() });
    if (msg.type === 'result') {
      busy = false;
      hub.setStatus({ state: 'idle', cost: msg.total_cost_usd ?? null, session: msg.session_id || null });
      if (pause.state === 'pausing') { pause = { state: 'paused', at: new Date(now()).toISOString() }; publishPause(); }
    }
  };

  // A live question waits askDefaultMs for an answer, then the session takes its defaults (the recommended option,
  // else the first) and says so in the conversation; `deadline` is when, for the countdown. One with no options waits.
  const onAsk = ({ id: askId, agent, questions, signal }) => new Promise((resolve) => {
    const at = now();
    const defaults = askDefaultMs > 0 ? askDefaults(questions) : null;
    const view = { id: askId, agent, questions, at, deadline: defaults ? at + askDefaultMs : null, session: id };
    const timer = defaults ? setTimeout(() => takeDefaults(askId), askDefaultMs) : null;
    timer?.unref?.();
    asks.set(askId, { view, resolve, timer, defaults });
    // The SDK's agentID is a subagent's own id, not the tool_use id the stage
    // draws it under, so stage beats attach questions to the session orb.
    hub.beat({ k: 'oversight', p: 'ask', id: askId, agent: MAIN });
    publishAsks();
    signal?.addEventListener('abort', () => {
      if (!asks.has(askId)) return;
      clearTimeout(asks.get(askId).timer);
      asks.delete(askId);
      hub.beat({ k: 'oversight', p: 'answer', id: askId });
      publishAsks();
      resolve(null);
    });
  });

  function takeDefaults(askId) {
    const entry = asks.get(askId);
    if (!entry) return;
    asks.delete(askId);
    hub.beat({ k: 'oversight', p: 'answer', id: askId });
    hub.tx({ kind: 'system', text: `default taken after ${Math.round(askDefaultMs / 60000)} min: ${Object.values(entry.defaults).join(' · ')}`, at: now() });
    publishAsks();
    entry.resolve(entry.defaults);
  }

  const onPermission = ({ id: reqId, agent, tool, input, suggestions, reason, signal }) => new Promise((resolve) => {
    const view = { id: reqId, agent, tool, summary: JSON.stringify(input).slice(0, 400), reason: reason || null, canAlways: !!(suggestions && suggestions.length), session: id };
    permissions.set(reqId, { view, resolve });
    if (!agent || agent === MAIN) hub.beat({ k: 'agent', p: 'wait', id: MAIN });
    publishPerms();
    signal?.addEventListener('abort', () => {
      if (!permissions.delete(reqId)) return;
      publishPerms();
      resolve({ allow: false });
    });
  });

  const hooks = {
    repo: cwd,
    session: id,
    env: () => extraEnv || {},
    onMessage,
    onAsk,
    onPermission,
    onStatus: (s) => { if (s.state === 'idle') busy = false; hub.setStatus(s); },
    permissionMode,
    ...(resume ? { resume } : {}),
  };
  // A session whose worktree still forms starts its provider once it is ready, so the agent works in the worktree.
  let provider = null;
  const makeProvider = async () => {
    provider = typeof injected === 'function' ? injected(hooks) : injected || await createProvider(hooks);
    hub.setStatus({ provider: provider.kind });
  };
  hub.setStatus({ state: 'idle', pause: 'run', ...(form ? { form } : {}) });
  if (!form || form.state === 'ready') await makeProvider();

  // A send while a turn is under way is a tug (steering mid-run); the
  // session itself stays open between turns, so "active" is not "busy".
  async function deliver(text, steered = false) {
    if (!extraEnv) extraEnv = await env();
    const running = busy;
    // A tug (or a steer aimed at this session) is drawn on the stage with its state (tugs.mjs).
    if (running || steered) tugLog.sent(text, { session: claude, busy: running });
    busy = true;
    sent += 1;
    hub.tx({ kind: 'user', text, at: now() });
    if (running) hub.beat({ k: 'oversight', p: 'tug', agent: MAIN });
    else hub.beat({ k: 'agent', p: 'start', id: MAIN, label: 'session' });
    provider.send(text);
  }

  return {
    id,
    name,
    get cwd() { return here; },
    get place() { return place; },
    get form() { return form; },
    at: new Date(now()).toISOString(),
    hub,
    get provider() { return provider; },
    tugs: tugLog,
    asks,
    permissions,
    get listed() { return listed; },
    set listed(v) { listed = !!v; },
    get claude() { return claude; },
    get busy() { return busy; },
    get sent() { return sent; },
    get pause() { return { ...pause, held: held.length }; },

    /** Send a prompt (`steered`: a steer aimed at this session); a paused (or pausing) session holds it until resume. */
    async send(text, { steered = false } = {}) {
      if (!provider) { waiting.push({ text, steered }); return { held: true, forming: true }; }
      if (pause.state !== 'run') { held.push({ text, steered }); return { held: true, pause: pause.state }; }
      await deliver(text, steered);
      return { held: false };
    },
    pauseAfterStep() {
      if (pause.state === 'run') pause = busy ? { state: 'pausing', at: null } : { state: 'paused', at: new Date(now()).toISOString() };
      publishPause();
      return this.pause;
    },
    async resume() {
      pause = { state: 'run', at: null };
      publishPause();
      const queued = held.splice(0);
      for (const q of queued) await deliver(q.text, q.steered);
      return { ...this.pause, delivered: queued.length };
    },
    /** The worktree's form moved on (shared/forming.mjs formNext): the session's channel carries it. */
    setForm(next) {
      form = next;
      hub.setStatus({ form });
    },
    /** The worktree is ready: the session works there from now on, and what was sent meanwhile goes, in order. */
    async formed({ cwd: dir, place: at } = {}) {
      if (dir) { here = dir; hooks.repo = dir; }
      if (at) place = at;
      if (!provider) await makeProvider();
      const queued = waiting.splice(0);
      for (const q of queued) await this.send(q.text, { steered: q.steered });
      return { delivered: queued.length };
    },
    interrupt: () => provider?.interrupt(),
    stop: () => provider?.stop(),
    async fresh() {
      await provider?.fresh();
      txCtx = newTxContext({ now });
      beatCtx = newBeatContext();
      hub.reset();
    },
    answerAsk(askId, answers) {
      const entry = asks.get(askId);
      if (!entry) return false;
      clearTimeout(entry.timer);
      asks.delete(askId);
      hub.beat({ k: 'oversight', p: 'answer', id: askId });
      publishAsks();
      entry.resolve(answers);
      return true;
    },
    answerPermission(reqId, decision) {
      const entry = permissions.get(reqId);
      if (!entry) return false;
      permissions.delete(reqId);
      publishPerms();
      entry.resolve(decision);
      return true;
    },
    /** Does `key` name this session: its id, its Claude Code session id, or its star? */
    is(key) {
      return !!key && (key === id || key === claude || (!!name && key === name));
    },
    async close() {
      for (const a of asks.values()) clearTimeout(a.timer);
      await provider?.stop?.();
      hub.close();
    },
  };
}
