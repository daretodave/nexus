// Run mode (decision 2): 'size' (nexus picks per chunk: S and M in one
// builder, L as a workflow), or the overrides 'sub', 'wf', 'both'. It lives
// in the checkout's .nexus/local.json as runMode, read (GET) and written
// (POST) through /api/local (server/local.mjs, the one writer). Settings,
// the cockpit's run-mode menu and onboarding all read it with localRunMode
// and save it with saveRunMode. The rules are pure, so they are tested.

export const RUN_MODES = ['size', 'sub', 'wf', 'both'];

/** GET /api/local's answer -> the run mode. Anything else (not loaded, unknown) is by size. */
export function localRunMode(local) {
  return RUN_MODES.includes(local?.runMode) ? local.runMode : 'size';
}

/**
 * Save a run mode: POST /api/local { runMode }. `post` is the data layer's
 * api(path, body), passed in so this file stays pure (tests pass their own).
 * Resolves to GET /api/local's shape after the write.
 */
export async function saveRunMode(rm, post) {
  if (!RUN_MODES.includes(rm)) throw new Error(`run mode must be one of ${RUN_MODES.join(', ')}`);
  return post('/api/local', { runMode: rm });
}

/** prefs { agents, workflows } -> a run mode. Neither set is "by size". */
export function runModeFromPrefs(prefs) {
  const a = !!prefs?.agents;
  const w = !!prefs?.workflows;
  return a && w ? 'both' : a ? 'sub' : w ? 'wf' : 'size';
}

/** A run mode -> prefs { agents, workflows }. */
export function prefsFromRunMode(rm) {
  return { agents: rm === 'sub' || rm === 'both', workflows: rm === 'wf' || rm === 'both' };
}

/**
 * The boards' toggle rule (Shape, Settings): ticking "Delegate to sub-agents"
 * (k 'sub') or "Use workflows" (k 'wf') turns "by size" off; clearing the
 * last one turns it back on.
 */
export function nextRunMode(v, k) {
  const sub = v === 'sub' || v === 'both';
  const wf = v === 'wf' || v === 'both';
  const s2 = k === 'sub' ? !(v !== 'size' && sub) : (v !== 'size' && sub);
  const w2 = k === 'wf' ? !(v !== 'size' && wf) : (v !== 'size' && wf);
  if (s2 && w2) return 'both';
  if (s2) return 'sub';
  if (w2) return 'wf';
  return 'size';
}
