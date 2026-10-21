// A small GIF89a encoder and reader in plain JavaScript (spec 44 A2): no ffmpeg, no native code, no dependency.
//
//   quantize(frames, colors)  one palette for the whole recording: median cut over the colours every frame
//                             uses, weighted by how much of the picture each covers, so a UI's flat colours
//                             come out exact and its anti-aliased edges share what is left.
//   encodeGif({ ... })        the frames on that palette. A later frame carries only the rectangle that changed,
//                             with the unchanged pixels inside it transparent; a frame that changed nothing adds
//                             its time to the one before. Delays come from the capture times.
//   readGif(bytes)            the other way, for tests and the budget check: header, palette, frames, delays,
//                             and with { pixels: true } every frame composited to RGBA.
//
// A GIF holds 256 colours: 255 for the picture and one kept for "unchanged".

const TRANSPARENT = 255;
const MIN_CODE = 8;

// ---- palette ------------------------------------------------------------------------------

/**
 * A palette of at most `colors` entries (RGB triplets) for RGBA frames.
 * @param {Uint8Array[]} frames
 * @param {number} [colors=255]
 * @param {number} [budget=2_000_000]  the most pixels sampled across all frames
 * @returns {Uint8Array}
 */
export function quantize(frames, colors = 255, budget = 2_000_000) {
  const total = frames.reduce((n, f) => n + f.length / 4, 0);
  const stride = Math.max(1, Math.floor(total / budget));
  // Histogram on 6 bits a channel; each bin keeps its true sums, so a bin of one colour averages back exactly.
  const count = new Uint32Array(1 << 18);
  const sum = new Float64Array(3 << 18);
  for (const f of frames) {
    for (let p = 0; p < f.length; p += 4 * stride) {
      const k = ((f[p] >> 2) << 12) | ((f[p + 1] >> 2) << 6) | (f[p + 2] >> 2);
      count[k]++;
      sum[k * 3] += f[p]; sum[k * 3 + 1] += f[p + 1]; sum[k * 3 + 2] += f[p + 2];
    }
  }
  const bins = [];
  for (let k = 0; k < count.length; k++) {
    if (!count[k]) continue;
    const n = count[k];
    bins.push({ n, c: [sum[k * 3] / n, sum[k * 3 + 1] / n, sum[k * 3 + 2] / n] });
  }
  const box = (items) => {
    const lo = [255, 255, 255], hi = [0, 0, 0];
    let n = 0;
    for (const b of items) {
      n += b.n;
      for (let c = 0; c < 3; c++) { if (b.c[c] < lo[c]) lo[c] = b.c[c]; if (b.c[c] > hi[c]) hi[c] = b.c[c]; }
    }
    const range = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
    const axis = range.indexOf(Math.max(...range));
    return { items, n, axis, score: items.length > 1 ? n * range[axis] : -1 };
  };
  const boxes = [box(bins)];
  while (boxes.length < colors) {
    let best = -1;
    for (let i = 0; i < boxes.length; i++) if (boxes[i].score > 0 && (best < 0 || boxes[i].score > boxes[best].score)) best = i;
    if (best < 0) break;
    const { items, n, axis } = boxes[best];
    items.sort((a, b) => a.c[axis] - b.c[axis]);
    let acc = 0, cut = 1;
    for (let i = 0; i < items.length - 1; i++) {
      acc += items[i].n;
      cut = i + 1;
      if (acc >= n / 2) break;
    }
    boxes.splice(best, 1, box(items.slice(0, cut)), box(items.slice(cut)));
  }
  const out = new Uint8Array(boxes.length * 3);
  boxes.forEach((b, i) => {
    const s = [0, 0, 0];
    for (const it of b.items) for (let c = 0; c < 3; c++) s[c] += it.c[c] * it.n;
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.round(s[c] / b.n);
  });
  return out;
}

/** Nearest palette entry for each colour, remembered. */
function matcher(palette) {
  const size = palette.length / 3;
  const memo = new Map();
  return (r, g, b) => {
    const key = (r << 16) | (g << 8) | b;
    let hit = memo.get(key);
    if (hit !== undefined) return hit;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < size; i++) {
      const dr = r - palette[i * 3], dg = g - palette[i * 3 + 1], db = b - palette[i * 3 + 2];
      const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
      if (d < bestD) { bestD = d; best = i; if (!d) break; }
    }
    memo.set(key, best);
    return best;
  };
}

// ---- timing -------------------------------------------------------------------------------

/**
 * GIF delays (centiseconds) for frames captured at `at` ms, the last held until `end` ms.
 * Each rounds against the running total, so the sum is the length and nothing drifts.
 */
export function centiseconds(at, end) {
  const t0 = at[0] || 0;
  const cs = (ms) => Math.round((ms - t0) / 10);
  return at.map((t, i) => cs(i + 1 < at.length ? at[i + 1] : end) - cs(t));
}

// ---- writing ------------------------------------------------------------------------------

class Bytes {
  constructor() { this.buf = new Uint8Array(1 << 16); this.len = 0; }
  room(n) {
    if (this.len + n <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.len + n) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }
  byte(b) { this.room(1); this.buf[this.len++] = b; }
  u16(v) { this.byte(v & 0xff); this.byte((v >> 8) & 0xff); }
  bytes(a) { this.room(a.length); this.buf.set(a, this.len); this.len += a.length; }
  text(s) { for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i)); }
  done() { return this.buf.slice(0, this.len); }
}

/** LZW-compress palette indices into GIF data sub-blocks (minimum code size 8). */
function lzw(out, indices) {
  const clear = 1 << MIN_CODE, eoi = clear + 1;
  let size = MIN_CODE + 1, next = eoi + 1;
  const dict = new Map();
  const block = new Uint8Array(255);
  let blen = 0, acc = 0, bits = 0;
  const flush = () => { if (blen) { out.byte(blen); out.bytes(block.subarray(0, blen)); blen = 0; } };
  const emit = (code) => {
    acc |= code << bits;
    bits += size;
    while (bits >= 8) {
      block[blen++] = acc & 0xff;
      if (blen === 255) flush();
      acc >>>= 8;
      bits -= 8;
    }
  };
  out.byte(MIN_CODE);
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = prefix * 256 + k;
    const hit = dict.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    emit(prefix);
    if (next < 4096) {
      if (next >= 1 << size && size < 12) size++;
      dict.set(key, next++);
    } else {
      emit(clear);
      dict.clear();
      size = MIN_CODE + 1;
      next = eoi + 1;
    }
    prefix = k;
  }
  emit(prefix);
  if (next >= 1 << size && size < 12) size++;
  emit(eoi);
  if (bits > 0) { block[blen++] = acc & 0xff; if (blen === 255) flush(); }
  flush();
  out.byte(0);
}

/**
 * Encode RGBA frames to an animated GIF that loops forever.
 * @param {object} o
 * @param {number} o.width
 * @param {number} o.height
 * @param {{ data: Uint8Array, at: number }[]} o.frames  RGBA, width*height*4 each; `at` is the capture time in ms
 * @param {number} o.end         when the last frame stops showing (ms, same clock as `at`)
 * @param {Uint8Array} [o.palette]  RGB triplets, at most 255; default quantize(frames)
 * @returns {Uint8Array}
 */
export function encodeGif({ width, height, frames, end, palette }) {
  if (!frames.length) throw new Error('no frames to encode');
  for (const f of frames) if (f.data.length !== width * height * 4) throw new Error(`a frame is ${f.data.length} bytes, not ${width}x${height}x4`);
  const pal = palette || quantize(frames.map((f) => f.data));
  if (pal.length / 3 > 255) throw new Error('a palette of more than 255 colours leaves no room for "unchanged"');
  const match = matcher(pal);
  const delays = centiseconds(frames.map((f) => f.at), end);

  // Every frame on the palette; a pixel the same as last frame's reuses its index.
  const n = width * height;
  const indexed = [];
  let prevRgba = null, prevIdx = null;
  for (const f of frames) {
    const idx = new Uint8Array(n);
    const d = f.data;
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      if (prevRgba && d[p] === prevRgba[p] && d[p + 1] === prevRgba[p + 1] && d[p + 2] === prevRgba[p + 2]) idx[i] = prevIdx[i];
      else idx[i] = match(d[p], d[p + 1], d[p + 2]);
    }
    indexed.push(idx);
    prevRgba = d; prevIdx = idx;
  }

  // What each frame adds over the last one shown: its changed rectangle, or nothing (fold the time back).
  const parts = [];
  let shown = null;
  indexed.forEach((idx, k) => {
    if (!shown) { parts.push({ x: 0, y: 0, w: width, h: height, px: idx, delay: delays[k], clear: false }); shown = idx; return; }
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        if (idx[row + x] !== shown[row + x]) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          y1 = y;
        }
      }
    }
    if (x1 < 0) { parts[parts.length - 1].delay += delays[k]; return; }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const px = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y0 + y) * width + x0 + x;
        px[y * w + x] = idx[i] === shown[i] ? TRANSPARENT : idx[i];
      }
    }
    parts.push({ x: x0, y: y0, w, h, px, delay: delays[k], clear: true });
    shown = idx;
  });

  const out = new Bytes();
  out.text('GIF89a');
  out.u16(width); out.u16(height);
  out.byte(0x80 | 0x70 | 0x07); // a global table of 256 entries, 8-bit colour resolution
  out.byte(0); out.byte(0);
  const table = new Uint8Array(256 * 3);
  table.set(pal);
  out.bytes(table);
  out.bytes([0x21, 0xff, 0x0b]); out.text('NETSCAPE2.0'); out.bytes([0x03, 0x01, 0x00, 0x00, 0x00]); // loop forever
  for (const p of parts) {
    // Graphic control: "do not dispose" so the next frame paints over this one; transparency for later frames.
    out.bytes([0x21, 0xf9, 0x04, (1 << 2) | (p.clear ? 1 : 0)]);
    out.u16(Math.max(0, p.delay));
    out.byte(p.clear ? TRANSPARENT : 0);
    out.byte(0);
    out.byte(0x2c);
    out.u16(p.x); out.u16(p.y); out.u16(p.w); out.u16(p.h);
    out.byte(0);
    lzw(out, p.px);
  }
  out.byte(0x3b);
  return out.done();
}

// ---- reading ------------------------------------------------------------------------------

function unlzw(data, minCode, count) {
  const clear = 1 << minCode, eoi = clear + 1;
  const prefix = new Int16Array(4096), suffix = new Uint8Array(4096), first = new Uint8Array(4096), length = new Uint16Array(4096);
  for (let i = 0; i < clear; i++) { suffix[i] = i; first[i] = i; length[i] = 1; prefix[i] = -1; }
  const out = new Uint8Array(count);
  let size = minCode + 1, next = eoi + 1, prev = -1, pos = 0, acc = 0, bits = 0, o = 0;
  const write = (code) => {
    const len = length[code];
    let c = code;
    for (let i = len - 1; i >= 0; i--) { if (o + i < count) out[o + i] = suffix[c]; c = prefix[c]; }
    o += len;
  };
  for (;;) {
    while (bits < size && pos < data.length) { acc |= data[pos++] << bits; bits += 8; }
    if (bits < size) break;
    const code = acc & ((1 << size) - 1);
    acc >>>= size; bits -= size;
    if (code === clear) { size = minCode + 1; next = eoi + 1; prev = -1; continue; }
    if (code === eoi) break;
    if (prev < 0) { write(code); prev = code; continue; }
    if (code > next) throw new Error(`bad LZW code ${code} (next ${next})`);
    const lead = code < next ? first[code] : first[prev];
    if (next < 4096) {
      prefix[next] = prev; suffix[next] = lead; first[next] = first[prev]; length[next] = length[prev] + 1;
      next++;
      if (next === 1 << size && size < 12) size++;
    }
    write(code);
    prev = code;
  }
  if (o < count) throw new Error(`frame data ends after ${o} of ${count} pixels`);
  return out;
}

/**
 * Read a GIF back.
 * @param {Uint8Array} bytes
 * @param {{ pixels?: boolean }} [o]  pixels: composite every frame to RGBA (`rgba` on each frame)
 * @returns {{ width: number, height: number, palette: Uint8Array, loop: number|null, duration: number,
 *             frames: { x: number, y: number, w: number, h: number, delay: number, transparent: number|null, disposal: number, rgba?: Uint8Array }[] }}
 */
export function readGif(bytes, { pixels = false } = {}) {
  const b = bytes;
  const sig = String.fromCharCode(...b.subarray(0, 6));
  if (sig !== 'GIF89a' && sig !== 'GIF87a') throw new Error('not a GIF');
  let p = 6;
  const u16 = () => { const v = b[p] | (b[p + 1] << 8); p += 2; return v; };
  const width = u16(), height = u16();
  const flags = b[p++]; p += 2;
  let palette = new Uint8Array(0);
  if (flags & 0x80) { const n = 3 * (1 << ((flags & 7) + 1)); palette = b.slice(p, p + n); p += n; }
  const subblocks = () => {
    const parts = [];
    for (let len = b[p++]; len; len = b[p++]) { parts.push(b.subarray(p, p + len)); p += len; }
    const all = new Uint8Array(parts.reduce((n, x) => n + x.length, 0));
    let o = 0;
    for (const x of parts) { all.set(x, o); o += x.length; }
    return all;
  };
  const frames = [];
  let loop = null, gce = null;
  const canvas = pixels ? new Uint8Array(width * height * 4) : null;
  for (;;) {
    if (p >= b.length) throw new Error('no trailer');
    const t = b[p++];
    if (t === 0x3b) break;
    if (t === 0x21) {
      const label = b[p++];
      const data = subblocks();
      if (label === 0xf9) gce = { disposal: (data[0] >> 2) & 7, delay: data[1] | (data[2] << 8), transparent: data[0] & 1 ? data[3] : null };
      // NETSCAPE2.0, then a sub-block of 0x01 and the loop count (0: forever).
      if (label === 0xff && data.length >= 14 && String.fromCharCode(...data.subarray(0, 11)) === 'NETSCAPE2.0') loop = data[12] | (data[13] << 8);
      continue;
    }
    if (t !== 0x2c) throw new Error(`unexpected block 0x${t.toString(16)} at ${p - 1}`);
    const x = u16(), y = u16(), w = u16(), h = u16();
    const f = b[p++];
    let table = palette;
    if (f & 0x80) { const n = 3 * (1 << ((f & 7) + 1)); table = b.slice(p, p + n); p += n; }
    const minCode = b[p++];
    const data = subblocks();
    const frame = { x, y, w, h, delay: gce ? gce.delay : 0, transparent: gce ? gce.transparent : null, disposal: gce ? gce.disposal : 0 };
    if (pixels) {
      const idx = unlzw(data, minCode, w * h);
      for (let yy = 0; yy < h; yy++) {
        for (let xx = 0; xx < w; xx++) {
          const c = idx[yy * w + xx];
          if (c === frame.transparent) continue;
          const o = ((y + yy) * width + x + xx) * 4;
          canvas[o] = table[c * 3]; canvas[o + 1] = table[c * 3 + 1]; canvas[o + 2] = table[c * 3 + 2]; canvas[o + 3] = 255;
        }
      }
      frame.rgba = canvas.slice();
    }
    frames.push(frame);
    gce = null;
  }
  return { width, height, palette, loop, frames, duration: frames.reduce((n, f) => n + f.delay * 10, 0) };
}

