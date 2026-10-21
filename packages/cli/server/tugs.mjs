// Oversight tugs and their state (spec 41, "Tug polish"): every answer or tug the owner aimed at one session, with
// where it went and how far it got.
//
//   sent     posted: an owner line `@<session> text` on the notice board (a terminal session), or text pushed on the
//            SDK input stream (the GUI's own session)
//   seen     handed over: the steer hook (or `announce.mjs read`) left the line's marker,
//            `.nexus/steered/<claude session id>/<n>.<hash>`; the folder names the session that took it, and the
//            marker's mtime is when. On the SDK stream: the first message of the turn that carries the text (the turn
//            after the one running when it was sent).
//   applied  the session moved on it: its first assistant entry in its Claude Code transcript after the hand-over
//            (the model's reply to the interrupt), or its ledger's next beat after it, whichever comes first. On the
//            SDK stream: that turn's result.
//
// Read-only over the board, the markers, the ledgers and the transcripts; it never claims or writes anything. The
// board's line shape and the marker key are announce.mjs's contract (`parse`, `lineKey`), repeated here the way the
// steer hook repeats them, so an older board module in the repo never breaks the drawing.
import fs from 'node:fs';
import path from 'node:path';
import { claudeHome, claudeSessions, primaryRoot, readLedgers, worktreeDirs } from './sessions.mjs';

export const BOARD = '.announcements.md';
export const STEERED = '.nexus/steered';
export const STATES = ['sent', 'seen', 'applied'];
const LINE = /^- \*\*(\d+)\*\* · (\S+) · ([^·]+?) · (.*)$/;
const TO = /^@([A-Za-z0-9][\w.-]*)\s+/;
const KEY = /^\d+\.[0-9a-f]{8}$/;
const KEEP = 20;

/** The board's lines: { n, at, from, text }, as announce.mjs `parse` reads them. */
export function parseBoard(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => LINE.exec(l))
    .filter(Boolean)
    .map((m) => ({ n: Number(m[1]), at: m[2], from: m[3].trim(), text: m[4] }));
}

/** A line's hand-over key, announce.mjs `lineKey`: `<n>.<FNV-1a of "<at> <text>">`. */
export function lineKey(a) {
  let h = 0x811c9dc5;
  const s = `${a.at} ${a.text}`;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return `${a.n}.${h.toString(16).padStart(8, '0')}`;
}

/** Every hand-over marker under `.nexus/steered/`: Map<key, { dir, at }> (the session folder and the mtime in ms). */
export function handovers(root) {
  const out = new Map();
  const base = path.join(root, STEERED);
  let dirs = [];
  try {
    dirs = fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return out;
  }
  for (const dir of dirs) {
    let files = [];
    try {
      files = fs.readdirSync(path.join(base, dir)).filter((f) => KEY.test(f));
    } catch {
      continue;
    }
    for (const f of files) {
      let at;
      try { at = fs.statSync(path.join(base, dir, f)).mtimeMs; } catch { continue; }
      const had = out.get(f);
      // A line is handed over once; should two folders hold it, the first hand-over is the one that counted.
      if (!had || at < had.at) out.set(f, { dir, at });
    }
  }
  return out;
}

/** The time (ms) of the transcript's first assistant entry after `after`, from its tail, or null. */
export function replyAfter(file, after, bytes = 262144) {
  if (!file || after == null) return null;
  let text = '';
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      const len = Math.min(size, bytes);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      text = buf.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
  let best = null;
  for (const line of text.split('\n')) {
    if (!line.includes('"assistant"')) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; } // the tail's cut first line
    if (e?.type !== 'assistant' || e.isSidechain) continue;
    const t = Date.parse(e.timestamp ?? '');
    if (Number.isFinite(t) && t > after && (best === null || t < best)) best = t;
  }
  return best;
}

/** sent | seen | applied, from the hand-over time and the session's next moves (all ms or null). */
export function tugState({ seenAt = null, beatAt = null, replyAt = null } = {}) {
  if (seenAt == null) return { state: 'sent', appliedAt: null };
  const after = [beatAt, replyAt].filter((t) => t != null && Number.isFinite(t) && t > seenAt);
  return after.length ? { state: 'applied', appliedAt: Math.min(...after) } : { state: 'seen', appliedAt: null };
}

const iso = (t) => (t == null || !Number.isFinite(t) ? null : new Date(t).toISOString());
/** A board time (`2026-10-21T12:00Z`) as ISO, or null. */
const boardTime = (at) => iso(Date.parse(at));
const who = (s) => (s ? { id: s.id, name: s.name, kind: s.kind } : null);
const kindOf = (text) => (/^Parked question (answered|settled)\b/.test(text) || /^Answers? to\b/i.test(text) ? 'answer' : 'tug');

/**
 * Every owner line on the board addressed to one session, newest first, with its state:
 * { id, via: 'board', kind: 'tug'|'answer', n, at, text, to, session, takenBy, state, seenAt, appliedAt }.
 * `sessions` is the merged list (sessions.mjs mergeSessions); `ledgers` the raw ledgers; `transcripts` a
 * Map<claude session id, transcript file>; `handed` the markers (`handovers`).
 */
export function deriveTugs({ lines, handed = new Map(), sessions = [], ledgers = [], transcripts = new Map() }) {
  const named = (to) => sessions.find((s) => s.id === to || s.claude === to) || sessions.find((s) => s.held && s.name === to) || null;
  const out = [];
  for (const a of lines) {
    const m = TO.exec(a.text);
    if (a.from !== 'owner' || !m) continue;
    const to = m[1];
    const target = named(to);
    const h = handed.get(lineKey(a)) || null;
    const taker = h ? sessions.find((s) => s.claude === h.dir || s.id === h.dir) || target : null;
    const ledger = h ? ledgers.find((l) => l.id === h.dir || l.claude === h.dir || (taker && l.id === taker.id)) : null;
    const beatAt = ledger ? Date.parse(ledger.beat ?? '') : null;
    const replyAt = h ? replyAfter(transcripts.get(h.dir) || (taker && transcripts.get(taker.claude)), h.at) : null;
    const { state, appliedAt } = tugState({ seenAt: h?.at ?? null, beatAt: Number.isFinite(beatAt) ? beatAt : null, replyAt });
    const text = a.text.slice(m[0].length);
    out.push({
      id: `board:${lineKey(a)}`, via: 'board', kind: kindOf(text), n: a.n, at: boardTime(a.at), text, to,
      session: who(target), takenBy: who(taker), state, seenAt: iso(h?.at ?? null), appliedAt: iso(appliedAt),
    });
  }
  return out.sort((x, y) => y.n - x.n);
}

/** Does tug `t` belong to session `s` (aimed at it, or taken by it)? */
export function tugOf(t, s) {
  if (!s) return false;
  const names = new Set([s.id, s.claude, s.held ? s.name : null].filter(Boolean));
  return (t.session && t.session.id === s.id) || (t.takenBy && t.takenBy.id === s.id) || names.has(t.to);
}

/** The board's tugs for this repo: reads the board, the markers, the ledgers and the live transcripts. */
export async function boardTugs({ repo, sessions, home = claudeHome(), now = Date.now() }) {
  const root = await primaryRoot(repo);
  let text = '';
  try { text = fs.readFileSync(path.join(root, BOARD), 'utf8'); } catch { return []; }
  const lines = parseBoard(text);
  if (!lines.some((a) => a.from === 'owner' && TO.test(a.text))) return [];
  const live = claudeSessions(await worktreeDirs(repo), { home, now });
  return deriveTugs({
    lines,
    handed: handovers(root),
    sessions,
    ledgers: readLedgers(root),
    transcripts: new Map(live.map((c) => [c.id, c.file])),
  });
}

/**
 * Tugs on the GUI's own session's SDK input stream, kept in memory (the stream leaves no marker). `sent` when pushed;
 * `seen` at the first message of the turn that carries it (the next turn, when one was running); `applied` at that
 * turn's result.
 */
export function createTugLog({ now = () => Date.now(), keep = KEEP } = {}) {
  const log = [];
  let n = 0;
  return {
    sent(text, { session = null, busy = false } = {}) {
      const words = String(text || '').trim();
      if (!words) return null;
      const e = { id: `sdk:${++n}`, via: 'sdk', kind: kindOf(words), n, at: iso(now()), text: words.replace(/\s+/g, ' '), to: session, session: session ? { id: session } : null, takenBy: null, state: 'sent', seenAt: null, appliedAt: null, wait: !!busy };
      log.push(e);
      while (log.length > keep) log.shift();
      return e;
    },
    onMessage(msg) {
      if (!msg || typeof msg !== 'object') return;
      for (const e of log) {
        if (msg.session_id && !e.to) { e.to = msg.session_id; e.session = { id: msg.session_id }; }
        if (e.state === 'seen') {
          if (msg.type === 'result') { e.state = 'applied'; e.appliedAt = iso(now()); }
        } else if (e.state === 'sent') {
          if (e.wait) { if (msg.type === 'result') e.wait = false; } // the turn running when it was sent has ended
          else { e.state = 'seen'; e.seenAt = iso(now()); e.takenBy = e.session; }
        }
      }
    },
    /** The log, newest first, for session id `id` (every entry when none is given). */
    list(id) {
      return log.filter((e) => !id || e.to === id).map(({ wait, ...e }) => ({ ...e })).reverse();
    },
  };
}
