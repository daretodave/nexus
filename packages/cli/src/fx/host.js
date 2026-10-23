// How FxLayer holds its engine over time, apart from React so a test can
// drive it: the engine loads on demand, a layer turned off (or unmounted)
// before the load lands never starts one, and an engine that throws is
// destroyed and dropped so the page goes on without particles.

/** Run one call on the engine in ref; one that throws is stopped, and the page goes on without particles. */
export function safely(ref, call) {
  if (!ref.current) return;
  try { call(ref.current); } catch {
    try { ref.current.destroy(); } catch { /* already broken: let it go */ }
    ref.current = null;
  }
}

/**
 * Load the engine and start it on the canvas; returns the stop for the
 * effect's cleanup. ref: where the engine lives (a React ref). load(): a
 * promise of { createFx }. canvas(): the element, or null once it is gone.
 * first(engine): the calls that bring a new engine up to date.
 */
export function startFx(ref, { load, canvas, first }) {
  let gone = false;
  let inst = null;
  Promise.resolve().then(load).then(({ createFx }) => {
    const el = canvas();
    // Turned off or unmounted while the chunk loaded: start nothing.
    if (gone || !el) return;
    inst = createFx(el);
    ref.current = inst;
    safely(ref, first);
  }).catch(() => { /* no engine (an offline chunk): the page simply has no particles */ });
  return () => {
    gone = true;
    if (inst && ref.current === inst) safely(ref, (e) => e.destroy());
    ref.current = null;
  };
}
