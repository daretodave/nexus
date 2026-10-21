// Session identity, verbatim from the handoff (decisions 16 and 17), as
// plain data and pure rules so they are tested: the star names in the
// order a new session takes them, their night and dawn colours (the
// --sess-<name> tokens in nexus.css), their star marks, and the places a
// session works in. session.jsx draws them.

/** Local sessions, in the order a new one takes its name. */
export const SESSIONS = [
  { name: 'vega', night: '#4CECE7', dawn: '#006E79', points: 4, star: 'M12 2C12.6 8.2 15.8 11.4 22 12C15.8 12.6 12.6 15.8 12 22C11.4 15.8 8.2 12.6 2 12C8.2 11.4 11.4 8.2 12 2Z' },
  { name: 'sirius', night: '#7FC8FF', dawn: '#1A609E', points: 5, star: 'M12 2l2.9 6.6 7.1.7-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.3l7.1-.7z' },
  { name: 'deneb', night: '#AC89FC', dawn: '#6338B9', points: 6, star: 'M12 2l2.6 5.5H21l-3.4 4.5L21 16.5h-6.4L12 22l-2.6-5.5H3L6.4 12 3 7.5h6.4z' },
  { name: 'altair', night: '#E2C69F', dawn: '#74542C', points: 8, star: 'M12 2l2.1 5.1L19.1 5l-2.1 5L22 12l-5 2 2.1 5-5-2.1L12 22l-2-5-5 2.1 2.1-5L2 12l5-2-2.1-5 5 2.1z' },
];

/** Terminal-observed sessions keep their own star name but share this colour and the terminal glyph. */
export const TERM = { night: '#AAACC1', dawn: '#3A3F5C' };

const BY_NAME = Object.fromEntries(SESSIONS.map((s) => [s.name, s]));

/** The star record for a name, or null when the name has no star of its own. */
export const starOf = (name) => BY_NAME[name] || null;

/** True for the four local star names. */
export const isStarName = (name) => !!BY_NAME[name];

/**
 * How a session is drawn. local with a star name: its star and colour;
 * terminal: the terminal glyph in the term colour; someone else's (or a
 * local session with no star name): a neutral initial, never a colour.
 * @returns {{ glyph: 'star'|'terminal'|'initial', cls: string, initial?: string }}
 */
export function sessionLook(session) {
  if (!session) return { glyph: 'initial', cls: '', initial: '?' };
  if (session.kind === 'terminal') return { glyph: 'terminal', cls: 'sess-term' };
  if (session.kind !== 'other' && BY_NAME[session.name]) return { glyph: 'star', cls: `sess-${session.name}` };
  return { glyph: 'initial', cls: '', initial: String(session.person || session.name || '?').slice(0, 1).toLowerCase() };
}

/** The CSS class that sets --sess for a session: sess-vega … sess-altair, sess-term; '' for someone else's. */
export const sessClass = (session) => sessionLook(session).cls;

/**
 * The first name, in order, not held by a live session on this machine.
 * A fallen or paused session keeps its name until it is closed, so callers
 * pass every session that is not closed. Null when all four are taken.
 */
export function nextSessionName(held) {
  const taken = new Set((held || []).filter((s) => typeof s === 'string' || s?.state !== 'closed').map((s) => (typeof s === 'string' ? s : s.name)));
  return SESSIONS.find((s) => !taken.has(s.name))?.name ?? null;
}

/** Branch and worktree for the n-th session of a name in this repo. */
export function sessionPlaces(name, n) {
  return { branch: `nexus/${name}-${n}`, worktree: `../.nexus-wt/${name}-${n}` };
}

/**
 * A new session's identity: the next free name (from the sessions not
 * closed), and n = 1 + how many sessions this repo has had by that name
 * (`history`: every session ever, closed ones included). Null when no name is free.
 */
export function newSessionIdentity(held, history = held) {
  const name = nextSessionName(held);
  if (!name) return null;
  const n = 1 + (history || []).filter((s) => (typeof s === 'string' ? s : s?.name) === name).length;
  return { name, n, ...sessionPlaces(name, n) };
}

/** Someone else's session: a neutral initial, labelled "jun · orion". Never a colour. */
export function otherLabel(person, sessionName) {
  return sessionName ? `${person} · ${sessionName}` : person;
}
