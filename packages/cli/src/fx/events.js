// From the live store to particle events. The layer keeps the last snapshot
// and diffs each new one against it: what is new since then (a tool call, a
// tool that failed, an agent that ended, a chunk that closed, a question, a
// commit on main) becomes one event. A replay is not news: the 'hello' frame
// hands over the whole history at once, so the first connected snapshot (and
// every reconnect, and a transcript that shrank on a reset) only sets the
// baseline. Opening a busy session sets off nothing.

const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SPAWN_TOOLS = new Set(['Task', 'Agent', 'Workflow']);
const MAIN = 'main';

/** The tone a tool call shows: the orb state it puts its agent in (writing | tool), or spawn for a delegation. */
export function toolTone(name) {
  if (WRITE_TOOLS.has(name)) return 'writing';
  if (SPAWN_TOOLS.has(name)) return 'spawn';
  return 'tool';
}

/**
 * What the diff reads, from the live store (data/client.js useEvents) and the
 * ledger's landed commits. landed: the ledger's landed list, or undefined while
 * the ledger has not loaded (so its first read is a baseline too).
 */
export function fxSnapshot(live, { landed, progress } = {}) {
  const stage = live?.stage || {};
  const agents = {};
  for (const id of stage.order || Object.keys(stage.agents || {})) {
    const a = stage.agents?.[id];
    if (a) agents[id] = { state: a.state, parent: a.parent || null, tools: a.tools || 0 };
  }
  const chunks = {};
  for (const [id, c] of Object.entries(stage.chunks || {})) chunks[id] = c.stage;
  const last = Array.isArray(landed) ? landed[landed.length - 1] : undefined;
  return {
    connected: !!live?.connected,
    transcript: live?.transcript || [],
    agents,
    chunks,
    asking: (live?.asks?.length || 0) + (live?.permissions?.length || 0),
    tugs: stage.tugs || 0,
    tugAgent: stage.lastTug?.agent || MAIN,
    landed: landed === undefined ? undefined : last ? last.sha : null,
    progress: progress == null ? null : progress,
  };
}

const ENDED = new Set(['done', 'failed']);

/**
 * The events between two snapshots, oldest first. prev null (or not yet
 * connected, or a transcript that shrank) is a baseline: nothing.
 * Event shapes: { type, agent?, ... }:
 *   tool { agent, name, tone }        tool-done { agent, ok }       error { agent }
 *   agent-start { agent, parent }     agent-end { agent, ok }       result { ok }
 *   chunk { id, stage }               ask { agent }                 answered
 *   tug { agent }                     landed { sha }                progress { from, to }
 */
export function diffFx(prev, next) {
  if (!next || !next.connected) return [];
  if (!prev || !prev.connected || next.transcript.length < prev.transcript.length) return [];
  const out = [];
  for (let i = prev.transcript.length; i < next.transcript.length; i += 1) {
    const t = next.transcript[i];
    if (!t) continue;
    const agent = t.agent || MAIN;
    if (t.kind === 'tool') out.push({ type: 'tool', agent, name: t.name, tone: toolTone(t.name) });
    else if (t.kind === 'tool-done') out.push({ type: 'tool-done', agent, ok: t.ok !== false });
    else if (t.kind === 'tool-error' || t.kind === 'error') out.push({ type: 'error', agent });
    else if (t.kind === 'result') out.push({ type: 'result', ok: t.ok !== false && !t.is_error });
  }
  for (const [id, a] of Object.entries(next.agents)) {
    const was = prev.agents[id];
    if (!was) { if (!ENDED.has(a.state)) out.push({ type: 'agent-start', agent: id, parent: a.parent }); continue; }
    if (!ENDED.has(was.state) && ENDED.has(a.state)) out.push({ type: 'agent-end', agent: id, ok: a.state === 'done' });
    else if (ENDED.has(was.state) && !ENDED.has(a.state)) out.push({ type: 'agent-start', agent: id, parent: a.parent });
  }
  for (const [id, st] of Object.entries(next.chunks)) {
    if (prev.chunks[id] !== st) out.push({ type: 'chunk', id, stage: st });
  }
  if (next.asking > prev.asking) out.push({ type: 'ask', agent: waitingAgent(next) });
  else if (next.asking === 0 && prev.asking > 0) out.push({ type: 'answered' });
  if (next.tugs > prev.tugs) out.push({ type: 'tug', agent: next.tugAgent });
  // The ledger loads after the channel connects: its first read (undefined -> a sha) is a baseline, not a landing.
  if (prev.landed !== undefined && next.landed && next.landed !== prev.landed) out.push({ type: 'landed', sha: next.landed });
  if (prev.progress != null && next.progress != null && next.progress > prev.progress) out.push({ type: 'progress', from: prev.progress, to: next.progress });
  return out;
}

/** The agent a new question most likely came from: one waiting, else the session. */
function waitingAgent(s) {
  for (const [id, a] of Object.entries(s.agents)) if (a.state === 'waiting' && id !== MAIN) return id;
  return MAIN;
}

/**
 * A stateful differ for a component: feed(snapshot, session) returns the
 * events since the last feed. Holding it in a ref keeps one baseline across
 * re-renders. A screen that switches sessions in place (the cockpit's /s/:id,
 * heads-down's ?s=) keeps its store until the new channel's hello lands, and
 * that store still reads connected. So a new session drops the baseline and
 * waits for the transcript to be replaced; the first snapshot after that is
 * the new session's baseline, not a burst of its history. The caller keeps
 * the landed list undefined until the new session's ledger loads, so its
 * first sha is a baseline too.
 */
export function createFxDiffer() {
  let prev = null;
  let key;
  let stale = null;
  return {
    feed(snap, session) {
      if (session !== key) {
        // The first feed only names the session; a change after that is a switch.
        if (key !== undefined || prev) stale = snap.transcript;
        key = session;
        prev = null;
      }
      // Still the old session's store: nothing in it is news, and it is no baseline either.
      if (stale && snap.transcript === stale) return [];
      stale = null;
      const ev = diffFx(prev, snap);
      // Keep the baseline only once connected; a dropped channel makes the next hello a baseline again.
      prev = snap.connected ? snap : null;
      return ev;
    },
    reset() { prev = null; stale = null; },
  };
}
