// The walk (spec 56 A2): demo scenarios, each screen opened in headless Chrome at two viewports, with what the
// page says and does written down. It observes and never asserts: findings land in walk.json, the run exits 0.
//
//   npm run walk -- [--scenarios fleet-to-tug,stack,grill-me|all] [--routes /,/inbox,...|all]
//                   [--viewports desktop,mobile] [--reduced-motion] [--out <dir>] [--settle 1200]
//                   [--chrome <path>] [--json]
//
// Each screen gets a fresh browser context. The walk waits for load, document.fonts.ready and a settle time,
// then records the final path, console errors, page errors, failed requests and 5xx, any 4xx on an endpoint the
// scenario stages (an endpoint the demo does not stage answers 404 by design, and is allow-listed), horizontal
// overflow, buttons and links with no name, images with no alt, and one PNG.
//
// It writes <out>/walk.json and the PNGs (default out: .scratch/walk/<iso>/ at the repo root, gitignored).
// Exit 0 with findings in the JSON; 1 when the UI is not built or the demo fails; 2 on a bad flag or no Chrome.
// Never a CI gate and never a screenshot diff: the loop reads the findings and decides.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, '..');
const ROOT = path.resolve(PKG, '..', '..');

/** The screens a walk opens by default: every route App.jsx draws, the onboarding at its first step. */
export const ROUTES = Object.freeze(['/', '/inbox', '/inbox/grill', '/board', '/cloud', '/settings', '/recover', '/git', '/vault', '/design', '/heads-down', '/onboarding/welcome']);
export const VIEWPORTS = Object.freeze({ desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } });
export const DEFAULT_SCENARIOS = Object.freeze(['fleet-to-tug', 'stack', 'grill-me']);
const CAP = 20; // at most this many lines of one kind per screen
const LINE = 300; // characters kept of one line

const USAGE = `  npm run walk -- [--scenarios fleet-to-tug,stack,grill-me|all] [--routes /,/inbox,...|all]
                  [--viewports desktop,mobile] [--reduced-motion] [--out <dir>] [--settle 1200]
                  [--chrome <path>] [--json]`;

const VALUED = new Set(['--scenarios', '--routes', '--viewports', '--out', '--settle', '--chrome']);

/** A folder name for this run: the ISO time, safe on every file system. */
export const stamp = (d = new Date()) => d.toISOString().replace(/[:.]/g, '-');

const list = (v) => String(v).split(',').map((s) => s.trim()).filter(Boolean);

/** The command line, checked. `names` is the demo's scenario names. Throws a sentence on anything it cannot use. */
export function parseArgs(argv, { names = [], now = new Date() } = {}) {
  const a = {
    scenarios: [...DEFAULT_SCENARIOS], routes: [...ROUTES], viewports: Object.keys(VIEWPORTS), reducedMotion: false,
    out: path.join(ROOT, '.scratch', 'walk', stamp(now)), settle: 1200, chrome: null, json: false, help: false,
  };
  const args = [...argv];
  while (args.length) {
    let t = args.shift();
    if (t === '--help' || t === '-h') { a.help = true; continue; }
    if (t === '--json') { a.json = true; continue; }
    if (t === '--reduced-motion') { a.reducedMotion = true; continue; }
    if (!t.startsWith('--')) throw new Error(`unexpected "${t}": every option is a flag`);
    let v;
    const eq = t.indexOf('=');
    if (eq > 0) { v = t.slice(eq + 1); t = t.slice(0, eq); } else v = args.shift();
    if (!VALUED.has(t)) throw new Error(`unknown flag ${t}`);
    if (v === undefined || v === '') throw new Error(`${t} needs a value`);
    switch (t) {
      case '--scenarios': {
        const s = v === 'all' ? [...names] : list(v);
        const bad = s.filter((n) => !names.includes(n));
        if (bad.length) throw new Error(`no demo scenario ${bad.map((n) => `"${n}"`).join(', ')} (try: ${names.join(', ')})`);
        if (!s.length) throw new Error('--scenarios names at least one scenario');
        a.scenarios = [...new Set(s)];
        break;
      }
      case '--routes': {
        // A route without its leading slash is taken as meant (some shells rewrite a bare /path into a file path).
        const r = v === 'all' ? [...ROUTES] : list(v).map((x) => (x.startsWith('/') ? x : `/${x}`));
        const bad = r.filter((x) => !/^\/[\w/?=&.-]*$/.test(x));
        if (bad.length) throw new Error(`a route is a path on the page, like /inbox or /vault?panel=stack, not ${bad.map((x) => `"${x}"`).join(', ')}`);
        if (!r.length) throw new Error('--routes names at least one route');
        a.routes = [...new Set(r)];
        break;
      }
      case '--viewports': {
        const vp = list(v);
        const bad = vp.filter((x) => !VIEWPORTS[x]);
        if (bad.length || !vp.length) throw new Error(`--viewports takes ${Object.keys(VIEWPORTS).join(', ')}, not "${v}"`);
        a.viewports = [...new Set(vp)];
        break;
      }
      case '--out': a.out = path.resolve(v); break;
      case '--settle': {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 0 || n > 30000) throw new Error(`--settle takes a whole number of ms from 0 to 30000, not "${v}"`);
        a.settle = n;
        break;
      }
      case '--chrome': a.chrome = v; break;
      default: throw new Error(`unknown flag ${t}`);
    }
  }
  return a;
}

// ---- The allow-list: the endpoints a scenario stages, read from the demo's own source ----

/**
 * The routes a demo source answers: every `case 'METHOD /api/...'` and `route === 'METHOD /api/...'` literal, and
 * every route pattern (`/^METHOD \/api\/...$/`). Read from the source so the allow-list follows the demo by itself.
 * -> { exact: Set<'METHOD /api/path'>, patterns: RegExp[] }
 */
export function stagedRoutes(...sources) {
  const exact = new Set();
  const patterns = [];
  for (const src of sources) {
    for (const m of src.matchAll(/(?:case\s+|route\s*===\s*)'((?:GET|POST|PUT|PATCH|DELETE) \/api\/[^']*)'/g)) exact.add(m[1]);
    for (const m of src.matchAll(/\/\^((?:GET|POST|PUT|PATCH|DELETE|\((?:\?:)?[A-Z|]+\)) \\\/api\\\/[^\n]*?)\$\/(?=\.(?:exec|test)\b)/g)) {
      try { patterns.push(new RegExp(`^${m[1]}$`)); } catch { /* a pattern the walk cannot read is left out, never guessed */ }
    }
  }
  return { exact, patterns };
}

/** Whether `METHOD /api/path` is a route the staged set answers. */
export function isStaged(staged, method, pathname) {
  const route = `${String(method).toUpperCase()} ${pathname}`;
  if (pathname === '/api/hello' && route === 'GET /api/hello') return true;
  return staged.exact.has(route) || staged.patterns.some((p) => p.test(route));
}

/**
 * The allow-list for one scenario: the demo's own routes, plus the repo-start stage's when the scenario has one
 * (a scenario with no stage does not answer those, so they read as not served there). Reads the source files.
 */
export function stagedFor({ hasStage }) {
  const demo = fs.readFileSync(path.join(PKG, 'server', 'demo.mjs'), 'utf8');
  const stage = hasStage ? fs.readFileSync(path.join(PKG, 'server', 'demo', 'repo-start.mjs'), 'utf8') : '';
  return stagedRoutes(demo, stage);
}

// ---- The finding rules (pure) ----

/** A line with the launch token taken out and cut to length, so walk.json never carries the token. */
export function redact(text, token) {
  let s = String(text ?? '');
  if (token) s = s.split(token).join('<token>').split(encodeURIComponent(token)).join('<token>');
  s = s.replace(/https?:\/\/(?:127\.0\.0\.1|localhost):\d+/g, '');
  return s.length > LINE ? `${s.slice(0, LINE - 1)}…` : s;
}

/** A URL as walk.json shows it: the path and query, the token out. */
export function shortUrl(u, token) {
  try { const x = new URL(u); return redact(`${x.pathname}${x.search}`, token); } catch { return redact(u, token); }
}

/**
 * What one response says, by the rules: null when nothing is wrong. 5xx is always a finding; a 4xx is one unless it
 * is on an /api/ endpoint the scenario does not stage (the demo answers those 404 by design: "not served").
 * -> null | { kind: '5xx' | '4xx', line } | { kind: 'allowed', line }
 */
export function classifyResponse({ method, url, status }, staged, token) {
  if (!(status >= 400)) return null;
  let pathname = '';
  try { const u = new URL(url); pathname = u.pathname; } catch { pathname = String(url); }
  const line = `${status} ${method} ${shortUrl(url, token)}`;
  if (status >= 500) return { kind: '5xx', line };
  if (status === 404 && pathname.startsWith('/api/') && !isStaged(staged, method, pathname)) return { kind: 'allowed', line };
  return { kind: '4xx', line };
}

/** Whether a failed request is a finding: a request the page itself dropped (a navigation, a closed stream) is not. */
export function isRealFailure({ failure }) {
  return !/ERR_ABORTED|NS_BINDING_ABORTED/i.test(String(failure || ''));
}

/**
 * Whether a console error is kept. Chrome logs "Failed to load resource" for every 4xx; that line is dropped when
 * its URL is one the allow-list covers (the response rule already decided it) and kept otherwise.
 */
export function keepConsole({ type, text, url }, allowedUrls) {
  if (type !== 'error') return false;
  if (/^Failed to load resource\b/.test(String(text)) && url && allowedUrls.has(url)) return false;
  return true;
}

/** A kept console line as walk.json shows it: a resource that failed to load names its URL (Chrome's line does not). */
export function consoleLine({ text, url }, token) {
  const t = String(text ?? '');
  return redact(/^Failed to load resource\b/.test(t) && url ? `${t} (${shortUrl(url, token)})` : t, token);
}

/** Horizontal overflow in CSS pixels: how far the page scrolls sideways past the viewport, never negative. */
export function overflowOf({ scrollWidth, clientWidth }) {
  const n = Math.round(Number(scrollWidth) - Number(clientWidth));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * A control's accessible name, as near as the walk needs it: aria-label, then aria-labelledby's text, the visible
 * text, title, the alt of an image inside, then an <svg><title>. Empty when it has none.
 */
export function nameOf(row) {
  for (const k of ['ariaLabel', 'labelledBy', 'text', 'title', 'imgAlt', 'svgTitle']) {
    const v = String(row?.[k] ?? '').replace(/\s+/g, ' ').trim();
    if (v) return v;
  }
  return '';
}

/** The buttons and links with no name, each by its short selector (`what`), at most CAP of them, no repeats. */
export function unnamedOf(rows) {
  const out = [];
  for (const r of rows || []) {
    if (r.hidden || nameOf(r)) continue;
    if (!out.includes(r.what)) out.push(r.what);
    if (out.length >= CAP) break;
  }
  return out;
}

/** Images with no alt attribute at all (alt="" marks one decorative and is fine), unless hidden from assistive tech. */
export function noAltOf(rows, token) {
  const out = [];
  for (const r of rows || []) {
    if (r.hidden || r.alt != null || r.ariaHidden || r.role === 'presentation' || r.role === 'none') continue;
    const line = r.src ? shortUrl(r.src, token) : r.what;
    if (!out.includes(line)) out.push(line);
    if (out.length >= CAP) break;
  }
  return out;
}

/** The PNG's file name for one screen: scenario, viewport and route, in letters, digits and dashes. */
export function pngName(scenario, viewport, route) {
  const slug = route === '/' ? 'fleet' : route.replace(/^\//, '').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '') || 'fleet';
  return `${scenario}--${viewport}--${slug}.png`;
}

/** The page URL for a route with the launch token on it (the page reads `t` from any path). */
export function screenUrl(origin, route, token) {
  const [p, q] = route.split('?');
  return `${origin}${p}?${q ? `${q}&` : ''}t=${encodeURIComponent(token)}`;
}

/** The final path the screen landed on, as walk.json shows it: the token out, the route's own query kept. */
export function finalPath(u) {
  try {
    const x = new URL(u);
    x.searchParams.delete('t');
    const q = x.searchParams.toString();
    return `${x.pathname}${q ? `?${q}` : ''}`;
  } catch { return String(u); }
}

/** How many findings one screen holds (the human summary's count; walk.json keeps the lines). */
export function findingCount(s) {
  return s.console.length + s.pageErrors.length + s.failed.length + (s.overflowPx > 0 ? 1 : 0) + s.unnamed.length + s.noAlt.length;
}

// In the page: the raw facts the pure rules decide on. Serialised by playwright, so it uses the DOM alone.
function domFacts() {
  const hiddenOf = (el) => !!el.closest('[aria-hidden="true"],[hidden],[inert]') || !el.getClientRects().length;
  const what = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += `#${el.id}`;
    const cls = [...el.classList].slice(0, 2);
    if (cls.length) s += `.${cls.join('.')}`;
    const href = el.getAttribute('href');
    if (href && el.tagName === 'A') s += `[href="${href.replace(/[?#].*$/, '')}"]`;
    return s;
  };
  const textOf = (ids) => (ids || '').split(/\s+/).filter(Boolean).map((id) => document.getElementById(id)?.textContent || '').join(' ');
  const controls = [...document.querySelectorAll('button, a[href], [role="button"], [role="link"]')].map((el) => ({
    what: what(el),
    hidden: hiddenOf(el),
    ariaLabel: el.getAttribute('aria-label') || '',
    labelledBy: textOf(el.getAttribute('aria-labelledby')),
    text: el.innerText || el.textContent || '',
    title: el.getAttribute('title') || '',
    imgAlt: [...el.querySelectorAll('img[alt]')].map((i) => i.getAttribute('alt')).join(' '),
    svgTitle: [...el.querySelectorAll('svg title')].map((t) => t.textContent).join(' '),
  }));
  const images = [...document.querySelectorAll('img')].map((el) => ({
    what: what(el), hidden: hiddenOf(el), alt: el.getAttribute('alt'), src: el.currentSrc || el.getAttribute('src') || '',
    ariaHidden: el.getAttribute('aria-hidden') === 'true', role: el.getAttribute('role') || '',
  }));
  const doc = document.documentElement;
  return { controls, images, scrollWidth: Math.max(doc.scrollWidth, document.body ? document.body.scrollWidth : 0), clientWidth: doc.clientWidth };
}

/** Open one screen in a fresh context and write down what it shows. */
async function walkScreen(browser, demo, { scenario, route, viewport, a, staged }) {
  const vp = VIEWPORTS[viewport];
  const context = await browser.newContext({
    viewport: vp, deviceScaleFactor: 1, colorScheme: 'dark',
    reducedMotion: a.reducedMotion ? 'reduce' : 'no-preference',
  });
  const token = demo.token;
  const consoleLines = [];
  const pageErrors = [];
  const failed = [];
  const allowedUrls = new Set();
  let open = true;
  try {
    const page = await context.newPage();
    page.on('response', (r) => {
      if (!open) return;
      const c = classifyResponse({ method: r.request().method(), url: r.url(), status: r.status() }, staged, token);
      if (!c) return;
      if (c.kind === 'allowed') allowedUrls.add(r.url());
      else failed.push(c.line);
    });
    page.on('requestfailed', (q) => {
      if (!open) return;
      const failure = q.failure()?.errorText || 'failed';
      if (isRealFailure({ failure })) failed.push(`failed ${q.method()} ${shortUrl(q.url(), token)} ${failure}`);
    });
    page.on('console', (m) => {
      if (!open) return;
      const c = { type: m.type(), text: m.text(), url: m.location()?.url };
      if (keepConsole(c, allowedUrls)) consoleLines.push(consoleLine(c, token));
    });
    page.on('pageerror', (e) => { if (open) pageErrors.push(redact(e && e.message ? e.message : e, token)); });

    await page.goto(screenUrl(new URL(demo.url).origin, route, token), { waitUntil: 'load', timeout: 30000 });
    await page.evaluate(() => document.fonts.ready.then(() => true));
    await page.waitForTimeout(a.settle);
    const png = pngName(scenario, viewport, route);
    await page.screenshot({ path: path.join(a.out, png) });
    const facts = await page.evaluate(domFacts);
    const final = finalPath(page.url());
    open = false;
    const cap = (xs) => [...new Set(xs)].slice(0, CAP);
    return {
      scenario, route, viewport, path: final,
      console: cap(consoleLines), pageErrors: cap(pageErrors), failed: cap(failed),
      overflowPx: overflowOf(facts), unnamed: unnamedOf(facts.controls), noAlt: noAltOf(facts.images, token), png,
    };
  } finally {
    open = false;
    await context.close().catch(() => {});
  }
}

/** The whole walk. Throws an Error with `.exit` (1 or 2) on what stops it; findings never throw. */
export async function walk(a, log = () => {}) {
  const dist = a.dist || path.join(PKG, 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    throw Object.assign(new Error('the UI is not built: run npm run build in packages/cli first'), { exit: 1 });
  }
  let chromium;
  try { ({ chromium } = await import('playwright-core')); } catch { throw Object.assign(new Error('playwright-core is missing: run npm ci in packages/cli'), { exit: 1 }); }
  const { startDemo } = await import('../server/demo.mjs');
  const { createRepoStage } = await import('../server/demo/repo-start.mjs');
  const { realClock } = await import('../server/demo/clock.mjs');

  const t0 = Date.now();
  const started = new Date(t0).toISOString();
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(a.chrome ? { executablePath: a.chrome } : { channel: 'chrome' }) });
  } catch (e) {
    throw Object.assign(new Error(`could not start Chrome (${String(e.message).split('\n')[0]}): install Google Chrome or pass --chrome <path to chrome>`), { exit: 2 });
  }
  const screens = [];
  try {
    fs.mkdirSync(a.out, { recursive: true });
    for (const scenario of a.scenarios) {
      const staged = stagedFor({ hasStage: !!createRepoStage(scenario, { clock: realClock() }) });
      let demo;
      try { demo = await startDemo({ scenario, dist }); } catch (e) { throw Object.assign(new Error(`the demo "${scenario}" did not start: ${e.message}`), { exit: 1 }); }
      try {
        for (const viewport of a.viewports) {
          for (const route of a.routes) {
            const s = await walkScreen(browser, demo, { scenario, route, viewport, a, staged });
            screens.push(s);
            log(s);
          }
        }
      } finally {
        await demo.close().catch(() => {});
      }
    }
    const result = {
      started, ms: Date.now() - t0, chrome: browser.version(),
      scenarios: a.scenarios, routes: a.routes, viewports: a.viewports, reducedMotion: a.reducedMotion,
      screens,
    };
    fs.writeFileSync(path.join(a.out, 'walk.json'), `${JSON.stringify(result, null, 2)}\n`);
    return result;
  } finally {
    await browser.close().catch(() => {});
  }
}

async function main() {
  const { scenarioNames } = await import('../server/demo/scenarios.mjs');
  let a;
  try { a = parseArgs(process.argv.slice(2), { names: scenarioNames() }); } catch (e) { console.error(`  ${e.message}\n\n${USAGE}`); process.exit(2); }
  if (a.help) { console.log(USAGE); return; }
  const say = a.json ? (s) => process.stderr.write(`${s}\n`) : (s) => console.log(s);
  const rel = (p) => path.relative(process.cwd(), p) || p;
  let r;
  try {
    r = await walk(a, (s) => {
      const n = findingCount(s);
      say(`  ${n ? String(n).padStart(3) : '  .'}  ${s.scenario.padEnd(14)} ${s.viewport.padEnd(8)}${s.route}${s.path !== s.route ? ` -> ${s.path}` : ''}`);
    });
  } catch (e) {
    console.error(`  walk stopped: ${e.message}`);
    process.exit(e.exit || 1);
  }
  const total = r.screens.reduce((n, s) => n + findingCount(s), 0);
  if (a.json) process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
  say(`  ${r.screens.length} screens in ${(r.ms / 1000).toFixed(1)} s (${r.chrome}); ${total} finding${total === 1 ? '' : 's'}; wrote ${rel(path.join(a.out, 'walk.json'))}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
