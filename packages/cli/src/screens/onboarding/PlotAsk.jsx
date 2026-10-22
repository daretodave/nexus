// The plot session's asks on the steps after Plot (spec 47, A15): while the session onboarding's Plot step started
// waits on a permission or a question, the Plot, Cloud and Launch steps show it in one strip under the header.
// A permission answers inline (Allow or Deny, POST /api/permission/:id as the cockpit's tug does; never "Always
// allow" from here); a question opens the cockpit, where its options are.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, SessTag } from '../../ui/index.js';
import { server, useEvents } from '../../data/index.js';
import { PATHS } from '../../routes.js';
import { pendingAsk } from './plotAsk.js';
import '../../styles/plot-ask.css';

/** The plot session's live channel (the cockpit's store), or a closed one before Plot has started a session. */
export function usePlotLive(d) {
  const id = d?.plotted ? d.plotSession?.id || null : null;
  return { id, live: useEvents(id || undefined, { off: !id }) };
}

/** The strip itself: nothing while the session waits on nothing. */
export function PlotAskStrip({ session, live, answer = server.answerPermission }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ask = pendingAsk(live);
  if (!session?.id || !ask) return null;
  const reply = async (allow) => {
    setBusy(true);
    setErr('');
    try { await answer(ask.id, allow, false); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const who = session.name ? <SessTag session={{ name: session.name, kind: 'local' }} /> : <b>The plot session</b>;
  return (
    <div className="plot-ask" role="status" aria-live="polite">
      <span className="park-mark" aria-hidden="true" />
      <span className="plot-ask-text">
        {who} <span className="plot-ask-lead">is waiting for you:</span> <span className="plot-ask-what">{ask.line}</span>
        {err ? <span className="plot-ask-err" role="alert">{err}</span> : null}
      </span>
      <span className="plot-ask-acts">
        {ask.kind === 'perm' ? (
          <>
            <button className="btn btn-s btn-primary" type="button" onClick={() => reply(true)} disabled={busy} aria-busy={busy || undefined}><Icon name="check" size={14} />Allow</button>
            <button className="btn btn-s" type="button" onClick={() => reply(false)} disabled={busy}>Deny</button>
          </>
        ) : null}
        <Link className="btn btn-s btn-ghost" to={PATHS.cockpit(session.id)}>Open cockpit<Icon name="arrowRight" size={14} /></Link>
      </span>
    </div>
  );
}
