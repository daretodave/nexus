// The recorder (spec 44 A2): frames to a palette-optimised GIF in pure JavaScript, the budget, the arguments.
// No browser here: the encoder, the PNG reader, the budget check and the argument parser are plain functions.
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { encodeGif, readGif, quantize, centiseconds } from '../scripts/record/gif.mjs';
import { decodePng } from '../scripts/record/png.mjs';
import { BUDGET, budgetProblems, parseArgs, recordLength } from '../scripts/record.mjs';

const W = 48;
const H = 32;

/** An RGBA frame: a flat sky, a moving block, a gradient strip (more colours than a GIF holds). */
function frame(k) {
  const d = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let c = [14, 18, 32];
      if (y >= H - 6) c = [x * 5, y * 7, 255 - x * 5];
      if (x >= 4 + k * 6 && x < 14 + k * 6 && y >= 6 && y < 16) c = [240, 196, 90];
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
  }
  return d;
}

const frames = [0, 1, 2, 3].map((k) => ({ data: frame(k), at: k * 100 }));

test('the encoder writes a GIF89a with the frames, the delays and a palette of at most 256', () => {
  const gif = encodeGif({ width: W, height: H, frames, end: 400 });
  assert.equal(Buffer.from(gif.subarray(0, 6)).toString('latin1'), 'GIF89a');
  assert.equal(gif[gif.length - 1], 0x3b, 'ends with the trailer');
  const r = readGif(gif);
  assert.equal(r.width, W);
  assert.equal(r.height, H);
  assert.ok(r.palette.length / 3 <= 256);
  assert.equal(r.frames.length, 4);
  assert.deepEqual(r.frames.map((f) => f.delay), [10, 10, 10, 10]);
  assert.equal(r.duration, 400);
  assert.equal(r.loop, 0, 'loops forever');
  assert.ok(gif.length < 8000, `small: ${gif.length} bytes`);
});

test('round trip: every composited frame comes back close to its source', () => {
  const gif = encodeGif({ width: W, height: H, frames, end: 400 });
  const r = readGif(gif, { pixels: true });
  r.frames.forEach((f, k) => {
    const src = frames[k].data;
    let worst = 0;
    for (let i = 0; i < W * H; i++) {
      for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(f.rgba[i * 4 + c] - src[i * 4 + c]));
    }
    assert.ok(worst <= 24, `frame ${k}: worst channel error ${worst}`);
    // The flat sky and the block are exact.
    assert.deepEqual([...f.rgba.subarray(0, 3)], [14, 18, 32]);
  });
});

test('LZW survives a full code table: noisy frames come back exact', () => {
  const w = 160, h = 120;
  const colours = Array.from({ length: 200 }, (_, i) => [(i * 37) & 255, (i * 91) & 255, (i * 13 + 7) & 255]);
  let seed = 7;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed; };
  const noisy = [0, 1].map((k) => {
    const d = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) { const c = colours[rand() % colours.length]; d.set([...c, 255], i * 4); }
    return { data: d, at: k * 500 };
  });
  const palette = new Uint8Array(colours.flat());
  const r = readGif(encodeGif({ width: w, height: h, frames: noisy, end: 1000, palette }), { pixels: true });
  r.frames.forEach((f, k) => assert.deepEqual(f.rgba, noisy[k].data, `frame ${k}`));
});

test('a later frame carries only what changed: cropped, the rest transparent', () => {
  const r = readGif(encodeGif({ width: W, height: H, frames, end: 400 }));
  assert.deepEqual([r.frames[0].w, r.frames[0].h], [W, H]);
  const f = r.frames[1];
  assert.ok(f.w * f.h < (W * H) / 4, `cropped to the moving block: ${f.w}x${f.h}`);
  assert.ok(f.transparent !== null);
});

test('an unchanged frame folds its time into the one before it', () => {
  const same = [{ data: frame(0), at: 0 }, { data: frame(0), at: 100 }, { data: frame(1), at: 200 }];
  const r = readGif(encodeGif({ width: W, height: H, frames: same, end: 300 }));
  assert.equal(r.frames.length, 2);
  assert.deepEqual(r.frames.map((f) => f.delay), [20, 10]);
});

test('delays come from capture times without drift', () => {
  // 12 fps: 83.3 ms apart. Each delay rounds, the sum stays the length.
  const at = Array.from({ length: 12 }, (_, i) => Math.round((i * 1000) / 12));
  const d = centiseconds(at, 1000);
  assert.equal(d.reduce((a, b) => a + b, 0), 100);
  assert.ok(d.every((x) => x === 8 || x === 9));
  assert.ok(d.every((x) => x >= 2), 'never under the 2 cs browsers honour');
});

test('the quantiser keeps the flat colours exact and never passes 255 entries', () => {
  const p = quantize([frame(0), frame(3)], 255);
  assert.ok(p.length / 3 <= 255);
  const has = (c) => { for (let i = 0; i < p.length; i += 3) if (p[i] === c[0] && p[i + 1] === c[1] && p[i + 2] === c[2]) return true; return false; };
  assert.ok(has([14, 18, 32]));
  assert.ok(has([240, 196, 90]));
});

test('the PNG reader decodes RGB and RGBA with every filter', () => {
  const crc = (buf) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } c = 0xffffffff; for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  for (const [colorType, bpp] of [[2, 3], [6, 4]]) {
    const w = 5, h = 5;
    const px = (x, y) => [x * 40, y * 50, (x + y) * 20, 200 + x];
    const raw = [];
    for (let y = 0; y < h; y++) {
      const filter = y; // 0 none, 1 sub, 2 up, 3 average, 4 paeth
      raw.push(filter);
      const line = (yy) => { const out = []; for (let x = 0; x < w; x++) out.push(...px(x, yy).slice(0, bpp)); return out; };
      const cur = line(y);
      const prev = y ? line(y - 1) : new Array(w * bpp).fill(0);
      for (let i = 0; i < cur.length; i++) {
        const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
        raw.push((cur[i] - pred) & 0xff);
      }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = colorType;
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.from(raw))), chunk('IEND', Buffer.alloc(0))]);
    const img = decodePng(png);
    assert.deepEqual([img.width, img.height], [w, h]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const want = px(x, y); if (bpp === 3) want[3] = 255;
      assert.deepEqual([...img.data.subarray((y * w + x) * 4, (y * w + x) * 4 + 4)], want, `type ${colorType} at ${x},${y}`);
    }
  }
  assert.throws(() => decodePng(Buffer.from('not a png')), /not a PNG/);
});

test('the budget: 5 to 8 seconds and about 3 MB, every miss named', () => {
  assert.deepEqual(BUDGET, { minMs: 5000, maxMs: 8000, maxBytes: 3 * 1024 * 1024 });
  assert.deepEqual(budgetProblems({ durationMs: 7000, bytes: 1_200_000 }), []);
  assert.deepEqual(budgetProblems({ durationMs: 5000, bytes: BUDGET.maxBytes }), []);
  const short = budgetProblems({ durationMs: 4200, bytes: 100 });
  assert.equal(short.length, 1);
  assert.match(short[0], /4\.2 s.*under 5 s/);
  assert.match(budgetProblems({ durationMs: 8100, bytes: 100 })[0], /8\.1 s.*over 8 s/);
  assert.match(budgetProblems({ durationMs: 6000, bytes: 4_000_000 })[0], /3\.81 MB.*over 3\.00 MB/);
  assert.equal(budgetProblems({ durationMs: 9000, bytes: 4_000_000 }).length, 2);
});

test('the recording runs the script plus a short hold, inside the budget', () => {
  assert.equal(recordLength({ script: 7000, speed: 1 }), 7600);
  assert.equal(recordLength({ script: 3000, speed: 1 }), 5000, 'a short script is held to the floor');
  assert.equal(recordLength({ script: 7600, speed: 1 }), 8000, 'a long one is cut at the ceiling');
  assert.equal(recordLength({ script: 12000, speed: 2 }), 6600, 'speed shortens the script');
  assert.equal(recordLength({ script: 7000, speed: 1, seconds: 6 }), 6000, '--seconds wins');
});

test('the arguments: a scenario, then flags with defaults', () => {
  const a = parseArgs(['fleet-to-tug']);
  assert.equal(a.scenario, 'fleet-to-tug');
  assert.equal(a.moment, 'fleet-to-tug');
  assert.equal(a.fps, 12);
  assert.equal(a.width, 960);
  assert.equal(a.height, 600);
  assert.equal(a.theme, 'night');
  assert.equal(a.speed, 1);
  assert.equal(a.seconds, null);
  assert.equal(a.session, null);
  assert.equal(a.poster, 'last');
  assert.match(a.out.replace(/\\/g, '/'), /assets\/gifs$/);

  const b = parseArgs(['bug-to-archive', '--out', 'x/y', '--fps=10', '--width', '800', '--height', '500', '--theme', 'dawn', '--speed', '1.5', '--seconds', '6', '--session', 'vega', '--name', 'bug', '--poster', '2500', '--chrome', 'C:/c.exe', '--headed']);
  assert.deepEqual(
    { s: b.scenario, m: b.moment, o: b.out.replace(/\\/g, '/').endsWith('x/y'), f: b.fps, w: b.width, h: b.height, t: b.theme, sp: b.speed, sec: b.seconds, ses: b.session, p: b.poster, c: b.chrome, hd: b.headed },
    { s: 'bug-to-archive', m: 'bug', o: true, f: 10, w: 800, h: 500, t: 'dawn', sp: 1.5, sec: 6, ses: 'vega', p: 2500, c: 'C:/c.exe', hd: true },
  );

  assert.throws(() => parseArgs([]), /scenario/);
  assert.throws(() => parseArgs(['x', '--fps', '0']), /--fps/);
  assert.throws(() => parseArgs(['x', '--fps', '60']), /--fps/);
  assert.throws(() => parseArgs(['x', '--width', 'wide']), /--width/);
  assert.throws(() => parseArgs(['x', '--theme', 'noon']), /--theme/);
  assert.throws(() => parseArgs(['x', '--seconds', '9']), /--seconds/);
  assert.throws(() => parseArgs(['x', '--name', '../up']), /--name/);
  assert.throws(() => parseArgs(['x', '--bogus']), /unknown/);
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['list']).scenario, 'list');
});
