// scripts/design/compare.mjs: the app against its board, pixel by pixel (spec 43 A4).
//
// The fidelity review renders a board (scripts/design/render.mjs) and screenshots the app's screen at the same size and
// theme; this says how far apart they are. Both PNGs are flattened onto white, then each pixel differs when its largest
// channel difference passes the threshold (0..1, default 0.1: anti-aliasing and font hinting stay quiet). Pixels outside
// the overlap of two sizes all differ. The diff PNG shows the board faded to grey, a differing pixel red, and the area
// only one image covers yellow; the score is the share of pixels that differ.
//
//   node scripts/design/compare.mjs <board.png> <app.png> [--threshold 0.1] [--out diff.png] [--max <percent>] [--json]
//
// Exit 0, or 1 when --max is given and the score passes it; 2 on a usage or read error. No dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodePng, encodePng } from './png.mjs';

export const DEFAULT_THRESHOLD = 0.1;
const USAGE = 'usage: node scripts/design/compare.mjs <board.png> <app.png> [--threshold 0.1] [--out diff.png] [--max <percent>] [--json]';
const RED = [255, 0, 64];
const YELLOW = [255, 196, 0];

const flat = (d, i, c) => {
  const a = d[i + 3] / 255;
  return d[i + c] * a + 255 * (1 - a);
};

/**
 * Compare two RGBA images ({ width, height, data }). Returns the counts, the percent of pixels that differ, and a diff
 * image as large as the bigger of the two in each direction.
 */
export function diffImages(a, b, { threshold = DEFAULT_THRESHOLD } = {}) {
  if (!(threshold >= 0 && threshold <= 1)) throw new Error(`threshold ${threshold}: give a number from 0 to 1`);
  const width = Math.max(a.width, b.width), height = Math.max(a.height, b.height);
  const ow = Math.min(a.width, b.width), oh = Math.min(a.height, b.height);
  const out = new Uint8Array(width * height * 4);
  const limit = threshold * 255;
  let differ = 0, outside = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      let colour;
      if (x >= ow || y >= oh) { outside++; colour = YELLOW; }
      else {
        const i = (y * a.width + x) * 4, j = (y * b.width + x) * 4;
        let max = 0;
        for (let c = 0; c < 3; c++) max = Math.max(max, Math.abs(flat(a.data, i, c) - flat(b.data, j, c)));
        if (max > limit) { differ++; colour = RED; }
        else {
          const g = 0.299 * flat(a.data, i, 0) + 0.587 * flat(a.data, i, 1) + 0.114 * flat(a.data, i, 2);
          const v = Math.round(255 - (255 - g) * 0.2);
          colour = [v, v, v];
        }
      }
      out[o] = colour[0]; out[o + 1] = colour[1]; out[o + 2] = colour[2]; out[o + 3] = 255;
    }
  }
  const total = width * height;
  const percent = total ? ((differ + outside) / total) * 100 : 0;
  return {
    width, height, total, differ, outside, threshold,
    percent: Math.round(percent * 100) / 100,
    sameSize: a.width === b.width && a.height === b.height,
    image: { width, height, data: out },
  };
}

function parseArgs(argv) {
  const a = { files: [], threshold: DEFAULT_THRESHOLD, out: null, max: null, json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    const val = () => { const v = argv[++i]; if (v === undefined) throw new Error(`${t} needs a value`); return v; };
    if (t === '--threshold') a.threshold = Number(val());
    else if (t === '--out') a.out = val();
    else if (t === '--max') a.max = Number(val());
    else if (t === '--json') a.json = true;
    else if (t === '-h' || t === '--help') a.help = true;
    else if (t.startsWith('--')) throw new Error(`unknown flag ${t}`);
    else a.files.push(t);
  }
  if (!a.help && a.files.length !== 2) throw new Error('give two PNGs: the board, then the app');
  if (!(a.threshold >= 0 && a.threshold <= 1)) throw new Error('--threshold takes a number from 0 to 1');
  if (a.max !== null && !(a.max >= 0)) throw new Error('--max takes a percent, 0 or more');
  return a;
}

export function main(argv = process.argv.slice(2), log = console.log) {
  let a;
  try { a = parseArgs(argv); } catch (e) { console.error(`compare: ${e.message}\n${USAGE}`); return 2; }
  if (a.help) { log(USAGE); return 0; }
  let imgs;
  try { imgs = a.files.map((f) => decodePng(fs.readFileSync(f))); } catch (e) { console.error(`compare: ${e.message}`); return 2; }
  const r = diffImages(imgs[0], imgs[1], { threshold: a.threshold });
  if (a.out) {
    fs.mkdirSync(path.dirname(path.resolve(a.out)), { recursive: true });
    fs.writeFileSync(a.out, encodePng(r.image));
  }
  const over = a.max !== null && r.percent > a.max;
  if (a.json) {
    const { image, ...rest } = r;
    log(JSON.stringify({ board: a.files[0], app: a.files[1], ...rest, sizes: imgs.map((m) => `${m.width}x${m.height}`), diff: a.out, max: a.max, over }, null, 2));
  } else {
    log(`${r.percent}% of pixels differ (${r.differ + r.outside} of ${r.total}) at threshold ${r.threshold}`);
    if (!r.sameSize) log(`sizes differ: board ${imgs[0].width}x${imgs[0].height}, app ${imgs[1].width}x${imgs[1].height} (${r.outside} pixels outside the overlap)`);
    if (a.out) log(`diff: ${a.out}`);
    if (over) log(`over the --max of ${a.max}%`);
  }
  return over ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exitCode = main();
