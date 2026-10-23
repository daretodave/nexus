// Plan answers are kept as they are given (spec 53, A1): `.nexus/answers.json` at the primary checkout's root
// (untracked, shared by its worktrees), one entry per plan question (a spec's Open question or a [needs-user-call]
// row), keyed by its id (`file:line`) and holding a hash of its words, so a question that moved or was reworded
// never inherits a stale answer.
//
//   { "<file:line>": { "answer": "...", "how": "answered" | "default", "hash": "<8 hex>", "at": 1729600000000,
//                      "sent"?: 1729600001000, "to"?: "<session id>" } }
//
// GET /api/plan-answers reads it, pruned to the questions the plan still lists with the same words; PUT (or POST)
// /api/plan-answers takes { answers: { "<file:line>": { answer, how } | null } }: an answer records (not sent yet),
// null or an empty answer clears. A Continue (POST /api/oversight/answer with a session) marks what it sent; a sent
// answer stays, read "sent", until the plan drops its question. A secret request is never kept here: a value goes
// only to the vault.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { primaryRoot } from './local.mjs';
import { DECIDE_TEXT, IMAGE_ONLY_TEXT, imageRefs } from '../shared/choices.mjs';

export const PLAN_ANSWERS_FILE = '.nexus/answers.json';
export const MAX_ANSWER = 20000;
const HOWS = new Set(['answered', 'default', 'decide']);

/** A question's words as a short hash: whitespace does not count, any other change does. */
export const textHash = (text) => crypto.createHash('sha1').update(String(text || '').replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 8);

/** The store at `root`, or {} when there is none or it does not parse. */
export function readStoreAt(root) {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(root, PLAN_ANSWERS_FILE), 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function writeStoreAt(root, store) {
  const file = path.join(root, PLAN_ANSWERS_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, file);
}

/** The questions by id: [{ id, text }] -> Map(id -> hash). */
const listed = (questions) => new Map((questions || []).map((q) => [q.id, textHash(q.text)]));

/** Pure: the entries whose question the plan still lists with the same words. */
export function pruneAnswers(store, questions) {
  const now = listed(questions);
  return Object.fromEntries(Object.entries(store || {}).filter(([id, e]) => e && now.has(id) && now.get(id) === e.hash));
}

/**
 * Pure: apply a patch ({ id: { answer, how, images? } | null }) against the questions listed now. An answer records (its
 * question's hash taken, its sent mark cleared: a changed answer goes again), null or an empty answer clears, an id
 * the plan does not list (or `skip` refuses) is left out. -> { store, skipped: [id] }
 */
export function applyAnswers(store, patch, questions, { at = Date.now(), skip = () => false, imageOk = () => false } = {}) {
  const now = listed(questions);
  const out = { ...(store || {}) };
  const skipped = [];
  for (const [id, v] of Object.entries(patch || {})) {
    const how = v && HOWS.has(v.how) ? v.how : 'answered';
    const images = v ? imageRefs(v.images, imageOk) : [];
    let answer = v && v.answer != null ? String(v.answer).trim() : '';
    // Images alone, or the choice left to the session, still make an answer.
    if (!answer && v && how === 'decide') answer = DECIDE_TEXT;
    if (!answer && images.length) answer = IMAGE_ONLY_TEXT;
    if (!answer) { delete out[id]; continue; }
    if (!now.has(id) || skip(id)) { skipped.push(id); continue; }
    out[id] = { answer: answer.slice(0, MAX_ANSWER), how, hash: now.get(id), at, ...(images.length ? { images } : {}) };
  }
  return { store: out, skipped };
}

/** Pure: mark these ids sent (to `to`). */
export function markSentIn(store, ids, to, at = Date.now()) {
  const out = { ...(store || {}) };
  for (const id of ids) if (out[id]) out[id] = { ...out[id], sent: at, ...(to ? { to: String(to) } : {}) };
  return out;
}

/** The answers for `repo`, pruned to `questions` (the pruned store is written back when anything went). */
export function readPlanAnswers(repo, questions) {
  const root = primaryRoot(repo);
  const all = readStoreAt(root);
  const kept = pruneAnswers(all, questions);
  if (Object.keys(kept).length !== Object.keys(all).length) writeStoreAt(root, kept);
  return kept;
}

/** Record a patch for `repo`. -> { answers, skipped } */
export function writePlanAnswers(repo, patch, questions, opts = {}) {
  const root = primaryRoot(repo);
  const { store, skipped } = applyAnswers(pruneAnswers(readStoreAt(root), questions), patch, questions, opts);
  writeStoreAt(root, store);
  return { answers: store, skipped };
}

/** Mark what a Continue sent. */
export function markPlanAnswersSent(repo, ids, to, at = Date.now()) {
  const root = primaryRoot(repo);
  const store = readStoreAt(root);
  if (!ids.some((id) => store[id])) return store;
  const next = markSentIn(store, ids, to, at);
  writeStoreAt(root, next);
  return next;
}
