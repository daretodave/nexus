// Highlighted code as drawn (ui/code.jsx, ui/tool-detail.jsx), rendered on the server as the first paint: the quick
// tokens colour a block before the grammar engine arrives, a long block folds, inline code colours what is code and
// leaves words alone, JSON folds by node, an edit is a coloured diff, a tool row's body shows the call and its
// output, and the composer's field carries its coloured copy.
import './jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanOutput, listTokens, parseNumbered } from '../src/ui/syntax/output.js';

const html = (el) => renderToStaticMarkup(el);
const text = (h) => h.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&#x27;/g, "'");

test('a fenced block: coloured in its language at first paint, brackets by depth, a label and a copy button', async () => {
  const { Markdown } = await import('../src/ui/markdown.jsx');
  const out = html(createElement(Markdown, { text: '```ts\nconst f = (a: number) => [a];\n```' }));
  assert.match(out, /<div class="code-box"><pre class="md-pre" data-lang="ts"><code>/);
  assert.match(out, /<span class="syn-kw">const<\/span>/);
  assert.match(out, /<span class="syn-br syn-b1">\(<\/span>/);
  assert.match(out, /<span class="code-lang">ts<\/span><button class="code-btn"/);
  assert.equal(text(out.replace(/<div class="code-tools">[\s\S]*?<\/div>/, '')), 'const f = (a: number) => [a];');
});

test('a fenced block past twelve lines folds to its head with "Show all"; a streaming one never folds', async () => {
  const { Markdown } = await import('../src/ui/markdown.jsx');
  const body = Array.from({ length: 30 }, (_, i) => `line_${i}()`).join('\n');
  const closed = html(createElement(Markdown, { text: `\`\`\`js\n${body}\n\`\`\`` }));
  assert.match(closed, /class="code-box is-folded"/);
  assert.match(closed, />Show all 30 lines</);
  assert.match(closed, /line_7/);
  assert.doesNotMatch(closed, /line_8\b/, 'folded to eight lines');
  const streaming = html(createElement(Markdown, { text: `\`\`\`js\n${body}` }));
  assert.match(streaming, /<pre class="md-pre is-open" data-lang="js">/);
  assert.doesNotMatch(streaming, /is-folded|Show all/);
  assert.match(streaming, /line_29/);
});

test('an unlabelled block stays plain text unless it is JSON', async () => {
  const { Markdown } = await import('../src/ui/markdown.jsx');
  const trace = html(createElement(Markdown, { text: '```\nError: boom\n    at main (x.js:1)\n```' }));
  assert.match(trace, /<pre class="md-pre"><code>Error: boom\n {4}at main \(x\.js:1\)<\/code><\/pre>/);
  const json = html(createElement(Markdown, { text: '```\n{"a": [1]}\n```' }));
  assert.match(json, /<span class="syn-prop">&quot;a&quot;<\/span>/);
  assert.match(json, /<span class="code-lang">json<\/span>/);
});

test('inline code: a command, a path, a snippet coloured; a word stays the plain <code> it was', async () => {
  const { Markdown } = await import('../src/ui/markdown.jsx');
  const out = html(createElement(Markdown, { inline: true, text: 'run `npm test`, open `src/ui/code.jsx`, call `f(x[0])`, see `tool`' }));
  assert.match(out, /<code><span class="syn-cmd">npm<\/span> test<\/code>/);
  assert.match(out, /<code><span class="syn-path">src\/ui\/code\.jsx<\/span><\/code>/);
  assert.match(out, /<span class="syn-fn">f<\/span><span class="syn-br syn-b1">\(<\/span>x<span class="syn-br syn-b2">\[<\/span>/);
  assert.match(out, /<code>tool<\/code>/);
});

test('a JSON tree: rows with fold toggles, deep boxes folded with their counts', async () => {
  const { JsonView } = await import('../src/ui/code.jsx');
  const out = html(createElement(JsonView, { value: { command: 'ls', deep: { a: { b: 1 } } } }));
  assert.match(out, /<pre class="code-pre code-json">/);
  assert.match(out, /<button class="json-fold" type="button" aria-expanded="true" aria-label="Fold"/);
  assert.match(out, /aria-expanded="false" aria-label="Unfold 1"/);
  assert.match(out, /… 1 key /);
  const clipped = html(createElement(JsonView, { text: '{"command":"echo (hi' }));
  assert.match(clipped, /<span class="syn-prop">&quot;command&quot;<\/span>/, 'a clipped summary still colours');
});

test('a diff: the file, its counts, each line in the file\'s language, the unchanged runs counted', async () => {
  const { DiffView } = await import('../src/ui/code.jsx');
  const before = ['import a from "a";', ...Array.from({ length: 10 }, (_, i) => `const x${i} = ${i};`)].join('\n');
  const after = before.replace('const x5 = 5;', 'let x5 = f(5);');
  const out = html(createElement(DiffView, { file: 'src/x.js', before, after }));
  assert.match(out, /<div class="diff code-diff"><div class="diff-head"><b title="src\/x\.js">src\/x\.js<\/b><span class="add">\+1<\/span><span class="del">−1<\/span>/);
  assert.match(out, /<div class="dl dl-del"><span class="ln">7<\/span><span class="sg">−<\/span><span><span class="syn-kw">const<\/span>/);
  assert.match(out, /<div class="dl dl-add"><span class="ln">7<\/span><span class="sg">\+<\/span><span><span class="syn-kw">let<\/span>/);
  assert.match(out, /3 unchanged lines/);
});

test('a tool row\'s body: the whole command, an edit\'s diff, a Read\'s numbered contents, a Grep\'s matches', async () => {
  const { ToolDetail, callView, outputView } = await import('../src/ui/tool-detail.jsx');
  const bash = html(createElement(ToolDetail, { tool: 'Bash', args: 'cat <<EOF x EOF', input: { command: 'cat <<EOF\nx\nEOF', description: 'd' }, output: '\u001b[32mok\u001b[0m' }));
  assert.match(bash, /<span class="syn-cmd">cat<\/span>/);
  assert.match(bash, /<span class="syn-cmd">cat<\/span> <span class="syn-op">&lt;&lt;EOF<\/span>\n<span class="syn-str">x\n<\/span><span class="syn-op">EOF<\/span>/, 'the whole command, a heredoc body one string');
  assert.match(bash, /<span class="code-cap">output<\/span>/);
  assert.doesNotMatch(bash, /\u001b/, 'terminal colours are dropped');
  assert.deepEqual(callView('Edit', { file_path: 'a.js', old_string: 'a', new_string: 'b' }).kind, 'diff');
  assert.deepEqual(callView('Write', { file_path: 'a.py', content: 'x' }), { kind: 'code', lang: 'python', text: 'x', label: 'a.py' });
  assert.equal(callView('Task', { prompt: 'p', description: 'd' }).kind, 'json');
  assert.deepEqual(callView('Bash', null, 'ls'), { kind: 'code', lang: 'shell', text: 'ls', label: 'shell' }, 'an old call: its summary');
  const read = outputView('Read', { file_path: 'x.ts' }, '     1→const a = 1;\n     2→let b = 2;\n<system-reminder>hi</system-reminder>');
  assert.deepEqual(read, { kind: 'code', lang: 'typescript', text: 'const a = 1;\nlet b = 2;', numbered: [1, 2] });
  const shown = html(createElement(ToolDetail, { tool: 'Read', args: 'x.ts', input: { file_path: 'x.ts' }, output: '     1→const a = 1;' }));
  assert.match(shown, /<span class="code-ln">1<\/span><span class="syn-kw">const<\/span>/);
  const grep = html(createElement(ToolDetail, { tool: 'Grep', args: 'foo', input: { pattern: 'foo' }, output: 'src/a.js:12:  foo()' }));
  assert.match(grep, /<span class="syn-path">src\/a\.js<\/span><span class="syn-punct">:<\/span><span class="syn-num">12<\/span>/);
  const failed = html(createElement(ToolDetail, { tool: 'Bash', args: 'x', error: 'boom' }));
  assert.match(failed, /<pre class="code-pre is-error"><code>boom<\/code><\/pre>/);
});

test('the permission card for an edit shows the change itself as a coloured diff', async () => {
  const { PermissionCard, permissionCard } = await import('../src/ui/permission-card.jsx');
  const input = { file_path: 'src/a.js', old_string: 'const a = 1;', new_string: 'const a = 2;' };
  const req = { tool: 'Edit', title: 'Edit', args: 'src/a.js', summary: JSON.stringify(input), input };
  assert.equal(permissionCard(req).change, true);
  assert.equal(permissionCard({ ...req, tool: 'Bash', input: { command: 'ls' } }).change, false, 'a command needs no second panel');
  const out = html(createElement(PermissionCard, { req, who: 'main' }));
  assert.match(out, /<div class="perm-change"><div class="tool-detail"><div class="diff code-diff">/);
  assert.match(out, /<div class="dl dl-add">/);
  assert.match(out, /<details class="perm-raw"><summary>Raw input<\/summary><div class="code-box"><pre class="code-pre perm-json code-json">/);
});

test('the composer\'s field: the real textarea with its text transparent, the coloured copy over it', async () => {
  const { Composer } = await import('../src/ui/composer.jsx');
  const out = html(createElement(Composer, { value: '/plot fix `npm test` (soon)', onChange() {} }));
  assert.match(out, /<div class="syn-field"><textarea class="syn-input" rows="2" aria-label="Message the session"/);
  assert.match(out, /<div class="syn-mirror" aria-hidden="true"><span class="syn-slash">\/plot<\/span>/);
  assert.match(out, /<span class="syn-cmd">npm<\/span>/);
  assert.match(out, /<span class="syn-br syn-b1">\(<\/span>soon<span class="syn-br syn-b1">\)<\/span>/);
  const { SyntaxTextarea } = await import('../src/ui/code.jsx');
  const nl = html(createElement(SyntaxTextarea, { value: 'a\n', onChange() {} }));
  assert.match(nl, /<div class="syn-mirror" aria-hidden="true">a\n​<\/div>/, 'a trailing newline keeps its line in the copy');
});

test('output: escapes and reminders dropped, numbered lines split, list lines coloured', () => {
  assert.equal(cleanOutput('\u001b[1mbold\u001b[0m\n\n<system-reminder>\nx\n</system-reminder>\n'), 'bold');
  assert.equal(parseNumbered('just a note'), null);
  assert.deepEqual(parseNumbered('  9\tx\n 10\ty\n'), { nums: [9, 10], code: 'x\ny' });
  const t = listTokens('Found 2 files\nsrc/a.js\nC:\\r\\b.ts:3:hit');
  assert.deepEqual(t.filter((x) => x.t !== 'ws').map((x) => x.t), ['comment', 'path', 'path', 'punct', 'num', 'punct', 'text']);
});
