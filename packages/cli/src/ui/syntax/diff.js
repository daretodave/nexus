// An edit's old and new text as diff lines, for the coloured diff a tool row and a permission card show. Pure. A
// line diff (longest common subsequence over the changed middle, the shared head and tail trimmed first), with a
// cell cap past which the middle counts as wholly replaced, as server/normalize.mjs lineDiff counts it.

const CAP = 250000;

const splitText = (t) => {
  const s = String(t ?? '');
  if (!s) return [];
  const a = s.split(/\r?\n/);
  if (a[a.length - 1] === '') a.pop();
  return a;
};

/**
 * Lines of the change from `a` to `b`: [{ kind: 'ctx' | 'del' | 'add', text, a, b }], `a` and `b` the line's index in
 * each text (null on the side it is not in).
 */
export function diffLines(a, b) {
  const x = splitText(a);
  const y = splitText(b);
  let lo = 0;
  while (lo < x.length && lo < y.length && x[lo] === y[lo]) lo += 1;
  let hx = x.length;
  let hy = y.length;
  while (hx > lo && hy > lo && x[hx - 1] === y[hy - 1]) { hx -= 1; hy -= 1; }
  const out = [];
  for (let i = 0; i < lo; i += 1) out.push({ kind: 'ctx', text: x[i], a: i, b: i });
  const xs = x.slice(lo, hx);
  const ys = y.slice(lo, hy);
  if (xs.length && ys.length && xs.length * ys.length <= CAP) {
    // The LCS table, then a walk from the top that prefers a deletion before an insertion.
    const n = xs.length;
    const m = ys.length;
    const t = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i -= 1) for (let j = m - 1; j >= 0; j -= 1) t[i][j] = xs[i] === ys[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && xs[i] === ys[j]) { out.push({ kind: 'ctx', text: xs[i], a: lo + i, b: lo + j }); i += 1; j += 1; } else if (j >= m || (i < n && t[i + 1][j] >= t[i][j + 1])) { out.push({ kind: 'del', text: xs[i], a: lo + i, b: null }); i += 1; } else { out.push({ kind: 'add', text: ys[j], a: null, b: lo + j }); j += 1; }
    }
  } else {
    xs.forEach((l, k) => out.push({ kind: 'del', text: l, a: lo + k, b: null }));
    ys.forEach((l, k) => out.push({ kind: 'add', text: l, a: null, b: lo + k }));
  }
  for (let k = 0; k < x.length - hx; k += 1) out.push({ kind: 'ctx', text: x[hx + k], a: hx + k, b: hy + k });
  return out;
}

/**
 * The lines worth showing: every change with `context` unchanged lines around it, the runs between folded into a
 * 'skip' line that says how many it hides.
 */
export function trimContext(lines, context = 3) {
  const keep = new Array(lines.length).fill(false);
  lines.forEach((l, i) => {
    if (l.kind === 'ctx') return;
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k += 1) keep[k] = true;
  });
  if (!keep.some(Boolean)) return lines.slice(0, context * 2);
  const out = [];
  let skipped = 0;
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (skipped) out.push({ kind: 'skip', count: skipped });
      skipped = 0;
      out.push(l);
    } else skipped += 1;
  });
  if (skipped) out.push({ kind: 'skip', count: skipped });
  return out;
}
