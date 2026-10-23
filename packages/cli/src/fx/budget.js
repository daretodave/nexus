// What the particle layer may spend. A level sets the ceiling (how many
// particles live at once, how much ambient drift, how big a burst); the
// governor watches what each frame actually costs and trades particles for
// frame time on a slow machine, then gives them back once it keeps up.

/** The ceiling for a level: cap (live particles), ambient and burst scales, alpha. */
export function budgetFor(level) {
  if (level === 'subtle') return { cap: 160, ambient: 0.4, burst: 0.45, alpha: 0.7 };
  if (level === 'on') return { cap: 520, ambient: 1, burst: 1, alpha: 1 };
  return { cap: 0, ambient: 0, burst: 0, alpha: 0 };
}

// A frame's own work (step and draw) should stay well inside the 16.7ms a
// 60Hz frame has: the rest of the page paints in the same frame.
export const FRAME_BUDGET_MS = 4;
const MIN_SCALE = 0.2;

/**
 * The frame-time governor. feed(costMs, gapMs) after each frame: costMs is
 * the time step and draw took, gapMs the time since the last frame. scale()
 * is 0.2..1, applied to spawn counts and the live cap.
 */
export function createGovernor({ budget = FRAME_BUDGET_MS } = {}) {
  let cost = budget / 2;
  let gap = 16.7;
  let scale = 1;
  return {
    feed(costMs, gapMs = 16.7) {
      // Exponential averages: one slow frame (a GC, a tab switch) moves little.
      cost += (Math.max(0, costMs) - cost) * 0.1;
      gap += (Math.min(250, Math.max(0, gapMs)) - gap) * 0.1;
      const over = cost > budget || gap > 34;
      const easy = cost < budget * 0.5 && gap < 20;
      if (over) scale = Math.max(MIN_SCALE, scale * 0.97);
      else if (easy) scale = Math.min(1, scale + 0.004);
      return scale;
    },
    scale: () => scale,
    cost: () => cost,
  };
}

/** How many of a burst's particles to make, after the level and the governor (at least one when any were asked). */
export function scaled(count, ...factors) {
  if (count <= 0) return 0;
  const n = factors.reduce((a, f) => a * f, count);
  return n <= 0 ? 0 : Math.max(1, Math.round(n));
}
