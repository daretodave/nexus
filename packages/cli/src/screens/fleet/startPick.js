// What "start heads-down" offers: a spec to work through (/heads-down <spec>), or infinite (march, or the next loop,
// forever; how it runs is follow.js). Nothing starts until one is chosen. A choice some running session already works on names
// that session: one this server runs opens instead of starting a second; one in a terminal (someone else's, or a tab
// of the owner's) is named but not opened, and starting anyway stays possible. Pure rules only.

import { followOf, followPrompt } from './follow.js';

export const INFINITE = 'infinite';

const RUNNING = ['live', 'observing', 'pausing', 'paused', 'resuming', 'resumed'];
const specOf = (chunkId) => String(chunkId || '').split('.')[0];

/** The prompt a choice starts: infinite runs as `follow` says (no follow: '/loop /next'), a spec '/heads-down <spec>'. */
export function startPrompt(choice, follow) {
  return choice === INFINITE ? followPrompt(follow || { mode: 'next', dry: 'stop' }) : `/heads-down ${choice}`;
}

/** What a running session works on: INFINITE, a spec id, or null. */
export function workingOn(s) {
  const p = String(s?.lastPrompt || '').trim();
  if (followOf(p)) return INFINITE;
  const hd = /^\/heads-down\s+(\d+)/.exec(p);
  if (hd) return hd[1];
  if (s?.chunk?.id) return specOf(s.chunk.id);
  return null;
}

/**
 * The choices, infinite first then every spec with work left in plan order:
 *   { value, label, sub, running: { id, name, terminal?, follow } | null }   (follow: followOf its prompt, or null)
 * A spec with nothing ready and nothing to chunk is left out.
 */
export function startChoices(plan, sessions = []) {
  const live = sessions.filter((s) => RUNNING.includes(s.state) && !s.ended);
  const by = (v) => {
    const s = live.find((x) => sameSpec(workingOn(x), v));
    if (!s) return null;
    const follow = followOf(s.lastPrompt);
    return s.kind === 'terminal' ? { id: s.id, name: s.name, terminal: true, follow } : { id: s.id, name: s.name, follow };
  };
  const next = [].concat(plan?.next || [])[0];
  const out = [{
    value: INFINITE,
    label: 'Infinite',
    sub: next?.id ? `march or the next loop, forever (${next.id} first)` : 'march or the next loop, forever',
    running: by(INFINITE),
  }];
  for (const sp of plan?.specs || []) {
    const ready = (sp.chunks || []).filter((c) => c.state === 'ready').length;
    if (!ready && !sp.unchunked) continue;
    out.push({
      value: String(sp.id),
      label: `${sp.id}${sp.title ? ` ${sp.title}` : ''}`,
      sub: sp.unchunked && !ready ? 'not chunked yet: the first pass chunks it' : `${ready} ready chunk${ready === 1 ? '' : 's'}`,
      running: by(String(sp.id)),
    });
  }
  return out;
}

function sameSpec(a, b) {
  if (a == null || b == null) return false;
  if (a === INFINITE || b === INFINITE) return a === b;
  return Number(a) === Number(b);
}
