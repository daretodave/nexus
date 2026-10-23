// What "start heads-down" offers: a spec to work through (/heads-down <spec>), or infinite (/loop /next, the next
// chunk in line, forever). Nothing starts until one is chosen. A choice some running session already works on names
// that session instead, so a second one is not started for the same thing. Pure rules only.

export const INFINITE = 'infinite';

const RUNNING = ['live', 'observing', 'pausing', 'paused', 'resuming', 'resumed'];
const specOf = (chunkId) => String(chunkId || '').split('.')[0];

/** The prompt a choice starts: '/loop /next' for infinite, '/heads-down <spec>' for a spec. */
export function startPrompt(choice) {
  return choice === INFINITE ? '/loop /next' : `/heads-down ${choice}`;
}

/** What a running session works on: INFINITE, a spec id, or null. */
export function workingOn(s) {
  const p = String(s?.lastPrompt || '').trim();
  if (/^\/loop\s+\/next\b/.test(p) || /^\/march\b/.test(p)) return INFINITE;
  const hd = /^\/heads-down\s+(\d+)/.exec(p);
  if (hd) return hd[1];
  if (s?.chunk?.id) return specOf(s.chunk.id);
  return null;
}

/**
 * The choices, infinite first then every spec with work left in plan order:
 *   { value, label, sub, running: { id, name } | null }
 * A spec with nothing ready and nothing to chunk is left out.
 */
export function startChoices(plan, sessions = []) {
  const live = sessions.filter((s) => RUNNING.includes(s.state) && !s.ended);
  const by = (v) => {
    const s = live.find((x) => sameSpec(workingOn(x), v));
    return s ? { id: s.id, name: s.name } : null;
  };
  const next = [].concat(plan?.next || [])[0];
  const out = [{
    value: INFINITE,
    label: 'Infinite',
    sub: next?.id ? `loop /next: the next chunk in line, forever (${next.id} first)` : 'loop /next: the next chunk in line, forever',
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
