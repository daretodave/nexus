// ui-walk.mjs end to end: a local static fixture site walked in the installed Chrome by each driver (cdp, playwright,
// screenshot), its findings read back from walk.json, and the server's own log checked for any credential.
// Spawns Chrome; skips a driver cleanly when Chrome, a global WebSocket or playwright-core is not there. Offline.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findChrome, loadPlaywright, parseArgs, walk } from '../ui-walk.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const chrome = findChrome();
const noChrome = chrome ? false : 'no Chrome installed (set CHROME_PATH to run this)';

const PAGES = {
  '/': `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Home</title><style>body{margin:0;font:16px sans-serif}</style></head>
<body><main><h1>Home</h1><a href="/broken">Broken page</a><button>Go</button><img src="/dot.svg" alt=""></main></body></html>`,
  '/broken': `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Broken</title><style>body{margin:0}.wide{width:2000px;height:10px;background:#c33}</style></head>
<body><div class="wide"></div><button class="icon"></button><img src="/missing.png">
<script>console.error('fixture console error'); setTimeout(() => { throw new Error('fixture page error'); }, 0);</script></body></html>`,
};
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>';

let server, base;
const seen = [];

before(async () => {
  server = http.createServer((req, res) => {
    seen.push({ url: req.url, cookie: req.headers.cookie, authorization: req.headers.authorization });
    const u = new URL(req.url, 'http://x');
    const p = u.pathname;
    if (PAGES[p]) { res.writeHead(200, { 'content-type': 'text/html' }); res.end(PAGES[p]); return; }
    if (p === '/dot.svg') { res.writeHead(200, { 'content-type': 'image/svg+xml' }); res.end(SVG); return; }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not here');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((r) => { server.close(r); server.closeAllConnections(); }));

/** playwright-core from the project, else nexus's GUI package (the kit's own checkout); null when neither. */
async function playwright() {
  const own = await loadPlaywright();
  if (own) return own;
  try {
    const req = createRequire(path.resolve(HERE, '..', '..', '..', 'packages', 'cli', 'package.json'));
    const m = await import(pathToFileURL(req.resolve('playwright-core')).href);
    return m.chromium || m.default?.chromium || null;
  } catch { return null; }
}

async function walkWith(driver, deps = {}) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ui walk run '));
  const bearings = `**UI:** \`url ${base}\`\n\n**UI routes:** \`/\`, \`/broken\`\n`;
  const r = await walk(parseArgs(['--out', out, '--driver', driver, '--settle', '300']), () => {}, { readFile: () => bearings, ...deps });
  return { r, out, json: JSON.parse(fs.readFileSync(path.join(out, 'walk.json'), 'utf8')) };
}

function checkFindings({ r, out, json }, driver) {
  assert.equal(json.driver, driver);
  assert.equal(json.auth, 'anonymous');
  assert.match(json.untrusted, /never instructions/);
  assert.deepEqual(json.screens.map((s) => `${s.viewport} ${s.route}`), ['desktop /', 'desktop /broken', 'mobile /', 'mobile /broken']);
  for (const s of json.screens) {
    assert.equal(s.scenario, 'url');
    assert.ok(s.png && fs.statSync(path.join(out, s.png)).size > 100, `${s.png} written`);
  }
  const home = json.screens[0];
  assert.deepEqual([home.console, home.pageErrors, home.failed, home.overflowPx, home.unnamed, home.noAlt], [[], [], [], 0, [], []]);
  const broken = json.screens.find((s) => s.viewport === 'mobile' && s.route === '/broken');
  assert.ok(broken.console.some((l) => l.includes('fixture console error')), broken.console.join(' | '));
  assert.ok(broken.pageErrors.some((l) => l.includes('fixture page error')), broken.pageErrors.join(' | '));
  assert.ok(broken.failed.includes('404 GET /missing.png'), broken.failed.join(' | '));
  assert.ok(broken.overflowPx > 1000, `overflow ${broken.overflowPx}`);
  assert.deepEqual(broken.unnamed, ['button.icon']);
  assert.deepEqual(broken.noAlt, ['/missing.png']);
  assert.equal(r.screens.length, 4);
}

describe('the walk in Chrome', { concurrency: false }, () => {
  it('cdp: the zero-dependency driver finds every kind of finding', { skip: noChrome || (typeof WebSocket !== 'function' && 'no global WebSocket (Node 22+)') }, async () => {
    checkFindings(await walkWith('cdp'), 'cdp');
  });

  it('playwright: the same findings through playwright-core', { skip: noChrome }, async (t) => {
    const chromium = await playwright();
    if (!chromium) { t.skip('no playwright-core here'); return; }
    checkFindings(await walkWith('playwright', { loadPlaywright: async () => chromium }), 'playwright');
  });

  it('screenshot: PNGs only when nothing else is there', { skip: noChrome }, async () => {
    const { json, out } = await walkWith('screenshot');
    assert.equal(json.driver, 'screenshot');
    assert.equal(json.screens.length, 4);
    for (const s of json.screens) assert.ok(s.png && fs.existsSync(path.join(out, s.png)), `${s.route} ${s.viewport}`);
  });

  it('sent no cookie and no authorization header', { skip: noChrome }, () => {
    assert.ok(seen.length > 0);
    assert.deepEqual(seen.filter((x) => x.cookie || x.authorization), []);
  });
});
