// A spec's brief for Grill me (0.5.1): what the spec is and why it matters, read from the spec itself, no model.
//
//   GET /api/oversight/specs?files=plan/11-sharing.md,... -> { specs: { [file]: { n, title, lede, why } } }
//
// lede: the first prose paragraph after the H1 (not a status quote, a Status:/Owner: line, a table, a list or a
// comment), cut at a sentence end near 700 characters. why: the first paragraph under the first heading that says
// why, problem, goal, motivation, context or purpose, or null. A file that is not a spec: its path as the title and
// the heading above its first [needs-user-call] row as the lede. Only plan/**.md files are read.
import fs from 'node:fs';
import path from 'node:path';
import { specNumber } from './repo.mjs';

export const BRIEF_CHARS = 700;
const WHY_HEAD = /\b(why|problem|goal|goals|motivation|context|purpose)\b/i;

/** Cut at the last sentence end before `max` (or at a word, with an ellipsis). */
export function cutAtSentence(s, max = BRIEF_CHARS) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max);
  const end = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '));
  if (end > max * 0.4) return head.slice(0, end + 1);
  return `${head.slice(0, head.lastIndexOf(' ')).trimEnd()}...`;
}

/** Is this line prose (not a heading, quote, meta line, table, list, comment or fence)? */
const prose = (l) => {
  const t = l.trim();
  if (!t) return false;
  if (/^(#|>|\||[-*+]\s|\d+[.)]\s|<!--|```|---)/.test(t)) return false;
  if (/^\*{0,2}(status|owner|owners|size|lane|state|updated|created|depends|blocked|chunks?)\*{0,2}\s*:/i.test(t)) return false;
  return true;
};

/** The first prose paragraph in `lines` from `from` (skipping what is not prose), until a blank or non-prose line. */
function paragraph(lines, from, until = lines.length) {
  let i = from;
  let inComment = false;
  for (; i < until; i += 1) {
    const t = lines[i].trim();
    if (inComment) { if (t.includes('-->')) inComment = false; continue; }
    if (t.startsWith('<!--') && !t.includes('-->')) { inComment = true; continue; }
    if (/^#{1,6}\s/.test(t) && i > from) return '';
    if (prose(lines[i])) break;
  }
  const out = [];
  for (; i < until && prose(lines[i]); i += 1) out.push(lines[i].trim());
  return out.join(' ');
}

/** A spec file's brief. `rel` is its path under the repo (plan/11-sharing.md). */
export function briefOf(text, rel) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const n = specNumber(rel);
  const h1 = lines.findIndex((l) => /^#\s+\S/.test(l));
  if (!n) {
    // Not a spec: the heading above its first [needs-user-call] row.
    const flag = lines.findIndex((l) => /\[needs-user(?:-call)?\]/i.test(l) && /^\s*(?:[-*+]|\d+\.|\|)\s/.test(l));
    let head = '';
    for (let i = flag; i >= 0; i -= 1) { const h = /^#{1,6}\s+(.*)$/.exec(lines[i] || ''); if (h) { head = h[1].trim(); break; } }
    return { n: null, title: rel, lede: head, why: null };
  }
  const title = h1 >= 0 ? lines[h1].replace(/^#\s+/, '').replace(/^(?:spec\s+)?\d+(?:\s*[-:.—–·|]+)?\s+/i, '').trim() : rel;
  const lede = cutAtSentence(paragraph(lines, h1 >= 0 ? h1 + 1 : 0));
  const wh = lines.findIndex((l, i) => i > h1 && /^#{2,6}\s/.test(l) && WHY_HEAD.test(l.replace(/^#+\s+/, '')) && !/open questions?/i.test(l));
  const why = wh >= 0 ? cutAtSentence(paragraph(lines, wh + 1)) || null : null;
  return { n, title, lede, why };
}

/** The briefs for these files (only plan/**.md, only ones that exist). */
export function specBriefs(repo, files) {
  const out = {};
  for (const raw of (Array.isArray(files) ? files : []).slice(0, 40)) {
    const rel = String(raw || '').replace(/\\/g, '/');
    if (!/^plan\/[\w./-]+\.md$/.test(rel) || rel.includes('..')) continue;
    const full = path.join(repo, rel);
    if (!fs.existsSync(full)) continue;
    out[rel] = briefOf(fs.readFileSync(full, 'utf8'), rel);
  }
  return { specs: out };
}
