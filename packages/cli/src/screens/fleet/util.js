// Small helpers the fleet, recover and git screens share: times, counts,
// and an action call that tells "not served yet" apart from "broke".
import { api } from '../../data/index.js';

/** "03:18" from a Date, an ISO string or epoch ms. Empty for nothing. */
export function hhmm(t) {
  if (t == null || t === '') return '';
  const d = t instanceof Date ? t : new Date(t);
  if (Number.isNaN(d.getTime())) return String(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "26 min ago", "3h ago", "2 days ago". */
export function ago(t, now = Date.now()) {
  if (t == null || t === '') return '';
  const d = new Date(t).getTime();
  if (Number.isNaN(d)) return String(t);
  const m = Math.max(0, Math.round((now - d) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** "#148" whether the server sends 148 or "#148". */
export const prNum = (n) => (n == null || n === '' ? '' : String(n).startsWith('#') ? String(n) : `#${n}`);

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * POST an action. Resolves { ok: true, data } or { ok: false, missing, error }:
 * `missing` means the server does not serve this action yet (404).
 */
export async function act(path, body = {}) {
  try {
    return { ok: true, data: await api(path, body) };
  } catch (e) {
    return { ok: false, missing: e.status === 404, error: e.message };
  }
}
