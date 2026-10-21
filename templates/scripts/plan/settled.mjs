// scripts/plan/settled.mjs: the plan as it reads once plan/pending/ settles. Each pending file's `## Edit` sections
// are applied in memory, in settle's order (date, then name), the files on disk untouched. A /plot writes its new
// spec directly and its roadmap rows as pending edits, which settle applies only on main after the merge, so a check
// reading the files as they stand would fail every plot's pull request by construction. Plan checks read this view
// instead; a close's own work (the chunk out of its spec, ARCHIVE.md) still waits for settle, and readers count the
// close as closed through pendingArchiveLines / pendingCloses (scripts/plan/pending.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.mjs';
import { parsePending, pendingFiles } from './pending.mjs';
import { applyEdits } from './settle.mjs';

/**
 * The settled view of the checkout at `root`: `read(rel)` gives a repo-relative file's text (\r\n read as \n) with
 * every pending edit applied, or null when the file isn't there; `problems` names each pending file that won't settle
 * (one that doesn't parse, an edit whose old text isn't there once or is there twice), as settle would skip it whole.
 * `only(path)` limits the edits applied to the files it accepts (a copy of plan/ alone has no root README.md).
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
  for (const f of pendingFiles(root)) {
    try {
      parsed.push({ ...parsePending(f.text, f.file, cfg), file: f.file });
    } catch (e) {
      problems.push(e.message);
    }
  }
  parsed.sort((a, b) => a.date.localeCompare(b.date) || a.file.localeCompare(b.file));
  for (const p of parsed) {
    // One file's edits land together or not at all, as settle's transaction does.
    const tx = new Map();
    try {
      applyEdits(
        p.edits.filter((e) => only(e.path)),
        (q) => (tx.has(q) ? tx.get(q) : read(q)),
        (q, t) => tx.set(q, t),
      );
      for (const [q, t] of tx) changed.set(q, t);
    } catch (e) {
      problems.push(`${p.file}: ${e.message}`);
    }
  }
  return { read, problems, pending: parsed.length, changed: [...changed.keys()] };
}
