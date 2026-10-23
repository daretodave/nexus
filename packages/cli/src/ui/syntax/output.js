// A tool's result text, read for display: terminal colour codes and Claude Code's reminder blocks dropped, a Read's
// numbered lines split from their code, a Grep's file:line:text and a Glob's path list coloured. Pure.
import { mergeRuns } from './tokens.js';

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;
const REMINDER = /\n*<system-reminder>[\s\S]*?(?:<\/system-reminder>|$)\n*/g;

/** A result's text without terminal escapes or the harness's reminder blocks. */
export function cleanOutput(text) {
  return String(text ?? '').replace(ANSI, '').replace(REMINDER, '\n').replace(/\s+$/, '');
}

const NUMBERED = /^\s*(\d+)(?:→|\t)(.*)$/;

/**
 * A Read result's numbered lines ("    12→code" or "    12\tcode") as { nums, code }, or null when the text is not
 * mostly numbered lines (an error, an image, a short note).
 */
export function parseNumbered(text) {
  const lines = String(text ?? '').split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  if (!lines.length) return null;
  const nums = [];
  const code = [];
  let hits = 0;
  for (const l of lines) {
    const m = NUMBERED.exec(l);
    if (m) { hits += 1; nums.push(Number(m[1])); code.push(m[2]); } else { nums.push(null); code.push(l); }
  }
  if (hits / lines.length < 0.6) return null;
  return { nums, code: code.join('\n') };
}

/** A Grep or Glob result: each line a path, or a path, a line number and the matching text. */
export function listTokens(text) {
  const out = [];
  String(text ?? '').split('\n').forEach((line, i) => {
    if (i > 0) out.push({ t: 'ws', v: '\n' });
    if (!line) return;
    const m = /^((?:[A-Za-z]:)?[^:\n]+?)([:-])(\d+)([:-])(.*)$/.exec(line);
    if (m && /[\\/.]/.test(m[1])) {
      out.push({ t: 'path', v: m[1] }, { t: 'punct', v: m[2] }, { t: 'num', v: m[3] }, { t: 'punct', v: m[4] }, { t: 'text', v: m[5] });
      return;
    }
    if (/^(?:[A-Za-z]:)?[^\s:]*[\\/.][^\s:]*$/.test(line)) { out.push({ t: 'path', v: line }); return; }
    if (/^(Found|No files|No matches)\b/.test(line)) { out.push({ t: 'comment', v: line }); return; }
    out.push({ t: 'text', v: line });
  });
  return mergeRuns(out);
}
