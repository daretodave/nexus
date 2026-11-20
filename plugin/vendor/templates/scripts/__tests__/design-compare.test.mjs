// design/png.mjs and design/compare.mjs: the PNG round trip, the reader over every row filter, and the diff's math on
// synthetic images (the threshold, alpha over white, two sizes, the diff image's colours, the CLI's exit codes).
// node:test, no deps; temp dirs only.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { crc32, decodePng, encodePng, pngSize } from '../design/png.mjs';
import { diffImages } from '../design/compare.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, '..', 'design', 'compare.mjs');

function solid(width, height, rgba) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(rgba, i * 4);
  return { width, height, data };
}
const at = (img, x, y) => [...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];

// An RGB PNG whose rows use the given filters, so the reader's unfiltering is checked against known pixels.
function rgbPng(width, height, pixel, filters) {
  const bpp = 3, stride = width * bpp;
  const rows = [];
  const px = (x, y) => pixel(x, y);
  const val = (y, i) => (y < 0 || i < 0 ? 0 : px(Math.floor(i / bpp), y)[i % bpp]);
  for (let y = 0; y < height; y++) {
    const f = filters[y % filters.length];
    const row = Buffer.alloc(stride + 1);
    row[0] = f;
    for (let i = 0; i < stride; i++) {
      const x = val(y, i), a = val(y, i - bpp), u = val(y - 1, i), c = val(y - 1, i - bpp);
      let pred = 0;
      if (f === 1) pred = a; else if (f === 2) pred = u; else if (f === 3) pred = (a + u) >> 1;
      else if (f === 4) { const q = a + u - c, pa = Math.abs(q - a), pb = Math.abs(q - u), pc = Math.abs(q - c); pred = pa <= pb && pa <= pc ? a : pb <= pc ? u : c; }
      row[i + 1] = (x - pred) & 0xff;
    }
    rows.push(row);
  }
  const chunk = (kind, data) => {
    const b = Buffer.alloc(12 + data.length);
    b.writeUInt32BE(data.length, 0); b.write(kind, 4, 'latin1'); data.copy(b, 8);
    b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length);
    return b;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

describe('png', () => {
  it('crc32 matches the known value', () => {
    assert.equal(crc32(Buffer.from('IEND', 'latin1')), 0xae426082);
  });

  it('round-trips RGBA through encode and decode', () => {
    const img = { width: 7, height: 5, data: new Uint8Array(7 * 5 * 4) };
    for (let i = 0; i < img.data.length; i++) img.data[i] = (i * 37 + 11) & 0xff;
    const png = encodePng(img);
    assert.deepEqual(pngSize(png), { width: 7, height: 5 });
    const back = decodePng(png);
    assert.equal(back.width, 7);
    assert.equal(back.height, 5);
    assert.deepEqual([...back.data], [...img.data]);
  });

  it('reads RGB rows under every filter as RGBA', () => {
    const pixel = (x, y) => [(x * 40 + y * 3) & 0xff, (y * 50 + 7) & 0xff, (x * y * 13) & 0xff];
    const img = decodePng(rgbPng(6, 5, pixel, [0, 1, 2, 3, 4]));
    for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) assert.deepEqual(at(img, x, y), [...pixel(x, y), 255], `pixel ${x},${y}`);
  });

  it('refuses what is not a PNG, and a size that does not match the bytes', () => {
    assert.throws(() => decodePng(Buffer.from('hello world')), /not a PNG/);
    assert.throws(() => encodePng({ width: 2, height: 2, data: new Uint8Array(3) }), /needs 16 RGBA bytes/);
  });
});

describe('diffImages', () => {
  it('scores two equal images 0 and fades the board to light grey', () => {
    const r = diffImages(solid(4, 3, [0, 0, 0, 255]), solid(4, 3, [0, 0, 0, 255]));
    assert.equal(r.differ, 0);
    assert.equal(r.percent, 0);
    assert.equal(r.sameSize, true);
    assert.deepEqual(at(r.image, 0, 0), [204, 204, 204, 255]);
  });

  it('counts a pixel only past the threshold', () => {
    const a = solid(10, 10, [100, 100, 100, 255]);
    const b = solid(10, 10, [100, 100, 100, 255]);
    b.data.set([120, 100, 100, 255], (2 * 10 + 3) * 4);
    b.data.set([140, 100, 100, 255], (5 * 10 + 5) * 4);
    const loose = diffImages(a, b, { threshold: 0.1 });
    assert.equal(loose.differ, 1);
    assert.equal(loose.percent, 1);
    assert.deepEqual(at(loose.image, 5, 5), [255, 0, 64, 255]);
    assert.notDeepEqual(at(loose.image, 3, 2), [255, 0, 64, 255]);
    const tight = diffImages(a, b, { threshold: 0.05 });
    assert.equal(tight.differ, 2);
    assert.equal(tight.percent, 2);
    assert.equal(diffImages(a, b, { threshold: 1 }).differ, 0);
  });

  it('flattens alpha onto white first', () => {
    const clear = solid(2, 2, [0, 0, 0, 0]);
    const white = solid(2, 2, [255, 255, 255, 255]);
    assert.equal(diffImages(clear, white, { threshold: 0 }).differ, 0);
  });

  it('counts the area outside the overlap of two sizes, and marks it yellow', () => {
    const r = diffImages(solid(4, 4, [9, 9, 9, 255]), solid(2, 3, [9, 9, 9, 255]));
    assert.equal(r.width, 4);
    assert.equal(r.height, 4);
    assert.equal(r.sameSize, false);
    assert.equal(r.differ, 0);
    assert.equal(r.outside, 16 - 6);
    assert.equal(r.percent, 62.5);
    assert.deepEqual(at(r.image, 3, 0), [255, 196, 0, 255]);
  });

  it('refuses a threshold outside 0 to 1', () => {
    assert.throws(() => diffImages(solid(1, 1, [0, 0, 0, 255]), solid(1, 1, [0, 0, 0, 255]), { threshold: 2 }), /from 0 to 1/);
  });
});

describe('compare CLI', () => {
  const ws = () => fs.mkdtempSync(path.join(os.tmpdir(), 'design compare '));
  const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf-8' });

  it('writes the diff PNG, prints the score, and exits 1 over --max', () => {
    const dir = ws();
    const a = path.join(dir, 'board.png'), b = path.join(dir, 'app.png'), out = path.join(dir, 'out', 'diff.png');
    fs.writeFileSync(a, encodePng(solid(10, 10, [0, 0, 0, 255])));
    const half = solid(10, 10, [0, 0, 0, 255]);
    for (let i = 0; i < 25; i++) half.data.set([255, 255, 255, 255], i * 4);
    fs.writeFileSync(b, encodePng(half));
    const ok = run([a, b, '--out', out]);
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /25% of pixels differ \(25 of 100\) at threshold 0\.1/);
    assert.deepEqual(pngSize(fs.readFileSync(out)), { width: 10, height: 10 });
    const over = run([a, b, '--max', '10', '--json']);
    assert.equal(over.status, 1);
    const j = JSON.parse(over.stdout);
    assert.equal(j.percent, 25);
    assert.equal(j.over, true);
    assert.equal(run([a, b, '--max', '30']).status, 0);
  });

  it('exits 2 on a usage error or an unreadable file', () => {
    assert.equal(run(['only-one.png']).status, 2);
    assert.equal(run(['a.png', 'b.png', '--threshold', '7']).status, 2);
    const dir = ws();
    const bad = path.join(dir, 'bad.png');
    fs.writeFileSync(bad, 'nope');
    assert.equal(run([bad, bad]).status, 2);
  });
});
