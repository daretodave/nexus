// scripts/plan/settled.mjs: the plan as it reads once plan/pending/ settles. Each pending file's `## Edit` and `## Add`
// sections are applied in memory, in settle's order (settleOrder: date, then what adds before the closes, then name),
// the files on disk untouched. A /plot writes its new spec directly and its roadmap rows (and any spec it extends) as
// pending changes, which settle applies only on main after the merge, so a check reading the files as they stand
// would fail every plot's pull request by construction. Plan checks read this view instead; a close's own work (the chunk out of its spec, ARCHIVE.md) still
// waits for settle, and readers count the close as closed through pendingArchiveLines / pendingCloses
// (scripts/plan/pending.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.mjs';
import { parsePending, pendingFiles } from './pending.mjs';
import { applyPlanChanges, settleOrder } from './settle.mjs';

/**
 * The settled view of the checkout at `root`: `read(rel)` gives a repo-relative file's text (\r\n read as \n) with
 * every pending edit and add applied, or null when the file isn't there; `problems` names each pending file that won't
 * settle (one that doesn't parse, an edit whose old text isn't there once or is there twice, an add to a spec with no
 * Measure line), as settle would skip it whole. `numbers` is what each `## Add` placeholder becomes (`07.?strip` →
 * `07.10`). `only(path)` limits the changes applied to the files it accepts (a copy of plan/ alone has no root
 * README.md).
 */
export function settledView(root, { only = () => true, cfg = loadConfig(root) } = {}) {
  const changed = new Map();
  const read = (rel) => {
    if (changed.has(rel)) return changed.get(rel);
    const file = path.join(root, rel);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null;
  };
  const problems = [];
  const parsed = [];
  const numbers = new Map();
  for (const f of pendingFiles(root)) {
    try {
      parsed.push({ ...parsePending(f.text, f.file, cfg), file: f.file });
    } catch (e) {
      problems.push(e.message);
    }
  }
  for (const p of settleOrder(parsed)) {
    // One file's changes land together or not at all, as settle's transaction does.
    const tx = new Map();
    try {
      const given = applyPlanChanges(
        p,
        (q) => (tx.has(q) ? tx.get(q) : read(q)),
        (q, t) => tx.set(q, t),
        only,
      );
      for (const [q, t] of tx) changed.set(q, t);
      for (const [k, v] of given) numbers.set(k, v);
    } catch (e) {
      problems.push(`${p.file}: ${e.message}`);
    }
  }
  return { read, problems, pending: parsed.length, changed: [...changed.keys()], numbers };
}
