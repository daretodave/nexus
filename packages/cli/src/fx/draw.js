// Drawing the pool onto a 2D context, and the colour arithmetic it needs.
// Colours arrive as resolved CSS colours (the runtime reads the theme's
// tokens off the page); this file turns them into rgb triples and draws.
// Night adds light ('lighter': particles glow on the dark sky); dawn paints
// ('source-over', thinner): additive light on a pale sky only washes out.
import { envelope } from './pool.js';

/** A resolved CSS colour (#rgb, #rrggbb, rgb(), rgba(), the space syntax) as [r, g, b, a]; null when unreadable. */
export function parseColor(str) {
  const s = String(str || '').trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    const h = m[1];
    if (h.length === 3 || h.length === 4) return [...h.slice(0, 3)].map((c) => parseInt(c + c, 16)).concat(h.length === 4 ? parseInt(h[3] + h[3], 16) / 255 : 1);
    if (h.length === 6 || h.length === 8) return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1);
    return null;
  }
  m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (!m) return null;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const ch = (v) => (v.endsWith('%') ? (parseFloat(v) / 100) * 255 : parseFloat(v));
  const rgb = parts.slice(0, 3).map(ch);
  const a = parts[3] == null ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
  if (rgb.some((v) => !Number.isFinite(v)) || !Number.isFinite(a)) return null;
  return [...rgb.map((v) => Math.round(Math.max(0, Math.min(255, v)))), Math.max(0, Math.min(1, a))];
}

/** How a theme draws: the blend, an alpha scale, and how far the glow reaches past the core. */
export function themeLook(theme) {
  return theme === 'light'
    ? { blend: 'source-over', alpha: 0.62, halo: 0.55, light: true }
    : { blend: 'lighter', alpha: 1, halo: 1, light: false };
}

export const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

const TAU = Math.PI * 2;

/**
 * Draw every live particle. o: { color(token) -> [r,g,b,a], sprite(token) ->
 * a pre-drawn glow image or null, look (themeLook), alpha (the level's),
 * font (the mono stack, for glyphs) }. Returns how many were drawn.
 */
export function drawPool(ctx, pool, o) {
  const look = o.look || themeLook('dark');
  const base = (o.alpha ?? 1) * look.alpha;
  ctx.globalCompositeOperation = look.blend;
  let drawn = 0;
  let font = '';
  for (let i = 0; i < pool.n; i += 1) {
    const p = pool.items[i];
    const env = envelope(p);
    if (env <= 0.003) continue;
    const c = o.color(p.color);
    if (!c) continue;
    const a = base * p.alpha * env * (c[3] ?? 1);
    if (a <= 0.003) continue;
    drawn += 1;
    switch (p.kind) {
      case 'spark':
      case 'seek': {
        // A streak along the way it is going: from velocity, or a seeker's last step.
        const dx = p.kind === 'seek' ? (p.x - p.tx) * 3 : p.vx * 0.045;
        const dy = p.kind === 'seek' ? (p.y - p.ty) * 3 : p.vy * 0.045;
        ctx.globalAlpha = 1;
        ctx.strokeStyle = rgba(c, a);
        ctx.lineWidth = p.size;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x - dx, p.y - dy);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        if (p.kind === 'seek') glow(ctx, o, p, a * 0.9, p.size * 2.2 * look.halo + p.size);
        break;
      }
      case 'ring': {
        const t = p.age / p.life;
        const r = p.r0 + (p.r1 - p.r0) * (1 - (1 - t) * (1 - t));
        ctx.globalAlpha = 1;
        ctx.strokeStyle = rgba(c, a * (1 - t * 0.6));
        ctx.lineWidth = Math.max(0.5, p.size * (1 - t * 0.7));
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, r), 0, TAU);
        ctx.stroke();
        break;
      }
      case 'pixel': {
        // Snapped to whole pixels: a terminal's cell, not a glow.
        const s = Math.max(1, Math.round(p.size));
        ctx.globalAlpha = 1;
        ctx.fillStyle = rgba(c, a);
        ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
        break;
      }
      case 'glyph': {
        const f = `${Math.round(p.size)}px ${o.font || 'monospace'}`;
        if (f !== font) { ctx.font = f; font = f; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; }
        ctx.globalAlpha = 1;
        ctx.fillStyle = rgba(c, a);
        ctx.fillText(p.glyph || '·', p.x, p.y);
        break;
      }
      default:
        glow(ctx, o, p, a, p.size * (1 + 2.4 * look.halo));
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return drawn;
}

function glow(ctx, o, p, a, r) {
  const img = o.sprite ? o.sprite(p.color) : null;
  if (img) {
    ctx.globalAlpha = Math.min(1, a);
    ctx.drawImage(img, p.x - r, p.y - r, r * 2, r * 2);
    return;
  }
  const c = o.color(p.color);
  ctx.globalAlpha = 1;
  ctx.fillStyle = rgba(c, a);
  ctx.beginPath();
  ctx.arc(p.x, p.y, Math.max(0.5, p.size), 0, TAU);
  ctx.fill();
}
