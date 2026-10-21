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
 */
export async function createSession({ id, name = '', cwd, place = {}, env = async () => ({}), provider: injected, permissionMode = () => 'default', listed = false, now = () => Date.now() }) {
  const hub = createHub();
  const asks = new Map();
  const permissions = new Map();
  let txCtx = newTxContext();
  let beatCtx = newBeatContext();
  let busy = false;
  let claude = null;
  let sent = 0;
  let pause = { state: 'run', at: null };
  const held = [];
  let extraEnv = null;
  const tugLog = createTugLog({ now });

  const publishAsks = () => hub.set('asks', [...asks.values()].map((a) => a.view));
  const publishPerms = () => hub.set('permissions', [...permissions.values()].map((a) => a.view));
  const publishPause = () => hub.setStatus({ pause: pause.state, pausedAt: pause.at });

  const onMessage = (msg) => {
    if (msg.session_id) claude = msg.session_id;
    tugLog.onMessage(msg);
    for (const item of txFromMessage(msg, txCtx)) hub.tx(item);
    for (const b of beatsFromMessage(msg, beatCtx)) hub.beat(b);
    if (msg.type === 'result') {
      busy = false;
      hub.setStatus({ state: 'idle', cost: msg.total_cost_usd ?? null, session: msg.session_id || null });
      if (pause.state === 'pausing') { pause = { state: 'paused', at: new Date(now()).toISOString() }; publishPause(); }
    }
  };

  const onAsk = ({ id: askId, agent, questions, signal }) => new Promise((resolve) => {
    const view = { id: askId, agent, questions, at: Date.now(), session: id };
    asks.set(askId, { view, resolve });
    // The SDK's agentID is a subagent's own id, not the tool_use id the stage
    // draws it under, so stage beats attach questions to the session orb.
    hub.beat({ k: 'oversight', p: 'ask', id: askId, agent: MAIN });
    publishAsks();
    signal?.addEventListener('abort', () => {
      if (!asks.has(askId)) return;
      asks.delete(askId);
      hub.beat({ k: 'oversight', p: 'answer', id: askId });
      publishAsks();
      resolve(null);
    });
  });

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
  };
  const provider = typeof injected === 'function' ? injected(hooks) : injected || await createProvider(hooks);
  hub.setStatus({ state: 'idle', provider: provider.kind, pause: 'run' });

  // A send while a turn is under way is a tug (steering mid-run); the
  // session itself stays open between turns, so "active" is not "busy".
  async function deliver(text, steered = false) {
    if (!extraEnv) extraEnv = await env();
    const running = busy;
    // A tug (or a steer aimed at this session) is drawn on the stage with its state (tugs.mjs).
    if (running || steered) tugLog.sent(text, { session: claude, busy: running });
    busy = true;
    sent += 1;
    hub.tx({ kind: 'user', text });
    if (running) hub.beat({ k: 'oversight', p: 'tug', agent: MAIN });
    else hub.beat({ k: 'agent', p: 'start', id: MAIN, label: 'session' });
    provider.send(text);
  }

  return {
    id,
    name,
    cwd,
    place,
    at: new Date(now()).toISOString(),
    hub,
    provider,
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
    interrupt: () => provider.interrupt(),
    stop: () => provider.stop(),
    async fresh() {
      await provider.fresh();
      txCtx = newTxContext();
      beatCtx = newBeatContext();
      hub.reset();
    },
    answerAsk(askId, answers) {
      const entry = asks.get(askId);
      if (!entry) return false;
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
      await provider.stop?.();
      hub.close();
    },
  };
}
