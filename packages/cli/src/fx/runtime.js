// The particle layer's browser half: one canvas, one requestAnimationFrame
// loop, the pool, and the page's tokens. Loaded on demand (FxLayer imports it
// inside an effect), so a static render and a reduced-motion browser never
// fetch it. It sizes the canvas to its box at the device's pixel ratio
// (capped at 2), sleeps while the tab is hidden or the layer is off-screen,
// and stops the loop outright when nothing is alive and nothing drifts.
import { budgetFor, createGovernor } from './budget.js';
import { drawPool, parseColor, themeLook } from './draw.js';
import { FX_TOKENS, ambientEmitters, ambientSpawn, emitCount, headsScene, spawnsFor, stageScene } from './effects.js';
import { createPool, setLimit, spawn, step } from './pool.js';

const MAX_DPR = 2;
const CAPACITY = budgetFor('on').cap;

/**
 * Start the layer on `canvas`. Returns { setScene, setState, emit, destroy }.
 * setScene(input): { mode: 'stage', nodes } or { mode: 'heads', target (a selector, element or ref), grid }.
 * setState({ level, hushed, asking }). emit(events): events from fx/events.js.
 */
export function createFx(canvas) {
  const ctx = canvas.getContext?.('2d');
  const host = canvas.parentElement;
  if (!ctx || !host) return { setScene() {}, setState() {}, emit() {}, destroy() {} };

  const pool = createPool(CAPACITY);
  const governor = createGovernor();
  const acc = {};
  const rng = Math.random;
  let input = null;
  let scene = null;
  let state = { level: 'on', hushed: false, asking: false };
  let size = { w: 0, h: 0, dpr: 1 };
  let colors = {};
  let sprites = {};
  let look = themeLook('dark');
  let font = 'monospace';
  let raf = 0;
  let last = 0;
  let visible = !document.hidden;
  let onScreen = true;
  let dead = false;

  // ---- tokens ------------------------------------------------------------------
  const probe = document.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none';
  host.appendChild(probe);
  const swatch = document.createElement('canvas');
  swatch.width = 1; swatch.height = 1;
  const sctx = swatch.getContext('2d', { willReadFrequently: true });

  /** A token as rgba, through the browser's own colour parser (color-mix, oklab and all). */
  function resolve(token) {
    // A layer outside any session class still reads: --sess falls back to the accent.
    probe.style.color = `var(${token}${token === '--sess' ? ', var(--aurora)' : ''})`;
    const css = getComputedStyle(probe).color;
    const quick = parseColor(css);
    if (quick || !sctx) return quick;
    sctx.clearRect(0, 0, 1, 1);
    sctx.fillStyle = '#000';
    sctx.fillStyle = css;
    sctx.fillRect(0, 0, 1, 1);
    const d = sctx.getImageData(0, 0, 1, 1).data;
    return d[3] ? [d[0], d[1], d[2], d[3] / 255] : null;
  }

  function sprite(c) {
    const s = document.createElement('canvas');
    s.width = 64; s.height = 64;
    const g = s.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    const [r, gr, b] = c;
    if (look.light) {
      // Dawn: a firmer core and a short falloff, so it reads as ink on paper, not fog.
      grad.addColorStop(0, `rgba(${r},${gr},${b},0.95)`);
      grad.addColorStop(0.3, `rgba(${r},${gr},${b},0.5)`);
      grad.addColorStop(1, `rgba(${r},${gr},${b},0)`);
    } else {
      grad.addColorStop(0, 'rgba(255,255,255,0.95)');
      grad.addColorStop(0.12, `rgba(${r},${gr},${b},0.9)`);
      grad.addColorStop(0.38, `rgba(${r},${gr},${b},0.28)`);
      grad.addColorStop(1, `rgba(${r},${gr},${b},0)`);
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return s;
  }

  function readTokens() {
    look = themeLook(document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
    colors = {};
    sprites = {};
    for (const t of FX_TOKENS) {
      const c = resolve(t);
      if (c) { colors[t] = c; sprites[t] = sprite(c); }
    }
    const f = getComputedStyle(host).getPropertyValue('--font-mono').trim();
    if (f) font = f;
  }
  readTokens();

  // ---- size and scene ------------------------------------------------------------
  function measure() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (w !== size.w || h !== size.h || dpr !== size.dpr) {
      size = { w, h, dpr };
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    if (!input) { scene = null; return; }
    if (input.mode === 'heads') {
      // A selector names the box beside the layer (heads-down's .tui); an element or a ref works too.
      const t = typeof input.target === 'string' ? host.parentElement?.querySelector(input.target) : input.target?.current || input.target;
      if (!t || !t.getBoundingClientRect) { scene = null; return; }
      const b = t.getBoundingClientRect();
      scene = headsScene({ left: b.left - r.left, top: b.top - r.top, width: b.width, height: b.height }, input.grid, w, h);
    } else {
      const trayY = parseFloat(getComputedStyle(host).getPropertyValue('--tray-y')) || 0;
      scene = stageScene({ nodes: input.nodes, trayY }, w, h);
    }
  }

  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { measure(); wake(); }) : null;
  ro?.observe(host);
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { onScreen = es.some((e) => e.isIntersecting); wake(); }) : null;
  io?.observe(canvas);
  const mo = new MutationObserver(() => { readTokens(); wake(); });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  const onVis = () => { visible = !document.hidden; wake(); };
  document.addEventListener('visibilitychange', onVis);
  // Heads-down's box scrolls when the window is narrow: its anchors move with it.
  const onMove = () => { if (input?.mode === 'heads') measure(); };
  window.addEventListener('scroll', onMove, true);
  window.addEventListener('resize', onMove);

  // ---- the loop --------------------------------------------------------------------
  function emitters() {
    return budgetFor(state.level).ambient > 0 ? ambientEmitters(scene, state) : [];
  }

  function frame(ts) {
    raf = 0;
    if (dead || !visible || !onScreen) return;
    try { tick(ts); } catch {
      // A broken frame stops the layer for good rather than throwing sixty times a second.
      dead = true;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function tick(ts) {
    const gap = last ? ts - last : 16.7;
    const dt = gap / 1000;
    last = ts;
    const t0 = performance.now();
    const b = budgetFor(state.level);
    const g = governor.scale();
    setLimit(pool, b.cap * g);
    const ems = scene ? emitters() : [];
    for (const em of ems) {
      const count = emitCount(acc, em.key, em.rate * b.ambient * g, dt);
      for (let i = 0; i < count; i += 1) spawn(pool, ambientSpawn(em, scene, rng, state));
    }
    step(pool, dt);
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    drawPool(ctx, pool, { color: (t) => colors[t], sprite: (t) => sprites[t], look, alpha: b.alpha, font });
    governor.feed(performance.now() - t0, gap);
    // Asleep when nothing lives and nothing drifts: no frames at all until the next event.
    if (pool.n > 0 || ems.length) raf = requestAnimationFrame(frame);
    else last = 0;
  }

  function wake() {
    if (dead || raf || !visible || !onScreen) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  return {
    setScene(next) {
      input = next;
      measure();
      wake();
    },
    setState(next) {
      state = { ...state, ...next };
      if (budgetFor(state.level).cap === 0) { pool.n = 0; ctx.clearRect(0, 0, canvas.width, canvas.height); }
      wake();
    },
    emit(events) {
      if (!events?.length || !scene || !visible) return;
      const b = budgetFor(state.level);
      const k = b.burst * governor.scale();
      for (const ev of events) for (const s of spawnsFor(ev, scene, rng, k)) spawn(pool, s);
      wake();
    },
    destroy() {
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      ro?.disconnect(); io?.disconnect(); mo.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      probe.remove();
    },
  };
}
