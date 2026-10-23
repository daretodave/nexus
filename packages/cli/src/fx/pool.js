// The particle pool: a fixed array of particle records reused for the life
// of the layer, so a busy session makes no garbage. Live particles sit packed
// at the front; one retires by swapping with the last live one. When the pool
// is full an event's burst (prio 1) may take the place of ambient drift
// (prio 0); ambient never pushes anything out.
import { bezier } from './effects.js';

function blank() {
  return {
    kind: 'mote', x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, drag: 0, life: 1, age: 0, delay: 0, size: 1, color: '', alpha: 1, prio: 0,
    r0: 0, r1: 0, cx: 0, cy: 0, rad: 0, ang: 0, w: 0, tilt: 0.4, wob: 0, wf: 0, phase: 0, path: null, jitter: 0, glyph: '', tx: 0, ty: 0,
  };
}

export function createPool(capacity) {
  const items = Array.from({ length: Math.max(0, capacity) }, blank);
  return { items, n: 0, cap: items.length, limit: items.length };
}

const BLANK = blank();
const KEYS = Object.keys(BLANK);

function assign(p, spec) {
  for (const k of KEYS) p[k] = spec[k] !== undefined ? spec[k] : BLANK[k];
  p.age = 0;
  // A seeker's tangent (for its streak) comes from the last position; start it on the path.
  if (p.kind === 'seek' && p.path) { p.x = p.path[0][0]; p.y = p.path[0][1]; p.tx = p.x; p.ty = p.y; }
  return p;
}

/**
 * Add one particle from a spec. Returns false when there is no room: the pool
 * is at its limit (the governor may hold it under capacity) and the spec is
 * ambient, or no ambient particle is left to give way.
 */
export function spawn(pool, spec) {
  if (!spec) return false;
  if (pool.n < pool.limit) { assign(pool.items[pool.n], spec); pool.n += 1; return true; }
  if (!spec.prio) return false;
  // Give a burst the oldest ambient slot.
  let pick = -1;
  let oldest = -1;
  for (let i = 0; i < pool.n; i += 1) {
    const p = pool.items[i];
    if (!p.prio && p.age / p.life > oldest) { oldest = p.age / p.life; pick = i; }
  }
  if (pick < 0) return false;
  assign(pool.items[pick], spec);
  return true;
}

/** Hold the live count under `limit` (the governor's share of the capacity); extra particles retire now. */
export function setLimit(pool, limit) {
  pool.limit = Math.max(0, Math.min(pool.cap, Math.floor(limit)));
  while (pool.n > pool.limit) retire(pool, pool.n - 1);
}

function retire(pool, i) {
  const last = pool.n - 1;
  if (i !== last) { const t = pool.items[i]; pool.items[i] = pool.items[last]; pool.items[last] = t; }
  pool.n = last;
}

/** Advance every live particle by dt seconds (clamped, so a tab coming back does not jump). */
export function step(pool, dtIn) {
  const dt = Math.min(0.05, Math.max(0, dtIn));
  for (let i = pool.n - 1; i >= 0; i -= 1) {
    const p = pool.items[i];
    if (p.delay > 0) { p.delay -= dt; continue; }
    p.age += dt;
    if (p.age >= p.life) { retire(pool, i); continue; }
    switch (p.kind) {
      case 'orbit': {
        p.ang += p.w * dt;
        p.x = p.cx + Math.cos(p.ang) * p.rad;
        p.y = p.cy + Math.sin(p.ang) * p.rad * p.tilt;
        break;
      }
      case 'seek': {
        const t = ease(p.age / p.life);
        const [x, y] = bezier(p.path, t);
        p.tx = p.x; p.ty = p.y;
        // Off the line a little, more in the middle: a stream, not a bead on a wire.
        const off = Math.sin(t * Math.PI) * p.jitter;
        p.x = x + off; p.y = y - off * 0.5;
        break;
      }
      case 'ring':
        break;
      default: {
        p.vx += p.ax * dt; p.vy += p.ay * dt;
        if (p.drag) { const d = Math.exp(-p.drag * dt); p.vx *= d; p.vy *= d; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.wob) p.x += Math.sin(p.age * p.wf * Math.PI * 2 + p.phase) * p.wob * dt;
      }
    }
  }
  return pool.n;
}

/** easeInOut for a seeker's ride: it leaves gently, hurries, and settles. */
export function ease(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

/**
 * How visible a particle is at its age (0..1): it fades in over the first
 * 12% and out over the last 45%; motes twinkle as they drift.
 */
export function envelope(p) {
  if (p.delay > 0) return 0;
  const t = p.age / p.life;
  const fin = Math.min(1, t / 0.12);
  const fout = t > 0.55 ? Math.max(0, 1 - (t - 0.55) / 0.45) : 1;
  const tw = p.kind === 'mote' || p.kind === 'glyph' ? 0.75 + 0.25 * Math.sin(p.age * 2.3 + p.phase * 3) : 1;
  return fin * fout * tw;
}
