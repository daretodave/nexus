// Tool rows fit their names (spec 52, A4): the cockpit's tool-name column sizes to the longest name shown, so
// "PowerShell", "ToolSearch" and "WebSearch" never overlap their argument (a longer name truncates with a tooltip),
// and PowerShell, WebSearch, WebFetch and ToolSearch draw their own glyphs, not the generic one.
import './jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
// work.jsx is loaded after jsx.mjs registers its hooks (a static import would resolve first).
const { LogRow, TOOL_GLYPH, TOOL_ICON, TOOL_NAME_MAX, toolGlyph, toolNameWidth } = await import('../src/ui/work.jsx');

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');

test('the tool glyphs: PowerShell is a shell, WebSearch and WebFetch the globe, ToolSearch a search, Agent the task', () => {
  const generic = toolGlyph('SomethingNew');
  assert.equal(generic, TOOL_GLYPH.Read, 'unknown tools keep the generic glyph');
  assert.equal(toolGlyph('PowerShell'), TOOL_GLYPH.Bash);
  assert.equal(toolGlyph('WebSearch'), toolGlyph('WebFetch'));
  assert.ok(toolGlyph('WebSearch').startsWith('M12 3.5a8.5 8.5 0 1 0 0 17'), 'a globe: the circle, then its equator and meridians');
  assert.equal(toolGlyph('ToolSearch'), TOOL_GLYPH.Grep);
  assert.equal(toolGlyph('Agent'), TOOL_GLYPH.Task);
  for (const t of ['PowerShell', 'WebSearch', 'WebFetch', 'ToolSearch', 'Task', 'Agent', 'Bash']) {
    assert.notEqual(toolGlyph(t), generic, `${t} has its own glyph`);
    assert.ok(TOOL_ICON[t], `${t} has a named log icon`);
  }
  assert.equal(TOOL_ICON.PowerShell, 'terminal');
  assert.equal(TOOL_ICON.WebSearch, 'orbit');
});

test('the name column fits the longest name shown: at least the board\'s 7ch, at most the cap', () => {
  assert.equal(toolNameWidth([]), '7ch');
  assert.equal(toolNameWidth(['Read', 'Edit', 'Bash']), '7ch');
  assert.equal(toolNameWidth(['Read', 'PowerShell']), '10ch');
  assert.equal(toolNameWidth(['ToolSearch', 'WebSearch', undefined]), '10ch');
  assert.equal(toolNameWidth(['mcp__claude-in-chrome__navigate']), `${TOOL_NAME_MAX}ch`);
});

test('a tool row\'s name cell carries the sizing class and its full name as a tooltip', () => {
  const html = renderToStaticMarkup(createElement(LogRow, { tool: 'PowerShell', args: 'git status', d: toolGlyph('PowerShell') }));
  assert.match(html, /class="log-row log-row-fit"/);
  assert.match(html, /<span class="log-tool" title="PowerShell">PowerShell<\/span>/);
  const css = read('../src/styles/tool-row-fit.css');
  assert.match(css, /\.log > \.log-row\.log-row-fit \{ grid-template-columns: 16px 16px auto minmax\(0, 1fr\) auto auto; \}/);
  assert.match(css, /\.log-row-fit \.log-tool \{ width: var\(--log-tool, 7ch\);[^}]*text-overflow: ellipsis/);
  assert.match(read('../src/ui/work.jsx'), /import '\.\.\/styles\/tool-row-fit\.css';/);
  // The cockpit sets the width on the conversation from every row it shows.
  assert.match(read('../src/screens/cockpit/Working.jsx'), /style=\{\{ '--log-tool': toolW \}\}/);
  // The handoff's stylesheet stays as drawn: the fit lives in its own file.
  assert.match(read('../src/styles/nexus.css'), /\.log-row \{ display: grid; grid-template-columns: 16px 16px 52px minmax\(0, 1fr\) auto auto;/);
});
