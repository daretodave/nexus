// The demo's clock (spec 44 A1). A scenario's beat script is timed in
// scenario milliseconds; the clock decides when those fire and what time
// the data says it is.
//
//   realClock({ speed })  wall time. A step `at` ms into the script fires
//                         after at / speed real ms, and everything it stamps
//                         carries the wall time, so the page's own clock
//                         (ages, "just now", the river's drop) agrees.
//   manualClock({ start }) for tests: nothing fires until advance(ms) moves
//                         time, then every due timer runs in order, each
//                         seeing now() at its own due time. Deterministic.
//
// Both answer the same three calls: now(), after(ms, fn) -> handle,
// cancel(handle).

/** Wall time; script time runs `speed` times faster than the wall. */
export function realClock({ speed = 1 } = {}) {
  const k = Number(speed) > 0 ? Number(speed) : 1;
  return {
    kind: 'real',
    speed: k,
    now: () => Date.now(),
    after: (ms, fn) => setTimeout(fn, Math.max(0, ms) / k),
    cancel: (h) => clearTimeout(h),
  };
}

/** A clock that only moves when told to. */
export function manualClock({ start = Date.UTC(2026, 9, 21, 9, 0, 0) } = {}) {
  let t = start;
  let seq = 0;
  const timers = [];
  const clock = {
    kind: 'manual',
    speed: 1,
    now: () => t,
    after(ms, fn) {
      const h = { due: t + Math.max(0, ms), seq: seq++, fn };
      timers.push(h);
      return h;
    },
    cancel(h) {
      const i = timers.indexOf(h);
      if (i >= 0) timers.splice(i, 1);
    },
    /** Move time forward by `ms`, running every timer that falls due, in due order (ties: first set, first run). */
    advance(ms) {
      const end = t + Math.max(0, ms);
      for (;;) {
        timers.sort((a, b) => a.due - b.due || a.seq - b.seq);
        const next = timers[0];
        if (!next || next.due > end) break;
        timers.shift();
        t = next.due;
        next.fn();
      }
      t = end;
    },
    get pending() { return timers.length; },
  };
  return clock;
}
