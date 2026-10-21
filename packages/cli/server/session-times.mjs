// The session detail's times and marks (GET /api/sessions/:id; 41.7, A7): when the session started, the Working
// phase's budget, the chunk in flight with its title, size, estimate and start, the chunks it closed with when, and the
// marks the phase track draws. Every value comes from something the session or the repo wrote; one the server could
// not see is null, and the screens draw their empty state for it.
//
// Sources:
//   ledger   `.nexus/sessions/<id>.json` (scripts/ledger.mjs): started, chunk, step, done, parked (each its `at`)
//   beats    a hosted session's stage beats, stamped as the server read them (session.mjs): a chunk's claim and close
//   watch    the server's own reads of a ledger over time: a chunk change between two reads dates the new chunk's start
//            at the ledger's beat, a close (an id added to `done`) dates the close; the first read is a baseline
//   plan     GET /api/plan's board (readPlan): chunk titles and sizes, and the hours table progress.mjs prints
//   phase    `.nexus/local.json` `phase`: the Working phase length Settings saved
import { replay } from '../shared/beats.mjs';
import { estimateMinutes, phaseBudget } from '../shared/times.mjs';

const iso = (ms) => (typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : null);
const ids = (list) => (Array.isArray(list) ? list.map(String).filter(Boolean) : []);

/** Remembers each ledger between reads, so a chunk change or a close the server saw happen gets its time. */
export function createStepWatch() {
  const seen = new Map();
  return {
    /** Read one ledger; returns its { starts, closes } (chunk id -> ISO time) seen so far. */
    observe(l) {
      if (!l || typeof l.id !== 'string') return { starts: new Map(), closes: new Map() };
      const chunk = l.chunk ? String(l.chunk) : '';
      const done = new Set(ids(l.done));
      let w = seen.get(l.id);
      if (!w) {
        w = { chunk, done, starts: new Map(), closes: new Map() };
        seen.set(l.id, w);
        return w;
      }
      const at = l.beat && Number.isFinite(Date.parse(l.beat)) ? new Date(l.beat).toISOString() : null;
      if (at) {
        if (chunk && chunk !== w.chunk && !w.starts.has(chunk)) w.starts.set(chunk, at);
        for (const id of done) if (!w.done.has(id) && !w.closes.has(id)) w.closes.set(id, at);
      }
      w.chunk = chunk;
      w.done = done;
      return w;
    },
  };
}

/** chunk id -> { title, size } from the plan board, and its hours table. */
function planIndex(plan) {
  const out = new Map();
  for (const s of plan?.specs || []) for (const c of s.chunks || []) out.set(String(c.id), { title: c.title || '', size: c.size || null });
  return { chunks: out, hours: plan?.hours || null };
}

/**
 * The fields GET /api/sessions/:id adds for the boards' times (shapes: src/screens/cockpit/model.js and
 * src/screens/headsdown-inbox/headsModel.js):
 *   { startedAt, budget: { label, ms } | null,
 *     chunk: { id, step, title, size, estimate (minutes) | null, startedAt | null } | null,
 *     closed: [{ id, title, at | null }], marks: [{ kind: 'closed' | 'parked', at }] }
 */
export function sessionTimes({ ledger = {}, beats = [], hostedAt = null, plan = null, watched = null, phase = null } = {}) {
  const l = ledger || {};
  const stage = beats.length ? replay(beats) : null;
  const w = watched || { starts: new Map(), closes: new Map() };
  const { chunks, hours } = planIndex(plan);
  const live = stage?.current && stage.chunks[stage.current]?.stage !== 'archive' ? stage.current : null;
  const current = l.chunk ? String(l.chunk) : live;

  let chunk = null;
  if (current) {
    const known = chunks.get(current) || {};
    const size = known.size || null;
    chunk = {
      id: current,
      step: l.step || stage?.chunks?.[current]?.stage || '',
      title: known.title || '',
      size,
      estimate: estimateMinutes(size, hours),
      startedAt: iso(stage?.chunks?.[current]?.claimedAt) || w.starts.get(current) || null,
    };
  }

  const archived = stage ? stage.chunkOrder.filter((id) => stage.chunks[id].stage === 'archive') : [];
  const closed = [...new Set([...ids(l.done), ...archived])].map((id) => ({
    id,
    title: chunks.get(id)?.title || '',
    at: iso(stage?.chunks?.[id]?.closedAt) || w.closes.get(id) || null,
  }));

  const parked = Array.isArray(l.parked) ? l.parked : [];
  const marks = [
    ...closed.filter((c) => c.at).map((c) => ({ kind: 'closed', id: c.id, at: c.at })),
    ...parked.filter((p) => p && typeof p === 'object' && p.at).map((p) => ({ kind: 'parked', at: p.at })),
  ].sort((a, b) => String(a.at).localeCompare(String(b.at)));

  return {
    startedAt: l.started || hostedAt || null,
    budget: phaseBudget(phase),
    chunk,
    closed,
    marks,
  };
}
