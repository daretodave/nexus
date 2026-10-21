// Onboarding's step list and the rules every step's frame reads from it.

/**
 * The onboarding steps, in order. The second handoff puts Secrets fourth
 * (4 of 7, after Shape); that step is 42.8's port, and every counter, kicker
 * and Back or Continue link reads this list, so adding it here renumbers them.
 */
export const STEPS = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'detect', label: 'Detect' },
  { id: 'shape', label: 'Shape' },
  { id: 'plot', label: 'Plot' },
  { id: 'cloud', label: 'Cloud loop' },
  { id: 'launch', label: 'Launch' },
];

/** A step's place, 1-based: "step 3 · shape the project". */
export const stepNo = (id, steps = STEPS) => steps.findIndex((s) => s.id === id) + 1;
/** The footer's count: "3 of 6". */
export const stepCount = (id, steps = STEPS) => `${stepNo(id, steps)} of ${steps.length}`;
/** The step before and after this one (Back, Continue), or null at either end. */
export const stepBefore = (id, steps = STEPS) => steps[stepNo(id, steps) - 2]?.id ?? null;
export const stepAfter = (id, steps = STEPS) => { const n = stepNo(id, steps); return n ? steps[n]?.id ?? null : null; };
