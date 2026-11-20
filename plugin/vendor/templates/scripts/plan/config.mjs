// scripts/plan/config.mjs: what settle (and the pending-file reader) may differ on between repos.
//
// Every key is optional. A repo that wants something other than the defaults writes `plan/settle.json` holding only
// the keys it changes; `loadConfig(root)` lays it over DEFAULTS (one level deep for `lanes`, `limits` and `ladder`).
// The defaults fit a repo on the nexus v2 plan shape (concepts/plan-shape.md) with no build queue file and no
// identity/ layer yet; a repo that adopted the footgun ladder and identity/ before the kit did keeps its own paths
// and numbers here, so it can run these scripts on its plan unchanged.
//
//   queue       a build-queue file whose `- [ ] Phase ` rows settle tidies too, or null for none (the v2 default)
//   notes       where a pending file's `## Notes` go (first under `## Inbox`, else at the end)
//   footguns    the footgun list (one line per trap; `## Open`, `## Watch`, `## Guarded`)
//   decisions   the folder of yearly decision files (`<year>.md`, entries `- **D<n>** · …`)
//   editable    what a `## Edit` may touch: folder prefixes (ending in `/`) or exact files; never plan/pending/
//   branch      the branch settle runs on (the owner's main); a detached HEAD (a worktree of origin/main) is fine
//   lanes       how the roadmap's Asap and Held lane headings start
//   limits      the footgun list's budget and the decision line cap
//   ladder      where an open footgun seen twice gets its `automate <slug>` chunk: the spec number and file settle
//               opens (and removes when its last chunk closes), its heading and why text, and the rows it adds to the
//               roadmap table (`plan`), the build queue (`queue`, after the last phase row of the list headed by
//               `queueAfter`) and the root README (`root`, after the table under the line starting `rootAfter`).
//               `{file}` and `{spec}` in any of them read as the ladder's own.
import fs from 'node:fs';
import path from 'node:path';

export const CONFIG_FILE = 'plan/settle.json';

export const DEFAULTS = Object.freeze({
  queue: null,
  notes: 'plan/notes.md',
  footguns: 'identity/footguns.md',
  decisions: 'identity/decisions',
  editable: ['plan/', 'identity/', 'README.md'],
  branch: 'main',
  lanes: { asap: '**Asap', held: '**Held' },
  limits: { openFootguns: 30, watchFootguns: 60, watchDays: 120, footgunBytes: 500, decisionLines: 3 },
  ladder: {
    spec: '99',
    file: '99-guard-the-traps.md',
    heading: '# {spec} · Guard the traps: automate every footgun seen twice',
    why: [
      '**Why:** a trap seen twice gets automated, never logged again. Settle opens this spec when an open footgun',
      'reaches 2×, adds one chunk per footgun with its entry in the Asap lane, and removes the spec and its rows when',
      'its last chunk closes. Write nothing else here.',
    ],
    rows: {
      plan: '| {spec} | Guard the traps: an open footgun seen twice becomes a test, a hook or a lint | [{file}]({file}) | planned (**Asap**: each chunk) | 0 left |',
      queue: null,
      root: null,
    },
    rootAfter: null,
    queueAfter: null,
  },
});

/** DEFAULTS with `over` laid on top: a plain key replaces, `lanes`, `limits`, `ladder` and `ladder.rows` merge. */
export function makeConfig(over = {}) {
  const ladder = { ...DEFAULTS.ladder, ...(over.ladder ?? {}) };
  ladder.rows = { ...DEFAULTS.ladder.rows, ...(over.ladder?.rows ?? {}) };
  return {
    ...DEFAULTS,
    ...over,
    lanes: { ...DEFAULTS.lanes, ...(over.lanes ?? {}) },
    limits: { ...DEFAULTS.limits, ...(over.limits ?? {}) },
    ladder,
  };
}

/** The repo's config: plan/settle.json over the defaults. A file that isn't JSON throws, naming it. */
export function loadConfig(root) {
  const file = path.join(root, CONFIG_FILE);
  if (!fs.existsSync(file)) return makeConfig();
  let over;
  try {
    over = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`${CONFIG_FILE}: not JSON (${e instanceof Error ? e.message.split('\n')[0] : e})`);
  }
  if (!over || typeof over !== 'object' || Array.isArray(over)) throw new Error(`${CONFIG_FILE}: not an object`);
  return makeConfig(over);
}

/** A ladder string with `{file}` and `{spec}` read as the ladder's own. */
export function fill(text, ladder) {
  return text === null || text === undefined ? text : String(text).replaceAll('{file}', ladder.file).replaceAll('{spec}', ladder.spec);
}

/** Whether a `## Edit` may touch `file` under `editable`: a folder prefix or an exact file, never plan/pending/. */
export function mayEdit(file, list = DEFAULTS.editable) {
  if (file.startsWith('plan/pending/') || file.includes('..')) return false;
  return list.some((e) => (e.endsWith('/') ? file.startsWith(e) : file === e));
}
