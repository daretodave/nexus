// Feedback (Feedback board): .stepper, .ring, .toast, .empty, .err, and the
// heads-down .tui frame. Calm: says what is safe before what broke.
import { Icon } from './icons.jsx';
import { cx, NavA } from './controls.jsx';
import { STEPS } from './steps.js';

/**
 * .stepper: a constellation. `current` is a step id; `done` and `skipped`
 * are id lists. A skipped star is dashed and reads "Skipped".
 */
export function Stepper({ steps = STEPS, current, done = [], skipped = [], hrefFor, label = 'Setup progress' }) {
  // A line lights when both its stars are reached (done, or done then current); a skipped star breaks the line.
  const lit = (i) => done.includes(steps[i].id) && (done.includes(steps[i + 1]?.id) || steps[i + 1]?.id === current);
  return (
    <nav className="stepper" aria-label={label}>
      <span className="stp-lines" aria-hidden="true">{steps.slice(0, -1).map((s, i) => <i key={s.id} className={lit(i) ? 'lit' : undefined} />)}</span>
      {steps.map((s) => {
        const state = s.id === current ? 'is-current' : skipped.includes(s.id) ? 'is-skipped' : done.includes(s.id) ? 'is-done' : '';
        return (
          <NavA key={s.id} className={cx('stp', state)} href={hrefFor ? hrefFor(s.id) : `#${s.id}`} aria-current={s.id === current ? 'step' : undefined}>
            <span className="stp-star" /><span className="stp-label">{skipped.includes(s.id) ? 'Skipped' : s.label}</span>
          </NavA>
        );
      })}
    </nav>
  );
}

/**
 * .ring: progress, calm, never a bar of doom. value 0..100 (null: track
 * only); size: s | l; color: a CSS colour for --ring; indeterminate spins.
 */
export function Ring({ value, size, color, num, indeterminate, label }) {
  return (
    <span className={cx('ring', size && `ring-${size}`, indeterminate && 'is-indeterminate')} style={color ? { '--ring': color } : undefined} role={label ? 'img' : undefined} aria-label={label}>
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle className="trk" cx="18" cy="18" r="15" pathLength="100" />
        {value != null ? <circle className="val" cx="18" cy="18" r="15" pathLength="100" strokeDasharray={`${Math.max(0, Math.min(100, value))} 100`} /> : null}
      </svg>
      {num != null ? <span className="ring-num">{num}</span> : null}
    </span>
  );
}

const TOAST_ICON = { info: 'plot', shipped: 'commit', needs: null, error: 'warn' };

/**
 * .toast: kind info | shipped | needs | error. Bottom right, one at a time,
 * settle in from 12px below, stay 6s or while hovered (ToastHost places them).
 */
export function Toast({ kind = 'info', icon, title, body, actions, onDismiss }) {
  const ic = icon ?? TOAST_ICON[kind];
  return (
    <div className={`toast toast-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span className="toast-ic">{kind === 'needs' && !icon ? <span className="park-mark" /> : <Icon name={ic} />}</span>
      <span>
        <span className="toast-title" style={{ display: 'block' }}>{title}</span>
        {body ? <span className="toast-body">{body}</span> : null}
        {actions ? <span className="toast-acts">{actions}</span> : null}
      </span>
      {onDismiss ? <button className="chip-x" type="button" aria-label="Dismiss" onClick={onDismiss}><Icon name="x" size={12} /></button> : <span />}
    </div>
  );
}

/** Where toasts live: bottom right, never more than two, never over the composer. */
export function ToastHost({ toasts = [] }) {
  if (!toasts.length) return null;
  return (
    <div style={{ position: 'fixed', zIndex: 20, right: 24, bottom: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {toasts.slice(-2).map((t) => <div key={t.id} style={{ animation: 'nx-settle-in var(--dur-settle) var(--ease-settle) both' }}><Toast {...t} /></div>)}
    </div>
  );
}

/** Star layouts for .empty-art, from the board (lit stars carry the cyan glow). */
export const SKIES = {
  quiet: [[20, 40, true], [52, 18], [86, 44], [112, 22]],
  none: [[26, 26], [62, 46], [98, 24]],
  flat: [[30, 34], [70, 34], [110, 34]],
  waiting: [[40, 20], [66, 50, true], [96, 28]],
};

/** .empty: a quiet sky, a title, a line, and at most one action. */
export function Empty({ title, body, sky = 'none', action }) {
  return (
    <div className="empty">
      <div className="empty-art" aria-hidden="true">
        {(SKIES[sky] || SKIES.none).map(([l, t, on], i) => <i key={i} className={on ? 'lit' : undefined} style={{ left: l, top: t }} />)}
      </div>
      <span className="empty-title">{title}</span>
      {body ? <span className="empty-body">{body}</span> : null}
      {action || null}
    </div>
  );
}

/** .err: what is safe, what happened, what to do. icon: warn | offline | x. detail: text or lines. */
export function Err({ icon = 'warn', title, body, detail, actions }) {
  return (
    <div className="err" role="alert">
      <div className="err-head">
        <span className="err-ic"><Icon name={icon} /></span>
        <span><span className="err-title" style={{ display: 'block' }}>{title}</span>{body ? <span className="err-body">{body}</span> : null}</span>
      </div>
      {detail == null ? null : Array.isArray(detail)
        ? <div className="err-detail">{detail.map((l, i) => <div key={i}>{l}</div>)}</div>
        : <pre className="err-detail">{detail}</pre>}
      {actions ? <div className="err-acts">{actions}</div> : null}
    </div>
  );
}

/**
 * .tui: the heads-down terminal frame. lines: arrays of [cls, text] spans
 * (cls one of b k d h a v ok no ask ask-b tl th wr id sel cur), or nodes.
 * Glyphs that must hold a 1ch cell go through <G>.
 */
export function Tui({ lines, label, children, style }) {
  return (
    <div className="tui" role="region" aria-label={label} style={style}>
      {lines ? lines.map((ln, i) => (
        <div key={i} className={ln.isNew ? 'is-new' : undefined}>
          {(ln.spans || ln).map((s, j) => (Array.isArray(s) ? <span key={j} className={s[0] || undefined}>{s[1]}</span> : <span key={j}>{s}</span>))}
        </div>
      )) : children}
    </div>
  );
}

/** .g: a glyph in a fixed 1ch cell, so a font fallback never shifts a column. */
export function G({ children }) {
  return <i className="g">{children}</i>;
}
