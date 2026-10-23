// Recovery across a restart or an upgrade: what a stopping server writes into each session's ledger, and what a later
// server sends when it picks that session up again. Pure where it can be (server.mjs does the writes and the hosting).
//
//   park      at close, synchronously, each session the GUI started is written `state: 'parked'` with a `stop`
//             marker: { at, by: 'server', why: 'stop'|'signal'|'sweep', turn: 'working'|'idle'|'asking'|'forming',
//             paused, version, queued: [{ text, steered }], asks: n }, its Claude Code session (`claude`), where it
//             worked (`cwd`), the prompts it took (`sent`), and the questions it was asking folded into `parked`
//             ({ q, alts, default, why, at, from: 'ask', askId }), where the inbox and Needs you already read them.
//             One that never took a prompt and holds nothing is ended instead (its star frees).
//   sweep     a server that died without that (killed) leaves its ledgers `live`: the next server parks them with
//             `stop.why: 'sweep'`, so the kit's terminal tools (scripts/ledger.mjs take) agree with the GUI at once.
//   pick up   the same ledger id, star and worktree, hosted again, resuming its own Claude Code conversation; what it
//             sends next follows pickupMessages.
import { parkedItem, promptText, tailEntries } from './sessions.mjs';
import { newTxContext, txFromMessage } from './normalize.mjs';

export const CARRY_ON = 'nexus restarted while you were mid-step. Check where you got to and carry on.';
export const ASK_NOTE = 'nexus restarted while your question was open. It waits in the inbox: take your recommended option for now and carry on; an answer that differs reaches you when it comes.';

const label = (o) => (typeof o === 'string' ? o : o && typeof o === 'object' ? String(o.label || '') : '');

/** A live ask (session.mjs view) as parked questions, one per question it carries. */
export function asksAsParked(asks = [], at = new Date().toISOString()) {
  const out = [];
  for (const a of asks || []) {
    const qs = Array.isArray(a?.questions) && a.questions.length ? a.questions : [{}];
    for (const q of qs) {
      const alts = (Array.isArray(q.options) ? q.options : []).map(label).filter(Boolean);
      const first = Array.isArray(q.options) ? q.options[0] : null;
      out.push({
        q: String(q.question || q.header || 'A question it asked'),
        alts,
        ...(alts[0] ? { default: alts[0] } : {}),
        why: first && typeof first === 'object' && first.description ? String(first.description) : '',
        at,
        from: 'ask',
        askId: String(a?.id || ''),
      });
    }
  }
  return out;
}

/**
 * The ledger patch a stopping server writes for one session (session.mjs snapshot()), or `{ end: true }` when it
 * never took a prompt and holds nothing (its ledger ends, as before). `why`: 'stop' (a close or Ctrl+C), 'signal'
 * (its terminal closed), 'sweep' (written by the next server after a crash).
 */
export function parkPatch(snap, l = {}, { why = 'stop', at = new Date().toISOString(), version = '', server = null } = {}) {
  const queued = [...(snap.waiting || []), ...(snap.held || [])].filter((q) => q && String(q.text || '').trim());
  if (!snap.sent && !queued.length && !snap.claude) return { end: true };
  const asks = asksAsParked(snap.asks, at);
  const turn = snap.form && snap.form !== 'ready' ? 'forming' : asks.length ? 'asking' : snap.busy ? 'working' : 'idle';
  // A question parked at an earlier stop stays (answered or not: the inbox and its history read it); only one the
  // session is asking again now is replaced by its fresh copy.
  const now = new Set(asks.map((a) => a.askId).filter(Boolean));
  const kept = (Array.isArray(l.parked) ? l.parked : []).filter((p) => !(p && typeof p === 'object' && p.from === 'ask' && now.has(String(p.askId || ''))));
  // Parked by its own loop (/reboot-ready: ledger.mjs park wrote state parked and the train) before nexus stopped.
  const train = l.state === 'parked' && !l.stop && typeof l.train === 'string' && l.train ? l.train : '';
  return {
    state: 'parked',
    beat: at,
    ...(snap.claude || l.claude ? { claude: snap.claude || l.claude } : {}),
    ...(snap.cwd ? { cwd: snap.cwd } : {}),
    sent: Number(snap.sent) || 0,
    ...(server ? { server } : {}),
    stop: {
      at, by: 'server', why, turn, paused: !!snap.pause && snap.pause !== 'run', version,
      queued: queued.map((q) => ({ text: String(q.text), steered: !!q.steered, ...(q.images ? { note: `${q.images} ${q.images === 1 ? 'image' : 'images'} not kept` } : {}) })),
      asks: asks.length,
      ...(train ? { train } : {}),
    },
    // The messages a start wrote down while its worktree formed are in `queued` now.
    waiting: undefined,
    parked: [...kept, ...asks],
  };
}

/** The patch the next server writes into a ledger a killed server left `live` (no stop marker). */
export function sweepPatch(l, { at = new Date().toISOString(), version = '' } = {}) {
  // What a start wrote down while its worktree formed (`waiting`) is the first prompt it never sent: kept to send.
  const waiting = (Array.isArray(l.waiting) ? l.waiting : []).filter((q) => q && typeof q.text === 'string' && q.text.trim())
    .map((q) => ({ text: q.text, steered: !!q.steered, ...(q.note ? { note: q.note } : {}) }));
  return {
    state: 'parked',
    stop: { at: typeof l.beat === 'string' ? l.beat : at, by: 'sweep', why: 'sweep', turn: waiting.length ? 'forming' : null, paused: false, version, queued: waiting, asks: 0, found: at },
    waiting: undefined,
  };
}

/** Was this ledger parked by its own loop's reboot train (/reboot-ready), not only by nexus stopping? */
export function trainParked(l) {
  if (!l || typeof l !== 'object') return false;
  if (l.stop && typeof l.stop === 'object') return typeof l.stop.train === 'string' && !!l.stop.train;
  return l.state === 'parked' && typeof l.train === 'string' && !!l.train;
}

/** Does a session pick up by itself at start: a clean stop, idle, nothing queued, no question, a conversation to resume. */
export function autoPickable(l) {
  const st = l?.stop;
  if (!l || l.gui !== true || l.state !== 'parked' || !st || st.by !== 'server' || st.turn !== 'idle') return false;
  // A loop its reboot train parked waits for /reboot-resume (Pick up sends it); one a terminal took is the terminal's.
  if (trainParked(l) || (typeof l.runner === 'string' && l.runner)) return false;
  if (Array.isArray(st.queued) && st.queued.length) return false;
  if ((Array.isArray(l.parked) ? l.parked : []).some((p) => parkedItem(p).state === 'pending')) return false;
  return typeof l.claude === 'string' && !!l.claude;
}

/** A plain prompt that gives a fresh session its stopped one's context, for a repo without /reboot-resume. */
export function contextPrompt(l) {
  const parts = [
    `You are picking up the nexus session ${l.star || l.id} after nexus restarted; its earlier conversation could not be reopened.`,
    l.worktree ? `It works in ${l.worktree}${l.branch ? ` on branch ${l.branch}` : ''}.` : l.branch ? `It works on branch ${l.branch}.` : '',
    l.chunk ? `It was on chunk ${l.chunk}${l.step ? ` (step: ${l.step})` : ''}.` : '',
    l.lastPrompt ? `Its last prompt was: ${l.lastPrompt}` : '',
    'Look at the git state there (status, log) to see where it got to, then carry on, or say what you found if there is nothing to carry on.',
  ];
  return parts.filter(Boolean).join(' ');
}

/**
 * What a pick-up sends, in order: [{ text, steered }].
 *   fresh (no conversation to resume) with anything to carry on: `/reboot-resume <star>` (the repo has the skill) or a
 *     context prompt, first
 *   mid-step: the carry-on line (a loop or chunk ledger: `/reboot-resume <star>`, in this same resumed session)
 *   asking, no answer given: a note that the question waits in the inbox
 *   the messages that waited (queued while the worktree formed, or held by a pause), in their order
 *   `then`: what the person typed or answered, last
 * Idle with nothing queued sends nothing: the session sits ready, with its whole context.
 */
export function pickupMessages(l, { resumed = true, turn = null, skill = false, then = null } = {}) {
  const st = l?.stop || {};
  const t = turn || st.turn || null;
  const out = [];
  const star = l.star || l.id;
  const queued = (Array.isArray(st.queued) ? st.queued : []).filter((q) => q && typeof q.text === 'string' && q.text.trim());
  const ran = (Number.isFinite(l.sent) && l.sent > 0) || !!l.claude;
  const loopish = !!(l.loop || l.chunk);
  const train = trainParked(l);
  if (!resumed && ran && (t === 'working' || t === 'asking' || loopish || train || queued.length || then)) {
    out.push({ text: skill ? `/reboot-resume ${star}` : contextPrompt(l), steered: false });
  } else if (resumed && (t === 'working' || train)) {
    // A loop its train parked ended its turn on purpose: /reboot-resume takes it on from its ledger.
    out.push({ text: (loopish || train) && skill ? `/reboot-resume ${star}` : CARRY_ON, steered: false });
  }
  if (t === 'asking' && !then) out.push({ text: ASK_NOTE, steered: false });
  for (const q of queued) out.push({ text: q.text, steered: !!q.steered });
  if (then && String(then).trim()) out.push({ text: String(then).trim(), steered: false });
  return out;
}

/**
 * A saved Claude Code session file drawn as the cockpit's transcript (the items normalize.mjs makes from the live
 * stream, plus each typed prompt), so a stopped session shows its conversation instead of "Quiet so far".
 */
export function savedTranscript(file, { bytes = 524288, max = 400 } = {}) {
  if (!file) return [];
  let at = 0;
  const ctx = newTxContext({ now: () => at });
  const out = [];
  for (const e of tailEntries(file, bytes)) {
    if (!e || typeof e !== 'object' || e.isSidechain) continue;
    const t = typeof e.timestamp === 'string' ? Date.parse(e.timestamp) : NaN;
    if (Number.isFinite(t)) at = t;
    if (e.type === 'user' && !e.isMeta) {
      const words = promptText(e.message?.content);
      if (words) out.push({ kind: 'user', text: typeof e.message?.content === 'string' ? e.message.content : words, at });
    }
    if (e.type !== 'user' && e.type !== 'assistant') continue;
    try {
      for (const item of txFromMessage({ ...e, parent_tool_use_id: e.parent_tool_use_id ?? null }, ctx)) out.push(item);
    } catch { /* a line this version does not draw */ }
  }
  return out.slice(-max);
}
