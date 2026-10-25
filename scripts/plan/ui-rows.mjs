// scripts/plan/ui-rows.mjs: /iterate's dimension H rows keep their shape and the magic guard (spec 56.5).
//
// An H row is what the GUI walk saw, filed in plan/AUDIT.md (skills/iterate.md §3a):
//
//   ### [H, <score>] <route> @ <desktop|mobile> (<scenario>) — <line>
//   - category: ui
//   - evidence: <the walk finding>, <the PNG>, <walk-<run id> or the run URL, or a local .scratch/walk/... path>
//   - next: <a file:line under packages/cli/>
//   - gate: npm test
//
// (A ticked row reads `### [x] [H, <score>] ...`.) The magic guard is a hard rule (skills/iterate.md §5.7): a `ui`
// finding never removes or dims the GUI's particles, colour or motion (packages/cli/src/fx/*, the particle, colour
// and motion CSS); it makes them cheaper. So a row's `next` that removes, deletes, disables, dims or hides one of
// them is a breach, and so is a sweep that leaves more than 3 H rows Pending.
//
//   node scripts/plan/ui-rows.mjs check [--file plan/AUDIT.md]
//
// Prints one line per breach and `<n> breaches`, or `clean (<n> H rows)`. Exit 0 clean; 1 on a breach; 64 on bad
// usage. Text only: nothing runs, nothing is fetched.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const MAX_PENDING = 3;
export const VIEWPORTS = Object.freeze(['desktop', 'mobile']);

const HEAD = /^### (?:\[[ x]\] )?\[H, ?(\d+(?:\.\d+)?)\]\s*(.*)$/i;
const SHAPE = /^(\/\S*) @ (\w+) \(([\w-]+)\) — \S/;
const FILE_LINE = /\b[\w./-]+\.\w+:\d+\b/;
const ARTIFACT = /\bwalk-\d+\b|\/actions\/runs\/\d+|\.scratch\/walk\//;
// The magic: the fx modules, and the particles, colour and motion the CSS draws.
const MAGIC = String.raw`(?:src\/fx\b\S*|fx\.css|particles?|motion|animations?|keyframes|glow|colou?rs?|fx)`;
const CUT = String.raw`(?:remove|removing|delete|deleting|drop|dropping|strip|stripping|disable|disabling|dim|dimming|hide|hiding|kill|killing|turn(?:ing)? off|rip(?:ping)? out|get rid of)`;
// The verb and its object close together: "drop the per-frame allocation in src/fx/pool.js" makes it cheaper.
const BREACH = new RegExp(String.raw`\b${CUT}\b(?:\s+\S+){0,2}?\s+[\x60@.]?(?:packages\/cli\/)?${MAGIC}`, 'i');

/** The H rows in an audit file: [{ line, heading, score, title, done, pending, fields }] (`line` is 1-based). */
export function parseRows(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const rows = [];
  let section = '';
  let row = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^#{1,3} /.test(l)) {
      row = null;
      if (/^## /.test(l)) section = l.slice(3).trim();
      const m = HEAD.exec(l);
      if (!m) continue;
      const done = /^### \[x\]/i.test(l) || /^Done\b/.test(section);
      row = { line: i + 1, heading: l, score: Number(m[1]), title: m[2].trim(), done, pending: !done && /^Pending\b/.test(section), fields: {} };
      rows.push(row);
      continue;
    }
    if (!row) continue;
    const f = /^- ([\w-]+):\s*(.*)$/.exec(l);
    if (f) {
      row.key = f[1];
      row.fields[f[1]] = f[2];
    } else if (row.key && /^\s+\S/.test(l)) row.fields[row.key] += ` ${l.trim()}`;
  }
  return rows;
}

/** Does this `next` remove or dim the GUI's particles, colour or motion? The matched words, or null. */
export function cutsMagic(next = '') {
  return BREACH.exec(next)?.[0] ?? null;
}

/** The breaches in an audit file's text, `rel` naming it. */
export function checkRows(text, rel = 'plan/AUDIT.md') {
  const problems = [];
  const rows = parseRows(text);
  for (const r of rows) {
    const at = `${rel}:${r.line}`;
    const shape = SHAPE.exec(r.title);
    if (!shape) problems.push(`${at}: an H row reads "### [H, <score>] <route> @ <viewport> (<scenario>) — <line>"`);
    else if (!VIEWPORTS.includes(shape[2])) problems.push(`${at}: viewport "${shape[2]}" is not ${VIEWPORTS.join(' or ')}`);
    if (r.done) continue; // a closed row keeps what it said when it shipped
    if (r.fields.category !== 'ui') problems.push(`${at}: an H row's category is ui`);
    if (!r.fields.evidence) problems.push(`${at}: an H row's evidence names the walk finding, the PNG and the artifact`);
    else if (!ARTIFACT.test(r.fields.evidence)) problems.push(`${at}: evidence cites no walk artifact (walk-<run id>, the run URL, or a .scratch/walk/ path)`);
    if (!r.fields.next || !FILE_LINE.test(r.fields.next)) problems.push(`${at}: an H row's next names a file:line`);
    if (!/npm (run )?test/.test(r.fields.gate ?? '')) problems.push(`${at}: an H row's gate is npm test`);
    const cut = cutsMagic(r.fields.next);
    if (cut) problems.push(`${at}: the magic guard: next "${cut}" removes or dims the GUI's particles, colour or motion; make it cheaper instead (src/fx/budget.js, pool.js, the pref.js reduced-motion path)`);
  }
  const pending = rows.filter((r) => r.pending).length;
  if (pending > MAX_PENDING) problems.push(`${rel}: ${pending} H rows Pending (at most ${MAX_PENDING} a sweep)`);
  return { problems, rows: rows.length };
}

export function main(argv, { root = process.cwd(), log = console.log } = {}) {
  const [cmd, ...rest] = argv;
  const i = rest.indexOf('--file');
  const file = i < 0 ? 'plan/AUDIT.md' : rest[i + 1];
  const extra = rest.filter((_, k) => k !== i && k !== i + 1);
  if (cmd !== 'check' || !file || extra.length) {
    console.error('usage: node scripts/plan/ui-rows.mjs check [--file plan/AUDIT.md]');
    return 64;
  }
  const abs = path.resolve(root, file);
  if (!fs.existsSync(abs)) {
    log(`clean (no ${file})`);
    return 0;
  }
  const { problems, rows } = checkRows(fs.readFileSync(abs, 'utf-8'), file);
  for (const p of problems) log(p);
  log(problems.length ? `${problems.length} breach${problems.length === 1 ? '' : 'es'}` : `clean (${rows} H row${rows === 1 ? '' : 's'})`);
  return problems.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
