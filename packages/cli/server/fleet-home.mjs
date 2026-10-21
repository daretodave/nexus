// The fleet home's server side (spec 40, "Fleet home", A2): what a tile shows past the session list, the merged inbox,
// and Resume for a fallen session.
//
//   tiles    each row of GET /api/sessions joined to its ledger: phase (questions, working, end, package), mini
//            progress (the ledger's done of claimed), mode, and for a session this server runs its live asks
//            (state asking) and its orb; a fallen ledger a hosted session is resuming reads `resuming`
//   inbox    GET /api/inbox: every session's questions in one list, tagged by star. The live asks and permission
//            requests of the sessions this server runs, the parked questions of every held ledger (terminal sessions
//            included) and the plan's durable questions. One row per question.
//   resume   POST /api/sessions/:id/resume for a session this server does not run: a fallen (or parked) ledger is
//            picked up by a new hosted session whose first prompt is `/reboot-resume <star>` (skills/reboot-resume.md:
//            it takes the ledger, the claims, the worktree and re-runs the ledger's `loop`)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ledgerStatus, parkedItem } from './sessions.mjs';

const GONE = new Set(['ended', 'resumed']);

/** The phase a ledger's step names, or undefined (the tile then reads the session's state). */
export function phaseOf(step = '') {
  const s = String(step).toLowerCase();
  if (!s) return undefined;
  if (/^(orient|questions?|ask)/.test(s)) return 'questions';
  if (/^(end|review)/.test(s)) return 'end';
  if (/^(package|pr\b)/.test(s)) return 'package';
  return 'working';
}

/** Mini progress: the chunks a heads-down ledger finished of those it claimed. */
export function progressOf(l = {}) {
  const claimed = Array.isArray(l.claimed) ? l.claimed : [];
  if (!claimed.length) return undefined;
  const done = (Array.isArray(l.done) ? l.done : []).filter((d) => claimed.includes(d)).length;
  return { done, total: claimed.length, pct: Math.round((100 * done) / claimed.length), label: `${done} of ${claimed.length} chunks` };
}

/**
 * The tile fields for each session row. `hosted`: [{ id, claude, asks, busy }] of the sessions this server runs;
 * `resumers`: Map ledger id -> { id, name } of the hosted session resuming it.
 */
export function fleetRows(list, { ledgers = [], hosted = [], resumers = new Map(), owner = false } = {}) {
  const byLedger = new Map(ledgers.map((l) => [l.id, l]));
  return list.map((row) => {
    const l = byLedger.get(row.id) || ledgers.find((x) => x.claude && x.claude === row.claude) || {};
    const out = { ...row, mode: l.mode || (owner ? 'owner' : 'contributor') };
    const phase = phaseOf(l.step);
    if (phase) out.phase = phase;
    const progress = progressOf(l);
    if (progress) out.progress = progress;
    const h = hosted.find((x) => x.id === row.id || (x.claude && x.claude === row.claude));
    if (h) {
      out.orb = h.busy ? 'thinking' : 'idle';
      if (h.asks > 0 && row.state !== 'paused') Object.assign(out, { state: 'asking', phase: 'questions', questions: { answered: 0, total: h.asks } });
    }
    const by = resumers.get(row.id);
    if (by && ['fallen', 'paused', 'resuming'].includes(out.state)) {
      Object.assign(out, { state: 'resuming', resume: { by: by.name, chunk: l.chunk || '' }, event: { text: `resuming as ${by.name}` } });
    }
    return out;
  });
}

const hash = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 8);
const label = (o) => (typeof o === 'string' ? o : o?.label || '');

/** A parked row's id: its ledger, its place in the list, and its words (so a list that moved is caught). */
export const parkedId = (ledgerId, index, q) => `parked:${ledgerId}:${index}:${hash(q)}`;

export function parseParkedId(id) {
  const m = /^parked:([^:]+):(\d+):([0-9a-f]{8})$/.exec(String(id));
  return m ? { ledger: m[1], index: Number(m[2]), hash: m[3] } : null;
}

/** Does the parked row's id still name this question? */
export const sameParked = (ref, q) => !!ref && hash(q) === ref.hash;

/**
 * The merged inbox, newest first within each kind. `hosted`: [{ id, name, asks: [view], permissions: [view] }];
 * `ledgers` every ledger at the primary root; `durable` repo.durableQuestions.
 */
export function inboxItems({ hosted = [], ledgers = [], durable = [], now = Date.now() } = {}) {
  const out = [];
  const tagOf = (h) => ({ id: h.id, name: h.name || h.id.slice(0, 8), kind: 'local' });
  const hostedIds = new Set(hosted.flatMap((h) => [h.id, h.claude]).filter(Boolean));
  const chunkOf = (id) => ledgers.find((l) => l.id === id)?.chunk || '';
  for (const h of hosted) {
    const session = tagOf(h);
    for (const a of h.asks || []) {
      (a.questions || []).forEach((q, i) => {
        const opts = (q.options || []).map(label).filter(Boolean);
        const first = (q.options || [])[0];
        out.push({
          id: `${a.id}:${i}`, kind: 'now', src: 'ask', askId: a.id, qText: q.question || q.header || `Question ${i + 1}`,
          session, sessionId: h.id, agent: a.agent || 'main', chunk: chunkOf(h.id),
          question: q.question || q.header || '', options: opts, default: opts[0], why: typeof first === 'object' && first?.description ? first.description : '',
          at: a.at ? new Date(a.at).toISOString() : null,
        });
      });
    }
    for (const p of h.permissions || []) {
      out.push({ id: `perm:${p.id}`, kind: 'now', src: 'perm', session, sessionId: h.id, chunk: chunkOf(h.id), question: `Allow ${p.tool}?`, perm: p, at: p.at ? new Date(p.at).toISOString() : null });
    }
  }
  for (const l of ledgers) {
    if (GONE.has(l.state)) continue;
    const session = { id: l.id, name: l.star || l.id.slice(0, 8), kind: hostedIds.has(l.id) || hostedIds.has(l.claude) ? 'local' : 'terminal' };
    (Array.isArray(l.parked) ? l.parked : []).forEach((raw, index) => {
      const p = parkedItem(raw);
      if (p.state !== 'pending' || !p.q) return;
      out.push({
        id: parkedId(l.id, index, p.q), kind: 'parked', src: 'inbox', session, sessionId: l.id, agent: p.who || p.agent || 'main',
        chunk: p.chunk || l.chunk || '', question: p.q, options: p.alts, default: p.alts[0], why: p.why || '', at: p.at || l.beat || null,
        status: ledgerStatus(l, now),
      });
    });
  }
  for (const d of durable) out.push({ id: `plan:${d.id}`, kind: 'cloud', src: 'durable', question: d.text, durable: d, at: null });
  return out;
}

/** Is the ledger one a resume may take? { ok } or { status, error } (ledger.mjs take's own refusals, said early). */
export function resumable(l, now = Date.now()) {
  if (!l) return { status: 404, error: 'no ledger for that session: nothing to resume' };
  const st = ledgerStatus(l, now);
  if (st === 'ended') return { status: 409, error: `${l.star} ended its loop: nothing to resume` };
  if (st === 'resuming' || st === 'resumed') return { status: 409, error: `${l.star} is already ${st}: another session has it` };
  if (st === 'live') return { status: 409, error: `${l.star} is live (its beat is fresh): it is still running, not fallen` };
  return { ok: true };
}

/** The ledger a resume names: by id, Claude Code session id, or the star of a held ledger. */
export function ledgerFor(ledgers, key) {
  return ledgers.find((l) => l.id === key || (l.claude && l.claude === key))
    || ledgers.find((l) => l.star === key && !GONE.has(l.state)) || null;
}

/** The resumer's first prompt: `/reboot-resume <slug> <star>` for a parked train car, `/reboot-resume <star>` else. */
export function resumePrompt(l) {
  const who = l.star || l.id;
  return l.state === 'parked' && l.train ? `/reboot-resume ${l.train} ${who}` : `/reboot-resume ${who}`;
}

/** Does the repo carry /reboot-resume (a command or a skill)? */
export function hasResumeSkill(root) {
  return fs.existsSync(path.join(root, '.claude', 'commands', 'reboot-resume.md'))
    || fs.existsSync(path.join(root, '.claude', 'skills', 'reboot-resume', 'SKILL.md'));
}
