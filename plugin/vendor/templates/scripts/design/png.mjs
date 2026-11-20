// scripts/design/png.mjs: just enough PNG for the board renderer and the screenshot compare, no dependencies.
//
// decodePng reads what a browser writes (8-bit greyscale, RGB, grey+alpha or RGBA, not interlaced, every row filter)
// back as RGBA; encodePng writes RGBA (filter 0, node:zlib deflate). Both are pure: buffers in, buffers out.
import zlib from 'node:zlib';

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** @returns {{ width: number, height: number, data: Uint8Array }} RGBA, width*height*4 */
export function decodePng(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (b.length < 8 || SIG.some((v, i) => b[i] !== v)) throw new Error('not a PNG');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 8, width = 0, height = 0, depth = 0, type = -1, interlace = 0;
  const idat = [];
  while (p + 8 <= b.length) {
    const len = dv.getUint32(p);
    const kind = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
    const data = b.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') { width = dv.getUint32(p + 8); height = dv.getUint32(p + 12); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    p += 12 + len;
  }
  const bpp = CHANNELS[type];
  if (!bpp || depth !== 8 || interlace) throw new Error(`a PNG this reader does not take (type ${type}, depth ${depth}, interlace ${interlace}): save it as 8-bit RGB or RGBA`);
  const raw = zlib.inflateSync(Buffer.concat(idat.map((x) => Buffer.from(x.buffer, x.byteOffset, x.length))));
  const stride = width * bpp;
  if (raw.length < height * (stride + 1)) throw new Error('a truncated PNG');
  const px = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    const up = row - stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? px[row + i - bpp] : 0;
      const u = y ? px[up + i] : 0;
      const c = y && i >= bpp ? px[up + i - bpp] : 0;
      let pred = 0;
      if (filter === 1) pred = a;
      else if (filter === 2) pred = u;
      else if (filter === 3) pred = (a + u) >> 1;
      else if (filter === 4) {
        const q = a + u - c, pa = Math.abs(q - a), pb = Math.abs(q - u), pc = Math.abs(q - c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? u : c;
      } else if (filter !== 0) throw new Error(`bad PNG row filter ${filter}`);
      px[row + i] = (raw[src + i] + pred) & 0xff;
    }
  }
  if (bpp === 4) return { width, height, data: px };
  const out = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < width * height; i++, j += bpp) {
    const g = px[j];
    if (bpp === 3) { out[i * 4] = g; out[i * 4 + 1] = px[j + 1]; out[i * 4 + 2] = px[j + 2]; out[i * 4 + 3] = 255; }
    else { out[i * 4] = g; out[i * 4 + 1] = g; out[i * 4 + 2] = g; out[i * 4 + 3] = bpp === 2 ? px[j + 1] : 255; }
  }
  return { width, height, data: out };
}

function chunk(kind, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(kind, 4, 'latin1');
  Buffer.from(data.buffer, data.byteOffset, data.length).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** RGBA in (width*height*4 bytes), a PNG file out. */
export function encodePng({ width, height, data }) {
  if (!(width > 0 && height > 0) || data.length !== width * height * 4) throw new Error(`encodePng: ${width}x${height} needs ${width * height * 4} RGBA bytes, got ${data.length}`);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  return Buffer.concat([Buffer.from(SIG), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** Width and height from the IHDR alone, without decoding. */
export function pngSize(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (b.length < 24 || SIG.some((v, i) => b[i] !== v)) throw new Error('not a PNG');
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}
