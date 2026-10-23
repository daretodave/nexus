// A JSON value as foldable rows: what a tool call's input and a permission's raw input draw as. Pure. Each object
// and array opens on its own row with a fold toggle; folded, it shows on one row with how many entries it hides.
// Brackets take their depth's colour straight from the nesting, keys and values their kinds (tokens.js).
import { BRACKET_DEPTHS } from './tokens.js';

const br = (v, depth) => ({ t: 'br', v, d: (depth % BRACKET_DEPTHS) + 1 });
const isBox = (v) => v !== null && typeof v === 'object';
const entries = (v) => (Array.isArray(v) ? v.map((x, i) => [i, x]) : Object.entries(v));

function scalar(v) {
  if (typeof v === 'string') return { t: 'str', v: JSON.stringify(v) };
  if (typeof v === 'number') return { t: 'num', v: Number.isFinite(v) ? String(v) : 'null' };
  if (typeof v === 'boolean' || v === null) return { t: 'lit', v: String(v) };
  return { t: 'lit', v: 'null' };
}

/** Parse a JSON text, or null when it does not parse (a clipped summary). */
export function parseJson(text) {
  if (isBox(text)) return { value: text };
  try { return { value: JSON.parse(String(text ?? '')) }; } catch { return null; }
}

/** Paths folded at first: anything nested past `depth` levels, and any box with more than `many` entries below the root. */
export function defaultFolds(value, { depth = 2, many = 24 } = {}) {
  const out = new Set();
  const walk = (v, path, d) => {
    if (!isBox(v)) return;
    const kids = entries(v);
    if (d > 0 && (d >= depth || kids.length > many) && kids.length) { out.add(path); return; }
    for (const [k, x] of kids) walk(x, `${path}/${k}`, d + 1);
  };
  walk(value, '', 0);
  return out;
}

/**
 * Rows for a value: [{ tokens, depth, fold: { path, open, count } | null }]. `folded` is a Set of paths ('' the root,
 * '/key/0' below it).
 */
export function jsonRows(value, folded = new Set(), { indent = 2 } = {}) {
  const rows = [];
  const pad = (d) => (d ? [{ t: 'ws', v: ' '.repeat(d * indent) }] : []);
  const emit = (v, path, d, key, comma) => {
    const head = [...pad(d)];
    if (key != null) head.push({ t: 'prop', v: JSON.stringify(String(key)) }, { t: 'punct', v: ':' }, { t: 'ws', v: ' ' });
    const tail = comma ? [{ t: 'punct', v: ',' }] : [];
    if (!isBox(v)) { rows.push({ tokens: [...head, scalar(v), ...tail], depth: d, fold: null }); return; }
    const arr = Array.isArray(v);
    const [o, c] = arr ? ['[', ']'] : ['{', '}'];
    const kids = entries(v);
    if (!kids.length) { rows.push({ tokens: [...head, br(o, d), br(c, d), ...tail], depth: d, fold: null }); return; }
    if (folded.has(path)) {
      const note = `${kids.length} ${arr ? (kids.length === 1 ? 'item' : 'items') : (kids.length === 1 ? 'key' : 'keys')}`;
      rows.push({ tokens: [...head, br(o, d), { t: 'comment', v: ` … ${note} ` }, br(c, d), ...tail], depth: d, fold: { path, open: false, count: kids.length } });
      return;
    }
    rows.push({ tokens: [...head, br(o, d)], depth: d, fold: { path, open: true, count: kids.length } });
    kids.forEach(([k, x], i) => emit(x, `${path}/${k}`, d + 1, arr ? null : k, i < kids.length - 1));
    rows.push({ tokens: [...pad(d), br(c, d), ...tail], depth: d, fold: null });
  };
  emit(value, '', 0, null, false);
  return rows;
}

/** The value as pretty JSON text (what the copy button copies). */
export const prettyJson = (value) => JSON.stringify(value, null, 2);
