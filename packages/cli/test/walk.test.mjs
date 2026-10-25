// The walk (spec 56 A2): the finding rules, the allow-list of endpoints a demo does not stage, the arguments and the
// refusal to start without a build. No browser here: the rules are plain functions, and the allow-list is checked
// against a running demo over plain HTTP.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROUTES, VIEWPORTS, DEFAULT_SCENARIOS, parseArgs, stagedRoutes, stagedFor, isStaged, classifyResponse, isRealFailure,
  keepConsole, consoleLine, redact, shortUrl, overflowOf, nameOf, unnamedOf, noAltOf, pngName, screenUrl, finalPath,
  findingCount, stamp, walk,
} from '../scripts/walk.mjs';
import { startDemo } from '../server/demo.mjs';
import { scenarioNames } from '../server/demo/scenarios.mjs';
import { manualClock } from '../server/demo/clock.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, '..');
const NO_DIST = path.join(PKG, 'test', 'fixtures', 'no-dist');
const NAMES = scenarioNames();
const TOKEN = 'tok-EN_123';

function get(port, pathname, token) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method: 'GET', path: `${pathname}${pathname.includes('?') ? '&' : '?'}t=${encodeURIComponent(token)}`, headers: { host: `127.0.0.1:${port}` } }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    r.on('error', reject);
    r.end();
  });
}

test('the defaults: three scenarios, twelve routes, two viewports, out under .scratch/walk/<iso>', () => {
  const a = parseArgs([], { names: NAMES, now: new Date('2026-10-25T09:08:07.006Z') });
  assert.deepEqual(a.scenarios, ['fleet-to-tug', 'stack', 'grill-me']);
  assert.deepEqual(a.scenarios, [...DEFAULT_SCENARIOS]);
  assert.equal(a.routes.length, 12);
  assert.deepEqual(a.routes, [...ROUTES]);
  assert.deepEqual(a.viewports, ['desktop', 'mobile']);
  assert.deepEqual(VIEWPORTS.desktop, { width: 1280, height: 800 });
  assert.deepEqual(VIEWPORTS.mobile, { width: 390, height: 844 });
  assert.equal(a.reducedMotion, false);
  assert.equal(a.json, false);
  assert.ok(a.out.endsWith(path.join('.scratch', 'walk', '2026-10-25T09-08-07-006Z')), a.out);
  assert.equal(stamp(new Date('2026-01-02T03:04:05.678Z')), '2026-01-02T03-04-05-678Z');
  for (const s of DEFAULT_SCENARIOS) assert.ok(NAMES.includes(s), `${s} is a demo scenario`);
});

test('the flags: all, lists, --json, --reduced-motion; a bad value is a sentence', () => {
  const a = parseArgs(['--scenarios', 'all', '--routes=inbox,/board', '--viewports', 'mobile', '--reduced-motion', '--json', '--settle', '0'], { names: NAMES });
  assert.deepEqual(a.scenarios, NAMES);
  assert.deepEqual(a.routes, ['/inbox', '/board']);
  assert.deepEqual(a.viewports, ['mobile']);
  assert.equal(a.reducedMotion, true);
  assert.equal(a.json, true);
  assert.equal(a.settle, 0);
  assert.deepEqual(parseArgs(['--routes', 'all'], { names: NAMES }).routes, [...ROUTES]);
  assert.deepEqual(parseArgs(['--routes', '/vault?panel=stack'], { names: NAMES }).routes, ['/vault?panel=stack']);
  assert.throws(() => parseArgs(['--scenarios', 'nope'], { names: NAMES }), /no demo scenario "nope"/);
  assert.throws(() => parseArgs(['--viewports', 'tablet'], { names: NAMES }), /--viewports takes desktop, mobile/);
  assert.throws(() => parseArgs(['--routes', 'C:/Program Files/Git/inbox'], { names: NAMES }), /a route is a path on the page/);
  assert.throws(() => parseArgs(['--settle', '-1'], { names: NAMES }), /--settle takes/);
  assert.throws(() => parseArgs(['--frobnicate', '1'], { names: NAMES }), /unknown flag --frobnicate/);
  assert.throws(() => parseArgs(['--out'], { names: NAMES }), /--out needs a value/);
  assert.throws(() => parseArgs(['inbox'], { names: NAMES }), /every option is a flag/);
});

test('the staged routes are read from the source: case literals, route === literals and route patterns', () => {
  const src = `
    switch (route) {
      case 'GET /api/plan': return 1;
      case 'POST /api/send': {
      case 'init':
    }
    if (route === 'POST /api/pickup-all') {}
    const one = /^GET \\/api\\/sessions\\/([\\w.%-]+)$/.exec(route);
    const m = /^POST \\/api\\/repo\\/(init|push)$/.exec(route);
    const notARoute = /^\\d+$/.test(x);
  `;
  const s = stagedRoutes(src);
  assert.deepEqual([...s.exact].sort(), ['GET /api/plan', 'POST /api/pickup-all', 'POST /api/send']);
  assert.equal(s.patterns.length, 2);
  assert.ok(isStaged(s, 'GET', '/api/plan'));
  assert.ok(isStaged(s, 'get', '/api/sessions/vega'));
  assert.ok(isStaged(s, 'POST', '/api/repo/push'));
  assert.ok(!isStaged(s, 'POST', '/api/repo/delete'));
  assert.ok(!isStaged(s, 'POST', '/api/plan'), 'the method counts');
  assert.ok(!isStaged(s, 'GET', '/api/sessions/vega/extra'), 'patterns are anchored');
  assert.ok(isStaged(s, 'GET', '/api/hello'), 'the tokenless hello is always served');
});

test('the allow-list follows the real demo: unstaged endpoints answer "not staged", staged ones never do', async () => {
  for (const [scenario, hasStage] of [['fleet-to-tug', false], ['plain-folder', true]]) {
    const staged = stagedFor({ hasStage });
    assert.ok(staged.exact.size > 30, `the demo stages its routes (${staged.exact.size})`);
    assert.equal(isStaged(staged, 'GET', '/api/actions'), hasStage, `${scenario}: /api/actions is the stage's`);
    assert.equal(isStaged(staged, 'GET', '/api/repo/start'), hasStage);
    assert.ok(isStaged(staged, 'GET', '/api/sessions/vega'));
    assert.ok(isStaged(staged, 'POST', '/api/sessions/vega/pause'));
    assert.ok(isStaged(staged, 'POST', '/api/secrets/GH_TOKEN/push'));
    const app = await startDemo({ scenario, clock: manualClock(), dist: NO_DIST, token: TOKEN, hub: { flushMs: 5, pingMs: 60000 } });
    try {
      // Every staged GET with no path parameter answers something other than "not staged" (the stream excepted).
      for (const route of staged.exact) {
        const [method, pathname] = route.split(' ');
        if (method !== 'GET' || pathname === '/api/events') continue;
        const r = await get(app.port, pathname, TOKEN);
        assert.ok(!/not staged in this demo/.test(r.data), `${scenario}: ${route} is staged but answered ${r.status} ${r.data}`);
      }
      // Endpoints the page calls that the demo does not stage: 404 "not staged", and allowed by the rule.
      const unstaged = ['/api/cloud', '/api/git', '/api/design', '/api/recover', ...(hasStage ? [] : ['/api/actions', '/api/runs'])];
      for (const pathname of unstaged) {
        const r = await get(app.port, pathname, TOKEN);
        assert.equal(r.status, 404, `${scenario}: ${pathname}`);
        assert.match(r.data, /not staged in this demo/);
        assert.equal(isStaged(staged, 'GET', pathname), false, `${scenario}: ${pathname} reads as not served`);
        assert.equal(classifyResponse({ method: 'GET', url: `http://127.0.0.1:${app.port}${pathname}`, status: 404 }, staged, TOKEN).kind, 'allowed');
      }
    } finally {
      await app.close();
    }
  }
});

test('the response rule: 5xx always, a 4xx unless it is a 404 on an endpoint the scenario does not stage', () => {
  const staged = stagedRoutes("case 'GET /api/plan': case 'GET /api/sessions': const one = /^GET \\/api\\/sessions\\/([\\w.%-]+)$/.exec(route);");
  const u = (p) => `http://127.0.0.1:5173${p}`;
  assert.equal(classifyResponse({ method: 'GET', url: u('/api/plan'), status: 200 }, staged, TOKEN), null);
  assert.equal(classifyResponse({ method: 'GET', url: u('/api/plan'), status: 304 }, staged, TOKEN), null);
  assert.deepEqual(classifyResponse({ method: 'GET', url: u('/api/cloud'), status: 404 }, staged, TOKEN), { kind: 'allowed', line: '404 GET /api/cloud' });
  assert.deepEqual(classifyResponse({ method: 'GET', url: u('/api/sessions/vega'), status: 404 }, staged, TOKEN), { kind: '4xx', line: '404 GET /api/sessions/vega' });
  assert.equal(classifyResponse({ method: 'GET', url: u('/api/plan'), status: 403 }, staged, TOKEN).kind, '4xx');
  assert.equal(classifyResponse({ method: 'GET', url: u('/api/cloud'), status: 403 }, staged, TOKEN).kind, '4xx', 'only a 404 is "not served"');
  assert.equal(classifyResponse({ method: 'GET', url: u('/favicon.ico'), status: 404 }, staged, TOKEN).kind, '4xx', 'a static file is not an endpoint');
  assert.deepEqual(classifyResponse({ method: 'POST', url: u(`/api/cloud?t=${TOKEN}`), status: 502 }, staged, TOKEN), { kind: '5xx', line: '502 POST /api/cloud?t=<token>' });
});

test('the token never reaches walk.json, and origins are dropped', () => {
  assert.equal(redact(`GET http://127.0.0.1:61234/api/events?t=${TOKEN} failed`, TOKEN), 'GET /api/events?t=<token> failed');
  assert.equal(redact(`x ${encodeURIComponent('a/b+c')} y`, 'a/b+c'), 'x <token> y');
  assert.equal(redact('x'.repeat(500)).length, 300);
  assert.equal(shortUrl(`http://localhost:9/s/vega?t=${TOKEN}`, TOKEN), '/s/vega?t=<token>');
  assert.equal(finalPath(`http://127.0.0.1:9/vault?panel=stack&t=${TOKEN}`), '/vault?panel=stack');
  assert.equal(finalPath(`http://127.0.0.1:9/?t=${TOKEN}`), '/');
  assert.equal(screenUrl('http://127.0.0.1:9', '/inbox', 'a b'), 'http://127.0.0.1:9/inbox?t=a%20b');
  assert.equal(screenUrl('http://127.0.0.1:9', '/vault?panel=stack', 'k'), 'http://127.0.0.1:9/vault?panel=stack&t=k');
});

test('console and request failures: errors kept, allow-listed loads and aborted requests dropped', () => {
  const allowed = new Set(['http://127.0.0.1:9/api/cloud']);
  const miss = 'Failed to load resource: the server responded with a status of 404 (Not Found)';
  assert.equal(keepConsole({ type: 'error', text: 'TypeError: x is undefined' }, allowed), true);
  assert.equal(keepConsole({ type: 'warning', text: 'careful' }, allowed), false);
  assert.equal(keepConsole({ type: 'error', text: miss, url: 'http://127.0.0.1:9/api/cloud' }, allowed), false);
  assert.equal(keepConsole({ type: 'error', text: miss, url: 'http://127.0.0.1:9/favicon.ico' }, allowed), true);
  assert.equal(consoleLine({ text: miss, url: 'http://127.0.0.1:9/favicon.ico' }, TOKEN), `${miss} (/favicon.ico)`);
  assert.equal(consoleLine({ text: `boom ${TOKEN}`, url: 'http://127.0.0.1:9/x.js' }, TOKEN), 'boom <token>');
  assert.equal(isRealFailure({ failure: 'net::ERR_ABORTED' }), false);
  assert.equal(isRealFailure({ failure: 'net::ERR_CONNECTION_REFUSED' }), true);
});

test('overflow, names and alt: the rules on the page facts', () => {
  assert.equal(overflowOf({ scrollWidth: 412, clientWidth: 390 }), 22);
  assert.equal(overflowOf({ scrollWidth: 390, clientWidth: 390 }), 0);
  assert.equal(overflowOf({ scrollWidth: 380, clientWidth: 390 }), 0);
  assert.equal(overflowOf({}), 0);

  assert.equal(nameOf({ ariaLabel: '  ', text: '\n Pause all \n' }), 'Pause all');
  assert.equal(nameOf({ labelledBy: 'Close panel' }), 'Close panel');
  assert.equal(nameOf({ title: 'Settings' }), 'Settings');
  assert.equal(nameOf({ imgAlt: 'Back' }), 'Back');
  assert.equal(nameOf({ svgTitle: 'Menu' }), 'Menu');
  assert.equal(nameOf({ text: '   ' }), '');
  const controls = [
    { what: 'button.icon', text: '' },
    { what: 'button.icon', text: '' },
    { what: 'a.rail-item[href="/board"]', text: 'Plan' },
    { what: 'button.ghost', hidden: true, text: '' },
    { what: 'a.wordmark', ariaLabel: 'nexus, the fleet' },
    { what: 'button.x', svgTitle: '' },
  ];
  assert.deepEqual(unnamedOf(controls), ['button.icon', 'button.x']);
  assert.equal(unnamedOf(Array.from({ length: 40 }, (_, i) => ({ what: `button.b${i}` }))).length, 20);

  const images = [
    { what: 'img.a', src: `http://127.0.0.1:9/a.png?t=${TOKEN}`, alt: null },
    { what: 'img.b', src: '/b.png', alt: '' },
    { what: 'img.c', src: '/c.png', alt: 'A chart' },
    { what: 'img.d', src: '/d.png', alt: null, ariaHidden: true },
    { what: 'img.e', src: '/e.png', alt: null, role: 'presentation' },
    { what: 'img.f', src: '/f.png', alt: null, hidden: true },
    { what: 'img.g', src: '', alt: null },
  ];
  assert.deepEqual(noAltOf(images, TOKEN), ['/a.png?t=<token>', 'img.g']);
});

test('one PNG per screen, named by scenario, viewport and route; findings counted per screen', () => {
  assert.equal(pngName('fleet-to-tug', 'desktop', '/'), 'fleet-to-tug--desktop--fleet.png');
  assert.equal(pngName('stack', 'mobile', '/inbox/grill'), 'stack--mobile--inbox-grill.png');
  assert.equal(pngName('stack', 'mobile', '/vault?panel=stack'), 'stack--mobile--vault-panel-stack.png');
  const names = new Set();
  for (const s of DEFAULT_SCENARIOS) for (const v of Object.keys(VIEWPORTS)) for (const r of ROUTES) names.add(pngName(s, v, r));
  assert.equal(names.size, 3 * 2 * 12, 'no two screens share a PNG');
  const clean = { console: [], pageErrors: [], failed: [], overflowPx: 0, unnamed: [], noAlt: [] };
  assert.equal(findingCount(clean), 0);
  assert.equal(findingCount({ ...clean, console: ['a'], failed: ['b', 'c'], overflowPx: 14, noAlt: ['d'] }), 5);
});

test('with no dist/ the walk stops before anything starts and says to build', async () => {
  await assert.rejects(walk({ ...parseArgs([], { names: NAMES }), dist: NO_DIST }), (e) => {
    assert.match(e.message, /the UI is not built: run npm run build/);
    assert.equal(e.exit, 1);
    return true;
  });
});
