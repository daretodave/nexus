// Session identity, verbatim from the handoff: a star name, a night and a
// dawn colour (the --sess-<name> tokens in nexus.css), and a star mark.
// Always shown as glyph + name, never colour alone.
import { Icon } from './icons.jsx';

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

/** The CSS class that sets --sess for a session: sess-vega … sess-altair, sess-term; '' for someone else's. */
export function sessClass(session) {
  if (!session) return '';
  if (session.kind === 'other') return '';
  if (session.kind === 'terminal') return 'sess-term';
  return BY_NAME[session.name] ? `sess-${session.name}` : '';
}

/**
 * The first name, in order, not held by a live session on this machine.
 * A fallen or paused session keeps its name until it is closed, so callers
 * pass every session that is not closed. Null when all four are taken.
 */
export function nextSessionName(held) {
  const taken = new Set((held || []).map((s) => (typeof s === 'string' ? s : s.name)));
  return SESSIONS.find((s) => !taken.has(s.name))?.name ?? null;
}

/** Branch and worktree for the n-th session of a name in this repo. */
export function sessionPlaces(name, n) {
  return { branch: `nexus/${name}-${n}`, worktree: `../.nexus-wt/${name}-${n}` };
}

/** The star mark: <svg class="star"> filled with var(--sess). */
export function Star({ name, className = '', style }) {
  const s = BY_NAME[name];
  if (!s) return null;
  return (
    <svg className={['star', className].filter(Boolean).join(' ')} viewBox="0 0 24 24" aria-hidden="true" style={style}>
      <path d={s.star} />
    </svg>
  );
}

/**
 * A session's glyph: its star (local), the terminal glyph in --sess
 * (observed from a terminal), or nothing (someone else's: a neutral initial, see Claim).
 * `session`: { name, kind: 'local' | 'terminal' | 'other' }.
 */
export function SessionGlyph({ session, size, style, className }) {
  if (!session || session.kind === 'other') return null;
  if (session.kind === 'terminal') return <Icon name="terminal" size={size} className={className} style={{ color: 'var(--sess)', ...style }} />;
  return <Star name={session.name} className={className} style={style} />;
}

/** .sess-tag: glyph + name on a tinted pill. */
export function SessTag({ session, children }) {
  return (
    <span className={['sess-tag', sessClass(session)].filter(Boolean).join(' ')}>
      <SessionGlyph session={session} />
      {children ?? session.name}
    </span>
  );
}

/** Someone else's session: a neutral initial, labelled "jun · orion". Never a colour. */
export function otherLabel(person, sessionName) {
  return sessionName ? `${person} · ${sessionName}` : person;
}
