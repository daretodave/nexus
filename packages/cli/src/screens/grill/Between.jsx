// Between two specs in Grill me (0.5.1): a short breath, not a gate. What the spec you finished came to, what is next,
// and the option to send that spec's answers now, so a session can start while you keep answering.
import { useState } from 'react';
import { Icon } from '../../ui/index.js';
import { continueLabel } from '../headsdown-inbox/planAnswers.js';

export function Between({ from, fromCounts, to, sendable, targets, target, onPick, onSend, sending, sent, onGo }) {
  const [picking, setPicking] = useState(false);
  const c = fromCounts || { answered: 0, decided: 0, skipped: 0 };
  return (
    <section className="grill-between" aria-label="Between specs">
      <p className="grill-between-done">
        <Icon name="check" />
        <span>
          {from.n ? `Spec ${from.n} · ${from.title}` : from.file}: {c.answered} answered, {c.decided} left to the session, {c.skipped} skipped.
        </span>
      </p>
      <p className="grill-between-next">Next: {to.n ? `spec ${to.n} · ${to.title}` : to.file}, {to.ids.length} {to.ids.length === 1 ? 'question' : 'questions'}.</p>
      <div className="grill-acts">
        <button className="btn btn-primary" type="button" onClick={onGo} autoFocus>Keep going<span className="kbd">⏎</span></button>
        {sent ? <span className="chk-state is-ok"><Icon name="check" size={14} />{sent}</span> : sendable > 0 ? (
          <>
            <button className="btn btn-ghost" type="button" disabled={sending} onClick={onSend}>{sending ? 'Sending...' : `Send ${from.n ? `spec ${from.n}'s` : 'these'} answers now`}</button>
            <button className="btn btn-ghost btn-s" type="button" aria-expanded={picking} onClick={() => setPicking((p) => !p)}>to {target.kind === 'new' ? 'a new session' : target.name}</button>
          </>
        ) : null}
      </div>
      {picking && !sent ? (
        <div className="grill-pick" role="radiogroup" aria-label="Send to">
          {targets.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={t.id === target.id} className={`achoice${t.id === target.id ? ' is-picked' : ''}`} onClick={() => { onPick(t); setPicking(false); }}>
              <span className="achoice-n"><Icon name={t.kind === 'new' ? 'plus' : 'arrowRight'} size={12} /></span>
              <span className="achoice-b"><span className="achoice-l">{t.name}</span><span className="achoice-w">{continueLabel(sendable, t)}</span></span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
