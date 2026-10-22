// The agent stage while a session's worktree forms (spec 47, A4): the cockpit opened at once, and git is still
// checking the branch out behind it. The motion is the handoff's own (Motion board, "the stars become the main
// session orb"; Launch's collapse): the constellation's stars draw in to the session orb, over and over, until the
// worktree is ready. A failed form shows the orb failed, git's reason and Retry.
import { Icon, Orb, cx } from '../../ui/index.js';
import { ROOT_WHY, formWords } from '../../../shared/forming.mjs';
import '../../styles/forming.css';

// Eight stars on a ring (the Motion board's constellation), each with its own colour and start.
const RING = [
  [-150, -70, '', 0], [-70, -118, 'v', 300], [40, -124, '', 600], [138, -82, 'n', 900],
  [156, 26, '', 1200], [86, 108, 'v', 1500], [-36, 120, '', 1800], [-136, 72, 'n', 2100],
];

/** form: shared/forming.mjs; null or ready draws nothing. onRetry: POST /api/sessions/:id/retry. */
export default function Forming({ form, now = Date.now(), onRetry, retrying }) {
  const w = formWords(form, now);
  if (!w) return null;
  const failed = form.state === 'failed';
  return (
    <div className={cx('forming', failed && 'is-failed')} role="status" aria-live="polite" aria-label={`${w.title}: ${w.sub}`}>
      <div className="forming-sky" aria-hidden="true">
        {failed ? null : RING.map(([x, y, k, d]) => <span key={`${x},${y}`} className={cx('lstar', k)} style={{ '--x': `${x}px`, '--y': `${y}px`, '--d': `${d}ms` }} />)}
        <span className="forming-core"><Orb state={failed ? 'failed' : 'thinking'} size="xl" main /></span>
      </div>
      <div className="forming-cap">
        <span className="t-title-m">{w.title}</span>
        <span className="t-mono-s c-2 forming-sub">{w.sub}</span>
        {!failed && form.line ? <span className="t-mono-xs c-3 forming-line">{form.line}</span> : null}
        {form.worktree ? <span className="t-body-s c-3">{form.worktree}{ROOT_WHY[form.why] ? ` · ${ROOT_WHY[form.why]}` : ''}</span> : null}
        {failed && onRetry ? (
          <button className="btn btn-s" type="button" onClick={onRetry} disabled={retrying} aria-busy={retrying || undefined}><Icon name="refresh" size={14} />Retry</button>
        ) : null}
      </div>
    </div>
  );
}
