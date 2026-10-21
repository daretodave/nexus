// The stage's oversight marks (spec 41, A2): each tug's path from the inbox to the session that took it, with its
// state, and each open question's age and session. Pure: callers pass `now`; the server derives the states
// (server/tugs.mjs, on GET /api/sessions/:id as `tugs`).
//
//   sent     the tug's pulse (.fil.is-tug with its flow), still on its way
//   seen     handed over: the dashed tug line (.is-seen), no pulse
//   applied  the session moved on it: a quiet line in the done colour (.is-applied), gone after FRESH_MS

export const TUG_STATES = ['sent', 'seen', 'applied'];
export const FRESH_MS = 10 * 60000;
export const MAX_MARKS = 3;

/** Each state's orb and word, so the mark never reads by colour alone. */
export const TUG_LOOK = {
  sent: { orb: 'blocked', word: 'sent' },
  seen: { orb: 'thinking', word: 'seen' },
  applied: { orb: 'done', word: 'applied' },
};

/** An unknown state reads as sent: the line is on the board, nothing more is known. */
export const tugStateOf = (t) => (TUG_STATES.includes(t?.state) ? t.state : 'sent');

/** A compact age: "now", "4m", "1h 12m", "3h", "2d". Empty for a missing or unreadable time. */
export function age(at, now) {
  const t = typeof at === 'number' ? at : Date.parse(at ?? '');
  if (!Number.isFinite(t) || !Number.isFinite(now)) return '';
  const m = Math.floor(Math.max(0, now - t) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return h < 3 && m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const clip = (s, n = 48) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const sess = (s, fallback) => (s?.name ? { name: s.name, kind: s.kind || 'local' } : fallback || null);

/**
 * The tugs the stage draws: the open ones (sent, seen) and those applied within FRESH_MS, newest first, at most
 * MAX_MARKS. Each: { key, state, orb, word, age, sub, text, session, takenBy, kind }. `sub` says how far it got
 * ("seen 2m after").
 */
export function tugMarks(tugs, { now, session = null, max = MAX_MARKS } = {}) {
  const rows = (Array.isArray(tugs) ? tugs : []).filter((t) => t && (tugStateOf(t) !== 'applied' || (Number.isFinite(Date.parse(t.appliedAt ?? '')) && now - Date.parse(t.appliedAt) < FRESH_MS)));
  return rows.slice(0, max).map((t, i) => {
    const state = tugStateOf(t);
    const look = TUG_LOOK[state];
    const to = sess(t.session, session);
    const took = sess(t.takenBy);
    const step = state === 'applied' ? t.appliedAt : state === 'seen' ? t.seenAt : null;
    return {
      key: t.id || `tug-${i}`,
      state,
      orb: look.orb,
      word: look.word,
      kind: t.kind === 'answer' ? 'answer' : 'tug',
      age: age(t.at, now),
      sub: step ? `${look.word} ${age(step, now) === 'now' ? 'just now' : `${age(step, now)} ago`}` : '',
      text: clip(t.text),
      session: to,
      // Drawn only when someone else took it (the session that resumed a parked one).
      takenBy: took && (!to || took.name !== to.name) ? took : null,
    };
  });
}

/**
 * The open questions the stage marks with their age and session: live asks first (an agent waits on them), then the
 * parked ones (defaults taken). Each: { key, orb, word, age, text, session }.
 */
export function questionMarks({ asks = [], parked = [], session = null, now, max = MAX_MARKS } = {}) {
  const live = asks.map((a, i) => ({ key: `ask-${a.id || i}`, orb: 'blocked', word: 'asking', age: age(a.at, now), text: clip(a.questions?.[0]?.question || a.questions?.[0]?.header || 'a question'), session: sess(a.session, session) }));
  const held = parked
    .filter((p) => (p.state || 'pending') === 'pending')
    .map((p, i) => ({ key: `parked-${i}`, orb: 'blocked', word: 'parked', age: age(p.at, now), text: clip(p.q), session: sess(p.session, session) }))
    .reverse();
  return [...live, ...held].slice(0, max);
}

const INBOX_STEP = 14; // px between the paths' inbox ends, so each tug reads as its own line

/**
 * One filament per tug mark, from the inbox (the stage's left edge, beside the dock's tray) to the session orb at
 * (50%, 30%); the same box as the question line, drawn the other way so the pulse travels toward the session.
 */
export function tugFils(marks) {
  return marks.map((m, i) => ({
    key: `tug-${m.key}`,
    l: '0',
    t: '30%',
    w: '50%',
    h: `calc(100% - var(--tray-y) - 30% + ${(i + 1) * INBOX_STEP}px)`,
    d: 'M0 100C45 100 55 0 100 0',
    tug: m.state !== 'applied',
    flow: m.state === 'sent',
    quiet: m.state === 'applied',
    cls: `is-${m.state}`,
  }));
}
