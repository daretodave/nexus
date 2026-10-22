// The Plot step's adoption gate (spec 52, A1). /plot needs nexus in the repo (its skill, scripts and plan), so on a
// repo nexus has never been in the step holds the kept ideas in the draft, offers Adopt now (POST /api/adopt: the
// home session adopts), and plots them once adoption lands. Explode writes nothing and works before adoption.

/**
 * Is nexus in this repo, from GET /api/state's info: adopted (agents.md, plan/ and .claude/commands, as Detect reads
 * it) or pinned by plan/nexus.lock. The server's POST /api/plot asks the same (server/repo.mjs nexusIn). null while
 * the state has not loaded.
 * @returns {boolean|null}
 */
export function nexusIn(info) {
  if (!info) return null;
  return !!(info.adopted || info.kit);
}

/**
 * Where the gate stands.
 *   open      plot as usual (nexus is in, or nothing is kept, or it is already plotted, or the state is not known yet:
 *             the server still refuses an unadopted repo)
 *   adopt     nexus isn't here: the kept ideas are held, Adopt now is offered
 *   adopting  the adopt prompt went to the home session; waiting for the state to say nexus is in
 *   landed    adoption landed: one click plots the held ideas
 *   auto      adoption landed and the person had already asked to plot (Next): plot them now
 * @param {{ nexus: boolean|null, adopt?: null|'sent', kept: number, plotted?: boolean, held?: boolean }} o
 */
export function plotGate({ nexus, adopt = null, kept, plotted = false, held = false }) {
  if (plotted || !kept || nexus === null) return 'open';
  if (!nexus) return adopt === 'sent' ? 'adopting' : 'adopt';
  if (adopt !== 'sent') return 'open';
  return held ? 'auto' : 'landed';
}

/** "Plot the 3 kept ideas" / "Plot the kept idea". */
export function plotKeptLabel(n) {
  return n === 1 ? 'Plot the kept idea' : `Plot the ${n} kept ideas`;
}

/** A refusal from POST /api/plot that means "adopt first" (409 { error, adopt: true }). */
export const needsAdopt = (e) => e?.status === 409 && !!e?.data?.adopt;
