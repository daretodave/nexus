// The demo's world (spec 44 A1): one scenario's fixtures held in memory and
// its beat script played against them on a clock. Nothing here touches a
// disk, a network or a child process; the demo server (server/demo.mjs)
// answers the page's calls from it.
//
// A scenario is { name, title, summary, home, fixtures(ctx), script }:
//
//   fixtures(ctx)  { repo: { name, branch, lastCommit }, owner, sessions, plan: { order, progress }, claims, durable }
//                  `ctx.ago(min)` and `ctx.at(ms)` give ISO times relative to the start, so every age reads
//                  the same whenever the demo runs.
//     session      { id, name, kind, row, ledger, beats, transcript }: `row` is its GET /api/sessions tile,
//                  `ledger` its GET /api/sessions/:id detail, `beats` and `transcript` its SSE channel's
//                  history (the stage and the conversation as the page first draws them).
//
//   script         steps, each `{ at, session?, <action> }` (`at`: ms from the start, or from the gate that
//                  holds it). One action per step:
//     beat  {...}           a beat on the session's channel (shared/beats.mjs), stamped with the clock
//     tx    {...}           a transcript item (server/normalize.mjs shapes), stamped
//     status {...}          the channel's status
//     row   {...}           merged into the session's tile
//     ledger {...}          merged into the session's detail
//     land  { sha, msg, chunk }   a chunk landed on main: the cockpit's river and its drop
//     chunk { id, ... }     a plan chunk changed (or slotted in: `plotted: true`); state ready|claimed|closed
//     claim { id }          the session claims a chunk (the claims rail and the plan's in-flight)
//     release id            the session lets one go
//     gate  { ask | send | resume, auto, answers?, then }
//                           the owner's turn. `ask` puts a live question to the owner (the stage hushes, the
//                           card pulls into the conversation); `send` waits for a line from the composer;
//                           `resume` waits for Resume on a fallen tile. The page can do it (POST /api/ask/:id,
//                           /api/send, /api/sessions/:id/resume), or the script does it `auto` ms after the gate
//                           opens. Either way the `then` steps run timed from that moment, once.
import { createHub } from '../hub.mjs';
import { MAIN } from '../../shared/beats.mjs';
import { boardFrom } from '../plan.mjs';
import { inboxItems } from '../fleet-home.mjs';
import { needsFrom } from '../../shared/needs.mjs';

const ACTIONS = ['beat', 'tx', 'status', 'row', 'ledger', 'land', 'chunk', 'claim', 'release', 'gate'];

/** The action a step carries. */
export const actionOf = (step) => ACTIONS.find((a) => step[a] !== undefined) || null;

/** How long a script runs when every gate is left to its `auto`: the last step's time. */
export function duration(script = [], from = 0) {
  let end = from;
  for (const s of script) {
    const at = from + (s.at || 0);
    end = Math.max(end, at);
    if (s.gate) end = Math.max(end, duration(s.gate.then || [], at + (s.gate.auto || 0)));
  }
  return end;
}

/** Every step a script holds, gates' `then` steps included, flattened with their times when left to `auto`. */
export function timeline(script = [], from = 0, out = []) {
  for (const s of script) {
    const at = from + (s.at || 0);
    out.push({ at, step: s });
    if (s.gate) timeline(s.gate.then || [], at + (s.gate.auto || 0), out);
  }
  return out.sort((a, b) => a.at - b.at);
}

const clone = (v) => JSON.parse(JSON.stringify(v));

/**
 * @param {object} scenario
 * @param {object} o
 * @param {object} o.clock   server/demo/clock.mjs realClock or manualClock
 * @param {object} [o.hub]   createHub options (tests shorten the flush)
 */
export function createWorld(scenario, { clock, hub: hubOpts = {} } = {}) {
  const hubs = new Map(); // session id -> hub; kept across restarts so open pages keep their channel
  const quiet = createHub(hubOpts);
  quiet.setStatus({ state: 'idle', hosted: false });
  let t0 = 0;
  let fx = null;
  let sessions = [];
  let gates = [];
  let timers = [];
  let log = [];
  let started = false;
  let sentNeeds = '';

  const iso = (ms) => new Date(ms).toISOString();
  const ctx = () => ({ now: t0, at: (ms) => iso(t0 + ms), ago: (min) => iso(t0 - min * 60000) });

  function load() {
    t0 = clock.now();
    fx = scenario.fixtures(ctx());
    sessions = (fx.sessions || []).map((s) => ({
      id: s.id, name: s.name, kind: s.kind || 'local',
      row: clone(s.row || {}), ledger: clone(s.ledger || {}),
      asks: new Map(),
      hub: hubs.get(s.id) || createHub(hubOpts),
      seed: { beats: s.beats || [], transcript: s.transcript || [] },
    }));
    for (const s of sessions) {
      hubs.set(s.id, s.hub);
      s.hub.reset();
      s.hub.set('asks', []);
      s.hub.set('permissions', []);
      s.hub.setStatus({ state: s.kind === 'terminal' ? 'idle' : 'running', hosted: s.kind !== 'terminal', provider: 'demo', pause: 'run' });
      for (const b of s.seed.beats) s.hub.beat({ ...b, at: b.at ?? t0 });
      for (const t of s.seed.transcript) s.hub.tx({ ...t, at: t.at ?? t0 });
    }
    gates = [];
    log = [];
  }

  const find = (key) => sessions.find((s) => s.id === key || s.name === key || s.ledger.claude === key) || null;
  const homeOf = (step) => find(step.session || scenario.home) || sessions[0];
  const now = () => clock.now();
  // Script time: ms since the start as the script counts them (the wall's, times the clock's speed).
  const stime = () => (now() - t0) * (clock.speed || 1);

  function schedule(steps, base) {
    for (const step of steps) {
      const h = clock.after(base + (step.at || 0) - stime(), () => {
        timers = timers.filter((x) => x !== h);
        apply(step);
      });
      timers.push(h);
    }
  }

  function note(kind, s, extra = {}) {
    log.push({ t: Math.round(stime()), kind, session: s ? s.name : null, ...extra });
  }

  // ---- the plan, held as order.mjs and progress.mjs would print it ----------------
  const specOf = (id) => String(id).split('.')[0];
  function planChunk(id) {
    for (const sp of fx.plan.progress.specs) {
      const c = (sp.chunks || []).find((x) => String(x.id) === String(id));
      if (c) return { sp, c };
    }
    return null;
  }
  function recount(sp) {
    const total = sp.chunks.length;
    const closed = sp.chunks.filter((c) => c.state === 'closed').length;
    sp.counts = { ...(sp.counts || {}), closed, open: total - closed, total };
    sp.percent = total ? Math.round((100 * closed) / total) : 0;
  }
  function setChunk(patch) {
    const id = String(patch.id);
    const order = fx.plan.order;
    let hit = planChunk(id);
    if (!hit) {
      const sp = fx.plan.progress.specs.find((x) => String(x.spec) === specOf(id));
      if (!sp) return;
      const c = { id, title: '', size: null, state: 'ready', closedOn: null, claim: null };
      sp.chunks.push(c);
      hit = { sp, c };
    }
    const { plotted, lane, ...rest } = patch;
    Object.assign(hit.c, rest);
    if (plotted) {
      order.mark = [...new Set([...(order.mark || []), id])];
      order.next = [{ id, spec: specOf(id), lane: lane || 'asap', eta: null, size: hit.c.size }, ...(order.next || []).filter((x) => String(x.id) !== id)];
    }
    if (hit.c.state === 'closed') {
      order.next = (order.next || []).filter((x) => String(x.id) !== id);
      order.inFlight = (order.inFlight || []).filter((x) => String(x.id) !== id);
      hit.c.claim = null;
    }
    recount(hit.sp);
  }
  function claim(s, id) {
    const order = fx.plan.order;
    const at = iso(now());
    fx.claims = (fx.claims || []).filter((r) => r.id !== id);
    fx.claims.push({ id, who: fx.repo.owner || 'owner', host: 'demo', at, session: s.id, star: s.name, pr: null, held: false, state: 'live', mine: true });
    order.next = (order.next || []).filter((x) => String(x.id) !== id);
    order.inFlight = [...(order.inFlight || []).filter((x) => String(x.id) !== id), { id, spec: specOf(id), who: s.name }];
    const hit = planChunk(id);
    if (hit) Object.assign(hit.c, { state: 'claimed', claim: { who: s.name, at } });
  }

  // ---- the steps ---------------------------------------------------------------------
  function apply(step) {
    const s = homeOf(step);
    const kind = actionOf(step);
    const at = now();
    switch (kind) {
      case 'beat': s.hub.beat({ ...step.beat, at }); break;
      case 'tx': s.hub.tx({ ...step.tx, at }); break;
      case 'status': s.hub.setStatus(step.status); break;
      case 'row': Object.assign(s.row, clone(step.row)); break;
      case 'ledger': Object.assign(s.ledger, clone(step.ledger)); break;
      case 'land': {
        const l = { sha: step.land.sha, msg: step.land.msg, chunk: step.land.chunk || null, at: iso(at) };
        s.ledger.landed = [...(s.ledger.landed || []), l];
        s.ledger.lastShip = { sha: l.sha, msg: l.msg, where: 'main', at: l.at };
        break;
      }
      case 'chunk': setChunk({ ...step.chunk, ...(step.chunk.state === 'closed' ? { closedOn: iso(at).slice(0, 10) } : {}) }); break;
      case 'claim': claim(s, String(step.claim.id ?? step.claim)); break;
      case 'release': fx.claims = (fx.claims || []).filter((r) => r.id !== String(step.release)); break;
      case 'gate': open(s, step.gate); break;
      default: break;
    }
    note(kind || 'unknown', s, kind === 'beat' ? { beat: `${step.beat.k}.${step.beat.p}${step.beat.id ? ` ${step.beat.id}` : ''}` } : {});
  }

  function publishAsks(s) {
    s.hub.set('asks', [...s.asks.values()]);
  }

  function open(s, g) {
    const gate = { session: s, spec: g, opened: now(), done: false, timer: null };
    gate.on = g.ask ? 'ask' : g.send !== undefined ? 'send' : 'resume';
    if (g.ask) {
      const at = now();
      const view = { id: g.ask.id, agent: g.ask.agent || MAIN, questions: clone(g.ask.questions), at, deadline: g.ask.deadline ? at + g.ask.deadline : null, session: s.id };
      gate.id = view.id;
      s.asks.set(view.id, view);
      s.hub.beat({ k: 'oversight', p: 'ask', id: view.id, agent: MAIN, at });
      publishAsks(s);
    }
    gates.push(gate);
    if (g.auto != null) {
      gate.timer = clock.after(g.auto, () => {
        timers = timers.filter((x) => x !== gate.timer);
        fulfil(gate, { by: 'script' });
      });
      timers.push(gate.timer);
    }
  }

  /** The owner's turn taken (by the page or the script): close the gate and run its `then` from now. */
  function fulfil(gate, { by, answers, text } = {}) {
    if (gate.done) return false;
    gate.done = true;
    if (gate.timer) { clock.cancel(gate.timer); timers = timers.filter((x) => x !== gate.timer); }
    const s = gate.session;
    const g = gate.spec;
    const at = now();
    if (gate.on === 'ask') {
      s.asks.delete(gate.id);
      s.hub.beat({ k: 'oversight', p: 'answer', id: gate.id, at });
      publishAsks(s);
      const picked = answers || g.answers || {};
      const words = Object.values(picked).filter(Boolean).join(' · ');
      if (words) s.hub.tx({ kind: 'user', text: words, at });
    } else if (gate.on === 'send') {
      s.hub.tx({ kind: 'user', text: text || g.send, at });
      s.hub.beat({ k: 'agent', p: 'start', id: MAIN, label: 'session', at });
    }
    note('owner', s, { gate: gate.on, by });
    schedule(g.then || [], stime());
    return true;
  }

  const openGate = (s, on) => gates.find((g) => !g.done && g.session === s && g.on === on) || null;

  // ---- what the page reads -------------------------------------------------------------
  function row(s) {
    const out = { id: s.id, name: s.name, kind: s.kind, ...clone(s.row) };
    if (s.asks.size && s.kind !== 'terminal') Object.assign(out, { state: 'asking', phase: 'questions', questions: { answered: 0, total: s.asks.size } });
    return out;
  }

  const api = {
    get scenario() { return scenario; },
    get started() { return started; },
    get t0() { return t0; },
    get elapsed() { return started ? Math.round(stime()) : 0; },
    get log() { return log; },
    get duration() { return duration(scenario.script); },
    sessions: () => sessions,
    session: find,
    hubFor: (key) => find(key)?.hub || quiet,
    /** Start (or start over): fresh fixtures, history replayed on each channel, the script from its first step. */
    start() {
      for (const h of timers) clock.cancel(h);
      timers = [];
      load();
      started = true;
      schedule(scenario.script, 0);
      return api;
    },
    stop() {
      for (const h of timers) clock.cancel(h);
      timers = [];
    },
    close() {
      api.stop();
      for (const h of hubs.values()) h.close();
      quiet.close();
    },
    info: () => ({ name: fx.repo.name, branch: fx.repo.branch || 'main', lastCommit: fx.repo.lastCommit || null, owner: !!fx.owner }),
    rows: () => sessions.map(row),
    detail(key) {
      const s = find(key);
      if (!s) return null;
      // The tile's asking marks (questions: { answered, total }) are the fleet's; the detail carries the ledger's own.
      return { ...clone(s.row), ...clone(s.ledger), id: s.id, name: s.name, kind: s.kind, hosted: s.kind !== 'terminal', tugs: clone(s.ledger.tugs || []), parked: clone(s.ledger.parked || []) };
    },
    inbox: () => inboxItems({
      hosted: sessions.filter((s) => s.kind !== 'terminal').map((s) => ({ id: s.id, claude: s.ledger.claude || null, name: s.name, asks: [...s.asks.values()], permissions: [] })),
      ledgers: sessions.map((s) => ({ id: s.id, star: s.name, state: 'live', beat: iso(now()), chunk: s.row.chunk?.id || '', parked: s.ledger.parked || [] })),
      durable: fx.durable || [],
      now: now(),
    }),
    asks: () => sessions.flatMap((s) => [...s.asks.values()]),
    /** GET /api/needs, as the live server answers it (shared/needs.mjs). */
    needs: () => ({
      at: now(),
      items: needsFrom(sessions.map(row), sessions.filter((s) => s.kind !== 'terminal').map((s) => ({ id: s.id, claude: s.ledger.claude || null, name: s.name, asks: [...s.asks.values()], permissions: [] }))),
    }),
    /** The `needs` event on every channel, when what the top bar shows changed since it was last sent. */
    pushNeeds() {
      const v = api.needs();
      const key = JSON.stringify(v.items);
      if (key === sentNeeds) return;
      sentNeeds = key;
      for (const h of [...hubs.values(), quiet]) h.set('needs', v);
    },
    plan: () => boardFrom(clone(fx.plan.order), clone(fx.plan.progress), { repo: fx.repo.name }),
    claims: () => ({ available: true, rows: clone(fx.claims || []), me: { who: fx.repo.owner || 'owner', owner: !!fx.owner } }),
    durable: () => clone(fx.durable || []),
    /** POST /api/ask/:id: the owner answers a live question. */
    answer(askId, answers) {
      const g = gates.find((x) => !x.done && x.on === 'ask' && x.id === askId);
      return g ? fulfil(g, { by: 'page', answers }) : false;
    },
    /** POST /api/send: a line from the composer (`extra`: its images). Fulfils the session's open send gate, else just shows. */
    send(key, text, extra = {}) {
      const s = find(key) || homeOf({});
      const g = openGate(s, 'send');
      if (g) return fulfil(g, { by: 'page', text });
      s.hub.tx({ kind: 'user', text, at: now(), ...extra });
      return true;
    },
    /** POST /api/sessions/:id/put-away: the session leaves the fleet until the demo starts over. */
    putAway(key) {
      const s = find(key);
      if (!s) return false;
      sessions = sessions.filter((x) => x !== s);
      return true;
    },
    /** POST /api/sessions/:id/resume: Resume on a fallen tile. */
    resume(key) {
      const s = find(key);
      const g = s && openGate(s, 'resume');
      return g ? fulfil(g, { by: 'page' }) : false;
    },
  };
  return api;
}
