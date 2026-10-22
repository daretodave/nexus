// Markdown, parsed (spec 47, A5): an agent's text as a tree of blocks and
// inlines, which ui/markdown.jsx draws as React elements. Pure, no React, no
// HTML: any tag in the text stays text. Streaming-safe: a partial message
// parses (an unclosed fence is a code block so far, an unclosed ** is two
// asterisks).
//
// Blocks:  heading { level, children } · paragraph { children } · code { lang, text, open }
//          list { ordered, start, items: [{ children: blocks }] } · quote { children: blocks }
//          table { align, head: [inlines], rows: [[inlines]] } · hr
// Inlines: text { text } · strong/em { children } · code { text } · link { href, children } · br
//          span { children } (a link whose target is not http/https: its text, never a link)

const FENCE = /^( {0,3})(`{3,}|~{3,})[ \t]*([^\s`]*)[^`]*$/;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}> ?(.*)$/;
const LIST = /^( *)([-*+]|\d{1,9}[.)])(?:[ \t]+(.*)|$)/;
const DELIM_ROW = /^ *\|? *:?-+:? *(?:\| *:?-+:? *)*\|? *$/;
const BLANK = /^\s*$/;

/** A link target the transcript may open: http and https only; anything else (javascript:, data:, file:) is null. */
export function safeHref(url) {
  const u = String(url || '').trim();
  return /^https?:\/\/[^\s]+$/i.test(u) ? u : null;
}

/** The block tree of a markdown text. */
export function parseMarkdown(text) {
  return parseBlocks(String(text ?? '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n'));
}

function indentOf(line) {
  return /^ */.exec(line)[0].length;
}

function isTableStart(lines, i) {
  return lines[i].includes('|') && i + 1 < lines.length && DELIM_ROW.test(lines[i + 1]) && lines[i + 1].includes('-');
}

/** Whether a line opens a block that ends a paragraph. */
function interrupts(lines, i) {
  const l = lines[i];
  return FENCE.test(l) || HEADING.test(l) || HR.test(l) || QUOTE.test(l) || LIST.test(l) || isTableStart(lines, i);
}

function parseBlocks(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (BLANK.test(line)) { i += 1; continue; }

    const f = FENCE.exec(line);
    if (f && !(f[2][0] === '`' && line.slice(f[1].length + f[2].length).includes('`'))) {
      const [, ind, mark, lang] = f;
      const close = new RegExp(`^ {0,3}${mark[0] === '`' ? '`' : '~'}{${mark.length},}[ \\t]*$`);
      const body = [];
      i += 1;
      let open = true;
      while (i < lines.length) {
        if (close.test(lines[i])) { open = false; i += 1; break; }
        const l = lines[i];
        body.push(l.slice(Math.min(ind.length, indentOf(l))));
        i += 1;
      }
      out.push({ type: 'code', lang: lang || '', text: body.join('\n'), open });
      continue;
    }

    const h = HEADING.exec(line);
    if (h) { out.push({ type: 'heading', level: h[1].length, children: parseInline(h[2] || '') }); i += 1; continue; }

    if (HR.test(line)) { out.push({ type: 'hr' }); i += 1; continue; }

    if (QUOTE.test(line)) {
      const body = [];
      while (i < lines.length && QUOTE.test(lines[i])) { body.push(QUOTE.exec(lines[i])[1]); i += 1; }
      out.push({ type: 'quote', children: parseBlocks(body) });
      continue;
    }

    if (LIST.test(line)) { i = parseList(lines, i, out); continue; }

    if (isTableStart(lines, i)) { i = parseTable(lines, i, out); continue; }

    const para = [line.trim()];
    i += 1;
    while (i < lines.length && !BLANK.test(lines[i]) && !interrupts(lines, i)) { para.push(lines[i].trim()); i += 1; }
    out.push({ type: 'paragraph', children: parseInline(para.join('\n')) });
  }
  return out;
}

function parseList(lines, i, out) {
  const first = LIST.exec(lines[i]);
  const base = first[1].length;
  const ordered = /\d/.test(first[2]);
  const mark = first[2].slice(-1); // a new bullet or delimiter starts a new list
  const list = { type: 'list', ordered, start: ordered ? parseInt(first[2], 10) : 1, items: [] };
  while (i < lines.length) {
    const m = LIST.exec(lines[i]);
    if (!m || m[1].length > base + 1 || m[1].length < base || m[2].slice(-1) !== mark) break;
    if (HR.test(lines[i]) && !m[3]) break;
    const content = m[1].length + m[2].length + 1;
    const body = [m[3] || ''];
    i += 1;
    while (i < lines.length) {
      const l = lines[i];
      if (BLANK.test(l)) {
        // A blank line keeps the item open only when what follows is indented under it.
        let j = i + 1;
        while (j < lines.length && BLANK.test(lines[j])) j += 1;
        if (j < lines.length && indentOf(lines[j]) > base && !(LIST.test(lines[j]) && indentOf(lines[j]) <= base + 1)) {
          for (; i < j; i += 1) body.push('');
          continue;
        }
        break;
      }
      const ind = indentOf(l);
      if (ind > base + 1 || (ind > base && !LIST.test(l))) { body.push(l.slice(Math.min(ind, content))); i += 1; continue; }
      // A lazy continuation line: plain text straight after the item's own text.
      if (!interrupts(lines, i) && !BLANK.test(body[body.length - 1])) { body.push(l.trim()); i += 1; continue; }
      break;
    }
    list.items.push({ children: parseBlocks(body) });
    // A blank line between two items does not end the list.
    let j = i;
    while (j < lines.length && BLANK.test(lines[j])) j += 1;
    if (j > i && j < lines.length) {
      const n = LIST.exec(lines[j]);
      if (n && n[1].length >= base && n[1].length <= base + 1 && n[2].slice(-1) === mark) i = j;
    }
  }
  out.push(list);
  return i;
}

/** The cells of a table row: split on | outside code spans and escapes, the edge pipes dropped. */
export function splitRow(line) {
  const cells = [];
  let cur = '';
  let tick = 0;
  const s = line.trim();
  for (let k = 0; k < s.length; k += 1) {
    const c = s[k];
    if (c === '\\' && s[k + 1] === '|') { cur += '|'; k += 1; continue; }
    if (c === '`') {
      let run = 1;
      while (s[k + run] === '`') run += 1;
      tick = tick === 0 ? run : tick === run ? 0 : tick;
      cur += s.slice(k, k + run);
      k += run - 1;
      continue;
    }
    if (c === '|' && !tick) { cells.push(cur); cur = ''; continue; }
    cur += c;
  }
  cells.push(cur);
  if (s.startsWith('|')) cells.shift();
  if (s.endsWith('|') && !s.endsWith('\\|') && cells.length) cells.pop();
  return cells.map((c) => c.trim());
}

function parseTable(lines, i, out) {
  const head = splitRow(lines[i]);
  const align = splitRow(lines[i + 1]).map((d) => (d.startsWith(':') && d.endsWith(':') ? 'center' : d.endsWith(':') ? 'right' : d.startsWith(':') ? 'left' : null));
  const n = head.length;
  const rows = [];
  i += 2;
  while (i < lines.length && !BLANK.test(lines[i]) && lines[i].includes('|') && !FENCE.test(lines[i])) {
    const cells = splitRow(lines[i]);
    rows.push(Array.from({ length: n }, (_, k) => parseInline(cells[k] || '')));
    i += 1;
  }
  out.push({ type: 'table', align: Array.from({ length: n }, (_, k) => align[k] || null), head: head.map((c) => parseInline(c)), rows });
  return i;
}

const PUNCT = /[!-/:-@[-`{-~]/;
const BARE_URL = /^https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"*_`\]]/i;

/** The inline nodes of a text: newlines become line breaks. */
export function parseInline(src) {
  const out = [];
  let buf = '';
  const flush = () => { if (buf) { out.push({ type: 'text', text: buf }); buf = ''; } };
  const s = String(src ?? '');
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length && PUNCT.test(s[i + 1])) { buf += s[i + 1]; i += 2; continue; }
    if (c === '\n') { flush(); out.push({ type: 'br' }); i += 1; continue; }
    if (c === '`') {
      let run = 1;
      while (s[i + run] === '`') run += 1;
      const fence = '`'.repeat(run);
      let j = s.indexOf(fence, i + run);
      while (j !== -1 && s[j + run] === '`') { let k = j; while (s[k] === '`') k += 1; j = s.indexOf(fence, k); }
      if (j === -1) { buf += fence; i += run; continue; }
      let code = s.slice(i + run, j).replace(/\n/g, ' ');
      if (code.length > 1 && code.startsWith(' ') && code.endsWith(' ') && code.trim()) code = code.slice(1, -1);
      flush();
      out.push({ type: 'code', text: code });
      i = j + run;
      continue;
    }
    if (c === '*' || c === '_') {
      const em = emphasis(s, i);
      if (em) { flush(); out.push(em.node); i = em.end; continue; }
      let run = 1;
      while (s[i + run] === c) run += 1;
      // An unmatched *** or ** may still open a shorter one: give up one mark and try again.
      const give = run > 1 && run <= 3 ? 1 : run;
      buf += s.slice(i, i + give);
      i += give;
      continue;
    }
    if (c === '[') {
      const l = link(s, i);
      if (l) { flush(); out.push(l.node); i = l.end; continue; }
    }
    if (c === '<') {
      const m = /^<(https?:\/\/[^\s<>]+)>/i.exec(s.slice(i));
      if (m) { flush(); out.push({ type: 'link', href: m[1], children: [{ type: 'text', text: m[1] }] }); i += m[0].length; continue; }
    }
    if ((c === 'h' || c === 'H') && (i === 0 || /[\s(]/.test(s[i - 1]))) {
      const m = BARE_URL.exec(s.slice(i));
      if (m) { flush(); out.push({ type: 'link', href: m[0], children: [{ type: 'text', text: m[0] }] }); i += m[0].length; continue; }
    }
    buf += c;
    i += 1;
  }
  flush();
  return out;
}

/** **strong**, *em*, ***both*** (and the _ forms, never inside a word) at s[i], or null. */
function emphasis(s, i) {
  const c = s[i];
  let run = 1;
  while (s[i + run] === c) run += 1;
  if (run > 3) return null;
  const after = s[i + run];
  if (!after || /\s/.test(after)) return null;
  if (c === '_' && i > 0 && /[\p{L}\p{N}]/u.test(s[i - 1])) return null;
  const mark = c.repeat(run);
  let j = s.indexOf(mark, i + run + 1);
  while (j !== -1) {
    const ok = !/\s/.test(s[j - 1]) && s[j - 1] !== c && s[j + run] !== c && !(c === '_' && /[\p{L}\p{N}]/u.test(s[j + run] || ''));
    if (ok) break;
    j = s.indexOf(mark, j + 1);
  }
  if (j === -1) return null;
  const children = parseInline(s.slice(i + run, j));
  const node = run === 1 ? { type: 'em', children } : run === 2 ? { type: 'strong', children } : { type: 'strong', children: [{ type: 'em', children }] };
  return { node, end: j + run };
}

/** [text](url "title") at s[i], or null. Unsafe schemes keep their text and lose the link. */
function link(s, i) {
  let depth = 0;
  let j = i;
  for (; j < s.length; j += 1) {
    if (s[j] === '\\') { j += 1; continue; }
    if (s[j] === '[') depth += 1;
    else if (s[j] === ']') { depth -= 1; if (depth === 0) break; }
  }
  if (j >= s.length || s[j + 1] !== '(') return null;
  const m = /^\(\s*<?([^\s()<>]*(?:\([^\s()]*\)[^\s()<>]*)*)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/.exec(s.slice(j + 1));
  if (!m) return null;
  const children = parseInline(s.slice(i + 1, j));
  const href = safeHref(m[1]);
  const end = j + 1 + m[0].length;
  return { node: href ? { type: 'link', href, children } : { type: 'span', children }, end };
}
