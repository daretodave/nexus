// The cockpit's session switcher, one rule for terminal sessions (the
// FleetKit board draws local stars only and leaves terminals open; the
// rule is in design/handoff/README.md):
//
// - The menu lists the local stars first, as the board does. Terminal
//   sessions follow under a divider, each with the terminal glyph, saying
//   whether it is linked or read-only until linked. Each opens its cockpit,
//   where sending links and steers it (41.1).
// - The button's small stars are the other local stars only.
// - Someone else's session never appears.

const PHASE_WORD = { start: 'Questions', working: 'Working', review: 'Questions', package: 'Package' };

const chunkId = (c) => (c && typeof c === 'object' ? c.id : c) || '';

/** A row's grey line: "Working · owner · 4.2", "fell over in 14.1", "terminal · linked · 9.1". */
export function swDesc(s) {
  const chunk = chunkId(s.chunk);
  if (s.state === 'fallen') return `fell over${chunk ? ` in ${chunk}` : ''}`;
  if (s.kind === 'terminal') return ['terminal', s.linked ? 'linked' : 'read-only until linked', chunk].filter(Boolean).join(' · ');
  return [PHASE_WORD[s.phase] || 'Working', s.mode === 'owner' ? 'owner' : '', s.phase === 'start' && s.waiting ? `${s.waiting} waiting` : chunk].filter(Boolean).join(' · ');
}

/**
 * sessions: GET /api/sessions (null when the server cannot list them);
 * current: { id, name, kind }. -> { stars, terminals, others }.
 */
export function switcherMenu(sessions, current) {
  const list = sessions && sessions.length ? sessions.filter((s) => s.kind !== 'other') : [current];
  const isTerm = (s) => s.kind === 'terminal';
  const stars = list.filter((s) => !isTerm(s));
  const terminals = list.filter(isTerm);
  const others = stars.filter((s) => s.id !== current.id);
  return { stars, terminals, others };
}
