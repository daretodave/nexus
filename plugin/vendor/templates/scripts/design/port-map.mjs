// scripts/design/port-map.mjs: every board of a design handoff ported, skipped with a reason, or pending a chunk.
//
// A handoff (scripts/design/ingest.mjs) is the UI's source of truth; its port map, `<handoff>/port.json`, says where
// each board went. `ingest` seeds it with every board pending the port's chunk; the port (the recipe Workflow,
// scripts/design/port.workflow.js) fills it in:
//
//   {
//     "port": 1,
//     "app": "packages/cli",                          the folder the paths below are in ("." by default)
//     "boards": {
//       "Fleet": "src/screens/Fleet.jsx",             ported: the file (or a list of files) that draws it
//       "FleetTrain": ["src/screens/Fleet.jsx", "src/ui/fleet.jsx"],
//       "Tokens": { "skip": "a documentation board: no app UI" },   skipped, with its reason
//       "Vault": { "pending": "42.8" }                not ported yet: the chunk (or the reason) it waits on
//     }
//   }
//
// The check: the handoff still matches its manifest (ingest's checkHandoff), every board in it has an entry, no entry
// names a board the handoff lacks, a ported board's files exist, a skip has its reason and a pending its chunk. A
// handoff folder from before ingest (boards, no manifest) has its files unchecked, said in a note, and its port map
// checked against the boards on disk.
//
//   node scripts/design/port-map.mjs check [<handoff>...] [--json]    every handoff found when none is named; exit 1 on a problem
//   node scripts/design/port-map.mjs status <handoff> [--json]        each board's status: ported, skipped, pending
//
// Handoffs are found in design/handoff/ and packages/*/design/handoff/: the folder itself when it holds a manifest or
// boards, and each folder in it. No dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { MANIFEST, PORT, buildManifest, checkHandoff } from './ingest.mjs';

export { PORT, appFor, seedPort } from './ingest.mjs';

const USAGE = [
  'usage: node scripts/design/port-map.mjs check [<handoff>...] [--json]',
  '       node scripts/design/port-map.mjs status <handoff> [--json]',
].join('\n');

const posix = (p) => p.split(path.sep).join('/');
const isBoard = (f) => /\.html?$/i.test(f);
const hasBoards = (dir) => fs.readdirSync(dir).some((f) => isBoard(f) && fs.statSync(path.join(dir, f)).isFile());

/** One entry's status, or a problem. */
export function classify(entry) {
  const files = typeof entry === 'string' ? [entry] : Array.isArray(entry) ? entry : null;
  if (files) {
    if (!files.length || files.some((f) => typeof f !== 'string' || !f.trim())) return { problem: 'a ported board names its files as non-empty paths' };
    return { status: 'ported', files };
  }
  if (entry && typeof entry === 'object') {
    const keys = Object.keys(entry);
    if (keys.length === 1 && keys[0] === 'skip') {
      return typeof entry.skip === 'string' && entry.skip.trim() ? { status: 'skipped', reason: entry.skip } : { problem: 'a skip needs its reason' };
    }
    if (keys.length === 1 && keys[0] === 'pending') {
      return typeof entry.pending === 'string' && entry.pending.trim() ? { status: 'pending', chunk: entry.pending } : { problem: 'a pending board names its chunk' };
    }
  }
  return { problem: 'want a file path, a list of them, { "skip": "<reason>" } or { "pending": "<chunk>" }' };
}

/** The boards of a handoff: from its manifest, or (a folder from before ingest) from the boards at its top level. */
function boardsOf(dir) {
  const abs = path.join(dir, MANIFEST);
  if (fs.existsSync(abs)) {
    try {
      const m = JSON.parse(fs.readFileSync(abs, 'utf8'));
      if (Array.isArray(m.boards)) return m.boards;
    } catch { /* checkHandoff names it */ }
    return [];
  }
  return buildManifest(dir).manifest.boards.filter((b) => !b.file.includes('/'));
}

/**
 * Check a handoff's port map against its boards. `root` is the repo the map's `app` folder is in. Returns the problems
 * and each board's status (`status`: ported, skipped, pending, unmapped).
 */
export function checkPort(dir, { root = process.cwd(), label = posix(path.relative(root, dir)) || '.' } = {}) {
  const problems = [];
  const at = `${label}/${PORT}`;
  const boards = boardsOf(dir);
  const abs = path.join(dir, PORT);
  if (!fs.existsSync(abs)) {
    return { problems: [`${at}: missing (map every board to the file that draws it, or skip it with a reason)`], boards: boards.map((b) => ({ board: b.name, page: b.page ?? null, status: 'unmapped' })) };
  }
  let map;
  try {
    map = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (err) {
    return { problems: [`${at}: not JSON (${err.message})`], boards: [] };
  }
  const entries = map && typeof map.boards === 'object' && !Array.isArray(map.boards) && map.boards ? map.boards : null;
  if (!entries) return { problems: [`${at}: no "boards" object`], boards: [] };
  const app = typeof map.app === 'string' && map.app.trim() ? map.app : '.';
  const appDir = path.resolve(root, app);
  if (!fs.existsSync(appDir)) problems.push(`${at}: app folder ${app} not found`);
  const names = new Set(boards.map((b) => b.name));
  const status = [];
  for (const b of boards) {
    if (!Object.hasOwn(entries, b.name)) {
      problems.push(`${at}: board ${b.name} is not mapped (a file, a skip with its reason, or pending a chunk)`);
      status.push({ board: b.name, page: b.page ?? null, status: 'unmapped' });
      continue;
    }
    const c = classify(entries[b.name]);
    if (c.problem) {
      problems.push(`${at}: board ${b.name}: ${c.problem}`);
      status.push({ board: b.name, page: b.page ?? null, status: 'unmapped' });
      continue;
    }
    if (c.files) {
      for (const f of c.files) {
        if (!fs.existsSync(path.join(appDir, f))) problems.push(`${at}: board ${b.name} maps to ${posix(path.join(app, f))}, which does not exist`);
      }
    }
    status.push({ board: b.name, page: b.page ?? null, ...c });
  }
  for (const name of Object.keys(entries)) {
    if (!names.has(name)) problems.push(`${at}: ${name} is mapped, but the handoff has no such board`);
  }
  return { problems, boards: status };
}

/** Every handoff folder under root: design/handoff and packages/<name>/design/handoff, the folder and each one in it. */
export function findHandoffs(root) {
  const parents = [path.join(root, 'design', 'handoff')];
  const pkgs = path.join(root, 'packages');
  if (fs.existsSync(pkgs)) {
    for (const e of fs.readdirSync(pkgs, { withFileTypes: true })) {
      if (e.isDirectory()) parents.push(path.join(pkgs, e.name, 'design', 'handoff'));
    }
  }
  const out = [];
  for (const p of parents) {
    if (!fs.existsSync(p) || !fs.statSync(p).isDirectory()) continue;
    if (fs.existsSync(path.join(p, MANIFEST)) || hasBoards(p)) out.push(p);
    for (const e of fs.readdirSync(p, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.isDirectory() && !e.name.startsWith('.')) out.push(path.join(p, e.name));
    }
  }
  return out;
}

/** The whole check over the given handoffs (every one found under root when none is given): the gate's design leg. */
export function checkAll(root, dirs = findHandoffs(root)) {
  const problems = [];
  const notes = [];
  const counts = { ported: 0, skipped: 0, pending: 0 };
  for (const dir of dirs) {
    const label = posix(path.relative(root, dir)) || '.';
    if (fs.existsSync(path.join(dir, MANIFEST))) problems.push(...checkHandoff(dir, { label }).problems);
    else if (fs.existsSync(dir) && hasBoards(dir)) notes.push(`${label} predates ingest (no manifest): its files are unchecked, its port map is checked`);
    else problems.push(...checkHandoff(dir, { label }).problems);
    const port = checkPort(dir, { root, label });
    problems.push(...port.problems);
    for (const b of port.boards) if (b.status in counts) counts[b.status]++;
  }
  const total = counts.ported + counts.skipped + counts.pending;
  const note = dirs.length
    ? `${dirs.length} handoff${dirs.length === 1 ? '' : 's'}, ${total} boards: ${counts.ported} ported, ${counts.skipped} skipped, ${counts.pending} pending${notes.length ? `; ${notes.join('; ')}` : ''}`
    : 'no design handoff here (design/handoff/, packages/*/design/handoff/)';
  return { problems, notes, counts, handoffs: dirs.map((d) => posix(path.relative(root, d)) || '.'), note };
}

export function main(argv = process.argv.slice(2), { cwd = process.cwd(), out = process.stdout, err = process.stderr } = {}) {
  const json = argv.includes('--json');
  const bad = argv.find((a) => a.startsWith('--') && a !== '--json');
  const [verb, ...targets] = argv.filter((a) => !a.startsWith('--'));
  if (bad || !['check', 'status'].includes(verb) || (verb === 'status' && targets.length !== 1)) {
    err.write(`${bad ? `unknown flag ${bad}\n` : ''}${USAGE}\n`);
    return 2;
  }
  if (verb === 'status') {
    const dir = path.resolve(cwd, targets[0]);
    const { problems, boards } = checkPort(dir, { root: cwd });
    if (json) out.write(`${JSON.stringify({ ok: problems.length === 0, problems, boards }, null, 2)}\n`);
    else {
      for (const b of boards) out.write(`  ${b.board.padEnd(28)} ${b.status}${b.files ? `  ${b.files.join(', ')}` : b.reason ? `  ${b.reason}` : b.chunk ? `  ${b.chunk}` : ''}\n`);
      if (problems.length) err.write(`${problems.map((p) => `  ${p}`).join('\n')}\n`);
    }
    return problems.length ? 1 : 0;
  }
  const res = checkAll(cwd, targets.length ? targets.map((t) => path.resolve(cwd, t)) : undefined);
  if (json) out.write(`${JSON.stringify({ ok: res.problems.length === 0, ...res }, null, 2)}\n`);
  else if (res.problems.length) err.write(`${res.problems.map((p) => `  ${p}`).join('\n')}\n`);
  else out.write(`${res.note}\n`);
  return res.problems.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
