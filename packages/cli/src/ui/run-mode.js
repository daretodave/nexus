// Run mode (decision 2): 'size' (nexus picks per chunk: S and M in one
// builder, L as a workflow), or the overrides 'sub', 'wf', 'both'. Stored
// today as prefs { agents, workflows } (POST /api/prefs); /api/local will
// carry it as runMode. Pure, so the toggle rule is tested.

export const RUN_MODES = ['size', 'sub', 'wf', 'both'];

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
