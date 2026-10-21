// design/render.mjs, its pure parts: the board index (canvas.json order, sizes, the $preview fallback, a missing board),
// the imports a board names and their closure, the theme twin, the staged page, finding Chrome, the CLI's usage errors.
// node:test, no deps, no Chrome (design-render-run.test.mjs renders); temp dirs only.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { boardName, findChrome, importClosure, importsOf, previewSize, readBoards, stagePage, themeTwin } from '../design/render.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, '..', 'design', 'render.mjs');

const board = (body, props = '{"$preview":{"width":800,"height":600}}') =>
  `<!doctype html>\n<html><head><script src="./support.js"></script><link rel="stylesheet" href="./app.css"></head>\n<body>\n<x-dc>\n<helmet><style>body{margin:0}</style></helmet>\n${body}\n</x-dc>\n<script type="text/x-dc" data-dc-script data-props='${props}'>\nclass Component extends DCLogic { renderVals() { return {}; } }\n</script>\n</body>\n</html>\n`;

function handoff(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'design render '));
  for (const [f, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), typeof text === 'string' ? text : JSON.stringify(text));
  return dir;
}

describe('the board index', () => {
  it('takes the canvas order, pages and sizes, and names a board the folder lacks', () => {
    const dir = handoff({
      'Fleet.dc.html': board('<div>fleet</div>'),
      'FleetLight.dc.html': board('<div style="width:100%"><dc-import name="Fleet" theme="light" hint-size="100%,100vh"></dc-import></div>'),
      'Tokens.dc.html': board('<div>tokens</div>', '{"theme":{"default":"dark"},"$preview":{"width":1440,"height":2120}}'),
      'index.html': '<p>the artifact page</p>',
      'canvas.json': {
        pages: [{ id: 'system', name: 'Design system' }, { id: 'fleet', name: 'Fleet' }],
        boards: {
          'Fleet.dc.html': { w: 1440, h: 900, title: 'Fleet', page: 'fleet' },
          'Tokens.dc.html': { title: 'Tokens', page: 'system' },
          'FleetLight.dc.html': { w: 1440, h: 900, title: 'Fleet, dawn', page: 'fleet' },
          'Gone.dc.html': { w: 10, h: 10, page: 'fleet' },
        },
        order: ['Tokens.dc.html', 'Fleet.dc.html'],
      },
    });
    const r = readBoards(dir);
    assert.deepEqual(r.pages, [{ id: 'system', name: 'Design system' }, { id: 'fleet', name: 'Fleet' }]);
    assert.deepEqual(r.boards.map((b) => [b.name, b.w, b.h, b.page]), [
      ['Tokens', 1440, 2120, 'system'],
      ['Fleet', 1440, 900, 'fleet'],
      ['FleetLight', 1440, 900, 'fleet'],
    ]);
    assert.deepEqual(r.missing, ['Gone.dc.html']);
  });

  it('renders every board at its $preview size, else 1440x900, when there is no canvas.json', () => {
    const dir = handoff({ 'B.dc.html': board('<div>b</div>'), 'A.html': '<x-dc><div>a</div></x-dc>' });
    assert.deepEqual(readBoards(dir).boards.map((b) => [b.file, b.w, b.h]), [['A.html', 1440, 900], ['B.dc.html', 800, 600]]);
  });

  it('reads $preview from either quoting', () => {
    assert.deepEqual(previewSize(`<script data-props='{"$preview":{"width":3,"height":4}}'>`), { w: 3, h: 4 });
    assert.deepEqual(previewSize('<script data-props="{&quot;$preview&quot;:{&quot;width&quot;:5,&quot;height&quot;:6}}">'), { w: 5, h: 6 });
    assert.equal(previewSize('<p>none</p>'), null);
    assert.equal(boardName('sub/Cockpit1024Light.dc.html'), 'Cockpit1024Light');
  });
});

describe('imports and theme twins', () => {
  const pages = {
    Shell: board('<div><dc-import name="Rail"></dc-import><dc-import src="./Card.dc.html" mode="owner"></dc-import><dc-import name="Rail"></dc-import></div>'),
    Rail: board('<nav><dc-import name="Icon"></dc-import></nav>'),
    Card: board('<div>card</div>'),
    Icon: board('<i>.</i>'),
  };
  it('lists the boards a board imports, once each, by name or src', () => {
    assert.deepEqual(importsOf(pages.Shell), ['Rail', 'Card']);
    assert.deepEqual(importsOf(pages.Card), []);
  });

  it('follows imports through other boards', () => {
    assert.deepEqual(importClosure('Shell', (n) => pages[n] ?? null), ['Rail', 'Icon', 'Card']);
  });

  it('calls a board that only re-imports another in a theme a twin, and nothing else', () => {
    assert.equal(themeTwin(board('<div style="width: 100%; height: 100vh">\n<dc-import name="Board" theme="light" hint-size="100%,100vh"></dc-import>\n</div>')), 'Board');
    assert.equal(themeTwin(board('<dc-import name="Board" mode="owner" theme="light"></dc-import>')), null);
    assert.equal(themeTwin(board('<dc-import name="Board"></dc-import>')), null);
    assert.equal(themeTwin(board('<h1>x</h1><dc-import name="Board" theme="light"></dc-import>')), null);
  });
});

describe('the staged page', () => {
  it('swaps support.js for the runtime and inlines each import as a template of its body', () => {
    const page = stagePage(board('<dc-import name="Card"></dc-import>'), [{ name: 'Card', html: board('<div class="card">c</div>') }]);
    assert.match(page, /<script src="\.\/board-runtime\.js"><\/script>/);
    assert.doesNotMatch(page, /support\.js/);
    const tpl = /<template data-dc-board="Card">([\s\S]*?)<\/template>\s*<\/body>/.exec(page);
    assert.ok(tpl, 'the template sits before </body>');
    assert.match(tpl[1], /<x-dc>[\s\S]*class="card"[\s\S]*data-dc-script/);
  });

  it('adds the runtime to a board that links no support.js', () => {
    assert.match(stagePage('<html><head></head><body><x-dc><p>x</p></x-dc></body></html>', []), /<head>\n<script src="\.\/board-runtime\.js"><\/script>/);
  });
});

describe('findChrome', () => {
  const only = (...paths) => (p) => paths.includes(p);
  it('takes --chrome, then CHROME_PATH, then the usual places', () => {
    assert.equal(findChrome({ chrome: '/x/chrome', exists: only('/x/chrome') }), '/x/chrome');
    assert.equal(findChrome({ chrome: '/x/chrome', exists: only() }), null);
    assert.equal(findChrome({ env: { CHROME_PATH: '/y/c' }, platform: 'linux', exists: only('/y/c', '/usr/bin/chromium') }), '/y/c');
    assert.equal(findChrome({ env: { PATH: '/opt/bin:/usr/bin' }, platform: 'linux', exists: only('/usr/bin/chromium') }), '/usr/bin/chromium');
    assert.equal(findChrome({ env: {}, platform: 'darwin', exists: only('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') }), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    const win = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    assert.equal(findChrome({ env: { PROGRAMFILES: 'C:\\Program Files' }, platform: 'win32', exists: only(win) }), win);
    assert.equal(findChrome({ env: { PATH: '/nowhere' }, platform: 'linux', exists: only() }), null);
  });
});

describe('render CLI', () => {
  const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf-8' });
  it('exits 2 on a usage error, before looking for Chrome', () => {
    assert.equal(run([]).status, 2);
    assert.equal(run(['some/handoff']).status, 2, 'no --out');
    assert.equal(run(['some/handoff', '--out', 'x', '--theme', 'noon']).status, 2);
    assert.equal(run(['no such folder', '--out', 'x']).status, 2);
    assert.match(run(['--help']).stdout, /usage: node scripts\/design\/render\.mjs/);
  });
});
