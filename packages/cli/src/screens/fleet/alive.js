// An alive Fleet home (0.5.1): each tile reads its session's state at a glance, by colour. Working is cyan and moves,
// needs you glows amber, a session that finished its job is green with a check (and offers to be put away), fell
// over keeps its ash, and an idle session with no finished job stays quiet. Pure rules only; the tile and the
// cockpit read the same ones. A row here is a normalized fleet row (model.js norm).
import { fellOver } from './model.js';
import { claimCount } from '../../../shared/put-away.mjs';

// One-shot skills: a session given one of these has a job, and is done once it ends its turn on a final word.
const JOBS = new Set([
  'oversight', 'next', 'plot', 'bug', 'jot', 'tidy', 'messy', 'explode', 'design', 'digest', 'critique', 'iterate',
  'triage', 'expand', 'lessons-pr', 'ship-a-chunk', 'heads-down', 'adopt',
]);
// A chunk loop is done only once its work landed: its last word or its last event says so.
const LANDS = new Set(['next', 'ship-a-chunk', 'heads-down']);
const LANDED = /\b(landed|pushed|merged|shipped|closed|archived|on main)\b/i;
// A clause that says it did not land: "nothing was pushed", "the chunk is not closed", "the gate failed".
const DENIED = /\b(not|no|nothing|never|neither|nor|failed|fails|cannot|unable)\b|n't\b/i;

/** Does this text say its work landed, in a clause that does not deny it? */
export function saysLanded(text) {
  return String(text || '').split(/[.!?;,\n]+|\s(?:but|and|so)\s/i).some((x) => LANDED.test(x) && !DENIED.test(x));
}

/** Does a final word ask the person something? Its last line ends on a question, or it counts questions off. */
export function asksSomething(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/\bquestion \d+ of \d+\b/i.test(t)) return true;
  const last = t.split(/\n+/).map((l) => l.trim()).filter(Boolean).pop() || '';
  return /\?[\s*_`"')\]]*$/.test(last);
}

/** The slash command a prompt starts with ('oversight'), or ''. */
export function commandOf(prompt) {
  const m = /^\s*\/([a-z][\w-]*)/i.exec(String(prompt || ''));
  return m ? m[1].toLowerCase() : '';
}

/**
 * Has this session finished its job? From real signals only: its turn ended on a final word (not a tool call) that
 * asks nothing, it holds no question and no claim, and its last prompt was a job: an /oversight apply, a one-shot
 * skill, or a chunk loop whose work landed. A free-form prompt is a conversation, never "done".
 * -> null, or { why, text } where text is the tile's short line ("applied your answers").
 */
export function finishedJob(s) {
  if (!s || !s.idle || s.ended || s.kind === 'terminal') return null;
  if (!['live', 'resumed'].includes(s.state)) return null;
  if (s.parked > 0 || s.questions?.total) return null;
  if (s.last?.kind !== 'text' || !String(s.last.text || '').trim()) return null;
  // A turn that ends asking something in plain words waits on the person: never done.
  if (asksSomething(s.last.text)) return null;
  if (claimCount(s.git || {}) > 0) return null;
  const cmd = commandOf(s.lastPrompt);
  if (!JOBS.has(cmd)) return null;
  if (cmd === 'oversight') return { why: 'oversight', text: /\bapply\b/i.test(s.lastPrompt) ? 'applied your answers' : 'oversight finished' };
  if (LANDS.has(cmd)) {
    // Landed only on a word that says so, and with its claims known to be gone (unknown is not "none").
    if (s.git?.claims == null) return null;
    if (!saysLanded(s.last.text) && !saysLanded(s.event?.text)) return null;
    return { why: cmd, text: cmd === 'heads-down' ? 'its list is done' : 'its chunk landed' };
  }
  return { why: cmd, text: `/${cmd} finished` };
}

/**
 * The tile's tone, one per session: stopped | fallen | needs | resuming | done | idle | observing | working.
 * `done` is finishedJob's answer (passed in when the caller already has it).
 */
export function tone(s, done = finishedJob(s)) {
  if (!s) return 'idle';
  if (s.ended || (s.state === 'stopped')) return 'stopped';
  if (fellOver(s)) return 'fallen';
  if (s.state === 'asking') return 'needs';
  if (s.state === 'resuming') return 'resuming';
  if (done) return 'done';
  if (s.idle || s.state === 'paused') return 'idle';
  if (s.state === 'observing') return 'observing';
  return 'working';
}

/**
 * The main orb on a tile's stage, by tone: done rests green with its check, needs you asks, working shows what it is
 * doing (its last tool call reads as a tool, cyan; else its own orb state).
 */
export function mainOrb(s, t = tone(s)) {
  if (t === 'done') return 'done';
  if (t === 'needs') return 'blocked';
  if (t === 'idle') return 'idle';
  if (t === 'working' && (!s.orb || s.orb === 'thinking') && s.last?.kind === 'tool') return 'tool';
  return s.orb || (s.state === 'resumed' ? 'thinking' : 'tool');
}

/** A sub-agent's orb on a tile: a finished session's agents rest done; a quiet one's rest idle. */
export function agentOrb(a = {}, t) {
  if (t === 'done') return 'done';
  if (t === 'needs' || t === 'idle') return 'idle';
  return a.state || 'idle';
}

/** The phase track of a finished session: every phase it reports lit as done. */
export function doneTrack(items) {
  return items.map((i) => ({ ...i, state: 'done', p: undefined }));
}

/**
 * Where a session fell, as parts the tile colours: the tool's name, then its argument (a command, a path).
 * "Bash npm run build" -> { tool: 'Bash', arg: 'npm run build' }; "Bash" -> { tool: 'Bash', arg: '' }.
 */
export function fellParts(tool) {
  const t = String(tool || '').trim();
  if (!t) return null;
  const m = /^([A-Za-z][\w.:-]*)(?:\s+([\s\S]*))?$/.exec(t);
  if (!m) return { tool: '', arg: t };
  return { tool: m[1], arg: (m[2] || '').trim() };
}

/**
 * The start tile's line: what heads-down would take first, from the plan's order (GET /api/plan next), as
 * { id, rest } ("12.5", "Head-to-head tiebreaks, size M, from spec 12"). null with nothing in line.
 */
export function nextInLine(plan, title = '') {
  const n = [].concat(plan?.next || [])[0];
  if (!n?.id) return null;
  const bits = [];
  if (title) bits.push(title);
  if (n.size) bits.push(`size ${n.size}`);
  if (n.lane) bits.push(n.lane === 'spec' ? `from spec ${n.spec || String(n.id).split('.')[0]}` : `from the ${n.lane} lane`);
  return { id: String(n.id), rest: bits.join(', ') };
}

/** The line a working session with no chunk reads as its headline: what its job is, from its last prompt. */
export function jobTitle(s) {
  const cmd = commandOf(s?.lastPrompt);
  if (!cmd) return '';
  if (cmd === 'oversight') return /\bapply\b/i.test(s.lastPrompt) ? 'Applying your oversight answers' : 'Oversight';
  return `/${cmd}`;
}

/**
 * "Keep it" is remembered per viewer, per job: the session's id and the moment its last word landed. A later job
 * that finishes asks again.
 */
export const keepKey = (s) => `nexus.keep.${s?.id || ''}`;
export const keepMark = (s) => `${s?.lastPrompt || ''}|${s?.last?.at || ''}`;

export function keptAlready(s, store) {
  try {
    return !!s && store?.getItem(keepKey(s)) === keepMark(s);
  } catch {
    return false;
  }
}

export function rememberKeep(s, store) {
  try { store?.setItem(keepKey(s), keepMark(s)); } catch { /* a blocked store only means it asks again */ }
}

/** A finished session's headline when it has no chunk to name: what its job was. */
export function doneTitle(done) {
  if (!done) return '';
  if (done.why === 'oversight') return done.text === 'applied your answers' ? 'Applied your oversight answers' : 'Oversight finished';
  if (done.why === 'heads-down') return 'Worked through its list';
  if (done.why === 'next' || done.why === 'ship-a-chunk') return 'Landed its chunk';
  return `Ran /${done.why}`;
}

/** This browser's storage, or null where it is blocked (a private window, a preview). */
export function viewerStore() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** What the fleet says once a session is put away: its star is free, and what stayed (shared/put-away.mjs). */
export function putAwayToast(name, r = {}) {
  if (r.kept?.length) return { kind: 'info', title: `Put ${name} away`, body: `Its star is free. ${r.say || ''} All of it stays where it was.`.replace(/\s+/g, ' ').trim() };
  if (r.worktree && !r.worktree.closed && r.worktree.note) return { kind: 'info', title: `Put ${name} away`, body: `Its star is free. Its worktree stays: ${r.worktree.note}` };
  return { kind: 'info', title: `Put ${name} away`, body: r.worktree?.closed ? 'Its star is free and its empty worktree is gone.' : 'Its star is free.' };
}
