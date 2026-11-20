// scripts/secrets-audit.mjs: the secrets audit record's set and rotation events, and the rotation nudge.
//
// The record is scripts/secrets-sinks.mjs's: `.nexus/secrets-audit.jsonl` at the primary checkout (untracked), one
// JSON line per event, appended under a lock by recordAudit, never a value:
//   { "time": "<ISO>", "action": "push", "name": "GH_TOKEN", "destination": "github-actions" }      (a sink)
//   { "time": "<ISO>", "action": "set", "name": "VERCEL_TOKEN", "destination": "local", "ring": "local" }
//   { "time": "<ISO>", "action": "rotate", "name": "VERCEL_TOKEN", "destination": "local", "ring": "keychain" }
//   { "time": "<ISO>", "action": "remove", "name": "VERCEL_TOKEN", "destination": "local", "ring": "local" }
// `set` is a first value (secrets.mjs set or import --store), `rotate` a value replaced, `remove` a value taken out
// of one ring (secrets.mjs unset). A secret whose last set or
// rotation is older than ROTATE_DAYS gets a rotation nudge: `node scripts/secrets.mjs audit` and `status` print it,
// the digest carries it. The command line: scripts/secrets.mjs; the how: nexus/customization/secrets.md.
import { AUDIT, readAudit, recordAudit } from './secrets-sinks.mjs';
import { NAME } from './plan/secrets-manifest.mjs';

export { AUDIT, readAudit };
export const ROTATE_DAYS = 90;
const RING = /^(local|keychain|workspace)$/;
const DAY = 86_400_000;
const SETS = new Set(['set', 'rotate']);

/** Record names stored in the vault: `rotate` for a name in `had` (it held a value), else `set`. Every name and the
 * ring are checked before the first line is written. Returns the events written (without their time). */
export function recordSets(root, { names, ring, had = new Set() }, opts = {}) {
  if (!Array.isArray(names) || names.some((n) => typeof n !== 'string' || !NAME.test(n))) throw new Error('audit: names are env-var names');
  if (!RING.test(String(ring))) throw new Error('audit: ring is one of local, keychain, workspace');
  const events = names.map((name) => ({ action: had.has(name) ? 'rotate' : 'set', name, destination: 'local', ring }));
  for (const e of events) recordAudit(root, e, opts);
  return events;
}

/** Record values taken out of the vault: one `remove` per name and ring it left ([{ name, rings }], unset's answer).
 * Returns the events written (without their time). */
export function recordRemoves(root, removed, opts = {}) {
  if (!Array.isArray(removed) || removed.some((r) => !r || typeof r.name !== 'string' || !NAME.test(r.name) || !Array.isArray(r.rings) || r.rings.some((g) => !RING.test(String(g))))) throw new Error('audit: each removal is { name, rings }');
  const events = removed.flatMap((r) => r.rings.map((ring) => ({ action: 'remove', name: r.name, destination: 'local', ring })));
  for (const e of events) recordAudit(root, e, opts);
  return events;
}

/** Each name's last set or rotation: Map name -> ISO time. */
export function lastSet(events) {
  const out = new Map();
  for (const e of events) {
    if (!SETS.has(e.action) || typeof e.name !== 'string' || typeof e.time !== 'string') continue;
    if (!out.has(e.name) || out.get(e.name) < e.time) out.set(e.name, e.time);
  }
  return out;
}

/** Whole days since an ISO time, or null. */
export function ageDays(at, now = new Date()) {
  const t = Date.parse(at);
  return Number.isNaN(t) ? null : Math.floor((now.getTime() - t) / DAY);
}

/** The rotation nudges: [{ name, days, at }] for each name last set over `days` ago that `held(name)` says the vault
 * still holds (by default, every name), oldest first. */
export function rotationNudges(events, { now = new Date(), days = ROTATE_DAYS, held = () => true } = {}) {
  return [...lastSet(events)]
    .map(([name, at]) => ({ name, at, days: ageDays(at, now) }))
    .filter((x) => x.days !== null && x.days > days && held(x.name))
    .sort((a, b) => b.days - a.days);
}

/** The nudge's one line. */
export const nudgeLine = (x) => `rotate ${x.name}: last set ${x.days} days ago (${x.at.slice(0, 10)}); set a fresh value with node scripts/secrets.mjs set ${x.name}`;
