// design/render.mjs end to end: a fixture handoff of tiny boards rendered by the installed Chrome, then read back pixel by
// pixel (holes, sc-if, sc-for, an import with its helmet, the theme as a prop, a theme twin, --theme, a board that throws).
// Spawns Chrome; skips cleanly when none is installed (findChrome, CHROME_PATH). Offline: the fixture links no fonts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { decodePng } from '../design/png.mjs';
import { findChrome, render } from '../design/render.mjs';

const chrome = findChrome();
const skip = chrome ? false : 'no Chrome installed (set CHROME_PATH to run this)';

const page = (body, script, props) => `<!doctype html>
<html><head><meta charset="utf-8"><script src="./support.js"></script></head>
<body>
<x-dc>
<helmet><style>body{margin:0;background:#fff}</style></helmet>
${body}
</x-dc>
<script type="text/x-dc" data-dc-script data-props='${JSON.stringify(props)}'>
${script}
</script>
</body></html>
`;
const box = (x, y, w, h, extra = '') => `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;${extra}`;

const FILES = {
  'Root.dc.html': page(
    `<div data-theme="{{theme}}" style="position:relative;width:200px;height:120px">
  <div style="${box(0, 0, 100, 60, 'background:{{bg}}')}"></div>
  <sc-if value="{{show}}"><div style="${box(100, 0, 100, 60, 'background:rgb(255,0,0)')}"></div></sc-if>
  <sc-if value="{{hide}}"><div style="${box(0, 0, 200, 120, 'background:rgb(0,255,0)')}"></div></sc-if>
  <sc-for list="{{cells}}" as="c"><div class="cell" style="position:absolute;top:60px;width:50px;height:60px;left:{{c.x}}px;background:{{c.colour}}"></div></sc-for>
  <input type="checkbox" checked="{{hide}}" onChange="{{toggle}}">
  <dc-import name="Chip" theme="dark"></dc-import>
</div>`,
    `class Component extends DCLogic {
  constructor(props) { super(props); this.state = { on: true }; }
  renderVals() {
    const theme = this.props.theme ?? 'dark';
    return { theme, bg: theme === 'light' ? 'rgb(255,255,0)' : 'rgb(0,0,255)', show: this.state.on, hide: false,
      toggle: () => this.setState({ on: !this.state.on }),
      cells: [{ x: 0, colour: 'rgb(0,255,255)' }, { x: 50, colour: 'rgb(255,0,255)' }, { x: 100, colour: 'rgb(128,128,128)' }] };
  }
}`,
    { theme: { editor: 'enum', options: ['dark', 'light'], default: 'dark' }, $preview: { width: 200, height: 120 } },
  ),
  'Chip.dc.html': `<!doctype html>
<html><head><script src="./support.js"></script></head><body>
<x-dc>
<helmet><style>.chip-dark{background:rgb(0,128,0)}.chip-light{background:rgb(128,0,128)}</style></helmet>
<div class="chip-{{theme}}" style="${box(150, 60, 50, 60)}"></div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"theme":{"default":"dark"}}'>
class Component extends DCLogic { renderVals() { return { theme: this.props.theme }; } }
</script>
</body></html>
`,
  'RootLight.dc.html': page('<div style="width:100%;height:100vh"><dc-import name="Root" theme="light" hint-size="100%,100vh"></dc-import></div>',
    'class Component extends DCLogic { renderVals() { return {}; } }', { $preview: { width: 200, height: 120 } }),
  'Broken.dc.html': page('<div>{{x}}</div>', 'class Component extends DCLogic { renderVals() { throw new Error("no data"); } }', { $preview: { width: 40, height: 30 } }),
  'canvas.json': JSON.stringify({
    pages: [{ id: 'p', name: 'Page' }],
    boards: {
      'Root.dc.html': { w: 200, h: 120, page: 'p' },
      'RootLight.dc.html': { w: 200, h: 120, page: 'p' },
      'Broken.dc.html': { w: 40, h: 30, page: 'p' },
    },
  }),
};

function fixture() {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'design render run '));
  const dir = path.join(ws, 'handoff');
  fs.mkdirSync(dir);
  for (const [f, t] of Object.entries(FILES)) fs.writeFileSync(path.join(dir, f), t);
  return { dir, out: path.join(ws, 'out') };
}
const rgbAt = (png, x, y) => {
  const img = decodePng(fs.readFileSync(png));
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
};

describe('render, in Chrome', { skip }, () => {
  it('draws each board as is: holes, sc-if, sc-for, the import with its helmet, the twin in its theme', async () => {
    const { dir, out } = fixture();
    const r = await render({ handoff: dir, out, chrome, jobs: 2, wait: 1000 });
    const by = Object.fromEntries(r.results.map((x) => [x.name, x]));
    assert.deepEqual(r.results.map((x) => x.name), ['Root', 'RootLight', 'Broken']);
    assert.ok(by.Root.ok && by.RootLight.ok, JSON.stringify(r.results));
    assert.deepEqual(by.Root.problems, []);
    const root = path.join(out, 'Root.png');
    assert.deepEqual(rgbAt(root, 50, 30), [0, 0, 255], 'the {{bg}} hole, dark');
    assert.deepEqual(rgbAt(root, 150, 30), [255, 0, 0], 'sc-if true draws');
    assert.deepEqual(rgbAt(root, 25, 90), [0, 255, 255], 'sc-for, first item');
    assert.deepEqual(rgbAt(root, 75, 90), [255, 0, 255], 'sc-for, second item');
    assert.deepEqual(rgbAt(root, 125, 90), [128, 128, 128], 'sc-for, third item');
    assert.deepEqual(rgbAt(root, 175, 90), [0, 128, 0], 'the import, styled by its helmet');
    const light = path.join(out, 'RootLight.png');
    assert.deepEqual(rgbAt(light, 50, 30), [255, 255, 0], 'the twin passes theme=light');
    assert.deepEqual(rgbAt(light, 175, 90), [0, 128, 0], 'an import that sets its own theme keeps it');
    assert.ok(by.Broken.problems.some((p) => /\[dc\].*renderVals threw.*no data/.test(p)), JSON.stringify(by.Broken.problems));
  });

  it('--theme renders every board in it, imports too, and skips the theme twin', async () => {
    const { dir, out } = fixture();
    const r = await render({ handoff: dir, out, chrome, theme: 'dawn', boards: [], wait: 1000 });
    assert.deepEqual(r.skipped, [{ name: 'RootLight', reason: 'a theme twin of Root' }]);
    const png = path.join(out, 'Root.dawn.png');
    assert.deepEqual(rgbAt(png, 50, 30), [255, 255, 0]);
    assert.deepEqual(rgbAt(png, 175, 90), [128, 0, 128], 'the import takes the forced theme');
    const one = await render({ handoff: dir, out, chrome, theme: 'night', boards: ['rootlight'], wait: 1000 });
    assert.deepEqual(one.results.map((x) => [x.name, x.ok]), [['RootLight', true]], 'a named twin renders');
    assert.deepEqual(rgbAt(path.join(out, 'RootLight.night.png'), 50, 30), [0, 0, 255]);
  });
});
