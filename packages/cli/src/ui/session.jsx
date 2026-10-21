// Session identity, verbatim from the handoff: a star name, a night and a
// dawn colour (the --sess-<name> tokens in nexus.css), and a star mark.
// Always shown as glyph + name, never colour alone.
import { Icon } from './icons.jsx';
import { SESSIONS, TERM, starOf, isStarName, sessionLook, sessClass, nextSessionName, sessionPlaces, newSessionIdentity, otherLabel } from './stars.js';

export { SESSIONS, TERM, starOf, isStarName, sessionLook, sessClass, nextSessionName, sessionPlaces, newSessionIdentity, otherLabel };

/** The star mark: <svg class="star"> filled with var(--sess). */
export function Star({ name, className = '', style }) {
  const s = starOf(name);
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
