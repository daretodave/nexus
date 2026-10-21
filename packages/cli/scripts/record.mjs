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
    const length = recordLength({ script: demo.world.duration, speed: a.speed, seconds: a.seconds });
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
    if (a.session) {
      const s = demo.world.session(a.session);
      if (!s) throw new Error(`no session "${a.session}" in ${a.scenario}`);
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
