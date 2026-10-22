// Agent markdown and highlighted commands (spec 47, A5): the parser's every construct, nesting, a streaming
// (unclosed) fence, HTML kept as text, an ASCII diagram's spacing; the link scheme filter; the shell tokenizer; and
// both themes defining every --syn-* token.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseInline, parseMarkdown, safeHref, splitRow } from '../src/ui/markdown.js';
import { tokenizeShell, toolArgTokens } from '../src/ui/shell-syntax.js';

const T = (text) => ({ type: 'text', text });
const P = (...children) => ({ type: 'paragraph', children });

test('ATX headings, one to four (and six) hashes, closing hashes dropped', () => {
  assert.deepEqual(parseMarkdown('# One\n## Two ##\n### Three\n#### Four\n###### Six'), [
    { type: 'heading', level: 1, children: [T('One')] },
    { type: 'heading', level: 2, children: [T('Two')] },
    { type: 'heading', level: 3, children: [T('Three')] },
    { type: 'heading', level: 4, children: [T('Four')] },
    { type: 'heading', level: 6, children: [T('Six')] },
  ]);
  assert.deepEqual(parseMarkdown('#hashtag'), [P(T('#hashtag'))], 'no space: not a heading');
});

test('paragraphs split on blank lines; a newline inside one is a line break', () => {
  assert.deepEqual(parseMarkdown('one\ntwo\n\nthree'), [P(T('one'), { type: 'br' }, T('two')), P(T('three'))]);
  assert.deepEqual(parseMarkdown(''), []);
  assert.deepEqual(parseMarkdown(undefined), []);
});

test('bold, italic, both, inline code, and _ never inside a word', () => {
  assert.deepEqual(parseInline('**b** *i* __b__ _i_ ***bi***'), [
    { type: 'strong', children: [T('b')] }, T(' '), { type: 'em', children: [T('i')] }, T(' '),
    { type: 'strong', children: [T('b')] }, T(' '), { type: 'em', children: [T('i')] }, T(' '),
    { type: 'strong', children: [{ type: 'em', children: [T('bi')] }] },
  ]);
  assert.deepEqual(parseInline('snake_case_name and 2 * 3 * 4'), [T('snake_case_name and 2 * 3 * 4')]);
  assert.deepEqual(parseInline('run `npm  test` now'), [T('run '), { type: 'code', text: 'npm  test' }, T(' now')]);
  assert.deepEqual(parseInline('`` a `tick` ``'), [{ type: 'code', text: 'a `tick`' }]);
  assert.deepEqual(parseInline('**not *closed'), [T('**not *closed')], 'a streaming half-mark stays text');
  assert.deepEqual(parseInline('*a **b** c*'), [{ type: 'em', children: [T('a '), { type: 'strong', children: [T('b')] }, T(' c')] }]);
  assert.deepEqual(parseInline('\\*literal\\*'), [T('*literal*')]);
});

test('links: http and https only, opened as links; any other scheme keeps only its text', () => {
  assert.deepEqual(parseInline('[the spec](https://example.com/a_(b))'), [{ type: 'link', href: 'https://example.com/a_(b)', children: [T('the spec')] }]);
  assert.deepEqual(parseInline('[x](javascript:alert(1))'), [{ type: 'span', children: [T('x')] }]);
  assert.deepEqual(parseInline('[x](data:text/html,hi)'), [{ type: 'span', children: [T('x')] }]);
  assert.deepEqual(parseInline('see https://example.com/x.'), [T('see '), { type: 'link', href: 'https://example.com/x', children: [T('https://example.com/x')] }, T('.')]);
  assert.deepEqual(parseInline('<https://e.com>'), [{ type: 'link', href: 'https://e.com', children: [T('https://e.com')] }]);
  assert.equal(safeHref('https://e.com'), 'https://e.com');
  assert.equal(safeHref('HTTP://e.com'), 'HTTP://e.com');
  assert.equal(safeHref('javascript:alert(1)'), null);
  assert.equal(safeHref(' javascript:x'), null);
  assert.equal(safeHref('file:///etc/passwd'), null);
  assert.equal(safeHref('/relative'), null);
  assert.equal(safeHref(''), null);
});

test('HTML in the text is text, never markup', () => {
  assert.deepEqual(parseMarkdown('<script>alert(1)</script>\n<b>hi</b>'), [P(T('<script>alert(1)</script>'), { type: 'br' }, T('<b>hi</b>'))]);
  assert.deepEqual(parseMarkdown('```html\n<img src=x onerror=y>\n```'), [{ type: 'code', lang: 'html', text: '<img src=x onerror=y>', open: false }]);
});

test('lists: unordered and ordered, nested by indent, with a lazy line and a loose blank', () => {
  const md = '- one\n- two\n  - two a\n    - two a i\n  - two b\n- three\ncontinued\n\n- four\n\n1. first\n2. second\n\n3) third';
  const [ul, ol] = parseMarkdown(md);
  assert.equal(ul.type, 'list');
  assert.equal(ul.ordered, false);
  assert.equal(ul.items.length, 4);
  const nested = ul.items[1].children[1];
  assert.equal(nested.type, 'list');
  assert.deepEqual(nested.items.map((it) => it.children[0].children[0].text), ['two a', 'two b']);
  assert.equal(nested.items[0].children[1].items[0].children[0].children[0].text, 'two a i');
  assert.deepEqual(ul.items[2].children, [P(T('three'), { type: 'br' }, T('continued'))]);
  assert.equal(ol.ordered, true);
  assert.equal(ol.start, 1);
  assert.equal(ol.items.length, 2, '3) is another list');
  assert.equal(parseMarkdown('4. four\n5. five')[0].start, 4);
  assert.deepEqual(parseMarkdown('Steps:\n- a\n- b').map((b) => b.type), ['paragraph', 'list'], 'a list interrupts a paragraph');
});

test('a list item holds a fenced block indented under it', () => {
  const [list] = parseMarkdown('1. run it:\n   ```sh\n   npm test\n   ```\n2. done');
  assert.equal(list.items.length, 2);
  assert.deepEqual(list.items[0].children[1], { type: 'code', lang: 'sh', text: 'npm test', open: false });
});

test('blockquotes nest blocks; horizontal rules', () => {
  assert.deepEqual(parseMarkdown('> **note**\n> - a\n\n---\n***'), [
    { type: 'quote', children: [P({ type: 'strong', children: [T('note')] }), { type: 'list', ordered: false, start: 1, tight: true, items: [{ children: [P(T('a'))] }] }] },
    { type: 'hr' },
    { type: 'hr' },
  ]);
});

test('fenced blocks: backticks and tildes, a language tag, a longer close', () => {
  assert.deepEqual(parseMarkdown('~~~js\nlet a = 1;\n~~~'), [{ type: 'code', lang: 'js', text: 'let a = 1;', open: false }]);
  assert.deepEqual(parseMarkdown('````\n```\ninner\n```\n````'), [{ type: 'code', lang: '', text: '```\ninner\n```', open: false }]);
  assert.deepEqual(parseMarkdown('text\n```\ncode\n```\nafter').map((b) => b.type), ['paragraph', 'code', 'paragraph']);
});

test('a streaming message with an unclosed fence renders the code so far', () => {
  const parts = '## Plan\n\n```text\n47.1 --> 47.2\n  |\n';
  assert.deepEqual(parseMarkdown(parts), [
    { type: 'heading', level: 2, children: [T('Plan')] },
    { type: 'code', lang: 'text', text: '47.1 --> 47.2\n  |\n', open: true },
  ]);
  // Every prefix of a message parses without throwing.
  const full = '# T\n\n- **a** `b`\n  1. c\n\n| x | y |\n|---|:-:|\n| 1 | 2 |\n\n> q\n\n```\nz\n```\n[l](https://e.com)';
  for (let n = 0; n <= full.length; n += 1) assert.doesNotThrow(() => parseMarkdown(full.slice(0, n)));
});

test('a long ASCII diagram keeps every space and line', () => {
  const art = [
    '  47.1 ──┬── 47.2 ───────────── 47.5',
    '         │                       │',
    '         └── 47.3   ◆ 47.6 (new) ┘',
    '                     \\    /',
    '    a  b   c    d      e       f         g          h           i            j             k',
  ].join('\n');
  const [b] = parseMarkdown(`The build order:\n\n\`\`\`\n${art}\n\`\`\``).slice(1);
  assert.equal(b.type, 'code');
  assert.equal(b.text, art);
});

test('GitHub tables: alignment, inline marks in cells, escaped and code pipes, ragged rows', () => {
  const [t] = parseMarkdown('| Chunk | Size | Note |\n|:--|:-:|--:|\n| **47.6** | M | `a|b` |\n| 47.7 \\| x |\n');
  assert.equal(t.type, 'table');
  assert.deepEqual(t.align, ['left', 'center', 'right']);
  assert.deepEqual(t.head, [[T('Chunk')], [T('Size')], [T('Note')]]);
  assert.deepEqual(t.rows[0], [[{ type: 'strong', children: [T('47.6')] }], [T('M')], [{ type: 'code', text: 'a|b' }]]);
  assert.deepEqual(t.rows[1], [[T('47.7 | x')], [], []]);
  assert.deepEqual(splitRow('a | b'), ['a', 'b']);
  assert.deepEqual(parseMarkdown('a | b\nnot a table').map((b) => b.type), ['paragraph']);
});

// ---- the shell tokenizer ---------------------------------------------------

const kinds = (s) => tokenizeShell(s).filter((t) => t.t !== 'ws').map((t) => [t.t, t.v]);

test('the shell tokenizer is lossless', () => {
  for (const s of ['git commit -a -q -m "feat: x"', 'cd a && npm test 2>&1 | tail -5', "echo 'unclosed", 'FOO=1 BAR=$HOME node x.mjs # note', '']) {
    assert.equal(tokenizeShell(s).map((t) => t.v).join(''), s);
  }
});

test('command words, flags, strings, paths, numbers, variables, operators, comments', () => {
  assert.deepEqual(kinds('cd Z:/nexus && git log --oneline -5 | grep "feat: x" > out.txt; echo $HOME ${PWD} # done'), [
    ['cmd', 'cd'], ['path', 'Z:/nexus'], ['op', '&&'], ['cmd', 'git'], ['text', 'log'], ['flag', '--oneline'], ['flag', '-5'], ['op', '|'],
    ['cmd', 'grep'], ['str', '"feat: x"'], ['op', '>'], ['path', 'out.txt'], ['op', ';'], ['cmd', 'echo'], ['var', '$HOME'], ['var', '${PWD}'],
    ['comment', '# done'],
  ]);
  assert.deepEqual(kinds('NODE_ENV=test node --test "test/*.test.mjs"'), [['var', 'NODE_ENV=test'], ['cmd', 'node'], ['flag', '--test'], ['str', '"test/*.test.mjs"']]);
  assert.deepEqual(kinds('sleep 30 || echo $(date)'), [['cmd', 'sleep'], ['num', '30'], ['op', '||'], ['cmd', 'echo'], ['op', '$('], ['cmd', 'date'], ['op', ')']]);
  assert.deepEqual(kinds('npm test 2>&1'), [['cmd', 'npm'], ['text', 'test'], ['op', '2>&1']]);
  assert.deepEqual(kinds('echo "a \\" b" \'c\''), [['cmd', 'echo'], ['str', '"a \\" b"'], ['str', "'c'"]]);
});

test('a tool row\'s summary: Bash as shell, Grep as a string, file tools as a path, others plain', () => {
  assert.equal(toolArgTokens('Bash', 'ls -la')[0].t, 'cmd');
  assert.deepEqual(toolArgTokens('Grep', 'foo|bar'), [{ t: 'str', v: 'foo|bar' }]);
  assert.deepEqual(toolArgTokens('Read', 'src/a.js'), [{ t: 'path', v: 'src/a.js' }]);
  assert.deepEqual(toolArgTokens('Task', 'build 47.6'), [{ t: 'text', v: 'build 47.6' }]);
  assert.deepEqual(toolArgTokens('Bash', ''), []);
});

// ---- the theme tokens ------------------------------------------------------

test('both themes define every --syn-* token the highlighter paints with, from existing tokens only', () => {
  const css = fs.readFileSync(new URL('../src/styles/markdown.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const block = (sel) => {
    const at = css.indexOf(`${sel} {`);
    assert.ok(at !== -1, `${sel} block`);
    return css.slice(at, css.indexOf('}', at));
  };
  const night = block(':root,\n[data-theme="dark"]');
  const day = block('[data-theme="light"]');
  const used = new Set([...css.matchAll(/var\((--syn-[a-z]+)\)/g)].map((m) => m[1]));
  const kinds = new Set(['cmd', 'flag', 'str', 'path', 'num', 'var', 'op']);
  for (const k of kinds) used.add(`--syn-${k}`);
  for (const tok of used) {
    assert.match(night, new RegExp(`${tok}:\\s*var\\(--[a-z0-9-]+\\);`), `night defines ${tok}`);
    assert.match(day, new RegExp(`${tok}:\\s*var\\(--[a-z0-9-]+\\);`), `day defines ${tok}`);
  }
  // Every token they lean on is one of the design's, defined in both of nexus.css's theme blocks (or once in :root).
  const nexus = fs.readFileSync(new URL('../src/styles/nexus.css', import.meta.url), 'utf8');
  for (const [, ref] of `${night}${day}`.matchAll(/var\((--[a-z0-9-]+)\)/g)) assert.ok(nexus.includes(`${ref}:`), `${ref} is a nexus.css token`);
  // Every token kind the tokenizer emits has a colour class.
  for (const k of ['cmd', 'flag', 'str', 'path', 'num', 'var', 'op', 'comment']) assert.ok(css.includes(`.syn-${k}`), `.syn-${k}`);
});

test('lists are tight unless a blank line splits their items or an item\'s own blocks (GitHub\'s rule)', () => {
  const tight = (md) => parseMarkdown(md)[0].tight;
  assert.equal(tight('- a\n- b\n  - b1\n- c'), true);
  assert.equal(tight('1. a\n2. b'), true);
  assert.equal(tight('- a\n  ```\n  x\n\n  y\n  ```\n- b'), true, 'a blank line inside a fence is code, not looseness');
  assert.equal(tight('- a\n\n- b'), false, 'a blank line between items');
  assert.equal(tight('- a\n\n  more about a\n- b'), false, 'a blank line inside an item');
  const [outer] = parseMarkdown('- a\n  - b\n\n  - c\n- d');
  assert.equal(outer.tight, true, 'a loose nested list leaves its parent tight');
  assert.equal(outer.items[0].children[1].tight, false);
  assert.equal(tight('- a\n- b\n\nAfter the list.'), true, 'a blank line that ends the list is not inside it');
});
