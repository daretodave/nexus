// ui-walk.mjs, its pure parts and the playwright path against a fake browser: the flags, the four UI knobs, UI: none
// starting no browser, the credential-free environment, the finding rules, findChrome kept equal to design/render.mjs's.
// node:test, no deps, no Chrome (ui-walk-run.test.mjs walks a local fixture in the installed Chrome); temp dirs only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  childEnv, classifyResponse, cleanRoutes, consoleLine, finalPath, findChrome, findingCount, isRealFailure, keepConsole, main, noAltOf,
  overflowOf, parseArgs, pickDriver, pngName, readUiKnobs, redact, resolveTarget, screenRecord, screenUrl, shortUrl,
  unnamedOf, UNTRUSTED, walk,
} from '../ui-walk.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES = path.resolve(HERE, '..', '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ui walk '));
const bearings = (lines) => `# Bearings\n\n## UI walk\n\n${lines.join('\n')}\n`;
const ORIGIN = 'https://example.com';

describe('the flags', () => {
  it('defaults to both viewports, the bearings knobs, auto and .nexus/walk/<iso>/', () => {
    const a = parseArgs([], { now: new Date('2026-10-25T10:00:00Z'), cwd: '/repo' });
    assert.deepEqual(a.viewports, ['desktop', 'mobile']);
    assert.equal(a.base, null);
    assert.equal(a.routes, null);
    assert.equal(a.driver, 'auto');
    assert.equal(a.out, path.join('/repo', '.nexus', 'walk', '2026-10-25T10-00-00-000Z'));
    assert.equal(a.bearings, path.join('/repo', 'plan', 'bearings.md'));
  });
  it('takes a base, routes (a slash added), viewports, the driver and the reduced path', () => {
    const a = parseArgs(['--base', 'http://127.0.0.1:4321/', '--routes', 'pricing,/docs?tab=api', '--viewports=mobile', '--driver', 'cdp', '--reduced-motion', '--json']);
    assert.equal(a.base, 'http://127.0.0.1:4321');
    assert.deepEqual(a.routes, ['/pricing', '/docs?tab=api']);
    assert.deepEqual(a.viewports, ['mobile']);
    assert.equal(a.driver, 'cdp');
    assert.equal(a.reducedMotion, true);
    assert.equal(a.json, true);
  });
  it('refuses what it cannot use, in a sentence', () => {
    assert.throws(() => parseArgs(['--base', 'ftp://x']), /http or https/);
    assert.throws(() => parseArgs(['--base', 'https://u:p@example.com']), /no credentials/);
    assert.throws(() => parseArgs(['--routes', '//evil.example/x']), /a route is a path/);
    assert.throws(() => parseArgs(['--viewports', 'tablet']), /--viewports takes desktop, mobile/);
    assert.throws(() => parseArgs(['--driver', 'selenium']), /--driver takes/);
    assert.throws(() => parseArgs(['--settle', '-1']), /--settle/);
    assert.throws(() => parseArgs(['--cookie', 'a=b']), /unknown flag --cookie/);
    assert.throws(() => parseArgs(['pricing']), /every option is a flag/);
  });
});

describe('the UI knobs', () => {
  it('reads no UI line as none: a v1 bearings walks nothing', () => {
    const k = readUiKnobs('# Bearings\n\n**Auth:** `none`\n');
    assert.equal(k.mode, 'none');
    assert.deepEqual(k.routes, ['/']);
    assert.equal(k.cadence, 'critique');
    assert.equal(k.magic, 'keep');
    assert.deepEqual(k.walks, { critique: false, iterate: false });
    assert.deepEqual(k.problems, []);
  });
  it('reads the template bearings as UI none, cadence critique, magic keep', () => {
    const k = readUiKnobs(fs.readFileSync(path.join(TEMPLATES, 'plan', 'bearings.md'), 'utf8'));
    assert.equal(k.mode, 'none');
    assert.equal(k.cadence, 'critique');
    assert.equal(k.magic, 'keep');
    assert.deepEqual(k.problems, []);
  });
  it('reads url mode, the routes and the cadence', () => {
    const k = readUiKnobs(bearings(['**UI:** `url https://example.com/`', '**UI routes:** `/`, `/pricing`, `/blog/latest`', '**UI cadence:** `both`', '**UI magic:** `open`']));
    assert.equal(k.mode, 'url');
    assert.equal(k.base, 'https://example.com');
    assert.deepEqual(k.routes, ['/', '/pricing', '/blog/latest']);
    assert.deepEqual(k.walks, { critique: true, iterate: true });
    assert.equal(k.magic, 'open');
  });
  it('walks only the pass the cadence names', () => {
    assert.deepEqual(readUiKnobs(bearings(['**UI:** url https://example.com', '**UI cadence:** iterate'])).walks, { critique: false, iterate: true });
    assert.deepEqual(readUiKnobs(bearings(['**UI:** url https://example.com'])).walks, { critique: true, iterate: false });
  });
  it('reads dev mode but walks nothing with it yet', () => {
    const k = readUiKnobs(bearings(['**UI:** `dev "npm run dev" 5173`']));
    assert.equal(k.mode, 'dev');
    assert.equal(k.cmd, 'npm run dev');
    assert.equal(k.port, 5173);
    assert.deepEqual(k.walks, { critique: false, iterate: false });
  });
  it('names a bad line', () => {
    const k = readUiKnobs(bearings(['**UI:** sometimes', '**UI cadence:** hourly', '**UI magic:** strip', '**UI routes:** //evil.example']));
    assert.equal(k.mode, 'none');
    assert.equal(k.problems.length, 4);
  });
});

describe('what a run walks', () => {
  const none = readUiKnobs('');
  const url = readUiKnobs(bearings(['**UI:** url https://example.com', '**UI routes:** /, /pricing']));
  it('skips UI none and UI dev', () => {
    assert.match(resolveTarget({ base: null, routes: null }, none).skip, /UI: none/);
    assert.match(resolveTarget({ base: null, routes: null }, readUiKnobs(bearings(['**UI:** dev "x" 1']))).skip, /url mode only/);
  });
  it('walks the knobs, the flags over them', () => {
    assert.deepEqual(resolveTarget({ base: null, routes: null }, url), { base: 'https://example.com', routes: ['/', '/pricing'] });
    assert.deepEqual(resolveTarget({ base: 'http://127.0.0.1:9', routes: ['/a'] }, none), { base: 'http://127.0.0.1:9', routes: ['/a'] });
  });
});

describe('UI: none browses nothing', () => {
  for (const line of [null, '**UI:** `none`', '**UI:** `dev "npm run dev" 5173`']) {
    it(`starts no browser with ${line ?? 'no UI line'}`, async () => {
      const out = tmp();
      let touched = 0;
      const deps = {
        readFile: () => bearings(line ? [line] : []),
        loadPlaywright: async () => { touched++; return null; },
        findChrome: () => { touched++; return null; },
      };
      const r = await walk(parseArgs(['--out', out]), () => {}, deps);
      assert.ok(r.skipped);
      assert.equal(touched, 0);
      assert.deepEqual(fs.readdirSync(out), []);
    });
  }
  it('says skipped and exits 0 from the command line', async () => {
    const lines = [];
    const code = await main(['--json'], { out: (s) => lines.push(s), err: (s) => lines.push(s) }, { readFile: () => '' });
    assert.equal(code, 0);
    assert.match(JSON.parse(lines[0]).skipped, /UI: none/);
  });
  it('stops on a bad UI line with exit 2', async () => {
    const err = [];
    const code = await main([], { out: () => {}, err: (s) => err.push(s) }, { readFile: () => bearings(['**UI:** sometimes']) });
    assert.equal(code, 2);
    assert.match(err.join('\n'), /plan\/bearings\.md: UI:/);
  });
  it('prints the knobs', async () => {
    const lines = [];
    await main(['--knobs'], { out: (s) => lines.push(s), err: () => {} }, { readFile: () => bearings(['**UI:** url https://example.com', '**UI cadence:** both']) });
    assert.deepEqual(JSON.parse(lines[0]).walks, { critique: true, iterate: true });
  });
});

describe('credentials stay out', () => {
  it('gives Chrome no token, secret, cookie, key or CRITIQUE_* value', () => {
    const env = childEnv({
      PATH: '/bin', HOME: '/home/x', TEMP: '/tmp', LANG: 'C', CHROME_PATH: '/c',
      GH_TOKEN: 'x', GITHUB_TOKEN: 'x', ACTIONS_PAT_TOKEN: 'x', CLAUDE_CODE_OAUTH_TOKEN: 'x', ANTHROPIC_API_KEY: 'x',
      CRITIQUE_SESSION_COOKIE: 'x', CRITIQUE_AUTH_USERNAME: 'x', CRITIQUE_BOT_SECRET: 'x', DB_PASSWORD: 'x', AWS_ACCESS_KEY_ID: 'x', NPM_CONFIG__AUTH: 'x',
      SUPABASE_SERVICE_ROLE_KEY: 'x', DEPLOY_KEY: 'x', SSH_KEY: 'x', STRIPE_KEY: 'x', GH_PAT: 'x', SENTRY_DSN: 'x',
      DATABASE_URL: 'postgres://u:p@h/db', REDIS_URL: 'redis://:p@h', SOME_UNKNOWN_VALUE: 'x', XDG_SECRET_TOKEN: 'x', XDG_RUNTIME_DIR: '/run',
    });
    assert.deepEqual(Object.keys(env).sort(), ['CHROME_PATH', 'HOME', 'LANG', 'PATH', 'TEMP', 'XDG_RUNTIME_DIR']);
  });
});

describe('the finding rules', () => {
  it('keeps the site path short and another origin whole', () => {
    assert.equal(shortUrl('https://example.com/a?b=1', ORIGIN), '/a?b=1');
    assert.equal(shortUrl('https://cdn.example.net/x.js', ORIGIN), 'https://cdn.example.net/x.js');
    assert.equal(redact(`boom at ${ORIGIN}/app.js:1`, ORIGIN), 'boom at /app.js:1');
    assert.equal(redact('x'.repeat(400), ORIGIN).length, 300);
  });
  it('counts every 4xx and 5xx: a live site stages nothing', () => {
    assert.equal(classifyResponse({ method: 'GET', url: `${ORIGIN}/`, status: 200 }, ORIGIN), null);
    assert.deepEqual(classifyResponse({ method: 'GET', url: `${ORIGIN}/api/me`, status: 404 }, ORIGIN), { kind: '4xx', line: '404 GET /api/me' });
    assert.deepEqual(classifyResponse({ method: 'POST', url: `${ORIGIN}/x`, status: 503 }, ORIGIN), { kind: '5xx', line: '503 POST /x' });
  });
  it('drops the favicon probe Chrome makes on its own, never a page icon link', () => {
    assert.equal(classifyResponse({ method: 'GET', url: `${ORIGIN}/favicon.ico`, status: 404 }, ORIGIN), null);
    assert.equal(keepConsole({ type: 'error', text: 'Failed to load resource', url: `${ORIGIN}/favicon.ico` }), false);
    assert.equal(classifyResponse({ method: 'GET', url: `${ORIGIN}/icons/app.png`, status: 404 }, ORIGIN).kind, '4xx');
    assert.equal(keepConsole({ type: 'error', text: 'boom' }), true);
    assert.equal(keepConsole({ type: 'warning', text: 'meh' }), false);
  });
  it('drops a request the page itself aborted', () => {
    assert.equal(isRealFailure({ failure: 'net::ERR_ABORTED' }), false);
    assert.equal(isRealFailure({ failure: 'net::ERR_FAILED', canceled: true }), false);
    assert.equal(isRealFailure({ failure: 'net::ERR_NAME_NOT_RESOLVED' }), true);
  });
  it('names a failed resource in its console line', () => {
    assert.equal(consoleLine({ text: 'Failed to load resource: 404', url: `${ORIGIN}/a.png` }, ORIGIN), 'Failed to load resource: 404 (/a.png)');
  });
  it('measures overflow, unnamed controls and missing alt', () => {
    assert.equal(overflowOf({ scrollWidth: 430, clientWidth: 390 }), 40);
    assert.equal(overflowOf({ scrollWidth: 300, clientWidth: 390 }), 0);
    assert.deepEqual(unnamedOf([{ what: 'button.x' }, { what: 'a', text: 'Home' }, { what: 'button.y', hidden: true }, { what: 'button.x' }]), ['button.x']);
    assert.deepEqual(noAltOf([{ what: 'img', src: `${ORIGIN}/a.png` }, { what: 'img', alt: '' }, { what: 'img', ariaHidden: true }], ORIGIN), ['/a.png']);
  });
  it('builds URLs under the base and never off it', () => {
    assert.equal(screenUrl('https://example.com/app', '/pricing'), 'https://example.com/app/pricing');
    assert.equal(finalPath('https://example.com/login?next=%2F', ORIGIN), '/login?next=%2F');
    assert.equal(finalPath('https://idp.example.org/auth', ORIGIN), 'https://idp.example.org/auth');
    assert.throws(() => cleanRoutes(['//evil.example']), /a route is a path/);
    assert.equal(pngName('mobile', '/'), 'url--mobile--home.png');
    assert.equal(pngName('desktop', '/docs?tab=api'), 'url--desktop--docs-tab-api.png');
  });
  it('writes the walk.json screen shape, scenario url', () => {
    const s = screenRecord({ route: '/', viewport: 'desktop', origin: ORIGIN, final: `${ORIGIN}/`, png: 'p.png',
      consoleRows: [{ type: 'log', text: 'hi' }, { type: 'error', text: 'bad' }], pageErrors: ['x'], failed: ['404 GET /a'],
      facts: { controls: [{ what: 'button' }], images: [], scrollWidth: 1300, clientWidth: 1280 } });
    assert.deepEqual(Object.keys(s), ['scenario', 'route', 'viewport', 'path', 'console', 'pageErrors', 'failed', 'overflowPx', 'unnamed', 'noAlt', 'png']);
    assert.equal(s.scenario, 'url');
    assert.deepEqual(s.console, ['bad']);
    assert.equal(findingCount(s), 5);
  });
});

describe('the driver', () => {
  it('takes playwright, then cdp, then screenshot under auto', () => {
    assert.equal(pickDriver('auto', { playwright: true, webSocket: true }), 'playwright');
    assert.equal(pickDriver('auto', { playwright: false, webSocket: true }), 'cdp');
    assert.equal(pickDriver('auto', { playwright: false, webSocket: false }), 'screenshot');
    assert.match(pickDriver('playwright', { playwright: false, webSocket: true }).error, /playwright-core/);
    assert.match(pickDriver('cdp', { playwright: true, webSocket: false }).error, /Node 22/);
  });
});

describe('findChrome', () => {
  it('is design/render.mjs\'s, case for case', async () => {
    const renderPath = path.join(TEMPLATES, 'scripts', 'design', 'render.mjs');
    if (!fs.existsSync(renderPath)) return; // an adopter that pruned scripts/design/ keeps only this copy
    const { findChrome: theirs } = await import(new URL('../design/render.mjs', import.meta.url).href);
    const cases = [
      { chrome: '/x/chrome', exists: () => true },
      { chrome: '/x/chrome', exists: () => false },
      { env: { CHROME_PATH: '/c' }, exists: (p) => p === '/c' },
      { env: { PROGRAMFILES: 'C:\\PF' }, platform: 'win32', exists: (p) => p.includes('Edge') },
      { env: {}, platform: 'darwin', exists: (p) => p.includes('Chromium') },
      { env: { PATH: '/usr/bin:/opt/bin' }, platform: 'linux', exists: (p) => p === '/opt/bin/chromium' },
      { env: { PATH: '/usr/bin' }, platform: 'linux', exists: () => false },
    ];
    for (const c of cases) assert.equal(findChrome(c), theirs(c));
  });
});

// A fake playwright: the page fires what a real one would on a page with every kind of finding.
function fakeChromium(record) {
  const page = (url) => {
    const on = {};
    let at = url;
    return {
      on: (ev, fn) => { on[ev] = fn; },
      async goto(u) {
        at = u;
        on.response?.({ request: () => ({ method: () => 'GET' }), url: () => u, status: () => 200 });
        on.response?.({ request: () => ({ method: () => 'GET' }), url: () => `${new URL(u).origin}/missing.png`, status: () => 404 });
        on.requestfailed?.({ method: () => 'GET', url: () => `${new URL(u).origin}/live`, failure: () => ({ errorText: 'net::ERR_ABORTED' }) });
        on.console?.({ type: () => 'error', text: () => 'boom', location: () => ({ url: u }) });
        on.console?.({ type: () => 'log', text: () => 'fine', location: () => ({}) });
        on.pageerror?.(new Error('Uncaught TypeError: x is undefined'));
      },
      evaluate: async (fn) => (typeof fn === 'function' && fn.name === 'domFacts'
        ? { controls: [{ what: 'button.icon' }, { what: 'a', text: 'Docs' }], images: [{ what: 'img', src: '/missing.png' }], scrollWidth: 420, clientWidth: 390 }
        : true),
      waitForTimeout: async () => {},
      screenshot: async ({ path: p }) => fs.writeFileSync(p, 'png'),
      url: () => at,
    };
  };
  return {
    launch: async (opts) => {
      record.launch = opts;
      return {
        version: () => '150.0.0.0',
        newContext: async (opts2) => { record.contexts.push(opts2); return { newPage: async () => page(), close: async () => {} }; },
        close: async () => { record.closed = true; },
      };
    },
  };
}

describe('the playwright path', () => {
  it('walks every route at both viewports into the walk.json shape, anonymous', async () => {
    const out = tmp();
    const record = { contexts: [] };
    const prev = process.env.CRITIQUE_SESSION_COOKIE;
    process.env.CRITIQUE_SESSION_COOKIE = 'sekrit';
    try {
      const r = await walk(parseArgs(['--out', out, '--settle', '0']), () => {}, {
        readFile: () => bearings(['**UI:** `url http://127.0.0.1:9`', '**UI routes:** `/`, `/pricing`']),
        loadPlaywright: async () => fakeChromium(record),
        findChrome: () => null,
      });
      assert.equal(r.driver, 'playwright');
      assert.equal(r.auth, 'anonymous');
      assert.equal(r.untrusted, UNTRUSTED);
      assert.equal(r.screens.length, 4);
      assert.deepEqual(r.screens.map((s) => `${s.viewport} ${s.route}`), ['desktop /', 'desktop /pricing', 'mobile /', 'mobile /pricing']);
      const s = r.screens[3];
      assert.deepEqual(s.console, ['boom']);
      assert.deepEqual(s.pageErrors, ['Uncaught TypeError: x is undefined']);
      assert.deepEqual(s.failed, ['404 GET /missing.png']);
      assert.equal(s.overflowPx, 30);
      assert.deepEqual(s.unnamed, ['button.icon']);
      assert.deepEqual(s.noAlt, ['/missing.png']);
      assert.equal(s.png, 'url--mobile--pricing.png');
      assert.ok(fs.existsSync(path.join(out, 'walk.json')));
      assert.equal(record.launch.env.CRITIQUE_SESSION_COOKIE, undefined);
      for (const c of record.contexts) {
        assert.equal(c.storageState, undefined);
        assert.equal(c.extraHTTPHeaders, undefined);
        assert.equal(c.httpCredentials, undefined);
        assert.equal(c.reducedMotion, 'no-preference');
      }
      assert.ok(record.closed);
    } finally {
      if (prev === undefined) delete process.env.CRITIQUE_SESSION_COOKIE; else process.env.CRITIQUE_SESSION_COOKIE = prev;
    }
  });
  it('prints the output folder in the --json stdout, so a skill can hand it to the reader', async () => {
    const out = tmp();
    const stdout = [];
    const code = await main(['--json', '--out', out, '--settle', '0'], { out: (s) => stdout.push(s), err: () => {} }, {
      readFile: () => bearings(['**UI:** `url http://127.0.0.1:9`', '**UI routes:** `/`']),
      loadPlaywright: async () => fakeChromium({ contexts: [] }),
      findChrome: () => null,
    });
    assert.equal(code, 0);
    const r = JSON.parse(stdout.join('\n'));
    assert.equal(path.resolve(r.out), path.resolve(out));
    assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'walk.json'), 'utf8')).out, r.out);
  });
  it('stops with exit 2 when no Chrome is found for the other drivers', async () => {
    await assert.rejects(walk(parseArgs(['--out', tmp(), '--driver', 'cdp']), () => {}, {
      readFile: () => bearings(['**UI:** url http://127.0.0.1:9']), loadPlaywright: async () => null, webSocket: true, findChrome: () => null,
    }), (e) => e.exit === 2 && /no Chrome found/.test(e.message));
  });
});
