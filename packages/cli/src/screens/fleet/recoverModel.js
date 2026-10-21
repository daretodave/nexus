// Recover's pure view model: a run's agents (GET /api/recover, server/recover.mjs readRun) as Runline rows.
// The server marks the one resume point (`resume`: the first agent that did not finish, since the Workflow tool
// replays every finished agent from the journal) and why every other row cannot resume (`why`).

/** Stage states the orb draws: a live agent reads as thinking. */
const ORB = { running: 'thinking' };

/** The row a screen opens on: the resume point, else the first failure, else the last row. */
export function defaultPick(agents = []) {
  const r = agents.findIndex((a) => a.resume);
  if (r >= 0) return r;
  const f = agents.findIndex((a) => a.state === 'failed');
  return f >= 0 ? f : Math.max(0, agents.length - 1);
}

/** How many agents finished (and replay on a resume). */
export const doneCount = (agents = []) => agents.filter((a) => a.state === 'done').length;

/**
 * Runline rows. A row's full result (`pre`) shows on the picked row and on a failure, so a long run stays readable.
 * @param {object[]} agents  readRun's agents
 * @param {number} here      the picked row
 * @param {(t: string) => string} when  formats an ISO time
 */
export function recoverRows(agents = [], here = defaultPick(agents), when = (t) => t) {
  return agents.map((a, i) => ({
    name: a.name,
    role: a.role,
    state: ORB[a.state] || a.state,
    peek: a.peek,
    pre: i === here || a.state === 'failed' ? a.pre || '' : '',
    when: a.when ? when(a.when) : '',
    here: i === here,
    never: a.state === 'never',
    canResume: !!a.resume,
    cantWhy: a.resume ? '' : a.why || '',
  }));
}
