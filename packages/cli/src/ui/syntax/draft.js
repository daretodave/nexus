// Prose that carries code: what you type in the composer, an answer field and the heads-down prompt, and a
// markdown inline `code` span. Pure and lossless. A leading /command, `backticked code`, ``` fences (their body
// in the fence's language), urls, paths, @mentions and --flags get their colours; the rest stays prose, and the
// brackets in it are left for the rainbow pass. Fence bodies go through `code(lang, text)`, the highlighter's best
// tokens when the caller passes it, the quick tokenizer's otherwise.
import { tokenizeShell } from '../shell-syntax.js';
import { liteTokens } from './lite.js';
import { langOf } from './langs.js';
import { mergeRuns } from './tokens.js';

/** Commands an inline span starts with when it is a command line, not a word (`npm run build`, `git status`). */
export const SHELL_WORDS = new Set((
  'npm npx pnpm yarn bun deno node git gh claude cd ls cat grep rg find sed awk curl wget python python3 pip pipx ' +
  'cargo rustc go make docker kubectl brew apt choco winget echo export set mkdir rm cp mv touch chmod ssh scp tar ' +
  'code open start sudo tsc vite vitest jest eslint prettier powershell pwsh'
).split(' '));

const URL_RE = /^https?:\/\/[^\s`<>"')\]]+/;
/** A word that names a file: a drive or a ./ ../ ~/ / start, or a slash and an extension, or two slashes. */
export function looksLikePath(w) {
  if (!w || /\s/.test(w) || w.length < 3) return false;
  if (/^[A-Za-z]:[\\/]/.test(w) || /^(?:\.{1,2}|~)[\\/]/.test(w)) return true;
  if (/^\/[\w.-]+\/[\w./-]*$/.test(w)) return true;
  const slashes = (w.match(/[\\/]/g) || []).length;
  if (!slashes) return /^[\w.-]+\.(?:m?[jt]sx?|json|md|css|html|ya?ml|toml|py|rs|go|rb|sh|ps1|lock|txt|log|env|mjs|cjs)$/.test(w);
  return /\.[A-Za-z0-9]{1,6}$/.test(w) || slashes >= 2;
}

const CODEY = /[()[\]{}=;"'<>]|=>|::/;

/**
 * An inline `code` span's tokens: a /command, a shell line, a path, a flag, or code (when it has code's punctuation).
 * A plain word stays one plain run, so `tool` draws as it always has.
 */
export function inlineTokens(text) {
  const s = String(text ?? '');
  if (!s) return [];
  const slash = /^\/[A-Za-z][\w:-]*/.exec(s);
  if (slash && !s.slice(slash[0].length).includes('/')) return mergeRuns([{ t: 'slash', v: slash[0] }, ...prose(s.slice(slash[0].length))]);
  if (/^\$ /.test(s)) return [{ t: 'op', v: '$' }, ...tokenizeShell(s.slice(1))];
  const first = s.split(/\s/)[0];
  if (/\s/.test(s) && SHELL_WORDS.has(first)) return tokenizeShell(s);
  if (looksLikePath(s)) return [{ t: 'path', v: s }];
  if (/^--?[A-Za-z][\w-]*(?:=\S*)?$/.test(s)) return [{ t: 'flag', v: s }];
  if (URL_RE.test(s) && URL_RE.exec(s)[0] === s) return [{ t: 'url', v: s }];
  if (CODEY.test(s)) return liteTokens(/^\s*[[{]/.test(s) && /:\s*/.test(s) && /"/.test(s) ? 'json' : 'javascript', s);
  return [{ t: 'text', v: s }];
}

/** Prose: urls, paths, @mentions and --flags in it; everything else plain. */
function prose(s) {
  const out = [];
  let i = 0;
  let plain = '';
  const flush = () => { if (plain) out.push({ t: 'text', v: plain }); plain = ''; };
  while (i < s.length) {
    const c = s[i];
    const atWord = i === 0 || /[\s([{'"]/.test(s[i - 1]);
    if (atWord && (c === 'h') && URL_RE.test(s.slice(i, i + 2048))) {
      const m = URL_RE.exec(s.slice(i, i + 2048))[0].replace(/[.,;:!?]+$/, '');
      flush(); out.push({ t: 'url', v: m }); i += m.length; continue;
    }
    if (atWord && !/\s/.test(c)) {
      const m = /^[^\s()[\]{}'"`,;]+/.exec(s.slice(i, i + 400));
      const w = m ? m[0].replace(/[.,:!?]+$/, '') : '';
      if (w && c === '@' && /^@[\w./-]+$/.test(w) && w.length > 1) { flush(); out.push({ t: 'var', v: w }); i += w.length; continue; }
      if (w && /^--?[A-Za-z][\w-]*(?:=\S*)?$/.test(w) && c === '-' && (s[i + 1] === '-' || /^-[A-Za-z]$/.test(w))) { flush(); out.push({ t: 'flag', v: w }); i += w.length; continue; }
      if (w && looksLikePath(w)) { flush(); out.push({ t: 'path', v: w }); i += w.length; continue; }
    }
    plain += c; i += 1;
  }
  flush();
  return out;
}

/** Inline `code` inside prose: the backticks as punctuation, the inside by inlineTokens. */
function proseWithCode(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const tick = s.indexOf('`', i);
    if (tick === -1) { out.push(...prose(s.slice(i))); break; }
    if (tick > i) out.push(...prose(s.slice(i, tick)));
    let n = 1;
    while (s[tick + n] === '`') n += 1;
    const fence = '`'.repeat(n);
    const close = s.indexOf(fence, tick + n);
    if (close === -1) {
      // Still being typed: the open tick and what follows read as code so far.
      out.push({ t: 'punct', v: fence });
      const rest = s.slice(tick + n);
      if (rest) out.push(...inlineTokens(rest).map((tk) => (tk.t === 'text' ? { ...tk, t: 'code' } : tk)));
      break;
    }
    out.push({ t: 'punct', v: fence });
    const inner = s.slice(tick + n, close);
    if (inner) out.push(...inlineTokens(inner).map((tk) => (tk.t === 'text' ? { ...tk, t: 'code' } : tk)));
    out.push({ t: 'punct', v: fence });
    i = close + n;
  }
  return out;
}

/**
 * What a person types, as tokens: a leading /command, ``` fences with their body in the fence's language, inline
 * code, urls, paths, mentions and flags. An unclosed fence colours its body so far (it is being typed).
 */
export function draftTokens(text, code = liteTokens) {
  const s = String(text ?? '');
  if (!s) return [];
  const out = [];
  let body = s;
  const slash = /^\s*\/[A-Za-z][\w:-]*/.exec(s);
  if (slash) {
    const lead = /^\s*/.exec(s)[0];
    if (lead) out.push({ t: 'ws', v: lead });
    out.push({ t: 'slash', v: slash[0].slice(lead.length) });
    body = s.slice(slash[0].length);
  }
  // Split on fence lines: ``` (or ~~~) at a line's start opens, the same mark at a line's start closes.
  const fenceRe = /(^|\n)([ \t]*)(```+|~~~+)([^\n`]*)(?=\n|$)/g;
  let at = 0;
  let m;
  while ((m = fenceRe.exec(body))) {
    const start = m.index + m[1].length;
    out.push(...proseWithCode(body.slice(at, start)));
    const mark = m[3];
    const word = m[4].trim().split(/\s+/)[0] || '';
    out.push({ t: 'fence', v: m[2] + mark + m[4] });
    const open = start + m[0].length - m[1].length;
    const closeRe = new RegExp(`\\n[ \\t]*${mark[0] === '`' ? '`' : '~'}{${mark.length},}[ \\t]*(?=\\n|$)`, 'g');
    closeRe.lastIndex = open;
    const c = closeRe.exec(body);
    const inner = body.slice(open, c ? c.index : body.length);
    const lang = langOf(word);
    if (inner) {
      const nl = inner.startsWith('\n') ? '\n' : '';
      if (nl) out.push({ t: 'ws', v: nl });
      const src = inner.slice(nl.length);
      if (src) out.push(...(lang ? code(lang, src) : [{ t: 'code', v: src }]));
    }
    if (!c) { at = body.length; fenceRe.lastIndex = body.length; break; }
    out.push({ t: 'ws', v: '\n' });
    out.push({ t: 'fence', v: c[0].slice(1) });
    at = c.index + c[0].length;
    fenceRe.lastIndex = at;
  }
  if (at < body.length) out.push(...proseWithCode(body.slice(at)));
  return mergeRuns(out);
}
