// scripts/design/ingest.mjs: keep a Claude Design export in the repo as the UI's source of truth.
//
// `/design ingest` (skills/design.md) fetches every board of an artifact into a scratch folder through the Artifact tool,
// or takes a folder the owner downloaded (a cloud tick has no Artifact access); this script does the rest, the same way
// every time:
//   - copies every file of the folder byte for byte into `<into>/<date>/` (`design/handoff/` by default; a second
//     delivery on the same day gets `<date>-2`, then `-3`), skipping dotfiles;
//   - writes `manifest.json`: the artifact link and version, the pages, the boards (every .html file, in the canvas
//     index's order when the folder has a `canvas.json`) and every file with its size and sha256;
//   - writes `README.md`, naming the folder the source of truth, listing the boards by page and opening the revision log;
//   - writes `port.json`, the port map: every board pending the port's chunk (scripts/design/port-map.mjs checks it).
// Nothing is written when the canvas index names a board the folder lacks (a fetch that stopped short), or when the
// export carries its own README.md, manifest.json or port.json.
//
//   node scripts/design/ingest.mjs <folder> [--into <dir>] [--date YYYY-MM-DD] [--artifact <url>] [--version <v>] [--chunk <id>] [--json]
//   node scripts/design/ingest.mjs check <handoff> [--json]    the files still match the manifest (exit 1 if not)
//   node scripts/design/ingest.mjs rehash <handoff>            after a logged edit: the manifest's sizes and hashes again
//
// A package's own handoff takes `--into packages/<name>/design/handoff`. `checkHandoff` is exported for the gate.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_INTO = 'design/handoff';
export const MANIFEST = 'manifest.json';
export const README = 'README.md';
export const INDEX = 'canvas.json';
export const PORT = 'port.json';
const OWN = new Set([MANIFEST, README, PORT]);
const USAGE = [
  'usage: node scripts/design/ingest.mjs <folder> [--into <dir>] [--date YYYY-MM-DD] [--artifact <url>] [--version <v>] [--chunk <id>] [--json]',
  '       node scripts/design/ingest.mjs check <handoff> [--json]',
  '       node scripts/design/ingest.mjs rehash <handoff>',
].join('\n');

const posix = (p) => p.split(path.sep).join('/');
const isBoard = (rel) => /\.html?$/i.test(rel);
export const boardName = (rel) => path.posix.basename(rel).replace(/(\.dc)?\.html?$/i, '');

/** Every file under dir (dotfiles and dot folders skipped), as sorted posix paths relative to it. */
export function listFiles(dir) {
  const out = [];
  const walk = (abs, rel) => {
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(abs, e.name), r);
      else if (e.isFile()) out.push(r);
    }
  };
  walk(dir, '');
  return out.sort();
}

export function hashFile(abs) {
  const buf = fs.readFileSync(abs);
  return { bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
}

function readIndex(dir) {
  const abs = path.join(dir, INDEX);
  if (!fs.existsSync(abs)) return null;
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (err) {
    return { invalid: err.message };
  }
}

/**
 * The manifest of an export folder: pages and boards from its canvas index (if any) and its .html files, a sha256 per
 * file. `problems` names what makes the folder unfit to ingest; the manifest is still returned.
 */
export function buildManifest(dir, { date = null, artifact = null, version = null, skip = OWN } = {}) {
  const problems = [];
  const files = listFiles(dir).filter((f) => !skip.has(f));
  const index = readIndex(dir);
  if (index?.invalid) problems.push(`${INDEX}: not JSON (${index.invalid})`);
  const canvas = index && !index.invalid ? index : null;
  const placed = canvas && canvas.boards && typeof canvas.boards === 'object' ? canvas.boards : {};
  const onDisk = new Set(files);
  for (const f of Object.keys(placed)) {
    if (!onDisk.has(f)) problems.push(`${INDEX} names ${f}, which the folder lacks: fetch it, or the export is incomplete`);
  }
  const order = [...(Array.isArray(canvas?.order) ? canvas.order : []), ...Object.keys(placed)];
  const boardFiles = [...new Set([...order.filter((f) => onDisk.has(f) && isBoard(f)), ...files.filter(isBoard)])];
  const boards = boardFiles.map((file) => ({
    name: boardName(file),
    file,
    page: placed[file]?.page ?? null,
    title: placed[file]?.title ?? null,
  }));
  const pages = (Array.isArray(canvas?.pages) ? canvas.pages : []).map((p) => ({
    id: p.id ?? null,
    name: p.name ?? p.id ?? null,
    boards: boards.filter((b) => b.page != null && b.page === p.id).map((b) => b.name),
  }));
  const loose = boards.filter((b) => !pages.some((p) => p.boards.includes(b.name))).map((b) => b.name);
  if (loose.length) pages.push({ id: null, name: canvas ? 'Not on the canvas' : 'Boards', boards: loose });
  const manifest = {
    handoff: 1,
    date,
    artifact,
    version,
    title: canvas?.title ?? null,
    pages,
    boards,
    files: files.map((f) => ({ path: f, ...hashFile(path.join(dir, f)) })),
  };
  return { manifest, problems };
}

/** The handoff's README: the folder is the source of truth; the boards by page; the revision log, opened. */
export function renderReadme(m, { into = DEFAULT_INTO } = {}) {
  const from = m.artifact ? `the artifact ${m.artifact}${m.version ? ` (version ${m.version})` : ''}` : 'a downloaded folder';
  const lines = [
    `# The Claude Design handoff, ${m.date}`,
    '',
    `${m.title ? `"${m.title}", as` : 'The design as'} delivered by Claude Design on ${m.date}, from ${from}.`,
    'This folder is the **source of truth for the UI**: fidelity reviews diff the',
    'app against it, and a screen that differs from its board is a bug in the',
    'screen, not in the board.',
    '',
    `- \`${MANIFEST}\`: the pages, the boards, and every file with its size and`,
    '  sha256. The files stay byte for byte as delivered: edit one only to keep',
    '  a gate green, log it under "Edits to the export", then run',
    `  \`node scripts/design/ingest.mjs rehash ${into}/${path.posix.basename(m.dir ?? m.date)}\`.`,
    `- \`${PORT}\`: the port map, each board's file in the app, its skip with the`,
    '  reason, or the chunk it waits on (`node scripts/design/port-map.mjs check`).',
    '- The boards are the design tool\'s documents, not app code: the port',
    '  translates their runtime tags and support script, and never ships them.',
    '',
    `## Boards (${m.boards.length})`,
    '',
  ];
  for (const p of m.pages) {
    lines.push(`- **${p.name}** (${p.boards.length}): ${p.boards.map((b) => `\`${b}\``).join(', ') || 'none'}`);
  }
  lines.push(
    '',
    '## Revisions',
    '',
    `1. **${m.date}, ingested**${m.version ? ` (artifact version ${m.version})` : ''}: ${m.boards.length} boards`,
    `   on ${m.pages.length} pages, ${m.files.length} files. Port: ${m.chunk ? `chunk ${m.chunk}` : 'not plotted yet'}.`,
    '',
    '## Edits to the export',
    '',
    'None yet. Each edit is a row: the file, what it was, what it is now, and',
    'which gate needed it.',
    '',
    '## Patterns not adopted',
    '',
    'The port\'s close fills this in: every board pattern the app leaves out or',
    'draws differently, with its reason.',
    '',
  );
  return lines.join('\n');
}

/** The app folder a handoff's port lives in, from where it was ingested: packages/x/design/handoff -> packages/x. */
export function appFor(into) {
  const m = /^(.*)\/design\/handoff\/?$/.exec(posix(into));
  return m && m[1] ? m[1] : '.';
}

/** A fresh port map: every board pending the port (its chunk when known). The port fills it in. */
export function seedPort(manifest, { chunk = null, app = '.' } = {}) {
  const boards = {};
  for (const b of manifest.boards) boards[b.name] = { pending: chunk || 'the port' };
  return { port: 1, app, boards };
}

/** `<date>`, or `<date>-2`, `-3`… when a delivery already landed that day. */
export function nextSlot(parent, date) {
  for (let n = 1; ; n++) {
    const slot = n === 1 ? date : `${date}-${n}`;
    if (!fs.existsSync(path.join(parent, slot))) return slot;
  }
}

export function today(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Ingest an export folder into `<root>/<into>/<slot>/`. Writes nothing when `problems` is not empty. */
export function ingest({ from, root = process.cwd(), into = DEFAULT_INTO, date = today(), artifact = null, version = null, chunk = null }) {
  const src = path.resolve(root, from);
  if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) return { problems: [`${from}: not a folder`] };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { problems: [`--date ${date}: want YYYY-MM-DD`] };
  const own = listFiles(src).filter((f) => OWN.has(f));
  const { manifest, problems } = buildManifest(src, { date, artifact, version, skip: new Set() });
  for (const f of own) problems.push(`the export carries its own ${f}; the handoff writes that file, so rename it first`);
  if (manifest.boards.length === 0) problems.push(`${from}: no .html boards in the folder`);
  if (problems.length) return { problems };
  const parent = path.resolve(root, into);
  const slot = nextSlot(parent, date);
  const dir = path.join(parent, slot);
  for (const f of manifest.files) {
    fs.mkdirSync(path.dirname(path.join(dir, f.path)), { recursive: true });
    fs.copyFileSync(path.join(src, f.path), path.join(dir, f.path));
  }
  fs.writeFileSync(path.join(dir, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, README), renderReadme({ ...manifest, dir: slot, chunk }, { into: posix(into).replace(/\/$/, '') }));
  fs.writeFileSync(path.join(dir, PORT), `${JSON.stringify(seedPort(manifest, { chunk, app: appFor(into) }), null, 2)}\n`);
  return { problems: [], dir, slot, manifest };
}

/** Does the handoff still match its manifest? Every listed file present with its size and sha256, nothing unlisted. */
export function checkHandoff(dir, { label = posix(dir) } = {}) {
  const problems = [];
  const at = (p) => `${label}/${p}`;
  const abs = path.join(dir, MANIFEST);
  if (!fs.existsSync(abs)) return { problems: [`${at(MANIFEST)}: missing (ingest the export with scripts/design/ingest.mjs)`], manifest: null };
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (err) {
    return { problems: [`${at(MANIFEST)}: not JSON (${err.message})`], manifest: null };
  }
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  if (!Array.isArray(manifest.files)) problems.push(`${at(MANIFEST)}: no files list`);
  const listed = new Set(files.map((f) => f.path));
  for (const f of files) {
    const p = path.join(dir, f.path);
    if (!fs.existsSync(p)) {
      problems.push(`${at(f.path)}: in the manifest, missing on disk`);
      continue;
    }
    const got = hashFile(p);
    if (got.sha256 !== f.sha256 || got.bytes !== f.bytes) {
      problems.push(`${at(f.path)}: changed since ingest (sha256 ${got.sha256.slice(0, 12)}, manifest ${String(f.sha256).slice(0, 12)}); log the edit and rehash, or restore it`);
    }
  }
  for (const f of listFiles(dir)) {
    if (!OWN.has(f) && !listed.has(f)) problems.push(`${at(f)}: on disk, not in the manifest`);
  }
  for (const b of Array.isArray(manifest.boards) ? manifest.boards : []) {
    if (!listed.has(b.file)) problems.push(`${at(MANIFEST)}: board ${b.name} names ${b.file}, which its files list lacks`);
  }
  if (!fs.existsSync(path.join(dir, README))) problems.push(`${at(README)}: missing (it names the folder the source of truth)`);
  return { problems, manifest };
}

/** After a logged edit: the files list again, everything else in the manifest kept. */
export function rehash(dir) {
  const abs = path.join(dir, MANIFEST);
  const old = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const { manifest } = buildManifest(dir, { date: old.date, artifact: old.artifact, version: old.version });
  const next = { ...old, files: manifest.files };
  fs.writeFileSync(abs, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (['--into', '--date', '--artifact', '--version', '--chunk'].includes(a)) {
      if (argv[i + 1] === undefined) throw new Error(`${a} needs a value`);
      opts[a.slice(2)] = argv[++i];
    } else if (a.startsWith('--')) throw new Error(`unknown flag ${a}`);
    else opts._.push(a);
  }
  return opts;
}

export function main(argv = process.argv.slice(2), { cwd = process.cwd(), out = process.stdout, err = process.stderr } = {}) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    err.write(`${e.message}\n${USAGE}\n`);
    return 2;
  }
  const [verb, target] = opts._;
  if (!verb || verb === 'help') {
    (verb ? out : err).write(`${USAGE}\n`);
    return verb ? 0 : 2;
  }
  if (verb === 'check' || verb === 'rehash') {
    if (!target) {
      err.write(`${USAGE}\n`);
      return 2;
    }
    const dir = path.resolve(cwd, target);
    if (verb === 'rehash') {
      const m = rehash(dir);
      out.write(`rehashed ${target}: ${m.files.length} files\n`);
      return 0;
    }
    const { problems, manifest } = checkHandoff(dir, { label: posix(target).replace(/\/$/, '') });
    if (opts.json) out.write(`${JSON.stringify({ ok: problems.length === 0, problems }, null, 2)}\n`);
    else if (problems.length) err.write(`${problems.map((p) => `  ${p}`).join('\n')}\n`);
    else out.write(`${target}: ${manifest.files.length} files match the manifest, ${manifest.boards.length} boards\n`);
    return problems.length ? 1 : 0;
  }
  const res = ingest({ from: verb, root: cwd, into: opts.into ?? DEFAULT_INTO, date: opts.date ?? today(), artifact: opts.artifact ?? null, version: opts.version ?? null, chunk: opts.chunk ?? null });
  if (res.problems.length) {
    if (opts.json) out.write(`${JSON.stringify({ ok: false, problems: res.problems }, null, 2)}\n`);
    else err.write(`nothing written:\n${res.problems.map((p) => `  ${p}`).join('\n')}\n`);
    return 1;
  }
  const rel = posix(path.relative(cwd, res.dir));
  const m = res.manifest;
  if (opts.json) {
    out.write(`${JSON.stringify({ ok: true, dir: rel, boards: m.boards.length, pages: m.pages.map((p) => ({ name: p.name, boards: p.boards.length })), files: m.files.length }, null, 2)}\n`);
  } else {
    out.write(`ingested ${m.boards.length} boards on ${m.pages.length} pages (${m.files.length} files) into ${rel}/\n`);
    for (const p of m.pages) out.write(`  ${p.name}: ${p.boards.length}\n`);
    out.write(`next: plot the port as an L chunk (/plot "port the design handoff in ${rel}/")\n`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
