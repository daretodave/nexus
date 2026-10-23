// The end of Grill me (0.5.1): review what you answered, spec by spec, pick where each spec's answers go, and send.
// Each target gets one message (grill/model.js handoffPlan); every spec headed to a new session shares one, which runs
// /oversight to apply them. Then you land in that session's cockpit to watch it.
import { Icon, cx } from '../../ui/index.js';
import { DECIDE_TEXT, IMAGE_ONLY_TEXT } from '../../../shared/choices.mjs';
import { thumbOf } from '../../ui/image-refs.js';
import { standing } from './model.js';

const oneLine = (s) => String(s || '').replace(/\s*\n\s*/g, ' ');
const WHERE_NEW = 'A new session starts in the checkout and runs /oversight with them: it records each answer where its question lives, then lands per owner mode.';

export function HandOff({ queue, done, skipped, totals, specs, picks, targets, defaultTarget, onPick, onEdit, onSend, onBack, sending, results, onOpen }) {
  const kept = totals.answered + totals.decided;
  const unsent = specs.reduce((n, s) => n + s.items.filter((i) => done[i.id]?.kept && !done[i.id].sent).length, 0);
  const stillOpen = queue.ids.filter((id) => standing(id, done, skipped) !== 'kept' && standing(id, done, skipped) !== 'decided');
  const failed = (results || []).filter((r) => r.result.error);
  const ok = (results || []).filter((r) => r.result.ok);
  return (
    <section className="grill-review" aria-label="Review and hand off">
      <h2 className="grill-review-h">
        You answered {totals.answered} of {totals.total}.{totals.decided ? ` ${totals.decided} left to the session.` : ''}{totals.skipped ? ` ${totals.skipped} skipped.` : ''}
      </h2>
      {specs.map((s) => {
        const items = s.items.filter((i) => done[i.id]?.kept);
        if (!items.length) return null;
        const target = picks[s.key] || defaultTarget(s);
        const imgs = items.reduce((n, i) => n + (done[i.id].images?.length || 0), 0);
        const sentTo = items.every((i) => done[i.id].sent);
        return (
          <div key={s.key} className="grill-review-spec">
            <div className="grill-review-sh">
              {s.n ? <span className="n">{s.n}</span> : null}
              <span className="t">{s.n ? s.title : s.file}</span>
              <span className="c">{items.length} {items.length === 1 ? 'answer' : 'answers'}{imgs ? `, ${imgs} ${imgs === 1 ? 'image' : 'images'}` : ''}</span>
              <span className="spacer" />
              {sentTo ? <span className="chk-state is-ok"><Icon name="check" size={14} />sent</span> : (
                <label className="grill-target">
                  <span className="t-body-s c-3">send to</span>
                  <select className="field" value={target.id} onChange={(e) => onPick(s.key, targets.find((t) => t.id === e.target.value))}>
                    {targets.map((t) => <option key={t.id} value={t.id}>{t.kind === 'new' ? 'a new session' : `${t.name}${t.id === defaultTarget(s).id && defaultTarget(s).why === 'asked' ? ' (asked these)' : ''}`}</option>)}
                  </select>
                </label>
              )}
            </div>
            {!sentTo ? <p className="grill-review-where">{target.kind === 'new' ? WHERE_NEW : `${target.name} gets them in one message and carries on where it left off.`}</p> : null}
            <ul className="grill-review-list">
              {items.map((i) => {
                const d = done[i.id];
                const decided = d.how === 'decide';
                return (
                  <li key={i.id} className={cx(decided && 'is-decided')}>
                    <Icon name={decided ? 'minus' : 'check'} size={14} />
                    <span className="q">{oneLine(i.q)}</span>
                    <span className="a">{decided ? 'left to the session' : d.a === IMAGE_ONLY_TEXT ? 'see the images' : oneLine(d.a === DECIDE_TEXT ? '' : d.a)}</span>
                    {d.images?.length ? <img className="th" src={thumbOf(d.images[0].file)} alt="" /> : <span />}
                    {!d.sent ? <button className="btn btn-ghost btn-s" type="button" onClick={() => onEdit(i.id)}>Edit</button> : <span />}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {stillOpen.length ? (
        <div className="grill-review-spec">
          <div className="grill-review-sh"><span className="t">Still open</span></div>
          <ul className="grill-review-list">
            {stillOpen.map((id) => (
              <li key={id}>
                <Icon name="clock" size={14} />
                <span className="q">{oneLine(queue.byId[id].item.q)}</span>
                <span className="a" />
                <span />
                <button className="btn btn-ghost btn-s" type="button" onClick={() => onEdit(id)}>Answer now</button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {failed.map((r) => <p key={r.group.target.id} className="grill-review-err" role="alert">Not sent to {r.group.target.kind === 'new' ? 'a new session' : r.group.target.name}: {r.result.error}. Those answers are still kept.</p>)}
      {ok.length && failed.length ? <p className="t-body-s c-2">{ok.map((r) => `Sent ${r.group.items.length} to ${r.result.name || r.group.target.name || 'a new session'}.`).join(' ')}</p> : null}
      <div className="grill-acts">
        {unsent ? (
          <button className="btn btn-primary" type="button" disabled={sending} onClick={onSend}>
            {sending ? 'Sending...' : failed.length ? 'Retry' : `Send ${unsent} ${unsent === 1 ? 'answer' : 'answers'} and start`}
          </button>
        ) : ok.length ? (
          <button className="btn btn-primary" type="button" onClick={() => onOpen(ok[0].result)}>Open {ok[0].result.name || 'the session'}<Icon name="arrowRight" size={14} /></button>
        ) : (
          <button className="btn btn-primary" type="button" onClick={onBack}>Back to Oversight</button>
        )}
        {unsent ? <button className="btn btn-ghost" type="button" onClick={onBack}>Not yet, keep them</button> : null}
        {kept === 0 && !unsent ? <span className="t-body-s c-3">Nothing kept to send.</span> : null}
      </div>
    </section>
  );
}
