// The quick tokenizer: a code block's colours on the first paint, on the server and in tests, before the grammar
// engine (engine.js) arrives, and for good where it never does. Pure and lossless. It knows comments, strings,
// numbers, a shared keyword list, calls, types and punctuation by language family (langs.js FAMILY), JSON as data
// and a diff by its line marks; it is not a parser, so the worst it does is a wrong colour.
import { FAMILY } from './langs.js';
import { tokenizeShell } from '../shell-syntax.js';
import { mergeRuns } from './tokens.js';

const KEYWORDS = new Set((
  'if else elif for while do switch case default break continue return function func fn def class struct enum ' +
  'interface trait impl type const let var val mut static public private protected readonly abstract final ' +
  'import export from as package use mod module require new delete typeof instanceof in of is not and or ' +
  'try catch except finally throw throws raise with yield async await lambda pass go defer select chan map ' +
  'extends implements super this self where match when unless until begin end then fi esac done loop ' +
  'include namespace using virtual override sealed internal extern goto sizeof void get set declare keyof satisfies'
).split(' '));
const LITERALS = new Set('true false null undefined nil none None True False NaN Infinity'.split(' '));
const BUILTINS = new Set((
  'console window document process require module exports Math JSON Object Array String Number Boolean Promise ' +
  'Map Set Symbol Error RegExp Date print len range str int float dict list tuple bool fmt int32 int64 uint u8 ' +
  'i32 i64 usize f32 f64 string number boolean any unknown never object bigint'
).split(' '));
const SQL_KW = new Set((
  'select from where insert into values update set delete create table drop alter add column index primary key ' +
  'foreign references join left right inner outer on group by order having limit offset as and or not null is ' +
  'distinct union all exists between like in case when then else end returning with default unique constraint'
).split(' '));

const COMMENT = {
  c: ['//', '/*'], css: [null, '/*'], hash: ['#', null], yaml: ['#', null], ini: [/[;#]/, null],
  sql: ['--', '/*'], text: [null, null], xml: [null, '<!--'],
};

/** Tokens for one line of a diff, by its first character. */
function diffLine(line) {
  if (/^(\+\+\+|---)( |$)/.test(line) || /^(diff |index |new file|deleted file|similarity|rename )/.test(line)) return { t: 'meta', v: line };
  if (line.startsWith('@@')) return { t: 'hunk', v: line };
  if (line.startsWith('+')) return { t: 'add', v: line };
  if (line.startsWith('-')) return { t: 'del', v: line };
  return { t: 'text', v: line };
}

function diffTokens(text) {
  const out = [];
  text.split('\n').forEach((line, i) => {
    if (i > 0) out.push({ t: 'ws', v: '\n' });
    if (line) out.push(diffLine(line));
  });
  return out;
}

/** JSON as data: keys (a string a colon follows) apart from values, literals, numbers, punctuation. Comments too (jsonc). */
export function jsonTokens(text) {
  const s = String(text ?? '');
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j += 1;
      out.push({ t: 'ws', v: s.slice(i, j) }); i = j; continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < s.length && s[j] !== '"' && s[j] !== '\n') j += s[j] === '\\' ? 2 : 1;
      j = Math.min(j + 1, s.length);
      let k = j;
      while (k < s.length && /[ \t]/.test(s[k])) k += 1;
      out.push({ t: s[k] === ':' ? 'prop' : 'str', v: s.slice(i, j) }); i = j; continue;
    }
    if (c === '/' && (s[i + 1] === '/' || s[i + 1] === '*')) {
      const end = s[i + 1] === '/' ? s.indexOf('\n', i) : s.indexOf('*/', i + 2);
      const j = end === -1 ? s.length : s[i + 1] === '/' ? end : end + 2;
      out.push({ t: 'comment', v: s.slice(i, j) }); i = j; continue;
    }
    const num = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(s.slice(i, i + 40));
    if (num && (c === '-' || /\d/.test(c))) { out.push({ t: 'num', v: num[0] }); i += num[0].length; continue; }
    const word = /^[A-Za-z_]\w*/.exec(s.slice(i, i + 40));
    if (word) { out.push({ t: LITERALS.has(word[0]) ? 'lit' : 'text', v: word[0] }); i += word[0].length; continue; }
    out.push({ t: '{}[]'.includes(c) ? 'text' : 'punct', v: c }); i += 1;
  }
  return mergeRuns(out);
}

/** Markup: tags, their attributes and values, comments; text between stays plain. */
function xmlTokens(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    if (s.startsWith('<!--', i)) {
      const e = s.indexOf('-->', i + 4);
      const j = e === -1 ? s.length : e + 3;
      out.push({ t: 'comment', v: s.slice(i, j) }); i = j; continue;
    }
    const tag = /^<\/?[A-Za-z][\w:.-]*/.exec(s.slice(i, i + 80));
    if (tag) {
      out.push({ t: 'punct', v: tag[0].startsWith('</') ? '</' : '<' });
      out.push({ t: 'tag', v: tag[0].replace(/^<\/?/, '') });
      i += tag[0].length;
      while (i < s.length && s[i] !== '>' && !(s[i] === '/' && s[i + 1] === '>') && s[i] !== '<') {
        const ws = /^\s+/.exec(s.slice(i));
        if (ws) { out.push({ t: 'ws', v: ws[0] }); i += ws[0].length; continue; }
        const q = s[i];
        if (q === '"' || q === "'") {
          const e = s.indexOf(q, i + 1);
          const j = e === -1 ? s.length : e + 1;
          out.push({ t: 'str', v: s.slice(i, j) }); i = j; continue;
        }
        const attr = /^[^\s=>/"']+/.exec(s.slice(i));
        if (attr) { out.push({ t: 'prop', v: attr[0] }); i += attr[0].length; continue; }
        out.push({ t: 'punct', v: s[i] }); i += 1;
      }
      if (s[i] === '/' && s[i + 1] === '>') { out.push({ t: 'punct', v: '/>' }); i += 2; } else if (s[i] === '>') { out.push({ t: 'punct', v: '>' }); i += 1; }
      continue;
    }
    let j = s.indexOf('<', i + 1);
    if (j === -1) j = s.length;
    out.push({ t: 'text', v: s.slice(i, j) }); i = j;
  }
  return out;
}

const startsComment = (s, i, marker) => marker && (typeof marker === 'string' ? s.startsWith(marker, i) : marker.test(s[i]));

/** Code in a C-like, hash-comment, SQL or CSS family. */
function codeTokens(s, family) {
  const [line, block] = COMMENT[family] || COMMENT.c;
  const blockEnd = block === '<!--' ? '-->' : '*/';
  const sql = family === 'sql';
  const yaml = family === 'yaml' || family === 'ini';
  const out = [];
  let i = 0;
  let lineStart = true;
  while (i < s.length) {
    const c = s[i];
    if (c === '\n' || /\s/.test(c)) {
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j += 1;
      const ws = s.slice(i, j);
      out.push({ t: 'ws', v: ws }); i = j;
      if (ws.includes('\n')) lineStart = true;
      continue;
    }
    const atStart = lineStart;
    lineStart = false;
    if (startsComment(s, i, line) && (family !== 'yaml' || i === 0 || /\s/.test(s[i - 1]))) {
      const e = s.indexOf('\n', i);
      const j = e === -1 ? s.length : e;
      out.push({ t: 'comment', v: s.slice(i, j) }); i = j; continue;
    }
    if (block && s.startsWith(block, i)) {
      const e = s.indexOf(blockEnd, i + block.length);
      const j = e === -1 ? s.length : e + blockEnd.length;
      out.push({ t: 'comment', v: s.slice(i, j) }); i = j; continue;
    }
    if (c === '"' || c === "'" || (c === '`' && family === 'c')) {
      const triple = family === 'hash' && s.startsWith(c.repeat(3), i);
      const close = triple ? c.repeat(3) : c;
      let j = i + close.length;
      while (j < s.length && !s.startsWith(close, j) && (triple || c === '`' || s[j] !== '\n')) j += s[j] === '\\' ? 2 : 1;
      j = Math.min(j + close.length, s.length);
      out.push({ t: 'str', v: s.slice(i, j) }); i = j; continue;
    }
    if (yaml && atStart) {
      // A key at the start of a line (yaml `key:`, ini `key =` or `[section]`).
      const sec = family === 'ini' && /^\[[^\]\n]*\]?/.exec(s.slice(i, i + 200));
      if (sec) { out.push({ t: 'type', v: sec[0] }); i += sec[0].length; continue; }
      const key = /^(?:- )?[\w.$-][\w .$/-]*?(?=\s*[:=](?:\s|$))/.exec(s.slice(i, i + 200));
      if (key) {
        if (key[0].startsWith('- ')) { out.push({ t: 'punct', v: '- ' }); out.push({ t: 'prop', v: key[0].slice(2) }); } else out.push({ t: 'prop', v: key[0] });
        i += key[0].length; continue;
      }
    }
    const num = /^(?:0x[\da-fA-F_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?[a-zA-Z]*)/.exec(s.slice(i, i + 40));
    if (num && /\d/.test(c) && !/[\w$]/.test(s[i - 1] || '')) { out.push({ t: 'num', v: num[0] }); i += num[0].length; continue; }
    if (family === 'css' && (c === '#' || c === '.') && /[\w-]/.test(s[i + 1] || '')) {
      const m = /^[#.][\w-]+/.exec(s.slice(i));
      out.push({ t: c === '#' ? 'fn' : 'type', v: m[0] }); i += m[0].length; continue;
    }
    const word = /^[@$]?[A-Za-z_][\w$-]*/.exec(s.slice(i, i + 80));
    if (word) {
      let w = word[0];
      if (family !== 'css' && w.includes('-')) w = w.slice(0, w.indexOf('-'));
      if (!w || w === '@' || w === '$') w = word[0][0];
      let j = i + w.length;
      while (j < s.length && (s[j] === ' ' || s[j] === '\t')) j += 1;
      let t = 'text';
      if (sql && SQL_KW.has(w.toLowerCase())) t = 'kw';
      else if (KEYWORDS.has(w)) t = 'kw';
      else if (LITERALS.has(w)) t = 'lit';
      else if (w.startsWith('@')) t = 'meta';
      else if (w.startsWith('$')) t = 'var';
      else if (family === 'css' && s[j] === ':') t = 'prop';
      else if (s[j] === '(') t = 'fn';
      else if (BUILTINS.has(w)) t = 'builtin';
      else if (/^[A-Z][a-z0-9]+[A-Za-z0-9]*$/.test(w) || /^[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*$/.test(w)) t = 'type';
      else if (/^[A-Z][A-Z0-9_]{2,}$/.test(w)) t = 'lit';
      else if (out.length && out[out.length - 1].v === '.' && family === 'c') t = 'prop';
      out.push({ t, v: w }); i += w.length; continue;
    }
    if ('()[]{}'.includes(c)) { out.push({ t: 'text', v: c }); i += 1; continue; }
    const op = /^(?:=>|->|===|!==|==|!=|<=|>=|&&|\|\||\?\?|\?\.|::|\+\+|--|\*\*|[-+*/%=<>!&|^~?:])/.exec(s.slice(i, i + 3));
    if (op) { out.push({ t: 'op', v: op[0] }); i += op[0].length; continue; }
    out.push({ t: 'punct', v: c }); i += 1;
  }
  return out;
}

/** The quick tokens for a text in a grammar (langs.js names); an unknown grammar is one plain run. */
export function liteTokens(lang, text) {
  const s = String(text ?? '');
  if (!s) return [];
  const family = FAMILY[lang];
  if (!family) return [{ t: 'text', v: s }];
  if (family === 'shell') return tokenizeShell(s);
  if (family === 'json') return jsonTokens(s);
  if (family === 'diff') return diffTokens(s);
  if (family === 'xml') return mergeRuns(xmlTokens(s));
  if (family === 'text') return [{ t: 'text', v: s }];
  return mergeRuns(codeTokens(s, family));
}
