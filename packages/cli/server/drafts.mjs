// Answers saved as they are typed (spec 51, A1): `.nexus/drafts.json` at the primary checkout's root (untracked,
// shared by its worktrees), keyed by question (an ask's `<askId>:<index>`, a plan question's `plan:<id>`, a parked
// one's inbox id, a cockpit start question's `start:<session>:<index>`).
//
//   { "<key>": { "text": "what was typed", "at": 1729600000000 } }
//
// GET /api/drafts reads it; PUT /api/drafts (and POST, for navigator.sendBeacon, which can only POST) takes
// { drafts: { "<key>": "text" | null } }: a text saves, an empty text or null clears (a sent answer clears its draft).
// The store is capped (MAX_KEYS, oldest dropped first; MAX_TEXT per draft) and written through a temp file and a
// rename, so a reader never sees half a file. Nothing here is a secret: a key card's value never comes this way.
import fs from 'node:fs';
import path from 'node:path';
import { primaryRoot } from './local.mjs';

export const DRAFTS_FILE = '.nexus/drafts.json';
export const MAX_KEYS = 500;
export const MAX_TEXT = 20000;
const MAX_KEY = 300;

/** The drafts at `root`, or {} when there are none or they do not parse. */
export function readDraftsAt(root) {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(root, DRAFTS_FILE), 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/**
 * Apply a patch ({ key: text | null }) to a store, pure: a text saves (cut at MAX_TEXT), an empty one or null clears,
 * a bad key is skipped; past MAX_KEYS the oldest go.
 */
export function applyDrafts(store, patch, at = Date.now()) {
  const out = { ...(store || {}) };
  for (const [k, v] of Object.entries(patch || {})) {
    if (!k || k.length > MAX_KEY) continue;
    const text = v == null ? '' : String(v);
    if (!text.trim()) delete out[k];
    else out[k] = { text: text.slice(0, MAX_TEXT), at };
  }
  const keys = Object.keys(out);
  if (keys.length > MAX_KEYS) {
    keys.sort((a, b) => (out[a].at || 0) - (out[b].at || 0));
    for (const k of keys.slice(0, keys.length - MAX_KEYS)) delete out[k];
  }
  return out;
}

/** The drafts for `repo` (its primary checkout's). */
export const readDrafts = (repo) => readDraftsAt(primaryRoot(repo));

/** Save a patch for `repo`; returns the store as written. */
export function writeDrafts(repo, patch, at = Date.now()) {
  const root = primaryRoot(repo);
  const next = applyDrafts(readDraftsAt(root), patch, at);
  const file = path.join(root, DRAFTS_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
  fs.renameSync(tmp, file);
  return next;
}

/** Clear every draft whose key starts with `prefix` (an ask's `<askId>:` once it is answered). */
export function clearDraftsWith(repo, prefix) {
  const store = readDrafts(repo);
  const gone = Object.keys(store).filter((k) => k.startsWith(prefix));
  if (!gone.length) return store;
  return writeDrafts(repo, Object.fromEntries(gone.map((k) => [k, null])));
}
