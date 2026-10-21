// The cockpit's view model: pure functions from what the server knows to
// what the Cockpit boards draw. No React, no fetch, no clock reads (callers
// pass `now`), so every builder can be checked by hand against the boards.
//
// Two sources feed it:
//
//   ledger  GET /api/sessions/:id (not served yet; null until it lands).
//           The shape this file reads, every field optional:
//           { id, name, kind: 'local'|'terminal'|'other', mode: 'owner'|'contributor',
//             phase: 'start'|'working'|'review'|'package', state: 'live'|'pausing'|'paused'|'fallen',
//             pausedAt, pausingStep, startedAt, workedMs, budget: { label: '3–4h', ms },
//             repo, git: { branch, worktree, up, down, dirty, pr: { num, ci }, claims, commits: [{ sha, m, w }] },
//             chunk: { id, title, ac: { met, total }, elapsed }, spec: { line, ref },
//             pinned: { text, at }, claims: { now, next: [], held },
//             closed: [{ id, title, at, fix }], landed: [{ sha, msg, at, chunk }],
//             lastShip: { sha, msg, where, at },
//             context: { room, strata: [n, n, n], compactsAt },
//             questions: [{ q, chunk, opts: [], rec, answer, how: 'answered'|'default' }],
//             parked: [{ who, chunk, at, q, alts: [], state: 'pending'|'approved'|'changed', pick, fix }],
//             base: { num, title, state, ci },  // the PR this package stacks on
//             package: { state, title, branch, ac: { met, total }, diff: { add, del, files },
//                        answers: { answered, defaults }, pr: { num, state, ci, url } } }
//
//   live    the SSE store (useEvents): stage beats, transcript, asks, permissions, status.
//
// Without a ledger the cockpit still draws the live session honestly: the
// conversation, the stage and what the beats say, and nothing invented.
import { MAIN } from '../../../shared/beats.mjs';

export const PHASES = ['start', 'working', 'review', 'package'];

const H = 3600000;
const WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

/** "1h 47m", "18m", "0m". */
export function dur(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '';
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}

/** "18:42": minutes and seconds of a chunk's elapsed time (ms), as the context strip shows it. */
export function mmss(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '';
  const t = Math.floor(ms / 1000);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** "03:14" in local time. */
export function clock(at) {
  if (!at) return '';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * A tool call's duration as the board's tool rows show it: "0.9s", "12s",
 * "2m", "1h 4m". Empty when unknown (the row shows nothing, never a guess).
 */
export function toolDur(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '';
  if (ms < 10000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return dur(ms);
}

/** "2m ago", "yesterday". */
export function ago(at, now) {
  if (!at || !now) return '';
  const m = Math.max(0, Math.round((now - new Date(at).getTime()) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return h < 48 ? 'yesterday' : `${Math.round(h / 24)}d ago`;
}

const pct = (n) => `${Math.max(0, Math.min(100, Math.round(n)))}%`;
const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The session as the switcher and tags see it. */
export function identity(id, ledger) {
  const name = ledger?.name || id;
  return { id, name, kind: ledger?.kind || 'local' };
}

/** Owner mode: the ledger's word when there is one, else the checkout's. */
export function isOwner(ledger, shellOwner) {
  if (ledger?.mode) return ledger.mode === 'owner';
  return !!shellOwner;
}

/** The phase the session is in. An owner session has no package rhythm: always Working. */
export function sessionPhase(ledger, owner) {
  if (owner) return 'working';
  return PHASES.includes(ledger?.phase) ? ledger.phase : 'working';
}

// ---- live state --------------------------------------------------------------

/** One agent's orb state from the reduced beats. */
export function agentState(a) {
  if (!a) return 'idle';
  if (a.state === 'waiting') return 'blocked';
  if (a.state === 'done') return 'done';
  if (a.state === 'failed') return 'failed';
  if (a.tool) return /^(Edit|Write|MultiEdit|NotebookEdit)$/.test(a.tool) ? 'writing' : 'tool';
  return 'thinking';
}

/** Chunks the beats saw, as the basin and phase track want them. */
export function liveChunks(stage) {
  return (stage?.chunkOrder || []).map((id) => {
    const c = stage.chunks[id];
    return { id, closed: c.stage === 'archive', building: c.stage === 'build' || c.stage === 'gate', claimed: c.stage === 'claim' };
  });
}

// ---- the phase track ---------------------------------------------------------

/**
 * Phase segments for <Phases>. `hrefFor(phase)` gives each its link.
 * Mirrors the board's four contributor tracks and the owner track.
 */
export function phaseTrack({ ledger, owner, phase, stage, now, hrefFor }) {
  const L = ledger || {};
  const qs = L.questions || [];
  const parked = L.parked || [];
  const closed = L.closed || liveChunks(stage).filter((c) => c.closed);
  const budget = L.budget || null;
  const budgetLabel = budget?.label || '';
  const started = L.startedAt ? new Date(L.startedAt).getTime() : null;
  const worked = L.workedMs ?? (started && now ? now - started : null);
  const span = budget?.ms || 4 * H;
  const at = (t) => (started && t ? pct(((new Date(t).getTime() - started) / span) * 100) : null);
  const settled = qs.filter((q) => q.answer != null).length;
  const reviewed = parked.filter((p) => p.state === 'approved' || p.state === 'changed').length;
  const building = L.chunk?.id || (stage?.current && stage.chunks[stage.current]?.stage !== 'archive' ? stage.current : null);
  const mark = (kind, t) => { const a = at(t); return a ? { kind, at: a } : null; };
  const fill = worked != null && started ? pct((worked / span) * 100) : null;
  const ofBudget = (worked != null && started ? dur(worked) : '') + (budgetLabel && started ? ` of ${budgetLabel}` : '');
  const join = (...a) => a.filter(Boolean).join(' · ');
  const known = !!ledger;

  if (owner) {
    const landed = L.landed || [];
    return [
      { key: 'q', name: 'Questions', meta: qs.length ? `${qs.length} settled` : '', state: known ? 'done' : undefined, href: hrefFor('start') },
      {
        key: 'w', name: 'Working', state: 'now', flex: '6.6 1 0', href: hrefFor('working'),
        meta: join(ofBudget, landed.length ? `${landed.length} landed on main` : '', !known && building ? `${building} building` : ''),
        fill,
        marks: [...landed.map((l) => mark('ship', l.at)), ...parked.map((p) => mark('park', p.at)), fill ? { kind: 'bead', at: fill } : null].filter(Boolean),
      },
      { key: 'q', name: 'Questions', meta: parked.length ? `${parked.length} parked` : '', href: hrefFor('review') },
    ];
  }

  const flexW = '5.5 1 0';
  const flexP = '1.35 1 0';
  const flexQ = '1.25 1 0';
  const stackOn = L.base?.num ? `stacks on #${L.base.num}` : '';
  const fixes = closed.filter((c) => c.fix).length;

  if (phase === 'start') {
    return [
      { key: 'q', name: 'Questions', meta: qs.length ? `${settled} of ${qs.length}` : '', state: 'now', ask: true, fill: qs.length ? pct((settled / qs.length) * 100) : null, fillAsk: true, flex: flexQ, href: hrefFor('start') },
      { key: 'w', name: 'Working', meta: `${budgetLabel ? `${budgetLabel}, ` : ''}unlocks when questions settle`, flex: flexW, href: hrefFor('working') },
      { key: 'q', name: 'Questions', flex: flexQ, href: hrefFor('review') },
      { key: 'p', name: 'Package', flex: flexP, href: hrefFor('package') },
    ];
  }
  if (phase === 'review') {
    return [
      { key: 'q', name: 'Questions', meta: qs.length ? `${qs.length} settled` : '', state: 'done', flex: flexQ, href: hrefFor('start') },
      { key: 'w', name: 'Working', meta: join(dur(worked), closed.length ? `${closed.length} chunks closed` : ''), state: 'done', flex: flexW, href: hrefFor('working'), marks: closed.map((c) => mark('tick', c.at)).filter(Boolean) },
      { key: 'q', name: 'Questions', meta: parked.length ? `${reviewed} of ${parked.length} reviewed` : '', state: 'now', ask: true, fill: parked.length ? pct((reviewed / parked.length) * 100) : null, fillAsk: true, flex: flexQ, href: hrefFor('review') },
      { key: 'p', name: 'Package', meta: 'waits on review', flex: flexP, href: hrefFor('package') },
    ];
  }
  if (phase === 'package') {
    return [
      { key: 'q', name: 'Questions', state: 'done', flex: flexQ, href: hrefFor('start') },
      { key: 'w', name: 'Working', meta: join(dur(worked), closed.length ? `${count(closed.length, 'chunk')}${fixes ? ` incl. ${count(fixes, 'fix', 'fixes')}` : ''}` : ''), state: 'done', flex: flexW, href: hrefFor('working') },
      { key: 'q', name: 'Questions', meta: parked.length ? `${parked.length} reviewed` : '', state: 'done', flex: flexQ, href: hrefFor('review') },
      { key: 'p', name: 'Package', meta: join('ready', L.base?.num ? 'stacked' : ''), state: 'now', fill: '100%', flex: flexP, href: hrefFor('package') },
    ];
  }
  return [
    { key: 'q', name: 'Questions', meta: qs.length ? `${qs.length} settled` : '', state: known ? 'done' : undefined, flex: flexQ, href: hrefFor('start') },
    {
      key: 'w', name: 'Working', state: 'now', flex: flexW, href: hrefFor('working'),
      meta: join(ofBudget, closed.length ? `${closed.length} chunks closed` : '', building ? `${building} building` : ''),
      fill,
      marks: [...closed.map((c) => mark('tick', c.at)), ...parked.map((p) => mark('park', p.at)), fill ? { kind: 'bead', at: fill } : null].filter(Boolean),
    },
    { key: 'q', name: 'Questions', meta: parked.length ? `${parked.length} parked` : '', flex: flexQ, href: hrefFor('review') },
    { key: 'p', name: 'Package', meta: stackOn, flex: flexP, href: hrefFor('package') },
  ];
}

// ---- the context strip ---------------------------------------------------------

/** "Context  62% room left  compacts at 10%" with its strata. */
function contextLayer(c, m) {
  if (!c || c.room == null) return null;
  const s = (c.strata || []).map((n) => pct(n));
  return { k: 'Context', v: `${Math.round(c.room)}% room left`, m: m ?? (c.compactsAt != null ? `compacts at ${c.compactsAt}%` : ''), depth: 5, strata: s.length ? s : null };
}

function lastShipLayer(L, info, now) {
  if (L.lastShip) {
    const s = L.lastShip;
    return { k: 'Last ship', v: [s.sha, s.msg].filter(Boolean).join(' '), m: [s.where, ago(s.at, now)].filter(Boolean).join(' · '), depth: 4 };
  }
  if (info?.lastCommit) return { k: 'Last ship', v: info.lastCommit, m: info.branch ? `on ${info.branch}` : '', depth: 4 };
  return null;
}

/**
 * The receding context layers. Each phase shows the board's rows, filled
 * from the ledger; without one, only rows the live data can back.
 */
export function ctxLayers({ ledger, owner, phase, stage, info, sessionName, now }) {
  const L = ledger || {};
  const out = [];
  const plan = (L.closed || []).map((c) => c.id);
  const ids = (list) => list.filter(Boolean).join(' · ');
  if (phase === 'start' && !owner) {
    const chunks = L.claims?.ids || [];
    if (chunks.length) out.push({ k: 'Plan', v: ids(chunks), m: count(chunks.length, 'chunk'), depth: 2 });
    if (chunks.length) out.push({ k: 'Claims', v: `${sessionName} holds ${chunks.length > 1 ? `all ${WORDS[chunks.length] || chunks.length}` : 'it'}${L.base?.num ? ` · stacks on #${L.base.num}` : ''}`, m: L.claims?.fresh ? 'fresh' : '', depth: 3 });
    const ship = lastShipLayer(L, info, now); if (ship) out.push(ship);
    const c = contextLayer(L.context, L.context?.fresh ? 'fresh session' : undefined); if (c) out.push(c);
    return out;
  }
  if (phase === 'review' && !owner) {
    const parked = L.parked || [];
    const done = parked.filter((p) => p.state === 'approved' || p.state === 'changed').length;
    out.push({ k: 'Now', v: 'Session review · parked questions', m: parked.length ? `${done} of ${parked.length}` : '', depth: 2 });
    if (plan.length) out.push({ k: 'Closed', v: ids(plan), m: [plan.length, dur(L.workedMs)].filter(Boolean).join(' · '), depth: 3 });
    const ship = lastShipLayer(L, info, now); if (ship) out.push(ship);
    const c = contextLayer(L.context); if (c) out.push(c);
    return out;
  }
  if (phase === 'package' && !owner) {
    const p = L.package || {};
    out.push({ k: 'Now', v: p.title ? `Package · ${p.title}` : 'Package', m: p.state === 'ready' || !p.state ? 'ready' : p.state, depth: 2 });
    if (L.base?.num) out.push({ k: 'Stack', v: `on #${L.base.num}${L.base.title ? ` ${L.base.title}` : ''}${L.base.state ? ` · ${L.base.state}` : ''}`, m: L.base.ci === 'green' ? 'CI green' : L.base.ci ? `CI ${L.base.ci}` : '', depth: 3 });
    const ship = lastShipLayer(L, info, now); if (ship) out.push(ship);
    const c = contextLayer(L.context, ''); if (c) out.push(c);
    return out;
  }
  // Working (and every owner session)
  if (L.pinned?.text) out.push({ k: 'Pinned', v: L.pinned.text, m: ['you', clock(L.pinned.at)].filter(Boolean).join(' · '), pin: true });
  const cur = L.chunk || (stage?.current ? { id: stage.current, stage: stage.chunks[stage.current]?.stage } : null);
  if (cur) {
    const ac = cur.ac ? `AC ${cur.ac.met}/${cur.ac.total}` : cur.stage || '';
    const el = typeof cur.elapsed === 'number' ? mmss(cur.elapsed) : cur.elapsed;
    out.push({ k: 'Now', v: [cur.id, cur.title].filter(Boolean).join(' '), m: [ac, el].filter(Boolean).join(' · '), depth: 2 });
  }
  if (L.spec?.line) out.push({ k: 'Spec', v: L.spec.line, m: L.spec.ref || '', depth: 2 });
  if (L.claims && (L.claims.now || (L.claims.next || []).length)) {
    const held = L.claims.held ?? ((L.claims.now ? 1 : 0) + (L.claims.next || []).length);
    const v = [L.claims.now ? `${L.claims.now} now` : '', (L.claims.next || []).length ? `${L.claims.next.join(' · ')} next` : ''].filter(Boolean).join(' · ');
    out.push({ k: 'Claims', v, m: `${sessionName} holds ${held}`, depth: 3 });
  }
  const ship = lastShipLayer(L, info, now); if (ship) out.push(ship);
  const c = contextLayer(L.context); if (c) out.push(c);
  return out;
}

// ---- the conversation ------------------------------------------------------------

/**
 * Transcript items to board messages: agent messages carry their tool rows,
 * your notes stand alone. `limit` keeps the newest (the convo fades the top).
 * Times come from the stream: each item's `at` (when the server read it) is the
 * message's time, a `tool-done` gives its call a duration, and an Edit or Write
 * carries its diffstat. An item without them shows none.
 */
export function convoItems(transcript, stage, limit = 40) {
  const out = [];
  const lastOf = {};
  const name = (agent) => (!agent || agent === MAIN ? 'main' : stage?.agents?.[agent]?.label || 'agent');
  const failed = new Set((transcript || []).filter((t) => t.kind === 'tool-error').map((t) => t.id));
  for (const t of transcript || []) {
    if (t.kind === 'user') { out.push({ you: true, text: t.text, pinned: !!t.pinned, time: clock(t.at), key: `u${out.length}` }); continue; }
    if (t.kind === 'text' || t.kind === 'delta') {
      const m = { agent: t.agent || MAIN, name: name(t.agent), text: t.text, tools: [], time: clock(t.at), key: t.id || `t${out.length}` };
      out.push(m); lastOf[m.agent] = m; continue;
    }
    if (t.kind === 'tool') {
      const agent = t.agent || MAIN;
      let m = lastOf[agent];
      if (!m || out[out.length - 1] !== m) { m = { agent, name: name(agent), text: '', tools: [], time: clock(t.at), key: `tm${t.id || out.length}` }; out.push(m); lastOf[agent] = m; }
      m.tools.push({
        id: t.id, tool: t.name, args: t.summary || '', failed: failed.has(t.id), at: t.at ?? null,
        diff: t.diff || null, note: SPAWN.has(t.name) ? 'delegated' : '', ms: null, done: false,
      });
      continue;
    }
    if (t.kind === 'tool-done') {
      for (const m of out) for (const tool of m.tools || []) if (tool.id === t.id) { tool.ms = t.ms ?? null; tool.done = true; if (t.ok === false) tool.failed = true; }
      continue;
    }
    if (t.kind === 'tool-error') {
      for (const m of out) for (const tool of m.tools || []) if (tool.id === t.id) tool.error = t.text;
      continue;
    }
    if (t.kind === 'error') { out.push({ agent: MAIN, name: 'main', text: t.text, tools: [], error: true, key: `e${out.length}` }); continue; }
  }
  return out.slice(-limit);
}

const SPAWN = new Set(['Task', 'Agent']);

/** Node captions never wrap; long subagent descriptions are cut to fit. */
const short = (s, n = 28) => { const t = String(s || ''); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

// ---- the stage ---------------------------------------------------------------------

// Where the board seats the main orb's children (first ring), in order, and
// where a second level (a subagent's own agents) sits below.
const RING = [[22, 14], [48, 8], [76, 14], [86, 40], [14, 40], [64, 4]];
const LOW = [[22, 72], [54, 74], [38, 76], [70, 70], [10, 66]];
const MAIN_AT = [50, 30];

/** A filament box between two node centres (percent units), with the board's curves. */
export function filament(a, b, o = {}) {
  const [ax, ay] = a;
  const [bx, by] = b;
  const l = Math.min(ax, bx);
  const t = Math.min(ay, by);
  const w = Math.abs(bx - ax);
  const h = Math.abs(by - ay);
  if (w < 1) return { l: `calc(${ax}% - 2px)`, t: `${t}%`, w: '4px', h: `${h}%`, d: by > ay ? 'M50 0L50 100' : 'M50 100L50 0', ...o };
  const sx = ax <= bx ? 0 : 100;
  const sy = ay <= by ? 0 : 100;
  const ex = 100 - sx;
  const ey = 100 - sy;
  // Mostly sideways: leave flat and arrive flat; otherwise rise and fall.
  const d = w > h * 2
    ? `M${sx} ${sy}C${sx === 0 ? 40 : 60} ${sy} ${sx === 0 ? 60 : 40} ${ey} ${ex} ${ey}`
    : `M${sx} ${sy}C${sx} ${sy === 0 ? 50 : 45} ${ex} ${sy === 0 ? 50 : 55} ${ex} ${ey}`;
  return { l: `${l}%`, t: `${t}%`, w: `${w}%`, h: `${h}%`, d, ...o };
}

/**
 * Nodes and filaments for the live Working stage, from the reduced beats.
 * Newest children win a seat; finished ones give theirs up first.
 */
export function liveStage(stage, { chunkLabel, parkedAgent } = {}) {
  const agents = stage?.agents || {};
  const order = (stage?.order || []).filter((id) => id !== MAIN);
  const main = agents[MAIN];
  const nodes = [];
  const fils = [];
  const kids = order.filter((id) => (agents[id].parent || MAIN) === MAIN);
  const live = (id) => agents[id].state === 'running' || agents[id].state === 'waiting';
  const seated = [...kids.filter(live), ...kids.filter((id) => !live(id)).reverse()].slice(0, RING.length);
  const seatedSet = new Set(seated);
  const seat = {};
  kids.filter((id) => seatedSet.has(id)).forEach((id, i) => { seat[id] = RING[i]; });
  const grand = order.filter((id) => seat[agents[id].parent]).slice(-LOW.length);
  grand.forEach((id, i) => { seat[id] = LOW[i]; });

  const st = agentState(main);
  nodes.push({
    key: MAIN, at: MAIN_AT, size: 'xl', state: main ? st : 'idle', main: true, capTop: '54px',
    label: chunkLabel ? `main · ${chunkLabel}` : 'main', tool: main?.tool || (st === 'blocked' ? 'waiting on you' : ''),
  });
  for (const id of [...seated, ...grand]) {
    const a = agents[id];
    const s = agentState(a);
    if (a.junction) {
      // A Workflow call (Cockpit board): the junction, captioned with how many agents hang from it.
      const n = order.filter((x) => agents[x].parent === id).length;
      nodes.push({ key: id, at: seat[id], junction: true, capTop: '18px', label: short(a.label) || 'workflow', tool: n ? `workflow · ${count(n, 'agent')}` : 'workflow' });
    } else {
      nodes.push({
        key: id, at: seat[id], size: grand.includes(id) ? 's' : 'm', state: s, capTop: grand.includes(id) ? '20px' : undefined,
        label: short(a.label) || 'agent', tool: a.tool || (s === 'failed' ? 'failed' : ''), bad: s === 'failed', parked: parkedAgent === id,
      });
    }
    const from = (a.parent || MAIN) === MAIN ? MAIN_AT : seat[a.parent];
    const running = a.state === 'running';
    // A workflow's own agents hang from it on the board's dashed lines.
    const underJunction = !!agents[a.parent]?.junction;
    fils.push(filament(from, seat[id], underJunction ? { dash: true, quiet: true, flow: running, key: id } : { flow: running, quiet: !running && a.state !== 'waiting', key: id }));
  }
  const working = [MAIN, ...order].filter((id) => agents[id] && agents[id].state === 'running').length;
  const total = (main ? 1 : 0) + order.length;
  return { nodes, fils, count: total ? `${count(total, 'agent')} · ${working} working` : '' };
}

/** The questions-start stage: main asking, the session's chunks waiting above it. */
export function startStage(ledger) {
  const ids = ledger?.claims?.ids || [];
  const titles = Object.fromEntries((ledger?.questions || []).map((q) => [String(q.chunk || '').split(' ')[0], String(q.chunk || '').split(' ').slice(1).join(' ')]));
  const seats = [[24, 16], [42, 9], [62, 10], [79, 20], [84, 44], [16, 40]];
  const nodes = [{ key: MAIN, at: [50, 36], size: 'xl', state: 'blocked', main: true, label: 'main', tool: 'planning the session', capTop: '54px' }];
  const fils = [];
  ids.slice(0, seats.length).forEach((id, i) => {
    nodes.push({ key: id, at: seats[i], size: 's', state: 'idle', label: id, tool: (titles[id] || '').toLowerCase(), capTop: '20px' });
    fils.push(filament([50, 36], seats[i], { quiet: true, key: id }));
  });
  fils.push({ key: 'tug', l: '0', t: '236px', w: '50%', h: 'calc(36% - 236px)', d: 'M100 100C55 100 45 0 0 0', tug: true, flow: true });
  return { nodes, fils, count: ids.length ? `session plan · ${count(ids.length, 'chunk')}` : 'session plan' };
}

/** The questions-end stage: everyone done, assumptions marked where they were taken. */
export function reviewStage(ledger) {
  const parked = ledger?.parked || [];
  const who = [...new Set(parked.map((p) => p.who).filter(Boolean))];
  const nodes = [{ key: MAIN, at: [50, 30], size: 'xl', state: 'done', main: true, label: 'main', tool: 'waiting on your review', capTop: '54px' }];
  const fils = [];
  who.slice(0, RING.length).forEach((w, i) => {
    const p = parked.find((x) => x.who === w);
    nodes.push({ key: w, at: RING[i], size: 'm', state: 'done', label: w, tool: p ? `assumed: ${p.alts?.[0] ?? ''}` : '', parked: true });
    fils.push(filament([50, 30], RING[i], { quiet: true, key: w }));
  });
  const n = parked.length;
  return { nodes, fils, count: `all agents done${n ? ` · ${count(n, 'assumption')} marked` : ''}` };
}

/** The package stage: the chunks gathered into the package node. */
export function packageStage(ledger) {
  const closed = ledger?.closed || [];
  const seats = [[28, 20], [50, 12], [72, 20], [76, 52], [50, 66], [24, 52], [16, 30], [84, 30]];
  const nodes = [{ key: 'pkg', at: [50, 40], pkg: true, label: 'package', tool: ledger?.base?.num ? `stacks on #${ledger.base.num}` : '', capTop: '44px' }];
  const fils = [];
  closed.slice(0, seats.length).forEach((c, i) => {
    nodes.push({ key: c.id, at: seats[i], size: 's', state: 'done', label: c.id, tool: c.fix ? 'fix' : '', capTop: '20px' });
    fils.push(filament(seats[i], [50, 40], { flow: true, key: c.id }));
  });
  return { nodes, fils, count: closed.length ? `${count(closed.length, 'chunk')} gathered` : '' };
}

// ---- the basin (contributor) and the river (owner) -------------------------------

/** Basin pills for the phase: closed (full moon), building (half), next (slot). */
export function basinItems({ ledger, phase, stage }) {
  const L = ledger || {};
  const stackOn = L.base?.num ? `stacks on #${L.base.num}` : '';
  const join = (...a) => a.filter(Boolean).join(' · ');
  const lower = (t) => String(t || '').toLowerCase();
  if (phase === 'start') {
    const ids = L.claims?.ids || [];
    return { head: `· ${join('forms at the end', stackOn)}`, items: ids.slice(0, 4).map((id) => ({ id, title: 'planned', slot: true, state: 'ready' })) };
  }
  if (phase === 'review') {
    const closed = L.closed || [];
    return { head: `· ${join(`${closed.length} closed`, 'waits on review')}`, items: closed.map((c) => ({ id: c.id, title: lower(c.short || c.title), state: 'closed', color: 'var(--st-done)' })) };
  }
  if (phase === 'package') {
    const closed = L.closed || [];
    return { head: `· ${join('ready', L.base?.num ? `stacked on #${L.base.num}` : '')}`, items: closed.map((c) => ({ id: c.id, title: c.fix ? 'fix' : lower(c.short || c.title), state: 'closed', color: 'var(--st-done)' })) };
  }
  const items = [];
  if (ledger) {
    for (const c of L.closed || []) items.push({ id: c.id, title: c.title, state: 'closed', color: 'var(--st-done)' });
    if (L.chunk?.id) items.push({ id: L.chunk.id, title: 'building', state: 'building', color: 'var(--st-tool)' });
    for (const id of L.claims?.next || []) items.push({ id, title: 'next', slot: true, state: 'ready' });
  } else {
    for (const c of liveChunks(stage)) {
      if (c.closed) items.push({ id: c.id, title: 'closed', state: 'closed', color: 'var(--st-done)' });
      else if (c.building) items.push({ id: c.id, title: 'building', state: 'building', color: 'var(--st-tool)' });
      else items.push({ id: c.id, title: 'next', slot: true, state: 'ready' });
    }
  }
  return { head: `· ${join('forming', stackOn, 'opens at the end')}`, items };
}
