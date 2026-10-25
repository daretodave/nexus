// scripts/plan/critique-gui.mjs: /critique's GUI pass, planned and its rows checked (spec 56.6).
//
// The pass walks the first-run and onboarding demo screens (skills/critique.md §3a) and hands the PNGs plus
// walk.json to the fresh-eyes delegate, which critiques the UI, not the fixture data:
//
//   node scripts/plan/critique-gui.mjs plan [--mode full|gui|read] [--json]
//   node scripts/plan/critique-gui.mjs check [--file plan/CRITIQUE.md]
//
// `plan` says whether the pass runs and how: the walk command (scenarios plain-folder, cloud-token, fleet-to-tug,
// out under .scratch/walk/critique-<iso>/), or `skip: <why>`, the pass-log line, when the mode runs no GUI pass
// (`read`) or packages/cli has no node_modules or no built dist/. Exit 0 either way; 64 on bad usage. It only
// looks at the file system: nothing is run, built or fetched.
//
// `check` reads the walk rows in the critique queue. A walk row is filed as
//
//   ### [ ] [HIGH|MED|LOW] <route> @ <desktop|mobile> (<scenario>) — <line>
//   - category: ui-comprehension
//   - observation: ...
//   - evidence: <the PNG and/or the walk.json screen>, <the walk folder or walk-<run id>>
//   - suggested fix: ...
//   - source: walk
//
// A `source: walk` row is category ui-comprehension and the other way round; its evidence cites the walk; its
// suggested fix keeps the magic guard (it never removes or dims the GUI's particles, colour or motion); and at most
// 3 walk rows sit Pending at once, so no pass files more than 3 of its 6. Prints one line per breach and
// `<n> breaches`, or `clean (<n> walk rows)`. Exit 0 clean; 1 on a breach; 64 on bad usage.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cutsMagic } from './ui-rows.mjs';

export const SCENARIOS = Object.freeze(['plain-folder', 'cloud-token', 'fleet-to-tug']);
export const MODES = Object.freeze(['full', 'gui', 'read']);
export const MAX_PENDING = 3;
export const MAX_PNGS = 8;
export const CATEGORY = 'ui-comprehension';
export const SOURCE = 'walk';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A folder name for this pass: the ISO time, safe on every file system (walk.mjs's stamp). */
export const stamp = (d = new Date()) => d.toISOString().replace(/[:.]/g, '-');

/**
 * Whether the pass runs, from the mode and what packages/cli holds.
 * -> { run: true, scenarios, out, command, pngs } | { run: false, skip }
 */
export function planPass({ root = ROOT, mode = 'full', now = new Date(), exists = fs.existsSync } = {}) {
  if (mode === 'read') return { run: false, skip: 'skip: GUI pass — /critique read runs no GUI pass' };
  const cli = path.join(root, 'packages', 'cli');
  if (!exists(path.join(cli, 'package.json'))) return { run: false, skip: 'skip: GUI pass — no packages/cli in this checkout' };
  if (!exists(path.join(cli, 'node_modules', 'playwright-core'))) {
    return { run: false, skip: 'skip: GUI pass — packages/cli has no node_modules (npm --prefix packages/cli ci --ignore-scripts)' };
  }
  if (!exists(path.join(cli, 'dist', 'index.html'))) {
    return { run: false, skip: 'skip: GUI pass — packages/cli has no built dist/ (npm --prefix packages/cli run build)' };
  }
  const out = path.join(root, '.scratch', 'walk', `critique-${stamp(now)}`);
  const command = `npm --prefix packages/cli run walk -- --scenarios ${SCENARIOS.join(',')} --out "${out}"`;
  return { run: true, scenarios: [...SCENARIOS], out, command, pngs: MAX_PNGS };
}

const HEAD = /^### (?:\[[ x]\] )?\[(HIGH|MED|LOW)\]\s*(.*)$/i;
const SHAPE = /^(\/\S*) @ (desktop|mobile) \(([\w-]+)\) — \S/;
const WALK_EVIDENCE = /walk\.json|\.png\b|\bwalk-\d+\b|\.scratch\/walk\//;

/** The rows of a critique queue: [{ line, heading, severity, title, done, pending, fields }] (`line` is 1-based). */
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
      const done = /^### \[x\]/i.test(l) || !/^Pending\b/.test(section);
      row = { line: i + 1, heading: l, severity: m[1].toUpperCase(), title: m[2].trim(), done, pending: !done, fields: {} };
      rows.push(row);
      continue;
    }
    if (!row) continue;
    const f = /^- ([\w -]+?):\s*(.*)$/.exec(l);
    if (f) {
      row.key = f[1];
      row.fields[f[1]] = f[2];
    } else if (row.key && /^\s+\S/.test(l)) row.fields[row.key] += ` ${l.trim()}`;
  }
  return rows;
}

const isWalk = (r) => (r.fields.source ?? '').trim() === SOURCE || (r.fields.category ?? '').trim() === CATEGORY;

/** The breaches in a critique queue's text, `rel` naming it. */
export function checkRows(text, rel = 'plan/CRITIQUE.md') {
  const problems = [];
  const rows = parseRows(text).filter(isWalk);
  for (const r of rows) {
    if (r.done) continue; // a closed row keeps what it said when it was filed
    const at = `${rel}:${r.line}`;
    const category = (r.fields.category ?? '').trim();
    const source = (r.fields.source ?? '').trim();
    if (source !== SOURCE) problems.push(`${at}: a ${CATEGORY} row comes from the GUI pass (source: ${SOURCE})`);
    if (category !== CATEGORY) problems.push(`${at}: a source: ${SOURCE} row's category is ${CATEGORY}`);
    const shape = SHAPE.exec(r.title);
    if (!shape) problems.push(`${at}: a walk row reads "### [SEV] <route> @ <desktop|mobile> (<scenario>) — <line>"`);
    if (!WALK_EVIDENCE.test(r.fields.evidence ?? '')) problems.push(`${at}: a walk row's evidence cites the walk (the PNG, walk.json, the .scratch/walk/ folder or walk-<run id>)`);
    const cut = cutsMagic(r.fields['suggested fix'] ?? '');
    if (cut) problems.push(`${at}: the magic guard: suggested fix "${cut}" removes or dims the GUI's particles, colour or motion; make it cheaper instead`);
  }
  const pending = rows.filter((r) => r.pending).length;
  if (pending > MAX_PENDING) problems.push(`${rel}: ${pending} walk rows Pending (at most ${MAX_PENDING}; a pass files at most ${MAX_PENDING} of its 6)`);
  return { problems, rows: rows.length };
}

function flag(rest, name) {
  const i = rest.indexOf(name);
  return i < 0 ? { value: undefined, rest } : { value: rest[i + 1], rest: rest.filter((_, k) => k !== i && k !== i + 1) };
}

export function main(argv, { root = ROOT, log = console.log, now = new Date(), exists = fs.existsSync } = {}) {
  const [cmd, ...args] = argv;
  if (cmd === 'plan') {
    const json = args.includes('--json');
    const { value: mode = 'full', rest } = flag(args.filter((a) => a !== '--json'), '--mode');
    if (!MODES.includes(mode) || rest.length) {
      console.error(`usage: node scripts/plan/critique-gui.mjs plan [--mode ${MODES.join('|')}] [--json]`);
      return 64;
    }
    const p = planPass({ root, mode, now, exists });
    if (json) log(JSON.stringify(p));
    else if (!p.run) log(p.skip);
    else {
      log(`run: GUI pass over ${p.scenarios.join(', ')}`);
      log(`  ${p.command}`);
      log(`  then hand ${path.relative(root, p.out).split(path.sep).join('/')}/walk.json and at most ${p.pngs} PNGs to the delegate`);
    }
    return 0;
  }
  if (cmd === 'check') {
    const { value: file = 'plan/CRITIQUE.md', rest } = flag(args, '--file');
    if (!file || rest.length) {
      console.error('usage: node scripts/plan/critique-gui.mjs check [--file plan/CRITIQUE.md]');
      return 64;
    }
    const abs = path.resolve(root, file);
    if (!fs.existsSync(abs)) {
      log(`clean (no ${file})`);
      return 0;
    }
    const { problems, rows } = checkRows(fs.readFileSync(abs, 'utf-8'), file);
    for (const p of problems) log(p);
    log(problems.length ? `${problems.length} breach${problems.length === 1 ? '' : 'es'}` : `clean (${rows} walk row${rows === 1 ? '' : 's'})`);
    return problems.length ? 1 : 0;
  }
  console.error('usage: node scripts/plan/critique-gui.mjs plan [--mode full|gui|read] [--json] | check [--file plan/CRITIQUE.md]');
  return 64;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
