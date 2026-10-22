// Questions, at the start (CockpitStart board): every question the session
// will need, asked at once. One card on top with two peeking behind, the
// settled ones as rows, and a start bar. Each answer goes as it is given; a typed one is a draft until then
// (data/drafts.js), and from the first answer on the bar starts the session with the rest at their defaults
// (spec 51, A1: "Start with 1 answer · 3 take their defaults").
import { Empty, Icon, Orb, QProg, QRow, cx } from '../../ui/index.js';
import { AnswerField } from '../../ui/answer-field.jsx';
import { draftFailed, draftSending, draftSent } from '../../data/drafts.js';
import { startLabel } from '../../data/answers.js';

/**
 * questions: [{ q, chunk, opts, rec, answer, how }] from the ledger.
 * onAnswer(i, answer, how) and onDefaults() resolve when the server took it;
 * onStart() starts the Working phase.
 */
export default function QuestionsStart({ name, questions, onAnswer, onDefaults, onStart, busy }) {
  if (!questions || !questions.length) {
    return (
      <div className="lp">
        <div><h2 className="lp-title">Before {name} starts</h2><p className="lp-sub">Every question this session will need, asked at once. Settle them and it works quietly for three to four hours.</p></div>
        <Empty sky="waiting" title="No questions yet" body="When this session plans its package, every question it needs shows up here, before any work starts." />
      </div>
    );
  }
  const n = questions.length;
  const cur = questions.findIndex((q) => q.answer == null);
  const settled = questions.filter((q) => q.answer != null).length;
  const remaining = n - settled;
  const nAnswered = questions.filter((q) => q.answer != null && q.how !== 'default').length;
  const nDefault = settled - nAnswered;
  const q = cur >= 0 ? questions[cur] : null;
  const rec = q ? (q.rec ?? 0) : 0;
  const draftKey = cur >= 0 ? `start:${name}:${cur}` : null;
  const answer = (label, how = 'answered') => { if (cur >= 0 && !busy) onAnswer(cur, label, how); };
  const typed = async (text) => {
    if (cur < 0 || busy) return;
    const k = draftKey;
    draftSending(k);
    if (await onAnswer(cur, text, 'answered')) draftSent(k); else draftFailed(k);
  };
  const early = startLabel({ total: n, answered: nAnswered });
  const startNow = async () => { if (await onDefaults()) onStart(); };
  return (
    <div className="lp">
      <div><h2 className="lp-title">Before {name} starts</h2><p className="lp-sub">Every question this session will need, asked at once. Settle them and it works quietly for three to four hours.</p></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="t-label">{settled} of {n} settled</span>
        <QProg style={{ flex: 1 }} items={questions.map((x, i) => (x.answer != null ? (x.how === 'default' ? 'def' : 'on') : i === cur ? 'cur' : ''))} />
      </div>
      {q ? (
        <div className="qstack">
          <div className="qstack-top tug is-pending" style={{ padding: '14px 16px', gap: 10 }} role="group" aria-label={`Question ${cur + 1} of ${n}`}>
            <div className="tug-head"><Orb state="blocked" size="s" /><span><span className="tug-who">{cur + 1} of {n}</span> {q.chunk ? <span className="tug-src">· for {q.chunk}</span> : null}</span></div>
            <p className="tug-q" style={{ fontSize: 15, lineHeight: '22px' }}>{q.q}</p>
            <div className="tug-opts">
              {(q.opts || []).map((label, i) => (
                <button key={label} className={cx('tug-opt', i === rec && 'is-rec')} type="button" disabled={busy} onClick={() => answer(label)}>
                  {label}{i === rec ? <span className="rec">recommended</span> : null}
                </button>
              ))}
            </div>
            <div className="tug-foot">
              <AnswerField key={draftKey} draftKey={draftKey} button="Answer" disabled={busy} onSend={typed} />
              <button className="btn btn-s tug-default" type="button" disabled={busy} onClick={() => answer(q.opts?.[rec], 'default')}>Use the default and keep going</button>
            </div>
          </div>
          {remaining > 1 ? <div className="qstack-peek" /> : null}
          {remaining > 2 ? <div className="qstack-peek p2" /> : null}
        </div>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0, overflow: 'hidden' }}>
        {questions.map((x, i) => (x.answer != null ? <QRow key={i} q={x.q} a={`${x.answer}${x.how === 'default' ? ' (default)' : ''}`} /> : null))}
      </div>
      {remaining > 0 ? (
        <div className="startbar">
          <Icon name="lock" style={{ color: 'var(--text-3)' }} />
          <span className="t-body-s c-2" style={{ flex: 1 }}>Answer {remaining} more, or take the defaults for the rest.</span>
          <button className="btn btn-s" type="button" disabled={busy} onClick={onDefaults}>Accept defaults</button>
          {early
            ? <button className="btn btn-primary btn-s" type="button" disabled={busy} onClick={startNow}>{early}<Icon name="arrowRight" size={14} /></button>
            : <button className="btn btn-primary btn-s" type="button" disabled>Start working</button>}
        </div>
      ) : (
        <div className="startbar" style={{ boxShadow: 'var(--e-3)' }}>
          <Icon name="check" style={{ color: 'var(--st-done)' }} />
          <span className="t-body-s" style={{ flex: 1 }}>All {n} settled: {nAnswered} answered, {nDefault} defaults. About 3 to 4 hours of quiet work.</span>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={onStart}>Start working<Icon name="arrowRight" size={14} /></button>
        </div>
      )}
    </div>
  );
}
