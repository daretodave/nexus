// What each event looks like, and where. Pure: a scene (the stage's orbs, or
// the heads-down box's anchors, in canvas pixels), an event and a random
// source in, plain particle specs out; the runtime only pours them into the
// pool. Colours are token names (--st-tool, --sess), resolved by the runtime
// against the theme in force, so night and dawn both hold.
import { scaled } from './budget.js';

/** Half the orb's --size (nexus.css .orb-xl .. .orb-xs), in px. */
export const ORB_R = { xl: 44, l: 28, m: 20, s: 12, xs: 6 };

/**
 * Each orb state's particles, keyed like ORB_GLYPH and STATE_WORD: the
 * token, the ambient look around a live orb, and its rate per second.
 * thinking motes orbit, tool sparks fly off, writing drops ink flecks,
 * blocked sends a ripple out; done and failed are still (their burst is
 * the event, not a loop).
 */
export const STATE_FX = {
  idle: { token: '--st-idle', ambient: null, rate: 0 },
  thinking: { token: '--st-thinking', ambient: 'orbit', rate: 1.6 },
  tool: { token: '--st-tool', ambient: 'spark', rate: 2.4 },
  writing: { token: '--st-writing', ambient: 'ink', rate: 3 },
  blocked: { token: '--st-blocked', ambient: 'ripple', rate: 0.55 },
  done: { token: '--st-done', ambient: null, rate: 0 },
  failed: { token: '--st-failed', ambient: null, rate: 0 },
  fallen: { token: '--st-fallen', ambient: null, rate: 0 },
};

export const TONE_TOKEN = { tool: '--st-tool', writing: '--st-writing', spawn: '--st-thinking' };

/** Every token the effects name; the runtime resolves exactly these. */
export const FX_TOKENS = [
  '--st-idle', '--st-thinking', '--st-tool', '--st-writing', '--st-blocked', '--st-done', '--st-failed', '--st-fallen',
  '--sess', '--aurora-cyan', '--aurora-violet', '--aurora', '--star',
];

const CHEER = ['--st-done', '--aurora-cyan', '--aurora-violet', '--sess', '--st-blocked'];
const TAU = Math.PI * 2;

// ---- geometry ------------------------------------------------------------------

/** A point on the cubic bezier pts [[x,y] x4] at t (0..1). */
export function bezier(pts, t) {
  const u = 1 - t;
  const a = u * u * u; const b = 3 * u * u * t; const c = 3 * u * t * t; const d = t * t * t;
  return [a * pts[0][0] + b * pts[1][0] + c * pts[2][0] + d * pts[3][0], a * pts[0][1] + b * pts[1][1] + c * pts[2][1] + d * pts[3][1]];
}

/**
 * The stage in canvas pixels. input: { nodes (model.js view.nodes, at in %),
 * trayY (px, the dock's tray height) }. Orbs carry their state; packages and
 * junctions are anchors with none. The tug runs along the ask-tug filament
 * Cockpit draws: from the session orb down to the conversation's edge.
 */
export function stageScene(input, w, h) {
  const nodes = [];
  for (const n of input?.nodes || []) {
    if (!Array.isArray(n.at)) continue;
    const y = n.atTray ? h - (input.trayY || 0) - 64 : (n.at[1] / 100) * h;
    nodes.push({ key: n.key, x: (n.at[0] / 100) * w, y, r: ORB_R[n.size] || (n.pkg ? 30 : 8), state: n.pkg || n.junction ? null : n.state || 'idle', main: !!n.main });
  }
  const main = nodes.find((n) => n.main) || { x: w * 0.5, y: h * 0.3, r: ORB_R.xl };
  const top = h * 0.3;
  const bottom = Math.max(top + 40, h - (input?.trayY || h * 0.2));
  const tug = [[w * 0.5, top], [w * 0.275, top], [w * 0.225, bottom], [0, bottom]];
  return { mode: 'stage', w, h, nodes, main, tug, drop: { x: w * 0.5, y: h * 0.63 }, river: { y: h - 120 } };
}

/**
 * The heads-down box in canvas pixels. rect: the .tui box relative to the
 * canvas; grid: { rows, cols, bar: { row, col0, col1, head }, tape, prompt }
 * (row indexes into the rendered rows, columns into the 120). Each anchor is
 * a cell's centre.
 */
export function headsScene(rect, grid, w, h) {
  const cols = grid?.cols || 120;
  const rows = Math.max(1, grid?.rows || 1);
  // No grid (the start card): a terminal cell's usual size, so the motes still read as type.
  const cw = grid?.rows ? rect.width / cols : 9.6;
  const rh = grid?.rows ? rect.height / rows : 16;
  const cell = (row, col) => ({ x: rect.left + (col + 0.5) * cw, y: rect.top + (row + 0.5) * rh });
  const bar = grid?.bar && grid.bar.row >= 0 ? {
    x0: cell(grid.bar.row, grid.bar.col0).x,
    x1: cell(grid.bar.row, grid.bar.col1).x,
    head: cell(grid.bar.row, grid.bar.head ?? grid.bar.col0).x,
    y: cell(grid.bar.row, 0).y,
  } : null;
  const tape = grid?.tape >= 0 ? cell(grid.tape, 19) : null;
  const prompt = grid?.prompt >= 0 ? cell(grid.prompt, 4) : null;
  const centre = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  return { mode: 'heads', w, h, box: rect, cw, rh, bar, tape: tape || centre, prompt: prompt || centre, main: tape || centre, nodes: [] };
}

/**
 * The heads-down grid from headsModel's rows: how many rows and columns, the
 * phase track (rows tagged fx.kind 'bar', with its ends and head column), the
 * tape row an event lands on (the newest, else the last one written), and the
 * prompt row. Rows without a tag are -1 / null.
 */
export function headsGrid(rows) {
  const list = rows || [];
  const bar = list.findIndex((r) => r.fx?.kind === 'bar');
  const prompt = list.findIndex((r) => r.fx?.kind === 'prompt');
  let tape = list.findIndex((r) => r.isNew);
  if (tape < 0) {
    for (let i = list.length - 1; i >= 0; i -= 1) if (typeof list[i].key === 'string' && /^t\d/.test(list[i].key)) { tape = i; break; }
  }
  const b = bar >= 0 ? list[bar].fx : null;
  return {
    rows: list.length,
    cols: list[0]?.cells?.length || 120,
    bar: b ? { row: bar, col0: b.col0, col1: b.col1, head: b.head } : null,
    tape,
    prompt,
  };
}

/** The scene node an event's agent sits on, else the session orb. */
export function nodeFor(scene, agent) {
  return scene.nodes.find((n) => n.key === agent) || scene.main;
}

// ---- particle specs ------------------------------------------------------------
// A spec is the pool's input: { kind, x, y, vx, vy, ax, ay, drag, life, size, color, alpha, prio, ... }.
// Kinds: mote (soft glow, wobbling drift), ember (glow under gravity), spark (a streak along its velocity),
// orbit (circles a centre), ring (an expanding circle), seek (rides a bezier path), pixel and glyph (heads-down).

function radial(x, y, n, o, rng) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * TAU + rng() * (TAU / n);
    const sp = o.speed * (0.45 + rng() * 0.75);
    out.push({
      kind: o.kind || 'ember', x: x + Math.cos(a) * (o.r || 0), y: y + Math.sin(a) * (o.r || 0),
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ax: 0, ay: o.gravity || 0, drag: o.drag ?? 2.2,
      life: o.life * (0.7 + rng() * 0.6), size: o.size * (0.7 + rng() * 0.6), color: Array.isArray(o.color) ? o.color[i % o.color.length] : o.color,
      alpha: o.alpha ?? 1, prio: 1, glyph: o.glyphs ? o.glyphs[Math.floor(rng() * o.glyphs.length)] : undefined,
    });
  }
  return out;
}

function ring(x, y, color, { r0 = 6, r1 = 60, life = 0.9, size = 1.6, alpha = 0.9 } = {}) {
  return { kind: 'ring', x, y, vx: 0, vy: 0, ax: 0, ay: 0, drag: 0, life, size, r0, r1, color, alpha, prio: 1 };
}

function seekers(pts, color, n, rng, { life = 1.5, stagger = 0.5, size = 3, alpha = 0.9 } = {}) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    out.push({ kind: 'seek', x: pts[0][0], y: pts[0][1], vx: 0, vy: 0, ax: 0, ay: 0, drag: 0, life, delay: (i / Math.max(1, n)) * stagger + rng() * 0.05, size: size * (0.7 + rng() * 0.5), path: pts, jitter: (rng() - 0.5) * 10, color, alpha, prio: 1 });
  }
  return out;
}

/** A straight path as a bezier, for streaks along the heads-down phase track. */
function line(x0, y0, x1, y1) {
  return [[x0, y0], [x0 + (x1 - x0) / 3, y0], [x0 + ((x1 - x0) * 2) / 3, y1], [x1, y1]];
}

const PIXELS = ['■', '·', '+', '*'];

/**
 * The specs for one event in a scene. k: the burst scale (level x governor).
 * Unknown events make nothing.
 */
export function spawnsFor(ev, scene, rng, k = 1) {
  if (!ev || !scene || k <= 0) return [];
  if (scene.mode === 'heads') return headsSpawns(ev, scene, rng, k);
  const n = (c) => scaled(c, k);
  const at = nodeFor(scene, ev.agent);
  switch (ev.type) {
    case 'tool': {
      const color = TONE_TOKEN[ev.tone] || '--st-tool';
      return [
        ...radial(at.x, at.y, n(at.main ? 12 : 8), { kind: 'spark', speed: 210, life: 0.55, size: 1.4, color, r: at.r * 0.8, drag: 3.4 }, rng),
        ring(at.x, at.y, color, { r0: at.r * 0.9, r1: at.r * 1.9, life: 0.6, size: 1.2, alpha: 0.6 }),
      ];
    }
    case 'tool-done':
      if (ev.ok) return [ring(at.x, at.y, '--st-done', { r0: at.r, r1: at.r * 1.6, life: 0.5, size: 1, alpha: 0.45 })];
      return radial(at.x, at.y, n(14), { kind: 'spark', speed: 260, life: 0.6, size: 1.5, color: '--st-failed', r: at.r * 0.8, drag: 3 }, rng);
    case 'error':
      return [
        ...radial(at.x, at.y, n(18), { kind: 'spark', speed: 300, life: 0.7, size: 1.6, color: '--st-failed', r: at.r * 0.7, drag: 2.8, gravity: 140 }, rng),
        ring(at.x, at.y, '--st-failed', { r0: at.r, r1: at.r * 2.2, life: 0.7, size: 1.8 }),
      ];
    case 'agent-start': {
      const from = nodeFor(scene, ev.parent);
      const out = [ring(at.x, at.y, '--st-thinking', { r0: 2, r1: at.r * 2.4, life: 0.9, size: 1.4, alpha: 0.7 })];
      if (from !== at) out.push(...seekers([[from.x, from.y], [from.x, (from.y + at.y) / 2], [at.x, (from.y + at.y) / 2], [at.x, at.y]], '--st-thinking', n(6), rng, { life: 0.8, stagger: 0.3, size: 2.6 }));
      return out;
    }
    case 'agent-end':
      if (ev.ok) {
        return [
          ...radial(at.x, at.y, n(at.main ? 34 : 22), { speed: 170, life: 1.3, size: 3, color: ['--st-done', '--st-done', '--aurora-cyan'], r: at.r * 0.6, gravity: 40 }, rng),
          ring(at.x, at.y, '--st-done', { r0: at.r, r1: at.r * 2.8, life: 1.1, size: 2 }),
        ];
      }
      return [
        ...radial(at.x, at.y, n(20), { speed: 120, life: 1.2, size: 2.6, color: '--st-failed', r: at.r * 0.6, gravity: 220 }, rng),
        ring(at.x, at.y, '--st-failed', { r0: at.r, r1: at.r * 1.8, life: 0.8, size: 2 }),
      ];
    case 'result':
      return ev.ok
        ? [ring(scene.main.x, scene.main.y, '--st-done', { r0: scene.main.r, r1: scene.main.r * 3, life: 1.2, size: 1.6, alpha: 0.7 })]
        : radial(scene.main.x, scene.main.y, n(16), { kind: 'spark', speed: 240, life: 0.7, size: 1.5, color: '--st-failed', r: scene.main.r * 0.8 }, rng);
    case 'chunk':
      if (ev.stage === 'archive') return celebrate(scene.main.x, scene.main.y, scene, rng, k, true);
      if (ev.stage === 'gate') return [ring(scene.main.x, scene.main.y, '--st-tool', { r0: scene.main.r, r1: scene.main.r * 2.6, life: 1, size: 1.6, alpha: 0.75 })];
      if (ev.stage === 'claim') return [ring(scene.main.x, scene.main.y, '--sess', { r0: 4, r1: scene.main.r * 3.2, life: 1.3, size: 1.4, alpha: 0.7 })];
      return [];
    case 'landed':
      return celebrate(scene.drop.x, scene.drop.y, scene, rng, k, false);
    case 'ask':
    case 'tug':
      return [
        ring(at.x, at.y, '--st-blocked', { r0: at.r, r1: at.r * 2.2, life: 1, size: 1.6 }),
        ...seekers(scene.tug, '--st-blocked', n(14), rng, { life: 1.6, stagger: 0.9, size: 3.2 }),
      ];
    default:
      return [];
  }
}

/** The landing: a fountain of embers in the cheer colours, glitter, two rings. toRiver sends a shower down too. */
function celebrate(x, y, scene, rng, k, toRiver) {
  const n = (c) => scaled(c, k);
  const out = [
    ...radial(x, y, n(46), { speed: 260, life: 1.7, size: 3, color: CHEER, gravity: 120, drag: 1.6 }, rng),
    ...radial(x, y, n(26), { kind: 'spark', speed: 380, life: 0.9, size: 1.3, color: CHEER, drag: 2.4 }, rng),
    ring(x, y, '--st-done', { r0: 8, r1: 120, life: 1.2, size: 2.2 }),
    ring(x, y, '--aurora-cyan', { r0: 4, r1: 70, life: 0.9, size: 1.4, alpha: 0.7 }),
  ];
  if (toRiver) {
    const fall = n(10);
    for (let i = 0; i < fall; i += 1) {
      const ex = scene.drop.x + (rng() - 0.5) * scene.w * 0.3;
      out.push(...seekers([[x, y], [x, (y + scene.river.y) / 2], [ex, scene.drop.y], [ex, scene.river.y]], CHEER[i % CHEER.length], 1, rng, { life: 1.4 + rng() * 0.5, stagger: 0, size: 2.6 }));
    }
  }
  return out;
}

/** Heads-down: the terminal's look. Pixels and glyphs instead of glows, streaks along the phase track. */
function headsSpawns(ev, scene, rng, k) {
  const n = (c) => scaled(c, k);
  const tape = scene.tape;
  const px = Math.max(2, Math.round(scene.cw * 0.28));
  const streak = (color, to) => {
    if (!scene.bar) return [];
    const end = to ?? scene.bar.head;
    return [
      ...seekers(line(scene.bar.x0, scene.bar.y, end, scene.bar.y), color, n(18), rng, { life: 0.9, stagger: 0.35, size: px }),
      ...radial(end, scene.bar.y, n(12), { kind: 'pixel', speed: 110, life: 0.9, size: px, color, gravity: 90 }, rng),
    ];
  };
  switch (ev.type) {
    case 'tool': {
      const color = TONE_TOKEN[ev.tone] || '--st-tool';
      return radial(tape.x, tape.y, n(8), { kind: 'pixel', speed: 120, life: 0.7, size: px, color, drag: 3.2 }, rng);
    }
    case 'tool-done':
      return ev.ok ? [] : radial(tape.x, tape.y, n(12), { kind: 'pixel', speed: 150, life: 0.8, size: px, color: '--st-failed', gravity: 160 }, rng);
    case 'error':
      return radial(tape.x, tape.y, n(16), { kind: 'glyph', speed: 140, life: 0.9, size: scene.rh * 0.8, color: '--st-failed', gravity: 180, glyphs: ['✗', 'x', '!'] }, rng);
    case 'agent-end':
      return ev.ok ? radial(tape.x, tape.y, n(12), { kind: 'pixel', speed: 130, life: 1, size: px, color: '--st-done', gravity: 60 }, rng) : radial(tape.x, tape.y, n(12), { kind: 'pixel', speed: 110, life: 1, size: px, color: '--st-failed', gravity: 200 }, rng);
    case 'result':
      return ev.ok ? streak('--st-done') : radial(tape.x, tape.y, n(14), { kind: 'pixel', speed: 150, life: 0.9, size: px, color: '--st-failed', gravity: 160 }, rng);
    case 'chunk':
      if (ev.stage === 'archive') {
        return [
          ...streak('--st-done', scene.bar ? scene.bar.x1 : undefined),
          ...radial(scene.bar ? scene.bar.head : tape.x, scene.bar ? scene.bar.y : tape.y, n(30), { kind: 'glyph', speed: 200, life: 1.5, size: scene.rh * 0.9, color: CHEER, gravity: 120, glyphs: ['✓', '*', '+', '·', '◆'] }, rng),
        ];
      }
      return streak(ev.stage === 'gate' ? '--st-tool' : '--sess');
    case 'landed':
      return [
        ...streak('--st-done', scene.bar ? scene.bar.x1 : undefined),
        ...radial(tape.x, tape.y, n(24), { kind: 'pixel', speed: 220, life: 1.3, size: px, color: CHEER, gravity: 120 }, rng),
      ];
    case 'progress':
      return streak('--aurora-cyan');
    case 'ask':
    case 'tug':
      return seekers([[tape.x, tape.y], [tape.x + scene.cw * 20, tape.y], [scene.prompt.x + scene.cw * 20, scene.prompt.y], [scene.prompt.x, scene.prompt.y]], '--st-blocked', n(10), rng, { life: 1.4, stagger: 0.8, size: px });
    default:
      return [];
  }
}

// ---- ambient ---------------------------------------------------------------------

/**
 * The loops that run while nothing happens: the session's own drift on the
 * sky, each live orb's look, and, while a question waits, the tug's stream.
 * Hushed (a question or permission pending, or a start/review page): the
 * drift slows to a trickle and the orbs go still; only the tug moves.
 * Returns [{ key, kind, rate, node? }]; rate is per second, before the level.
 */
export function ambientEmitters(scene, { hushed = false, asking = false } = {}) {
  if (!scene) return [];
  const out = [];
  const area = (scene.w * scene.h) / (1280 * 800);
  if (scene.mode === 'heads') {
    out.push({ key: 'rise', kind: 'rise', rate: (hushed ? 1.2 : 5) * Math.max(0.4, area) });
    if (asking) out.push({ key: 'tug', kind: 'heads-tug', rate: 1.6 });
    return out;
  }
  out.push({ key: 'drift', kind: 'drift', rate: (hushed ? 1 : 5) * Math.max(0.4, area) });
  for (const n of scene.nodes) {
    const look = n.state ? STATE_FX[n.state] : null;
    if (!look || !look.ambient) continue;
    if (hushed && look.ambient !== 'ripple') continue;
    out.push({ key: `orb:${n.key}`, kind: look.ambient, rate: look.rate * (n.main ? 1.4 : 1), node: n });
  }
  if (asking) out.push({ key: 'tug', kind: 'tug', rate: 2.2 });
  return out;
}

// A rising glyph drifts at most 3px/s sideways for at most 13s: this far from the box it never reaches it.
const RISE_CLEAR = 40;
const RISE_GLYPHS = ['·', '·', '+', '*', '0', '1', '<', '>', '/', '{', '}', '■', '░', '$'];

/** One ambient particle for an emitter. */
export function ambientSpawn(em, scene, rng, { hushed = false } = {}) {
  const slow = hushed ? 0.35 : 1;
  switch (em.kind) {
    case 'drift': {
      // The session's colour, drifting up and across the sky; a few in the star tint for depth.
      const deep = rng() < 0.3;
      return {
        kind: 'mote', x: rng() * scene.w, y: scene.h * (0.15 + rng() * 0.9), vx: (rng() - 0.5) * 14 * slow, vy: -(6 + rng() * 14) * slow,
        ax: 0, ay: 0, drag: 0, life: 6 + rng() * 6, size: deep ? 1.4 + rng() : 2 + rng() * 2.6, color: deep ? '--star' : '--sess',
        alpha: deep ? 0.6 : 0.55, wob: 8 + rng() * 10, wf: 0.4 + rng() * 0.6, phase: rng() * TAU, prio: 0,
      };
    }
    case 'orbit': {
      const n = em.node;
      return {
        kind: 'orbit', x: n.x, y: n.y, cx: n.x, cy: n.y, rad: n.r * (1.25 + rng() * 0.5), ang: rng() * TAU, w: (rng() < 0.5 ? -1 : 1) * (0.9 + rng() * 0.8),
        tilt: 0.38 + rng() * 0.18, vx: 0, vy: 0, ax: 0, ay: 0, drag: 0, life: 2.6 + rng() * 2, size: 1.6 + rng() * 1.4, color: '--st-thinking', alpha: 0.85, prio: 0,
      };
    }
    case 'spark': {
      const n = em.node;
      const a = rng() * TAU;
      return {
        kind: 'spark', x: n.x + Math.cos(a) * n.r * 0.9, y: n.y + Math.sin(a) * n.r * 0.9, vx: Math.cos(a) * (60 + rng() * 70), vy: Math.sin(a) * (60 + rng() * 70),
        ax: 0, ay: 0, drag: 2.6, life: 0.5 + rng() * 0.4, size: 1.1, color: '--st-tool', alpha: 0.8, prio: 0,
      };
    }
    case 'ink': {
      const n = em.node;
      return {
        kind: 'ember', x: n.x + (rng() - 0.5) * n.r * 1.2, y: n.y + n.r * (0.4 + rng() * 0.4), vx: (rng() - 0.5) * 22, vy: 10 + rng() * 20,
        ax: 0, ay: 60, drag: 1.2, life: 0.9 + rng() * 0.6, size: 1.6 + rng() * 1.2, color: '--st-writing', alpha: 0.8, prio: 0,
      };
    }
    case 'ripple': {
      const n = em.node;
      return { kind: 'ring', x: n.x, y: n.y, vx: 0, vy: 0, ax: 0, ay: 0, drag: 0, life: 1.8, size: 1.3, r0: n.r * 0.9, r1: n.r * 2.4, color: '--st-blocked', alpha: 0.55, prio: 0 };
    }
    case 'tug': {
      const [s] = seekers(scene.tug, '--st-blocked', 1, rng, { life: 2.2, stagger: 0, size: 2.4, alpha: 0.75 });
      return { ...s, prio: 0 };
    }
    case 'heads-tug': {
      const [s] = spawnsFor({ type: 'ask' }, scene, rng, 0.1);
      return s ? { ...s, delay: 0, alpha: 0.6, prio: 0 } : null;
    }
    case 'rise': {
      // Terminal motes: glyphs and pixels rising up the sky, thicker at the bottom, in the session's colour. The box
      // has no background, so a glyph in the terminal's own face inside it would read as dim text in the tape: glyphs
      // keep to either side of it (RISE_CLEAR covers their sideways drift over a whole life), pixels go anywhere.
      const x = rng() * scene.w;
      const b = scene.box;
      const inBox = !!b && x > b.left - RISE_CLEAR && x < b.left + b.width + RISE_CLEAR;
      const glyph = !inBox && rng() < 0.55;
      const size = glyph ? Math.min(20, Math.max(9, scene.rh * (0.6 + rng() * 0.4))) : Math.max(2, Math.round((scene.cw || 8) * 0.25));
      return {
        kind: glyph ? 'glyph' : 'pixel', x, y: scene.h + 10 - rng() * scene.h * 0.25, vx: (rng() - 0.5) * 6, vy: -(14 + rng() * 26) * slow,
        ax: 0, ay: 0, drag: 0, life: 7 + rng() * 6, size, color: rng() < 0.75 ? '--sess' : '--star', alpha: glyph ? 0.28 : 0.4,
        glyph: glyph ? RISE_GLYPHS[Math.floor(rng() * RISE_GLYPHS.length)] : undefined, prio: 0,
      };
    }
    default:
      return null;
  }
}

/**
 * Fractional emission: carries each emitter's remainder between frames so a
 * rate of 0.5/s emits once every two seconds, not never. acc: { [key]: carry }.
 * Returns how many to emit now.
 */
export function emitCount(acc, key, rate, dt) {
  const v = (acc[key] || 0) + rate * dt;
  // A hair of slack: sixty sixtieths of a second add up to just under one in floating point.
  const whole = Math.floor(v + 1e-9);
  acc[key] = Math.max(0, v - whole);
  return whole;
}

/** A small seeded random source (mulberry32), so tests can pin the specs. */
export function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
