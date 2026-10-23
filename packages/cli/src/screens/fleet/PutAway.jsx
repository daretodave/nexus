// Put away (0.5.1): the small card a session that finished its job shows, at the end of its conversation and on its
// Fleet tile. "deneb is done. Put it away?" Put away ends the session and frees its star; when it left nothing behind
// its empty worktree closes too (POST /api/sessions/:id/put-away, the same safe close as Clear). Holding commits,
// changes or claims, the card says what and the button keeps them: the session ends, its work stays where it is.
// Keep it hides the card for this job (remembered in this browser only). Styles: styles/put-away.css.
import { useMemo, useState } from 'react';
import { api } from '../../data/index.js';
import { Icon, cx } from '../../ui/index.js';
import { putAwayPlan } from '../../../shared/put-away.mjs';
import '../../styles/put-away.css';

/** The line a clean put away reads. In the shared checkout nothing closes, and what is there is left as it is. */
function cleanLine(plan, compact) {
  if (!plan.worktree) return compact ? 'Nothing in the checkout is touched.' : 'Frees its star and ends the session. Nothing in the checkout is touched.';
  return compact ? 'It left nothing behind, so nothing is lost.' : 'Frees its star and closes its empty worktree. It left nothing behind, so nothing is lost.';
}

/**
 * s: the session's fleet row (normalized); done: finishedJob(s) ({ text }); onGone(result) after it is put away;
 * onKeep() on Keep it. `compact` draws the tile's smaller card.
 */
export default function PutAway({ s, done, onGone, onKeep, compact = false }) {
  const plan = useMemo(() => putAwayPlan(s), [s]);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState(null);
  const [error, setError] = useState('');
  const keepWork = !plan.clean || !!refused;
  const say = refused?.say || plan.say;
  const keepSay = refused?.keep || plan.keep;

  async function go() {
    setBusy(true);
    setError('');
    try {
      const r = await api(`/api/sessions/${encodeURIComponent(s.id)}/put-away`, keepWork ? { keep: true } : {});
      onGone?.(r);
    } catch (e) {
      // The server read newer git than the tile had: it holds work after all. Say what, and offer the safe choice.
      if (e.status === 409 && e.data?.holds) setRefused({ say: e.data.say, keep: e.data.keep });
      else setError(e.status === 404 && !e.data?.error ? 'This server cannot put sessions away yet. Nothing changed.' : e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cx('put-away', compact && 'is-compact', keepWork && 'holds-work')} role="group" aria-label={`Put ${s.name} away`}>
      <span className="pa-mark" aria-hidden="true"><Icon name="check" size={compact ? 12 : 14} /></span>
      <div className="pa-body">
        {compact
          ? <div className="pa-title">Put {s.name} away?</div>
          : <div className="pa-title"><b>{s.name}</b> is done{done?.text ? <span className="pa-why">: {done.text}</span> : null}. Put it away?</div>}
        {keepWork
          ? <div className="pa-sub">{say} {compact ? 'It all stays where it is.' : keepSay}</div>
          : <div className="pa-sub">{cleanLine(plan, compact)}</div>}
        {error ? <div className="pa-err">{error}</div> : null}
        <div className="pa-actions">
          <button className="btn btn-s btn-primary" type="button" onClick={go} disabled={busy} aria-busy={busy || undefined}>
            {busy ? <span className="spin" /> : <Icon name="check" size={14} />}{keepWork ? 'Put away, keep its work' : 'Put away'}
          </button>
          <button className="btn btn-s btn-ghost" type="button" onClick={onKeep} disabled={busy}>Keep it</button>
        </div>
      </div>
    </div>
  );
}
