// Questions, at the end (CockpitReview board): what came up while the
// session worked, each card saying what the agent assumed. Approve it, or
// change it and a fix chunk is queued before the package.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Empty, Icon, ParkMark, cx } from '../../ui/index.js';
import { clock } from './model.js';

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const word = (n) => WORDS[n] || String(n);

/**
 * parked: [{ who, chunk, at, q, alts, state: 'pending'|'approved'|'changed', pick, fix }].
 * onApprove(i), onChange(i, pick), onApproveRest() resolve when the server took it.
 */
export default function QuestionsEnd({ name, parked, onApprove, onChange, onApproveRest, packageTo, busy }) {
  const [changing, setChanging] = useState({});
  if (!parked || !parked.length) {
    return (
      <div className="lp">
        <div><h2 className="lp-title">Before {name} packages</h2><p className="lp-sub">Each card says what the agent assumed. Approve it, or change it and a fix is queued.</p></div>
        <Empty sky="quiet" title="Nothing parked" body="Questions that come up while the session works are parked here with the default it took, for you to review before the package." />
      </div>
    );
  }
  const n = parked.length;
  const left = parked.filter((p, i) => (p.state || 'pending') === 'pending' || changing[i] != null).length;
  const top = (p, tail) => [p.who, p.chunk, tail].filter(Boolean).join(' · ');
  return (
    <div className="lp">
      <div>
        <h2 className="lp-title">Before {name} packages</h2>
        <p className="lp-sub">{word(n)} question{n === 1 ? '' : 's'} came up while it worked. Each card says what the agent assumed. Approve it, or change it and a fix is queued.</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {parked.map((p, i) => {
          const alts = p.alts || [];
          const s = changing[i] != null ? 'changing' : (p.state || 'pending');
          if (s === 'approved') {
            return (
              <div key={i} className="pcard is-approved" style={{ padding: '10px 14px', gap: 6 }}>
                <div className="pcard-top"><Icon name="check" size={14} style={{ color: 'var(--st-done)' }} /><span>{top(p, 'approved')}</span></div>
                <div className="t-body-s"><span className="c-2">{p.q}</span> <b>{alts[0]}</b></div>
              </div>
            );
          }
          if (s === 'changed') {
            return (
              <div key={i} className="pcard is-changed" style={{ padding: '10px 14px', gap: 6 }}>
                <div className="pcard-top"><ParkMark changed /><span>{top(p, 'changed')}</span></div>
                <div className="t-body-s"><span className="c-2">Now</span> <b>{alts[p.pick ?? 1]}</b></div>
                {p.fix ? <span className="fixq"><Icon name="plus" size={14} />Fix queued as {p.fix} · runs before the package</span> : null}
              </div>
            );
          }
          if (s === 'changing') {
            const pick = changing[i];
            return (
              <div key={i} className="pcard is-changing">
                <div className="pcard-top"><ParkMark /><span>{top(p, `parked ${clock(p.at)}`)}</span></div>
                <p className="pcard-q">{p.q}</p>
                <div className="tug-opts">
                  {alts.map((label, j) => <button key={label} className={cx('tug-opt', pick === j && 'is-chosen')} type="button" aria-pressed={pick === j} onClick={() => setChanging((c) => ({ ...c, [i]: j }))}>{label}</button>)}
                </div>
                <div className="pcard-acts">
                  <button className="btn btn-primary btn-s" type="button" disabled={busy} onClick={async () => { if (await onChange(i, pick === 0 ? 1 : pick)) setChanging((c) => { const x = { ...c }; delete x[i]; return x; }); }}>Queue the fix</button>
                  <button className="btn btn-ghost btn-s" type="button" onClick={() => setChanging((c) => { const x = { ...c }; delete x[i]; return x; })}>Cancel</button>
                  <span className="hint">A change queues a fix chunk</span>
                </div>
              </div>
            );
          }
          return (
            <div key={i} className="pcard">
              <div className="pcard-top"><ParkMark /><span>{top(p, `parked ${clock(p.at)}`)}</span></div>
              <p className="pcard-q">{p.q}</p>
              <div className="pcard-assumed"><Icon name="arrowRight" size={14} style={{ color: 'var(--st-blocked)' }} /><span>The agent assumed <b>{alts[0]}</b></span></div>
              <div className="pcard-acts">
                <button className="btn btn-s" type="button" disabled={busy} onClick={() => onApprove(i)}><Icon name="check" size={14} />Approve</button>
                <button className="btn btn-ghost btn-s" type="button" onClick={() => setChanging((c) => ({ ...c, [i]: 1 }))}>Change</button>
              </div>
            </div>
          );
        })}
      </div>
      {left > 0 ? (
        <div className="startbar">
          <ParkMark />
          <span className="t-body-s c-2" style={{ flex: 1 }}>{left} still open. The package waits until each is settled.</span>
          <button className="btn btn-s" type="button" disabled={busy} onClick={async () => { if (await onApproveRest()) setChanging({}); }}>Approve the rest</button>
        </div>
      ) : (
        <div className="startbar" style={{ boxShadow: 'var(--e-3)' }}>
          <Icon name="check" style={{ color: 'var(--st-done)' }} />
          <span className="t-body-s" style={{ flex: 1 }}>All {word(n).toLowerCase()} settled. The package is ready to assemble.</span>
          <Link className="btn btn-primary" to={packageTo}>Package it<Icon name="arrowRight" size={14} /></Link>
        </div>
      )}
    </div>
  );
}
