// The highlighter's pure parts: the token passes (rainbow brackets, lines, folding), the quick tokenizer, the
// grammar engine's tree read into tokens, the composer's prose-with-code tokens, the JSON tree, the edit diff, and
// the theme tokens they paint with. Every tokenizer is lossless: its tokens, joined, are its input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BRACKET_DEPTHS, foldPlan, hasColour, lineCount, mergeRuns, rainbow, splitLines, takeLines, tokenClass } from '../src/ui/syntax/tokens.js';
import { liteTokens, jsonTokens } from '../src/ui/syntax/lite.js';
import { langOf, langOfPath, ENGINE_LANGS, FAMILY } from '../src/ui/syntax/langs.js';
import { hastTokens, scopeKind } from '../src/ui/syntax/hast.js';
import { draftTokens, inlineTokens, looksLikePath } from '../src/ui/syntax/draft.js';
import { defaultFolds, jsonRows, parseJson } from '../src/ui/syntax/json.js';
import { diffLines, trimContext } from '../src/ui/syntax/diff.js';
import { codeTokens } from '../src/ui/syntax/highlighter.js';

const join = (tokens) => tokens.map((t) => t.v).join('');
const kinds = (tokens) => tokens.filter((t) => t.t !== 'ws').map((t) => [t.t, t.v]);
const brackets = (tokens) => tokens.filter((t) => t.t === 'br').map((t) => `${t.v}${t.d}`).join(' ');

// ---- rainbow brackets ------------------------------------------------------------------------------------------

test('rainbow: each depth its colour, a closer the colour of its opener, strings and comments left alone', () => {
  const tokens = rainbow([{ t: 'text', v: 'f(a[0], {b: (c)})' }]);
  assert.equal(join(tokens), 'f(a[0], {b: (c)})', 'lossless');
  assert.equal(brackets(tokens), '(1 [2 ]2 {2 (3 )3 }2 )1');
  const quiet = rainbow([{ t: 'str', v: '"(not)"' }, { t: 'comment', v: '// [nope]' }, { t: 'text', v: '()' }]);
  assert.equal(brackets(quiet), '(1 )1', 'brackets in a string or a comment are prose');
});

test('rainbow: depths cycle; a stray closer is the error ink; an opener left open keeps its colour', () => {
  const deep = rainbow([{ t: 'text', v: '('.repeat(BRACKET_DEPTHS + 1) }]);
  assert.equal(deep[BRACKET_DEPTHS].d, 1, 'the seventh comes back round to the first colour');
  assert.equal(brackets(rainbow([{ t: 'text', v: 'a) (b]' }])), ')0 (1 ]0');
  assert.equal(brackets(rainbow([{ t: 'text', v: 'if (x {' }])), '(1 {2', 'still streaming, not an error');
  assert.equal(tokenClass({ t: 'br', v: ')', d: 0 }), 'syn-br syn-bx');
  assert.equal(tokenClass({ t: 'br', v: '(', d: 2 }), 'syn-br syn-b2');
  assert.equal(tokenClass({ t: 'text', v: 'x' }), null);
});

test('rainbow carries through shell tokens: $( and ) pair up, a quoted paren does not count', () => {
  const tokens = rainbow(liteTokens('shell', 'echo $(date "+(%s)") && (cd x)'));
  assert.equal(brackets(tokens), '(1 )1 (1 )1');
});

test('a heredoc body is one string up to its closing word; <<- allows an indented close', () => {
  const src = "cat <<'EOF' > out.txt\nline (1)\n  $HOME\nEOF\necho done";
  const tokens = liteTokens('shell', src);
  assert.equal(join(tokens), src);
  assert.deepEqual(kinds(tokens), [['cmd', 'cat'], ['op', "<<'EOF'"], ['op', '>'], ['path', 'out.txt'], ['str', 'line (1)\n  $HOME\n'], ['op', 'EOF'], ['cmd', 'echo'], ['text', 'done']]);
  const dash = liteTokens('shell', 'cat <<-END\n\tx\n\tEND');
  assert.deepEqual(kinds(dash).slice(-2), [['str', '\tx\n'], ['op', '\tEND']]);
  const open = liteTokens('shell', 'cat <<EOF\nstill typing');
  assert.deepEqual(kinds(open).slice(-1), [['str', 'still typing']], 'an unclosed heredoc is string to the end');
  assert.equal(join(liteTokens('shell', 'cat <<< "x"')), 'cat <<< "x"', 'a here-string is not a heredoc');
  // Its second '<' must not start a heredoc either: the next line is a command again, not a string.
  const hs = liteTokens('shell', 'cat <<< word\nls');
  assert.equal(join(hs), 'cat <<< word\nls');
  assert.deepEqual(kinds(hs), [['cmd', 'cat'], ['op', '<<<'], ['text', 'word'], ['cmd', 'ls']]);
  assert.ok(!kinds(liteTokens('shell', 'cat <<<EOF\necho hi\nEOF\nls')).some(([t]) => t === 'str'), 'no heredoc body');
});

// ---- lines and folding ------------------------------------------------------------------------------------------

test('lines: split at newlines, cut to the first n, counted with a closing newline', () => {
  const tokens = [{ t: 'kw', v: 'a\nb' }, { t: 'text', v: 'c\nd\n' }];
  assert.deepEqual(splitLines(tokens).map(join), ['a', 'bc', 'd', '']);
  assert.equal(join(takeLines(tokens, 2)), 'a\nbc');
  assert.equal(join(takeLines(tokens, 1)), 'a');
  assert.equal(join(takeLines(tokens, 9)), 'a\nbc\nd\n');
  assert.equal(lineCount('a\nb\n'), 2);
  assert.equal(lineCount('a\nb'), 2);
  assert.equal(lineCount(''), 0);
});

test('fold: past twelve lines a block folds to eight; a block barely over stays whole', () => {
  assert.deepEqual(foldPlan(12), { fold: false, keep: 12, hidden: 0 });
  assert.deepEqual(foldPlan(40), { fold: true, keep: 8, hidden: 32 });
  assert.equal(foldPlan(13, { at: 12, keep: 11 }).fold, false, 'two hidden lines are not worth a button');
});

test('mergeRuns joins plain neighbours and drops empties', () => {
  assert.deepEqual(mergeRuns([{ t: 'text', v: 'a' }, { t: 'text', v: 'b' }, { t: 'kw', v: '' }, { t: 'kw', v: 'x' }, { t: 'kw', v: 'y' }]), [{ t: 'text', v: 'ab' }, { t: 'kw', v: 'x' }, { t: 'kw', v: 'y' }]);
  assert.equal(hasColour([{ t: 'text', v: 'a' }, { t: 'ws', v: ' ' }]), false);
});

// ---- languages ---------------------------------------------------------------------------------------------------

test('fence words and file names find their grammar', () => {
  assert.equal(langOf('TSX'), 'typescript');
  assert.equal(langOf('js'), 'javascript');
  assert.equal(langOf('ps1'), 'powershell');
  assert.equal(langOf('bash'), 'shell');
  assert.equal(langOf('{.yaml}'), 'yaml');
  assert.equal(langOf('nonsense'), '');
  assert.equal(langOfPath('src/ui/code.jsx'), 'javascript');
  assert.equal(langOfPath('C:\\repo\\Dockerfile'), 'dockerfile');
  assert.equal(langOfPath('.env.local'), 'ini');
  assert.equal(langOfPath('notes'), '');
  for (const l of ENGINE_LANGS) assert.ok(FAMILY[l], `${l} has a quick family`);
  assert.ok(!ENGINE_LANGS.has('shell'), 'shell stays with the hand-written tokenizer');
});

// ---- the quick tokenizer ----------------------------------------------------------------------------------------

test('lite: keywords, calls, types, strings, numbers and comments in a C-like grammar; lossless', () => {
  const src = 'const x = await fetch("/api", { n: 42 }); // go\nclass Foo extends Bar {}';
  const tokens = liteTokens('typescript', src);
  assert.equal(join(tokens), src);
  const k = kinds(tokens);
  for (const want of [['kw', 'const'], ['kw', 'await'], ['fn', 'fetch'], ['str', '"/api"'], ['num', '42'], ['comment', '// go'], ['kw', 'class'], ['type', 'Foo'], ['type', 'Bar']]) {
    assert.ok(k.some(([t, v]) => t === want[0] && v === want[1]), `${want[0]} ${want[1]}`);
  }
});

test('lite: hash comments and triple strings (python), keys (yaml), sections (ini), keywords (sql)', () => {
  const py = liteTokens('python', 'def f(x):\n    """doc (x)"""\n    return None  # done');
  assert.ok(kinds(py).some(([t, v]) => t === 'str' && v === '"""doc (x)"""'));
  assert.ok(kinds(py).some(([t, v]) => t === 'comment' && v === '# done'));
  assert.ok(kinds(py).some(([t, v]) => t === 'lit' && v === 'None'));
  const yaml = liteTokens('yaml', 'name: ci\njobs:\n  - run: npm test # quick');
  assert.deepEqual(kinds(yaml).filter(([t]) => t === 'prop').map(([, v]) => v), ['name', 'jobs', 'run']);
  const ini = liteTokens('ini', '[core]\nbare = false');
  assert.deepEqual(kinds(ini)[0], ['type', '[core]']);
  const sql = liteTokens('sql', 'SELECT id FROM users WHERE n > 1 -- all');
  assert.deepEqual(kinds(sql).filter(([t]) => t === 'kw').map(([, v]) => v), ['SELECT', 'FROM', 'WHERE']);
});

test('lite: JSON keys apart from values; a clipped string still tokenizes', () => {
  const tokens = jsonTokens('{"command": "ls -la", "n": -1.5e3, "ok": true, "x": null}');
  assert.deepEqual(kinds(tokens).filter(([t]) => t !== 'punct' && t !== 'text'), [
    ['prop', '"command"'], ['str', '"ls -la"'], ['prop', '"n"'], ['num', '-1.5e3'], ['prop', '"ok"'], ['lit', 'true'], ['prop', '"x"'], ['lit', 'null'],
  ]);
  const clipped = '{"command":"echo \\"hi';
  assert.equal(join(jsonTokens(clipped)), clipped);
});

test('lite: a diff by its line marks, markup by its tags, an unknown grammar plain', () => {
  const d = liteTokens('diff', '--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new\n same');
  assert.deepEqual(kinds(d).map(([t]) => t), ['meta', 'meta', 'hunk', 'del', 'add', 'text']);
  const x = liteTokens('xml', '<div class="a">hi <!-- c --></div>');
  assert.ok(kinds(x).some(([t, v]) => t === 'tag' && v === 'div'));
  assert.ok(kinds(x).some(([t, v]) => t === 'prop' && v === 'class'));
  assert.ok(kinds(x).some(([t, v]) => t === 'str' && v === '"a"'));
  assert.deepEqual(liteTokens('', 'plain'), [{ t: 'text', v: 'plain' }]);
  assert.deepEqual(liteTokens('javascript', ''), []);
});

test('lite is lossless on every family', () => {
  const src = 'x = {"a": [1, 2]} # (c)\n/* b */ `t` \'s\' <p a="1">q</p>\n@@ -1 +1 @@\n-a\n+b';
  for (const lang of [...ENGINE_LANGS, 'shell', '']) assert.equal(join(liteTokens(lang, src)), src, lang);
});

// ---- the grammar engine's tree ------------------------------------------------------------------------------------

test('scopes: highlight.js classes to kinds, sub-scopes first', () => {
  assert.equal(scopeKind(['hljs-keyword']), 'kw');
  assert.equal(scopeKind(['hljs-title', 'class_']), 'type');
  assert.equal(scopeKind(['hljs-title', 'function_']), 'fn');
  assert.equal(scopeKind(['hljs-title', 'class_', 'inherited__']), 'type');
  assert.equal(scopeKind(['hljs-variable', 'language_']), 'builtin');
  assert.equal(scopeKind(['hljs-unknown']), null);
});

test('the engine through lowlight: a tree read into lossless tokens, a literal keeping its colour', async () => {
  const { createLowlight } = await import('lowlight');
  const ts = (await import('highlight.js/lib/languages/typescript')).default;
  const json = (await import('highlight.js/lib/languages/json')).default;
  const low = createLowlight();
  low.register({ typescript: ts, json });
  const src = 'class Foo extends Bar {\n  run(n: number) { return `x${n}`; } // hi\n}';
  const tokens = hastTokens(low.highlight('typescript', src));
  assert.equal(join(tokens), src);
  const k = kinds(tokens);
  assert.ok(k.some(([t, v]) => t === 'kw' && v === 'class'));
  assert.ok(k.some(([t, v]) => t === 'type' && v === 'Foo'));
  assert.ok(k.some(([t, v]) => t === 'comment' && v === '// hi'));
  assert.ok(k.some(([t, v]) => t === 'var' && v === '${n}'), 'a template substitution is code, not string');
  const j = hastTokens(low.highlight('json', '{"a": [true, null]}'));
  assert.deepEqual(kinds(j).filter(([t]) => t === 'lit'), [['lit', 'true'], ['lit', 'null']], 'true inside a literal stays a literal');
  assert.equal(brackets(rainbow(j)), '{1 [2 ]2 }1');
});

test('the engine module itself: a grammar loads on demand and draws', async () => {
  const engine = await import('../src/ui/syntax/engine.js');
  assert.equal(engine.highlight('python', 'x = 1'), null, 'nothing before the grammar loads');
  assert.equal(await engine.loadGrammar('python'), true);
  assert.equal(await engine.loadGrammar('nope'), false);
  const tokens = engine.highlight('python', 'def f():\n    return 1');
  assert.ok(tokens.some((t) => t.t === 'kw' && t.v === 'def'));
  for (const l of ENGINE_LANGS) assert.ok(engine.GRAMMARS[l], `a chunk for ${l}`);
});

test('the highlighter on the server: the quick tokens, the engine never fetched', () => {
  const tokens = codeTokens('javascript', 'let a = f(1)');
  assert.ok(tokens.some((t) => t.t === 'kw' && t.v === 'let'));
  assert.deepEqual(codeTokens('javascript', ''), []);
});

// ---- prose with code (the composer) -----------------------------------------------------------------------------

test('draft: a /command, inline code, a path, a url, a flag and a mention; lossless', () => {
  const src = '/plot fix `npm run build` in src/ui/code.jsx, see https://x.dev/a?b=1. Use --force @main (soon)';
  const tokens = draftTokens(src);
  assert.equal(join(tokens), src);
  const k = kinds(tokens);
  assert.deepEqual(k[0], ['slash', '/plot']);
  assert.ok(k.some(([t, v]) => t === 'cmd' && v === 'npm'), 'inline code goes through the shell tokenizer');
  assert.ok(k.some(([t, v]) => t === 'path' && v === 'src/ui/code.jsx'));
  assert.ok(k.some(([t, v]) => t === 'url' && v === 'https://x.dev/a?b=1'), 'the url stops before the full stop');
  assert.ok(k.some(([t, v]) => t === 'flag' && v === '--force'));
  assert.ok(k.some(([t, v]) => t === 'var' && v === '@main'));
  assert.equal(brackets(rainbow(tokens)), '(1 )1', 'brackets in prose are left for the rainbow');
});

test('draft: a fence body in its language, closed or still being typed', () => {
  const closed = draftTokens('look:\n```js\nconst a = [1];\n```\nok');
  assert.equal(join(closed), 'look:\n```js\nconst a = [1];\n```\nok');
  assert.ok(kinds(closed).some(([t, v]) => t === 'kw' && v === 'const'));
  assert.deepEqual(kinds(closed).filter(([t]) => t === 'fence').map(([, v]) => v), ['```js', '```']);
  const open = draftTokens('```py\ndef f(');
  assert.equal(join(open), '```py\ndef f(');
  assert.ok(kinds(open).some(([t, v]) => t === 'kw' && v === 'def'));
  const half = draftTokens('run `git sta');
  assert.equal(join(half), 'run `git sta');
  assert.ok(kinds(half).some(([t, v]) => t === 'cmd' && v === 'git'), 'an unclosed tick colours what follows as code');
  const custom = draftTokens('```js\nx\n```', () => [{ t: 'kw', v: 'x' }]);
  // A leading absolute path is a path, not a /command; a /command alone or before a space still is.
  assert.deepEqual(kinds(draftTokens('/usr/bin/node crashes')), [['path', '/usr/bin/node'], ['text', ' crashes']]);
  assert.deepEqual(kinds(draftTokens('/plot')), [['slash', '/plot']]);
  assert.deepEqual(kinds(draftTokens('  /next now'))[0], ['slash', '/next']);
  assert.ok(kinds(custom).some(([t, v]) => t === 'kw' && v === 'x'), 'the fence body goes through the given highlighter');
});

test('inline code: commands, paths, flags and snippets coloured; a plain word or version stays plain', () => {
  assert.deepEqual(inlineTokens('tool'), [{ t: 'text', v: 'tool' }]);
  assert.deepEqual(inlineTokens('nexus 2.0.0'), [{ t: 'text', v: 'nexus 2.0.0' }]);
  assert.equal(inlineTokens('git status')[0].t, 'cmd');
  assert.deepEqual(inlineTokens('plan/README.md'), [{ t: 'path', v: 'plan/README.md' }]);
  assert.deepEqual(inlineTokens('--dry-run'), [{ t: 'flag', v: '--dry-run' }]);
  assert.equal(inlineTokens('/tidy dry')[0].t, 'slash');
  assert.ok(inlineTokens('useMemo(() => x, [a])').some((t) => t.t === 'fn' && t.v === 'useMemo'));
  assert.equal(join(inlineTokens('$ npm test')), '$ npm test');
  assert.ok(looksLikePath('C:\\Users\\me'));
  assert.ok(looksLikePath('./x'));
  assert.ok(!looksLikePath('and/or'));
});

// ---- JSON tree ---------------------------------------------------------------------------------------------------

test('json rows: a row per entry, brackets by depth, keys and values by kind', () => {
  const rows = jsonRows({ command: 'ls', opts: { all: true, n: [1, 2] }, none: null });
  const text = rows.map((r) => join(r.tokens)).join('\n');
  assert.equal(text, JSON.stringify({ command: 'ls', opts: { all: true, n: [1, 2] }, none: null }, null, 2));
  assert.deepEqual(rows[0].fold, { path: '', name: 'root', open: true, count: 3 });
  assert.equal(rows.find((r) => r.fold?.path === '/opts/n').fold.name, 'opts.n', 'a toggle is named by its keys');
  const opts = rows.find((r) => r.fold?.path === '/opts');
  assert.equal(opts.tokens.find((t) => t.t === 'br').d, 2);
  assert.ok(rows.some((r) => r.tokens.some((t) => t.t === 'prop' && t.v === '"command"')));
});

test('json rows: a folded box shows on one row with its count; deep boxes start folded', () => {
  const value = { a: { b: { c: [1, 2, 3] } }, list: [] };
  const rows = jsonRows(value, new Set(['/a']));
  const a = rows.find((r) => r.fold?.path === '/a');
  assert.equal(join(a.tokens), '  "a": { … 1 key },');
  assert.equal(a.fold.open, false);
  assert.ok(rows.some((r) => join(r.tokens).includes('"list": []')), 'an empty box never folds');
  assert.deepEqual([...defaultFolds(value)], ['/a/b']);
  assert.deepEqual([...defaultFolds({ big: Array.from({ length: 30 }, (_, i) => i) })], ['/big']);
  // A key holding '/' is escaped, so it never shares a path with a nested key of the same spelling.
  const clash = { 'a/b': { x: { y: 1 } }, a: { b: { x: { y: 1 } } } };
  const paths = jsonRows(clash).filter((r) => r.fold).map((r) => r.fold.path);
  assert.equal(new Set(paths).size, paths.length, 'every box has its own path');
  assert.ok(paths.includes('/a~1b') && paths.includes('/a/b'));
  const folds = jsonRows(clash, new Set(['/a/b'])).filter((r) => r.fold && !r.fold.open).map((r) => r.fold.path);
  assert.deepEqual(folds, ['/a/b'], 'folding one leaves the other open');
  assert.deepEqual([...defaultFolds({ 'p/q': { r: 1 } }, { depth: 1 })], ['/p~1q']);
  assert.equal(parseJson('{"a":'), null);
  assert.deepEqual(parseJson('[1]'), { value: [1] });
});

// ---- the edit diff -----------------------------------------------------------------------------------------------

test('diffLines: the change as kept, removed and added lines, with each side\'s line number', () => {
  const lines = diffLines('a\nb\nc\nd', 'a\nB\nc\nd\ne');
  assert.deepEqual(lines.map((l) => `${l.kind}:${l.text}`), ['ctx:a', 'del:b', 'add:B', 'ctx:c', 'ctx:d', 'add:e']);
  assert.deepEqual(lines[2], { kind: 'add', text: 'B', a: null, b: 1 });
  assert.deepEqual(diffLines('', 'x').map((l) => l.kind), ['add']);
  assert.deepEqual(diffLines('same\n', 'same\n').map((l) => l.kind), ['ctx']);
});

test('trimContext: three lines around each change, the runs between counted', () => {
  const before = Array.from({ length: 20 }, (_, i) => `l${i}`).join('\n');
  const after = before.replace('l10', 'L10');
  const out = trimContext(diffLines(before, after));
  assert.deepEqual(out[0], { kind: 'skip', count: 7 });
  assert.equal(out.filter((l) => l.kind !== 'skip').length, 8);
  assert.deepEqual(out[out.length - 1], { kind: 'skip', count: 6 });
});

// ---- the theme tokens --------------------------------------------------------------------------------------------

test('syntax.css: both themes define every --syn-* token it paints with, from the design\'s tokens only', () => {
  const css = fs.readFileSync(new URL('../src/styles/syntax.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const block = (sel) => {
    const at = css.indexOf(`${sel} {`);
    assert.ok(at !== -1, `${sel} block`);
    return css.slice(at, css.indexOf('}', at));
  };
  const night = block(':root,\n[data-theme="dark"]');
  const day = block('[data-theme="light"]');
  const base = fs.readFileSync(new URL('../src/styles/markdown.css', import.meta.url), 'utf8');
  const used = new Set([...css.matchAll(/var\((--syn-[a-z0-9]+)\)/g)].map((m) => m[1]));
  for (const tok of used) {
    if (base.includes(`${tok}:`)) continue; // a base kind, declared in markdown.css (and tested there)
    assert.match(night, new RegExp(`${tok}:\\s*var\\(--[a-z0-9-]+\\);`), `night defines ${tok}`);
    assert.match(day, new RegExp(`${tok}:\\s*var\\(--[a-z0-9-]+\\);`), `day defines ${tok}`);
  }
  const nexus = fs.readFileSync(new URL('../src/styles/nexus.css', import.meta.url), 'utf8');
  for (const [, ref] of `${night}${day}`.matchAll(/var\((--[a-z0-9-]+)\)/g)) assert.ok(nexus.includes(`${ref}:`), `${ref} is a nexus.css token`);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, 'tokens only: both themes hold');
  for (const k of ['kw', 'fn', 'type', 'builtin', 'lit', 'prop', 'tag', 're', 'meta', 'punct', 'add', 'del', 'hunk', 'slash', 'url', 'code', 'fence', 'comment', 'esc', 'param']) {
    assert.ok(css.includes(`.syn-${k} `), `.syn-${k}`);
  }
  for (let d = 1; d <= BRACKET_DEPTHS; d += 1) assert.ok(css.includes(`.syn-b${d} `), `bracket depth ${d}`);
  assert.ok(css.includes('.syn-bx '), 'the unmatched bracket');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
