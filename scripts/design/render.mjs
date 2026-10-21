// scripts/design/render.mjs: the boards of a Claude Design handoff as PNGs, at each board's own size (spec 43 A4).
//
// A board is the design tool's document, not a web page: it links the tool's runtime (`./support.js`), which the export
// does not carry. This script stands that runtime in (scripts/design/board-runtime.js) in a scratch copy of the
// handoff, inlines every board a page imports, and has the installed Chrome screenshot each one headless:
//   - the boards and their sizes come from `canvas.json` (w, h, page, title); a handoff without one renders every .html
//     at its `$preview` size, else 1440x900;
//   - `--theme night|dawn` renders every board in that theme (the URL's ?theme=dark|light, which reaches imported boards
//     too); a board that only re-imports another, at the same size, in a theme (a `*Light` twin) is then skipped as a
//     duplicate, unless named with --board;
//   - fonts load from the links the boards name (Google Fonts): render online, or the fallback faces show.
//
//   node scripts/design/render.mjs <handoff> [--board <name>[,<name>]] [--page <id>] [--theme night|dawn]
//                                  --out <dir> [--chrome <path>] [--jobs 4] [--wait 4000] [--json]
//
// Writes <out>/<Board>.png (or <Board>.<theme>.png with --theme). Exit 0 when every board rendered, 1 when one failed,
// 2 on a usage error or no Chrome (pass --chrome or set CHROME_PATH). The handoff is never written to. No dependencies:
// Chrome's own --screenshot does the drawing.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pngSize } from './png.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const RUNTIME = path.join(HERE, 'board-runtime.js');
export const THEMES = { night: 'dark', dawn: 'light' };
export const DEFAULT_SIZE = { w: 1440, h: 900 };
const USAGE = [
  'usage: node scripts/design/render.mjs <handoff> --out <dir> [--board <name>[,<name>]] [--page <id>] [--theme night|dawn]',
  '                                     [--chrome <path>] [--jobs 4] [--wait 4000] [--json]',
].join('\n');

export const boardName = (file) => path.posix.basename(file).replace(/(\.dc)?\.html?$/i, '');
const isBoardFile = (f) => /\.html?$/i.test(f) && !/^index\.html?$/i.test(f);

/** The `$preview` size a board's script declares, or null. */
export function previewSize(html) {
  const m = /data-props='([^']*)'/.exec(html) || /data-props="([^"]*)"/.exec(html);
  if (!m) return null;
  try {
    const p = JSON.parse(m[1].replace(/&quot;/g, '"'))?.$preview;
    return p && p.width > 0 && p.height > 0 ? { w: p.width, h: p.height } : null;
  } catch { return null; }
}

/**
 * The boards of a handoff folder, in the canvas index's order: { file, name, title, page, w, h }.
 * A board the index names but the folder lacks is reported in `missing`, not returned.
 */
export function readBoards(dir) {
  const files = fs.readdirSync(dir).filter(isBoardFile).sort();
  const indexPath = path.join(dir, 'canvas.json');
  const boards = [], missing = [];
  let pages = [];
  const size = (file) => previewSize(fs.readFileSync(path.join(dir, file), 'utf-8')) || DEFAULT_SIZE;
  if (fs.existsSync(indexPath)) {
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    pages = (index.pages || []).map((p) => ({ id: p.id, name: p.name || p.id }));
    const entries = index.boards || {};
    const order = Array.isArray(index.order) ? index.order.filter((f) => f in entries) : [];
    for (const f of Object.keys(entries)) if (!order.includes(f)) order.push(f);
    for (const file of order) {
      const e = entries[file] || {};
      if (!files.includes(file)) { missing.push(file); continue; }
      const fallback = e.w > 0 && e.h > 0 ? null : size(file);
      boards.push({ file, name: boardName(file), title: e.title || boardName(file), page: e.page || null, w: e.w > 0 ? e.w : fallback.w, h: e.h > 0 ? e.h : fallback.h });
    }
  } else {
    for (const file of files) { const s = size(file); boards.push({ file, name: boardName(file), title: boardName(file), page: null, w: s.w, h: s.h }); }
  }
  return { pages, boards, missing };
}

/** The names of the boards a board imports (<dc-import name="X"> or src="./X.dc.html"). */
export function importsOf(html) {
  const out = [];
  for (const m of html.matchAll(/<dc-import\b([^>]*)>/gi)) {
    const name = /\bname="([^"]+)"/.exec(m[1])?.[1] ?? boardName(/\bsrc="([^"]+)"/.exec(m[1])?.[1] ?? '');
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

const xdcBody = (html) => (/<x-dc\b[^>]*>([\s\S]*)<\/x-dc>/i.exec(html)?.[1] ?? '').replace(/<helmet\b[\S\s]*?<\/helmet>/gi, '');

/**
 * A theme twin: the board only re-imports another board in a set theme (nothing else drawn, no other prop).
 * Returns the imported board's name, or null.
 */
export function themeTwin(html) {
  const body = xdcBody(html).replace(/<\/?div\b[^>]*>/gi, '').trim();
  const m = /^<dc-import\b([^>]*)>\s*<\/dc-import>$/i.exec(body);
  if (!m) return null;
  const attrs = [...m[1].matchAll(/([\w:-]+)="[^"]*"/g)].map((a) => a[1]).filter((a) => !a.startsWith('hint-'));
  if (!attrs.includes('theme') || attrs.some((a) => a !== 'theme' && a !== 'name' && a !== 'src')) return null;
  return importsOf(html)[0] ?? null;
}

/** Every board `name` imports, directly or through another, in first-seen order. */
export function importClosure(name, readHtml) {
  const seen = [];
  const walk = (n) => {
    for (const i of importsOf(readHtml(n) ?? '')) if (i !== name && !seen.includes(i)) { seen.push(i); walk(i); }
  };
  walk(name);
  return seen;
}

/** A board's page with the runtime linked and every imported board inlined as a <template data-dc-board>. */
export function stagePage(html, imports) {
  const bodyOf = (h) => /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(h)?.[1] ?? h;
  const tpls = imports.map(({ name, html: h }) => `<template data-dc-board="${name}">${bodyOf(h)}</template>`).join('\n');
  let page = html.replace(/<script\s+src="\.\/support\.js"\s*><\/script>/i, '<script src="./board-runtime.js"></script>');
  if (!/board-runtime\.js/.test(page)) page = page.replace(/<head\b[^>]*>/i, (h) => `${h}\n<script src="./board-runtime.js"></script>`);
  return /<\/body>/i.test(page) ? page.replace(/<\/body>/i, `${tpls}\n</body>`) : `${page}\n${tpls}\n`;
}

/** The installed Chrome (or Chromium, or Edge): --chrome, then CHROME_PATH, then the usual places. Null when none. */
export function findChrome({ chrome = null, env = process.env, platform = process.platform, exists = fs.existsSync } = {}) {
  if (chrome) return exists(chrome) ? chrome : null;
  if (env.CHROME_PATH && exists(env.CHROME_PATH)) return env.CHROME_PATH;
  const c = [];
  if (platform === 'win32') {
    for (const base of [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA, 'C:\\Program Files', 'C:\\Program Files (x86)'].filter(Boolean)) {
      c.push(path.win32.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'));
      c.push(path.win32.join(base, 'Chromium', 'Application', 'chrome.exe'));
    }
    for (const base of [env['PROGRAMFILES(X86)'], env.PROGRAMFILES, 'C:\\Program Files (x86)', 'C:\\Program Files'].filter(Boolean)) c.push(path.win32.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
  } else if (platform === 'darwin') {
    c.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
  } else {
    for (const dir of (env.PATH || '/usr/bin:/usr/local/bin').split(':').filter(Boolean)) {
      for (const n of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) c.push(path.posix.join(dir, n));
    }
  }
  return c.find((p) => exists(p)) ?? null;
}

function shoot(chrome, url, png, { w, h, wait, profile }) {
  const args = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check',
    // An elevated shell on Windows makes Chrome relaunch itself de-elevated and exit at once, before the screenshot.
    '--do-not-de-elevate',
    '--disable-extensions', '--force-device-scale-factor=1', `--user-data-dir=${profile}`, `--window-size=${w},${h}`,
    `--virtual-time-budget=${wait}`, '--enable-logging=stderr', '--v=0', `--screenshot=${png}`, url];
  return new Promise((resolve) => {
    const child = spawn(chrome, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    const timer = setTimeout(() => child.kill(), Math.max(60000, wait * 4));
    child.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, problems: [e.message] }); });
    child.on('close', () => {
      clearTimeout(timer);
      const problems = [...err.matchAll(/\[dc\][^"\r\n]*/g)].map((m) => m[0].trim());
      resolve({ ok: fs.existsSync(png), problems });
    });
  });
}

/** Render the boards; returns { results: [{ name, file, png, w, h, ok, problems }], skipped, missing }. */
export async function render({ handoff, out, boards: only = [], page = null, theme = null, chrome, jobs = 4, wait = 4000, log = () => {} }) {
  const dir = path.resolve(handoff);
  const { boards, missing } = readBoards(dir);
  const htmlOf = new Map();
  const read = (name) => {
    if (!htmlOf.has(name)) {
      const f = [`${name}.dc.html`, `${name}.html`].find((x) => fs.existsSync(path.join(dir, x)));
      htmlOf.set(name, f ? fs.readFileSync(path.join(dir, f), 'utf-8') : null);
    }
    return htmlOf.get(name);
  };
  const want = only.map((b) => b.toLowerCase());
  let pick = boards.filter((b) => (!want.length || want.includes(b.name.toLowerCase()) || want.includes(b.file.toLowerCase())) && (!page || b.page === page));
  const unknown = want.filter((w) => !boards.some((b) => b.name.toLowerCase() === w || b.file.toLowerCase() === w));
  const skipped = [];
  if (theme && !want.length) {
    pick = pick.filter((b) => {
      const twin = themeTwin(fs.readFileSync(path.join(dir, b.file), 'utf-8'));
      const of = twin && boards.find((o) => o.name === twin && o.w === b.w && o.h === b.h);
      if (of) skipped.push({ name: b.name, reason: `a theme twin of ${twin}` });
      return !of;
    });
  }
  // The scratch copy: the handoff's files, the runtime beside them, and one staged page per board.
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-render-'));
  try {
    fs.cpSync(dir, stage, { recursive: true });
    fs.copyFileSync(RUNTIME, path.join(stage, 'board-runtime.js'));
    fs.mkdirSync(out, { recursive: true });
    const results = [];
    let next = 0;
    const work = async (slot) => {
      while (next < pick.length) {
        const b = pick[next++];
        const html = fs.readFileSync(path.join(dir, b.file), 'utf-8');
        const imports = importClosure(b.name, read).map((name) => ({ name, html: read(name) })).filter((i) => i.html !== null);
        const absent = importClosure(b.name, read).filter((n) => read(n) === null);
        const staged = path.join(stage, `.render-${b.name}.html`);
        fs.writeFileSync(staged, stagePage(html, imports));
        const png = path.resolve(out, theme ? `${b.name}.${theme}.png` : `${b.name}.png`);
        fs.rmSync(png, { force: true });
        const url = pathToFileURL(staged).href + (theme ? `?theme=${THEMES[theme]}` : '');
        const r = await shoot(chrome, url, png, { w: b.w, h: b.h, wait, profile: path.join(stage, `.profile-${slot}`) });
        const problems = [...absent.map((n) => `[dc] imports ${n}, which the handoff lacks`), ...r.problems];
        let ok = r.ok;
        if (ok) {
          const s = pngSize(fs.readFileSync(png));
          if (s.width !== b.w || s.height !== b.h) problems.push(`rendered ${s.width}x${s.height}, the board is ${b.w}x${b.h}`);
        } else problems.push('Chrome wrote no screenshot');
        results.push({ name: b.name, file: b.file, page: b.page, png: ok ? png : null, w: b.w, h: b.h, ok, problems });
        log(`${ok ? 'ok  ' : 'FAIL'} ${b.name} ${b.w}x${b.h}${problems.length ? `  (${problems.join('; ')})` : ''}`);
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, pick.length)) }, (_, i) => work(i)));
    const order = new Map(pick.map((b, i) => [b.name, i]));
    results.sort((x, y) => order.get(x.name) - order.get(y.name));
    return { results, skipped, missing, unknown };
  } finally {
    try { fs.rmSync(stage, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* a Chrome still closing holds a profile; the OS temp sweep takes it */ }
  }
}

function parseArgs(argv) {
  const a = { handoff: null, out: null, boards: [], page: null, theme: null, chrome: null, jobs: 4, wait: 4000, json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    const val = () => { const v = argv[++i]; if (v === undefined) throw new Error(`${t} needs a value`); return v; };
    if (t === '--out') a.out = val();
    else if (t === '--board') a.boards.push(...val().split(',').map((s) => s.trim()).filter(Boolean));
    else if (t === '--page') a.page = val();
    else if (t === '--theme') a.theme = val();
    else if (t === '--chrome') a.chrome = val();
    else if (t === '--jobs') a.jobs = Number(val());
    else if (t === '--wait') a.wait = Number(val());
    else if (t === '--json') a.json = true;
    else if (t === '-h' || t === '--help') a.help = true;
    else if (t.startsWith('--')) throw new Error(`unknown flag ${t}`);
    else if (!a.handoff) a.handoff = t;
    else throw new Error(`one handoff folder only (got ${t} too)`);
  }
  if (a.help) return a;
  if (!a.handoff) throw new Error('name the handoff folder');
  if (!a.out) throw new Error('--out <dir> is required');
  if (a.theme && !(a.theme in THEMES)) throw new Error(`--theme takes night or dawn, not ${a.theme}`);
  if (!(a.jobs >= 1)) throw new Error('--jobs takes 1 or more');
  if (!(a.wait >= 0)) throw new Error('--wait takes milliseconds');
  return a;
}

export async function main(argv = process.argv.slice(2), log = console.log) {
  let a;
  try { a = parseArgs(argv); } catch (e) { console.error(`render: ${e.message}\n${USAGE}`); return 2; }
  if (a.help) { log(USAGE); return 0; }
  if (!fs.existsSync(a.handoff) || !fs.statSync(a.handoff).isDirectory()) { console.error(`render: no handoff folder at ${a.handoff}`); return 2; }
  const chrome = findChrome({ chrome: a.chrome });
  if (!chrome) { console.error('render: no Chrome found. Install Google Chrome (or Chromium, or Edge), or pass --chrome <path> or set CHROME_PATH.'); return 2; }
  const r = await render({ ...a, chrome, log: a.json ? () => {} : log });
  const ok = r.results.filter((x) => x.ok).length;
  if (a.json) log(JSON.stringify({ chrome, rendered: ok, failed: r.results.length - ok, ...r }, null, 2));
  else {
    for (const s of r.skipped) log(`skip ${s.name}  (${s.reason})`);
    for (const m of r.missing) log(`missing ${m}  (canvas.json names it; the folder lacks it)`);
    for (const u of r.unknown) log(`unknown board ${u}`);
    log(`rendered ${ok} of ${r.results.length} boards${a.theme ? ` in ${a.theme}` : ''} into ${a.out}${r.skipped.length ? ` (${r.skipped.length} theme twins skipped)` : ''}`);
  }
  return r.results.length - ok || r.unknown.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exitCode = await main();
