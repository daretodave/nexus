// Onboarding's step list and the rules every step's frame reads from it.

/**
 * The onboarding steps, in order. Permissions comes second, before anything
 * starts a session (spec 50); the second handoff puts Secrets after Shape
 * (42.8's port), so it is fifth (5 of 8). Every counter, kicker and Back or
 * Continue link reads this list.
 */
export const STEPS = [
  { id: 'welcome', label: 'Welcome', hint: 'What nexus is and how this setup runs' },
  { id: 'permissions', label: 'Permissions', hint: 'Grant the agent the access it needs before it starts' },
  { id: 'detect', label: 'Detect', hint: 'Read the repo to see what is already here' },
  { id: 'shape', label: 'Shape', hint: 'Confirm the project type the kit will adopt into' },
  { id: 'secrets', label: 'Secrets', hint: 'Wire the tokens and keys the loop will need' },
  { id: 'plot', label: 'Plot', hint: 'Place the first piece of work on the plan' },
  { id: 'cloud', label: 'Cloud loop', hint: 'Turn on the autonomous loop that ships from here' },
  { id: 'launch', label: 'Launch', hint: 'Hand off and watch the first run' },
];

/** A step's place, 1-based: "step 3 · shape the project". */
export const stepNo = (id, steps = STEPS) => steps.findIndex((s) => s.id === id) + 1;
/** The footer's count: "3 of 8". */
export const stepCount = (id, steps = STEPS) => `${stepNo(id, steps)} of ${steps.length}`;
/** The step before and after this one (Back, Continue), or null at either end. */
export const stepBefore = (id, steps = STEPS) => steps[stepNo(id, steps) - 2]?.id ?? null;
export const stepAfter = (id, steps = STEPS) => { const n = stepNo(id, steps); return n ? steps[n]?.id ?? null : null; };
