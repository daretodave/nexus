// Oversight tug and parked questions (Tug board): .tug (pending, answered,
// expired), .qstack + .qprog + .qrow + .startbar (Questions at the start),
// .tray + .parked (Working: never interrupts), .pcard (Questions at the end).
import { useState } from 'react';
import { Icon } from './icons.jsx';
import { Orb, ParkMark } from './agent.jsx';
import { Ring } from './feedback.jsx';
import { cx } from './controls.jsx';

/**
 * .tug. state: pending | answered | expired.
 * options: [{ label, rec?, chosen? }] (recommended first); `why` explains the
 * recommendation; `timer` { left: '4:48', pct: 80 } counts down to the default.
 */
export function Tug({
  state = 'pending', who, src, question, options = [], why, timer, at,
  onPick, onOther, onDefault, chosen, onChange, onRevisit, label, compact, style, className,
}) {
  const [other, setOther] = useState('');
  if (state === 'answered') {
    return (
      <div className={cx('tug is-answered', className)} role="group" aria-label={label || `Answered question from ${who}`} style={style}>
        <div className="tug-head"><Orb state="done" size="s" /><span><span className="tug-who">{who}</span> {src ? <span className="tug-src">· {src}</span> : null}</span>{at ? <span className="tug-timer">{at}</span> : null}</div>
        <p className="tug-q" style={{ color: 'var(--text-2)', fontSize: 14, lineHeight: '21px' }}>{question}</p>
        <div className="tug-result"><Icon name="check" style={{ color: 'var(--st-done)' }} /><span>You chose <b>{chosen}</b>. {who} resumed.</span></div>
        {onChange ? <div style={{ display: 'flex', gap: 8 }}><button className="btn btn-ghost btn-s" type="button" onClick={onChange}>Change answer</button></div> : null}
      </div>
    );
  }
  if (state === 'expired') {
    return (
      <div className={cx('tug is-expired', className)} role="group" aria-label={label || `Expired question from ${who}`} style={style}>
        <div className="tug-head"><Icon name="clock2" style={{ color: 'var(--text-3)' }} /><span><span className="tug-who">{who}</span> {src ? <span className="tug-src">· {src}</span> : null}</span></div>
        <p className="tug-q" style={{ fontSize: 14, lineHeight: '21px' }}>{question}</p>
        <div className="tug-result"><Icon name="arrowRight" style={{ color: 'var(--st-blocked)' }} /><span>{who} assumed the default: <b>{chosen}</b></span></div>
        {onRevisit ? <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><button className="btn btn-s" type="button" onClick={onRevisit}>Revisit</button><span className="hint">A different answer lands in the plan for the next loop.</span></div> : null}
      </div>
    );
  }
  return (
    <div className={cx('tug is-pending', className)} role="group" aria-label={label || `Question from ${who}`} style={style}>
      <div className="tug-head">
        <Orb state="blocked" size="s" />
        <span><span className="tug-who">{who}</span> {src ? <span className="tug-src">· {src}</span> : null}</span>
        {timer ? <span className="tug-timer"><Ring size="s" color="var(--st-blocked)" value={timer.pct} />default in {timer.left}</span> : null}
      </div>
      <p className="tug-q" style={compact ? { fontSize: 14, lineHeight: '20px' } : undefined}>{question}</p>
      <div className="tug-opts">
        {options.map((o) => (
          <button key={o.label} className={cx('tug-opt', o.rec && 'is-rec', o.chosen && 'is-chosen')} type="button" onClick={() => onPick?.(o.label)}>
            {o.label}{o.rec && !compact ? <span className="rec">recommended</span> : null}
          </button>
        ))}
      </div>
      {why ? <p className="tug-why"><Icon name="rays4" size={14} style={{ marginTop: 3, color: 'var(--st-blocked)' }} /><span>{why}</span></p> : null}
      {onOther || onDefault ? (
        <div className="tug-foot">
          {onOther ? <input className="field tug-other" type="text" aria-label="Other answer" placeholder="Other…" value={other} onChange={(e) => setOther(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && other.trim()) onOther(other.trim()); }} /> : null}
          {onDefault ? <button className="btn btn-s tug-default" type="button" onClick={onDefault}>Use the default and keep going<Icon name="arrowRight" size={14} /></button> : null}
        </div>
      ) : null}
    </div>
  );
}

/** .qprog: one bar per question; on = answered, def = default accepted, cur = this one. */
export function QProg({ items, style }) {
  return <div className="qprog" style={style}>{items.map((s, i) => <i key={i} className={s || undefined} />)}</div>;
}

/** .qstack: the current question on top, two peeks behind it. */
export function QStack({ children, peeks = 2 }) {
  return (
    <div className="qstack">
      <div className="qstack-top">{children}</div>
      {peeks > 0 ? <div className="qstack-peek" /> : null}
      {peeks > 1 ? <div className="qstack-peek p2" /> : null}
    </div>
  );
}

/** .qrow: a settled question, one line. */
export function QRow({ q, a }) {
  return <div className="qrow"><Icon name="check" style={{ color: 'var(--st-done)' }} /><span className="q">{q}</span><span className="a">{a}</span></div>;
}

/** .startbar: locked until every question is answered or defaults accepted. */
export function StartBar({ ready, text, onDefaults, onStart, raised }) {
  if (ready) {
    return (
      <div className="startbar" style={raised ? { boxShadow: 'var(--e-3)' } : undefined}>
        <Icon name="check" style={{ color: 'var(--st-done)' }} /><span className="t-body-s" style={{ flex: 1 }}>{text}</span>
        <button className="btn btn-primary" type="button" onClick={onStart}>Start working<Icon name="arrowRight" size={14} /></button>
      </div>
    );
  }
  return (
    <div className="startbar">
      <Icon name="lock" style={{ color: 'var(--text-3)' }} /><span className="t-body-s c-2" style={{ flex: 1 }}>{text}</span>
      <button className="btn btn-s" type="button" onClick={onDefaults}>Accept defaults</button>
      <button className="btn btn-primary btn-s" type="button" disabled>Start working</button>
    </div>
  );
}

/** .tray: parked questions during Working. `head` overrides the default line. */
export function Tray({ count, head, open, onToggle, href, children, style }) {
  const inner = (
    <>
      <span className="tray-count">{count}</span><b>parked</b><span>{head ?? '· defaults taken · review at the end'}</span>
      {onToggle ? <><span className="tb-spacer" /><Icon name="chevronDown" size={14} /></> : null}
    </>
  );
  return (
    <div className="tray" style={style}>
      {href ? <a className="tray-head" href={href} style={{ color: 'var(--text-2)', textDecoration: 'none' }}>{inner}</a>
        : <div className="tray-head" onClick={onToggle} role={onToggle ? 'button' : undefined} aria-expanded={onToggle ? !!open : undefined}>{inner}</div>}
      {children}
    </div>
  );
}

/** .parked: one parked question with the default its agent took. */
export function Parked({ q, who, a, t, arriving }) {
  return (
    <div className={cx('parked', arriving && 'is-arriving')}>
      <span className="park-mark" />
      <span style={{ minWidth: 0 }}>
        <span className="parked-q" style={{ display: 'block' }}>{q}</span>
        <span className="parked-a" style={{ display: 'block' }}>{who ? `${who} ` : ''}assumed <b>{a}</b></span>
      </span>
      <span className="parked-t">{t}</span>
    </div>
  );
}

/**
 * .pcard: a parked question at review. state: review | changing | approved | changed.
 * options for changing: [{ label, chosen }].
 */
export function PCard({ state = 'review', top, q, assumed, was, now, fix, options, onApprove, onChange, onQueueFix, onCancel, onPick }) {
  if (state === 'approved') {
    return (
      <div className="pcard is-approved">
        <div className="pcard-top"><Icon name="check" size={14} style={{ color: 'var(--st-done)' }} /><span>{top}</span></div>
        <div className="pcard-assumed"><span>{assumed}</span></div>
      </div>
    );
  }
  if (state === 'changed') {
    return (
      <div className="pcard is-changed">
        <div className="pcard-top"><ParkMark changed /><span>{top}</span></div>
        <div className="pcard-assumed"><span>Was <b style={{ textDecoration: 'line-through', fontWeight: 500 }}>{was}</b>, now <b>{now}</b></span></div>
        {fix ? <span className="fixq"><Icon name="plus" size={14} />{fix}</span> : null}
      </div>
    );
  }
  if (state === 'changing') {
    return (
      <div className="pcard is-changing">
        <div className="pcard-top"><ParkMark /><span>{top}</span></div>
        <p className="pcard-q">{q}</p>
        <div className="tug-opts">{(options || []).map((o) => <button key={o.label} className={cx('tug-opt', o.chosen && 'is-chosen')} type="button" onClick={() => onPick?.(o.label)}>{o.label}</button>)}</div>
        <div className="pcard-acts"><button className="btn btn-primary btn-s" type="button" onClick={onQueueFix}>Queue the fix</button><button className="btn btn-ghost btn-s" type="button" onClick={onCancel}>Cancel</button><span className="hint">A change queues a fix chunk</span></div>
      </div>
    );
  }
  return (
    <div className="pcard">
      <div className="pcard-top"><ParkMark /><span>{top}</span></div>
      <p className="pcard-q">{q}</p>
      <div className="pcard-assumed"><Icon name="arrowRight" size={14} style={{ color: 'var(--st-blocked)' }} /><span>The agent assumed <b>{assumed}</b></span></div>
      <div className="pcard-acts"><button className="btn btn-s" type="button" onClick={onApprove}><Icon name="check" size={14} />Approve</button><button className="btn btn-ghost btn-s" type="button" onClick={onChange}>Change</button></div>
    </div>
  );
}
