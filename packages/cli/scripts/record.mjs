// The recorder (spec 44 A2): a demo scenario, played in headless Chrome and captured at a fixed rate, encoded
// to a palette-optimised GIF and a still poster frame in plain JavaScript. No ffmpeg; no browser download
// (playwright-core drives the Chrome already installed).
//
//   npm run record -- <scenario> [--out <dir>] [--name <moment>] [--fps 12] [--width 960] [--height 600]
//                                [--theme night|dawn] [--speed 1] [--seconds <5-8>] [--session <name>]
//                                [--poster last|first|<ms>] [--chrome <path>] [--headed]
//
// It writes <out>/<moment>.gif and <out>/<moment>.png (default out: assets/gifs at the repo root, moment: the
// scenario's name) and fails loudly when the GIF misses the budget: 5 to 8 seconds, about 3 MB.
//
// The scenario runs in this process (server/demo.mjs) on a manual clock that stands still while the page loads
// and moves with the wall (times --speed) once capture starts, so frame one is the script's first moment.
// A scenario's `shot` (server/demo/scenarios.mjs) names the screen to open on and the clicks a drawn pointer
// makes, at script times: the fleet, a tile clicked, an answer picked. --session opens on that session's
// cockpit and makes no clicks.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { encodeGif, readGif } from './record/gif.mjs';
import { decodePng } from './record/png.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, '..');
const ROOT = path.resolve(PKG, '..', '..');
const MB = 1024 * 1024;

/** The README's budget for a GIF: 5 to 8 seconds, about 3 MB. */
export const BUDGET = Object.freeze({ minMs: 5000, maxMs: 8000, maxBytes: 3 * MB });

/** Every way a GIF misses the budget, as sentences; empty when it fits. */
export function budgetProblems({ durationMs, bytes }) {
  const out = [];
  const s = (ms) => `${(ms / 1000).toFixed(1)} s`;
  if (durationMs < BUDGET.minMs) out.push(`${s(durationMs)} long, under ${BUDGET.minMs / 1000} s`);
  if (durationMs > BUDGET.maxMs) out.push(`${s(durationMs)} long, over ${BUDGET.maxMs / 1000} s`);
  if (bytes > BUDGET.maxBytes) out.push(`${(bytes / MB).toFixed(2)} MB, over ${(BUDGET.maxBytes / MB).toFixed(2)} MB`);
  return out;
}

/** How long to record (ms): the script at its speed plus a 0.6 s hold on the end, kept inside the budget. */
export function recordLength({ script, speed = 1, seconds = null }) {
  if (seconds) return Math.round(seconds * 1000);
  return Math.min(BUDGET.maxMs, Math.max(BUDGET.minMs, Math.round(script / speed) + 600));
}

/**
 * Where a recording opens, the moves it makes and how long it holds: the scenario's `shot` (its `screen`, a path such
 * as /vault?panel=stack, opens there), or --session's cockpit with no moves. A move is `{ at, click, text?, what }` (press at `at`) or
 * `{ at, type, keys, ms, enter?, what }` (focus the field, type `keys` from `at` over `ms`, then Enter).
 */
export function shotFor(scenario, { session = null } = {}) {
  if (session) return { start: session, moves: [], seconds: null };
  const shot = scenario.shot || {};
  const moves = [...(shot.moves || [])].sort((x, y) => x.at - y.at);
  for (const m of moves) {
    const ok = Number.isFinite(m.at) && m.at >= 0 && (typeof m.click === 'string' && m.click
      ? true
      : typeof m.type === 'string' && m.type && typeof m.keys === 'string' && m.keys && Number.isFinite(m.ms) && m.ms >= 0);
    if (!ok) throw new Error(`${scenario.name}: a shot move is { at, click } or { at, type, keys, ms }: ${JSON.stringify(m)}`);
  }
  if (shot.screen != null && !(typeof shot.screen === 'string' && /^\/[\w/?=&.-]*$/.test(shot.screen))) throw new Error(`${scenario.name}: a shot's screen is a path on the page, like /vault?panel=stack`);
  return { start: shot.start || 'fleet', ...(shot.screen ? { screen: shot.screen } : {}), moves, seconds: shot.seconds || null };
}

// The drawn pointer: headless Chrome draws none, so the page gets one (an arrow and a ring that pulses on a
// press). It sits above everything, takes no events and survives route changes (it hangs off <body>).
const POINTER = `(() => {
  if (window.__nexusPointer) return;
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;left:0;top:0;width:28px;height:28px;z-index:2147483647;pointer-events:none;transition:transform 0ms linear,opacity 200ms;opacity:0;will-change:transform';
  el.innerHTML = '<span style="position:absolute;left:-14px;top:-14px;width:28px;height:28px;border-radius:50%;border:2px solid rgba(255,255,255,.9);opacity:0;transform:scale(.4);transition:opacity 260ms,transform 260ms"></span>'
    + '<svg width="22" height="24" viewBox="0 0 22 24" style="position:absolute;left:-3px;top:-2px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))"><path d="M3 2 L3 19 L7.5 15 L10.5 22 L13.5 20.7 L10.6 14 L17 14 Z" fill="#fff" stroke="#10131f" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  document.body.appendChild(el);
  const ring = el.firstChild;
  window.__nexusPointer = {
    place(x, y) { el.style.transitionDuration = '0ms, 200ms'; el.style.transform = 'translate(' + x + 'px,' + y + 'px)'; el.style.opacity = '1'; },
    move(x, y, ms) { el.style.transitionDuration = ms + 'ms, 200ms'; el.style.transitionTimingFunction = 'cubic-bezier(.45,.05,.25,1)'; el.style.transform = 'translate(' + x + 'px,' + y + 'px)'; },
    hide() { el.style.opacity = '0'; },
    press() { ring.style.transition = 'none'; ring.style.opacity = '1'; ring.style.transform = 'scale(.4)'; void ring.offsetWidth; ring.style.transition = 'opacity 380ms ease-out, transform 380ms ease-out'; ring.style.opacity = '0'; ring.style.transform = 'scale(1.5)'; },
  };
})()`;
const GLIDE = 650; // ms of wall time the pointer takes to reach what it clicks

/** Play a shot's moves against the page: glide to each target, press it at its script time, type if asked. */
async function play(page, moves, { speed, elapsed, width, height }) {
  if (!moves.length) return;
  const until = async (ms) => { const wait = ms - elapsed(); if (wait > 0) await new Promise((r) => setTimeout(r, wait)); };
  await page.evaluate(POINTER);
  await page.evaluate(([x, y]) => window.__nexusPointer.place(x, y), [Math.round(width * 0.62), Math.round(height * 0.92)]);
  for (const m of moves) {
    const sel = m.click || m.type;
    const what = m.what || sel;
    const target = page.locator(sel, m.click && m.text ? { hasText: m.text } : {}).first();
    const at = m.at / speed;
    await until(Math.max(0, at - GLIDE - 400));
    await target.waitFor({ state: 'visible', timeout: Math.max(1000, at - elapsed()) }).catch(() => {
      throw new Error(`the shot found nothing to ${m.click ? 'click' : 'type in'} for ${what} by ${(m.at / 1000).toFixed(1)} s`);
    });
    const centre = async () => { const b = await target.boundingBox(); return b ? [Math.round(b.x + Math.min(b.width / 2, 60)), Math.round(b.y + b.height / 2)] : null; };
    let xy = await centre();
    if (!xy) throw new Error(`the shot's ${what} has no box`);
    const glide = Math.max(0, Math.min(GLIDE, at - elapsed()));
    await page.evaluate(([x, y, ms]) => window.__nexusPointer.move(x, y, ms), [...xy, Math.round(glide)]);
    await until(at);
    xy = (await centre()) || xy;
    await page.evaluate(([x, y]) => { window.__nexusPointer.move(x, y, 60); window.__nexusPointer.press(); }, xy);
    await page.mouse.click(xy[0], xy[1]);
    if (m.type) {
      // One key at a time on the wall's schedule, so a slow key never stretches the line.
      const step = m.ms / speed / m.keys.length;
      for (let i = 0; i < m.keys.length; i++) {
        await until(at + i * step);
        await page.keyboard.type(m.keys[i]);
      }
      if (m.enter) { await until(at + m.ms / speed + 120); await page.keyboard.press('Enter'); }
    }
  }
  // The pointer bows out once the last move is made, so the end (and the poster) show the app alone.
  await until(elapsed() + 700);
  await page.evaluate(() => window.__nexusPointer.hide());
}

const USAGE = `  npm run record -- <scenario> [--out <dir>] [--name <moment>] [--fps 12] [--width 960] [--height 600]
                              [--theme night|dawn] [--speed 1] [--seconds <5-8>] [--session <name>]
                              [--poster last|first|<ms>] [--chrome <path>] [--headed]
  npm run record -- list`;

const VALUED = new Set(['--out', '--name', '--fps', '--width', '--height', '--theme', '--speed', '--seconds', '--session', '--poster', '--chrome']);

/** The command line, checked. Throws a sentence on anything it cannot use. */
export function parseArgs(argv) {
  const a = {
    scenario: null, moment: null, out: path.join(ROOT, 'assets', 'gifs'), fps: 12, width: 960, height: 600,
    theme: 'night', speed: 1, seconds: null, session: null, poster: 'last', chrome: null, headed: false, help: false,
  };
  const num = (flag, v, lo, hi, int = true) => {
    const n = Number(v);
    if (!Number.isFinite(n) || (int && !Number.isInteger(n)) || n < lo || n > hi) throw new Error(`${flag} takes ${int ? 'a whole number' : 'a number'} from ${lo} to ${hi}, not "${v}"`);
    return n;
  };
  const args = [...argv];
  while (args.length) {
    let t = args.shift();
    if (t === '--help' || t === '-h') { a.help = true; continue; }
    if (t === '--headed') { a.headed = true; continue; }
    if (!t.startsWith('--')) {
      if (a.scenario) throw new Error(`one scenario at a time ("${a.scenario}", then "${t}")`);
      a.scenario = t;
      continue;
    }
    let v;
    const eq = t.indexOf('=');
    if (eq > 0) { v = t.slice(eq + 1); t = t.slice(0, eq); } else v = args.shift();
    if (!VALUED.has(t)) throw new Error(`unknown flag ${t}`);
    if (v === undefined) throw new Error(`${t} needs a value`);
    switch (t) {
      case '--out': a.out = path.resolve(v); break;
      case '--name':
        if (!/^[a-z0-9][a-z0-9-]*$/.test(v)) throw new Error(`--name is a file name of lowercase letters, digits and dashes, not "${v}"`);
        a.moment = v; break;
      case '--fps': a.fps = num(t, v, 1, 30); break;
      case '--width': a.width = num(t, v, 320, 1920); break;
      case '--height': a.height = num(t, v, 240, 1200); break;
      case '--theme':
        if (v !== 'night' && v !== 'dawn') throw new Error(`--theme is night or dawn, not "${v}"`);
        a.theme = v; break;
      case '--speed': a.speed = num(t, v, 0.25, 4, false); break;
      case '--seconds': a.seconds = num(t, v, BUDGET.minMs / 1000, BUDGET.maxMs / 1000, false); break;
      case '--session': a.session = v; break;
      case '--poster':
        a.poster = v === 'last' || v === 'first' ? v : num(t, v, 0, BUDGET.maxMs); break;
      case '--chrome': a.chrome = v; break;
      default: throw new Error(`unknown flag ${t}`);
    }
  }
  if (!a.scenario && !a.help) throw new Error('name a scenario to record (npm run record -- list)');
  a.moment = a.moment || a.scenario;
  return a;
}

/** Record one scenario. Returns what it wrote and whether it fits the budget. */
export async function record(a, log = console.log) {
  const { startDemo } = await import('../server/demo.mjs');
  const { manualClock } = await import('../server/demo/clock.mjs');
  if (!fs.existsSync(path.join(PKG, 'dist', 'index.html'))) throw new Error('the UI is not built: run npm run build in packages/cli first');
  let chromium;
  try { ({ chromium } = await import('playwright-core')); } catch { throw new Error('playwright-core is missing: run npm ci in packages/cli'); }

  const clock = manualClock({ start: Date.now() });
  const demo = await startDemo({ scenario: a.scenario, clock });
  let browser;
  try {
    const shot = shotFor(demo.world.scenario, a);
    const length = recordLength({ script: demo.world.duration, speed: a.speed, seconds: a.seconds ?? shot.seconds });
    try {
      browser = await chromium.launch({ headless: !a.headed, ...(a.chrome ? { executablePath: a.chrome } : { channel: 'chrome' }) });
    } catch (e) {
      throw new Error(`could not start Chrome (${String(e.message).split('\n')[0]}): install Google Chrome or pass --chrome <path to chrome>`);
    }
    const context = await browser.newContext({
      viewport: { width: a.width, height: a.height }, deviceScaleFactor: 1,
      colorScheme: a.theme === 'dawn' ? 'light' : 'dark', reducedMotion: 'no-preference',
    });
    const page = await context.newPage();
    let url = demo.url;
    if (shot.screen) {
      // A screen of its own (the stack hand-off opens on /vault?panel=stack): the page reads the token from any path.
      const u = new URL(demo.url);
      const [p, q] = shot.screen.split('?');
      url = `${u.origin}${p}?${q ? `${q}&` : ''}t=${encodeURIComponent(demo.token)}`;
    } else if (shot.start !== 'fleet') {
      const s = demo.world.session(shot.start);
      if (!s) throw new Error(`no session "${shot.start}" in ${a.scenario}`);
      url = demo.urlFor(s.id);
    }
    await page.goto(url, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1500); // the first fetches land and the screen settles, the script still at 0
    const cdp = await context.newCDPSession(page);

    // Go: the clock follows the wall from here; capture on a fixed grid, skipping a slot rather than bunching.
    const t0 = performance.now();
    const elapsed = () => performance.now() - t0;
    let last = 0;
    clock.advance(0);
    const pump = setInterval(() => { const now = elapsed(); clock.advance((now - last) * a.speed); last = now; }, 5);
    const shots = [];
    const step = 1000 / a.fps;
    const moving = play(page, shot.moves, { speed: a.speed, elapsed, width: a.width, height: a.height }).then(() => null, (e) => e);
    try {
      for (let slot = 0; slot * step < length; ) {
        const wait = slot * step - elapsed();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        const at = elapsed();
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
        shots.push({ png: Buffer.from(data, 'base64'), at });
        slot = Math.max(slot + 1, Math.ceil(elapsed() / step));
      }
    } finally {
      clearInterval(pump);
    }
    const missed = await moving;
    if (missed) throw missed;

    const frames = shots.map((s) => {
      const img = decodePng(s.png);
      if (img.width !== a.width || img.height !== a.height) throw new Error(`a frame came back ${img.width}x${img.height}, not ${a.width}x${a.height}`);
      return { data: img.data, at: s.at };
    });
    const gif = encodeGif({ width: a.width, height: a.height, frames, end: length });
    const posterAt = a.poster === 'last' ? Infinity : a.poster === 'first' ? -Infinity : a.poster;
    const poster = shots.reduce((best, s) => (Math.abs(s.at - posterAt) < Math.abs(best.at - posterAt) || (posterAt === Infinity && s.at > best.at) ? s : best), shots[0]);

    fs.mkdirSync(a.out, { recursive: true });
    const gifPath = path.join(a.out, `${a.moment}.gif`);
    const pngPath = path.join(a.out, `${a.moment}.png`);
    fs.writeFileSync(gifPath, gif);
    fs.writeFileSync(pngPath, poster.png);

    const back = readGif(gif);
    const result = {
      gif: gifPath, poster: pngPath, bytes: gif.length, durationMs: back.duration, frames: back.frames.length,
      captured: shots.length, fps: shots.length / (length / 1000), colours: back.palette.length / 3,
      width: a.width, height: a.height, script: demo.world.duration, problems: budgetProblems({ durationMs: back.duration, bytes: gif.length }),
    };
    const rel = (p) => path.relative(process.cwd(), p) || p;
    log(`  wrote ${rel(gifPath)}  ${(result.durationMs / 1000).toFixed(2)} s · ${(result.bytes / MB).toFixed(2)} MB · ${a.width}x${a.height} · ${result.frames} frames (${result.captured} captured, ${result.fps.toFixed(1)} fps of ${a.fps})`);
    log(`  wrote ${rel(pngPath)}  the poster (the ${typeof a.poster === 'number' ? 'frame nearest' : a.poster + ' frame,'} ${(poster.at / 1000).toFixed(2)} s), for readers who ask for less motion`);
    if (result.fps < a.fps * 0.8) log(`  note: capture kept ${result.fps.toFixed(1)} of ${a.fps} fps; try a lower --fps or a smaller --width`);
    return result;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await demo.close().catch(() => {});
  }
}

async function main() {
  let a;
  try { a = parseArgs(process.argv.slice(2)); } catch (e) { console.error(`  ${e.message}\n\n${USAGE}`); process.exit(2); }
  if (a.help) { console.log(USAGE); return; }
  const { SCENARIOS, scenarioNames } = await import('../server/demo/scenarios.mjs');
  if (a.scenario === 'list' || !SCENARIOS[a.scenario]) {
    const rows = scenarioNames().map((n) => `  ${n.padEnd(17)}${SCENARIOS[n].summary}`).join('\n');
    if (a.scenario !== 'list') console.error(`  no demo scenario "${a.scenario}"\n`);
    console.log(rows);
    process.exit(a.scenario === 'list' ? 0 : 2);
  }
  let r;
  try { r = await record(a); } catch (e) { console.error(`  record failed: ${e.message}`); process.exit(1); }
  if (r.problems.length) {
    console.error(`\n  OVER BUDGET: ${r.problems.join('; ')}.\n  The budget is ${BUDGET.minMs / 1000} to ${BUDGET.maxMs / 1000} s and ${(BUDGET.maxBytes / MB).toFixed(0)} MB; the files are left for a look, not for the README.`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
