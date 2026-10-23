// The token stream every highlighter in the GUI speaks: [{ t, v }], lossless (the values, joined, are the input),
// painted by class from the --syn-* tokens (styles/syntax.css, styles/markdown.css). Pure, no React. The shell
// tokenizer (ui/shell-syntax.js), the quick tokenizer (lite.js), the composer's (draft.js) and the grammar engine
// (engine.js, lazy) all hand their tokens here for the same three passes: rainbow brackets, lines, folding.
//
// Kinds: kw · fn · type · builtin · str · esc · num · lit · comment · op · punct · prop · tag · var · param · re ·
// meta · add · del · hunk · path · cmd · flag · slash · url · code · fence · text · ws, plus 'br' (a bracket, `d` its
// depth colour 1..BRACKET_DEPTHS, 0 when it closes nothing).

/** How many bracket colours cycle before the first comes round again. */
export const BRACKET_DEPTHS = 6;

const OPEN = { '(': ')', '[': ']', '{': '}' };
const CLOSE = { ')': '(', ']': '[', '}': '{' };
/** Kinds whose text is never searched for brackets: a paren in a string or a comment is prose, not nesting. */
const OPAQUE = new Set(['str', 'esc', 'comment', 're', 'path', 'url', 'slash', 'add', 'del', 'hunk', 'br']);

/** Join neighbouring tokens of a kind that draws plain, so the runs stay few. */
export function mergeRuns(tokens) {
  const out = [];
  for (const tk of tokens) {
    if (!tk || tk.v === '') continue;
    const last = out[out.length - 1];
    if (last && last.t === tk.t && (tk.t === 'text' || tk.t === 'ws') && last.d === undefined) last.v += tk.v;
    else out.push({ ...tk });
  }
  return out;
}

/**
 * Rainbow brackets: every (, [ and { outside a string or a comment becomes its own 'br' token, coloured by how deep
 * it sits; its closer takes the same colour. A closer that closes nothing (or the wrong kind) is d 0, the error ink.
 * An opener left open at the end keeps its colour: a block still streaming is not an error yet.
 */
export function rainbow(tokens, { stack = [] } = {}) {
  const out = [];
  for (const tk of tokens) {
    if (OPAQUE.has(tk.t) || !/[()[\]{}]/.test(tk.v)) { out.push(tk); continue; }
    let from = 0;
    for (let i = 0; i < tk.v.length; i += 1) {
      const c = tk.v[i];
      if (!OPEN[c] && !CLOSE[c]) continue;
      if (i > from) out.push({ t: tk.t, v: tk.v.slice(from, i) });
      if (OPEN[c]) {
        stack.push(c);
        out.push({ t: 'br', v: c, d: ((stack.length - 1) % BRACKET_DEPTHS) + 1 });
      } else if (stack.length && stack[stack.length - 1] === CLOSE[c]) {
        out.push({ t: 'br', v: c, d: ((stack.length - 1) % BRACKET_DEPTHS) + 1 });
        stack.pop();
      } else out.push({ t: 'br', v: c, d: 0 });
      from = i + 1;
    }
    if (from < tk.v.length) out.push({ t: tk.t, v: tk.v.slice(from) });
  }
  return out;
}

/** The tokens cut at their newlines: one array of tokens per line, the newline itself dropped. */
export function splitLines(tokens) {
  const lines = [[]];
  for (const tk of tokens) {
    const parts = tk.v.split('\n');
    parts.forEach((p, i) => {
      if (i > 0) lines.push([]);
      if (p) lines[lines.length - 1].push({ ...tk, v: p });
    });
  }
  return lines;
}

/** The tokens of the first `n` lines only (the newline that ends line n dropped). */
export function takeLines(tokens, n) {
  const out = [];
  let left = n;
  for (const tk of tokens) {
    if (left <= 0) break;
    let at = tk.v.indexOf('\n');
    while (at !== -1 && left > 1) { left -= 1; at = tk.v.indexOf('\n', at + 1); }
    if (at === -1) { out.push(tk); continue; }
    if (at > 0) out.push({ ...tk, v: tk.v.slice(0, at) });
    left = 0;
  }
  return out;
}

/** The number of lines in a text, a trailing newline closing the last (not opening another). */
export function lineCount(text) {
  const s = String(text ?? '');
  if (!s) return 0;
  const n = s.split('\n').length;
  return s.endsWith('\n') ? n - 1 : n;
}

/** Past this many lines a block folds; folded, it keeps FOLD_KEEP. */
export const FOLD_AT = 12;
export const FOLD_KEEP = 8;

/**
 * Whether a block of `lines` lines folds and how many it shows folded. A block only a line or two past the limit
 * stays whole: hiding two lines behind a button saves nothing.
 */
export function foldPlan(lines, { at = FOLD_AT, keep = FOLD_KEEP } = {}) {
  const fold = lines > at && lines - keep > 2;
  return { fold, keep: fold ? keep : lines, hidden: fold ? lines - keep : 0 };
}

/** Do the tokens colour anything, or would they draw as plain text? */
export const hasColour = (tokens) => tokens.some((tk) => tk.t !== 'text' && tk.t !== 'ws');

/** The class a token draws with, or null for plain text. */
export function tokenClass(tk) {
  if (tk.t === 'text' || tk.t === 'ws') return null;
  if (tk.t === 'br') return `syn-br syn-b${tk.d || 'x'}`;
  return `syn-${tk.t}`;
}

/** The tokens from line `from` on (0-based; the newline that ends line from - 1 dropped): a streaming block's tail. */
export function dropLines(tokens, from) {
  if (from <= 0) return tokens;
  const out = [];
  let left = from;
  for (const tk of tokens) {
    if (left <= 0) { out.push(tk); continue; }
    let at = -1;
    while (left > 0) {
      const nl = tk.v.indexOf('\n', at + 1);
      if (nl === -1) break;
      at = nl;
      left -= 1;
    }
    if (left <= 0 && at < tk.v.length - 1) out.push({ ...tk, v: tk.v.slice(at + 1) });
  }
  return out;
}

/** A text's last `n` lines (a trailing newline closing the last, as lineCount counts). */
export function lastLines(text, n) {
  const s = String(text ?? '');
  const all = s.split('\n');
  if (s.endsWith('\n')) all.pop();
  return all.slice(Math.max(0, all.length - n)).join('\n');
}
