// Controls (Controls board): .btn*, .kbd, .field, .seg, .check, .switch,
// .owner, .mode-chip, .chip, .tip, .menu, .pause-btn, .loop-status.
// Class names are the design's; props only pick which classes apply.
import { useId } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';
import { Icon } from './icons.jsx';

export const cx = (...a) => a.flat().filter(Boolean).join(' ');

/**
 * A link that stays in the app: an in-app path ("/s/vega") renders a router
 * <Link>, so a click never reloads the page; anything else (an external URL,
 * "#id", or no router around it) is a plain <a>.
 */
export function NavA({ href, children, ...rest }) {
  const inRouter = useInRouterContext();
  if (inRouter && typeof href === 'string' && href.startsWith('/') && !href.startsWith('//')) {
    return <Link to={href} {...rest}>{children}</Link>;
  }
  return <a href={href} {...rest}>{children}</a>;
}

/**
 * .btn. variant: primary | ghost | warn | danger; size: s | l | xl.
 * `icon` makes a square .btn-icon. Renders <a> when `href` is set.
 */
export function Btn({ variant, size, icon, href, className, type = 'button', children, ...rest }) {
  const cls = cx('btn', variant && `btn-${variant}`, size && `btn-${size}`, icon && 'btn-icon', className);
  if (href) return <NavA className={cls} href={href} {...rest}>{children}</NavA>;
  return <button className={cls} type={type} {...rest}>{children}</button>;
}

export function Kbd({ children }) {
  return <span className="kbd">{children}</span>;
}

/** .field: an input, or a textarea with `multiline`. */
export function Field({ multiline, className, ...rest }) {
  return multiline ? <textarea className={cx('field', className)} {...rest} /> : <input className={cx('field', className)} {...rest} />;
}

export function Label({ htmlFor, children }) {
  return <label className="label" htmlFor={htmlFor}>{children}</label>;
}

export function Hint({ children, style }) {
  return <span className="hint" style={style}>{children}</span>;
}

/** .seg: radios drawn as a segmented control. options: [{ value, label, icon? }]. */
export function Seg({ options, value, onChange, label, name }) {
  const auto = useId();
  const group = name || `seg-${auto}`;
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const id = `${group}-${o.value}`;
        return [
          <input key={`i-${o.value}`} type="radio" name={group} id={id} checked={value === o.value} onChange={() => onChange?.(o.value)} />,
          <label key={`l-${o.value}`} htmlFor={id}>{o.icon ? <Icon name={o.icon} size={14} /> : null}{o.label}</label>,
        ];
      })}
    </div>
  );
}

/** .choice with radios (route chooser, plan-it-or-do-it). */
export function Choice({ options, value, onChange, label, name }) {
  const auto = useId();
  const group = name || `choice-${auto}`;
  return (
    <span className="choice" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const id = `${group}-${o.value}`;
        return [
          <input key={`i-${o.value}`} type="radio" name={group} id={id} checked={value === o.value} onChange={() => onChange?.(o.value)} />,
          <label key={`l-${o.value}`} htmlFor={id}>{o.label}</label>,
        ];
      })}
    </span>
  );
}

/** .choice drawn with buttons, for lists from data (sort, filter, place in line). */
export function ChoiceButtons({ options, value, onChange, label, multi }) {
  const on = (v) => (multi ? (value || []).includes(v) : value === v);
  return (
    <div className="choice" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" title={o.title} className={cx(on(o.value) && 'is-on', o.asap && 'is-asap')} aria-pressed={on(o.value)} onClick={() => onChange?.(o.value)}>
          {o.icon ? <Icon name={o.icon} /> : null}{o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * .check: a checkbox with title and sub. `managed` draws the dashed
 * "decided by size" box with its dash; `small` is .check-s.
 */
export function Check({ checked, onChange, title, sub, badge, managed, disabled, small, focus }) {
  return (
    <label className={cx('check', small && 'check-s', managed && 'is-managed', disabled && 'is-disabled', focus && 'is-focus')}>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
      <Icon name="check" className="tick" />
      {managed ? <span className="auto" /> : null}
      <span className="check-text">
        <span className="check-title">{title}{badge ? <> {badge}</> : null}</span>
        {sub ? <span className="check-sub">{sub}</span> : null}
      </span>
    </label>
  );
}

export function BadgeAuto({ children }) {
  return <span className="badge-auto">{children}</span>;
}

export function BadgeDef({ children }) {
  return <span className="badge-def">{children}</span>;
}

/** The ⓘ button that opens a tip; it keeps its hover look while the tip is open. */
export function InfoBtn({ label, open, onClick, icon = 'info' }) {
  return (
    <button className={cx('info-btn', open && 'is-hover')} type="button" aria-label={label} aria-expanded={!!open} onClick={onClick}>
      <Icon name={icon} />
    </button>
  );
}

/** .tip: a floating explanation (static = in flow). rows: [{ text, cost: 0..3, costLabel }]. */
export function Tip({ rows, arrowLeft, staticPos, style, children }) {
  return (
    <div className={cx('tip', staticPos && 'tip-static')} role="tooltip" style={style}>
      <span className="tip-arrow" style={arrowLeft != null ? { left: arrowLeft } : undefined} />
      {rows ? rows.map((r, i) => (
        <div className="tip-row" key={i}>
          <span>{r.text}</span>
          {r.cost != null ? <span className="cost" aria-label={r.costLabel}>{[0, 1, 2].map((k) => <i key={k} className={k < r.cost ? 'on' : undefined} />)}</span> : null}
        </div>
      )) : children}
    </div>
  );
}

/** .switch: the owner-mode switch (lock closed when on). */
export function Switch({ checked, onChange, title, sub, focus, iconOn = 'lock', iconOff = 'lockOpen' }) {
  return (
    <label className={cx('switch', focus && 'is-focus')}>
      <input type="checkbox" role="switch" checked={!!checked} onChange={(e) => onChange?.(e.target.checked)} />
      <span className="track"><span className="knob"><Icon name={iconOn} className="k-on" /><Icon name={iconOff} className="k-off" /></span></span>
      <span className="switch-text"><span className="switch-title">{title}</span>{sub ? <span className="switch-sub">{sub}</span> : null}</span>
    </label>
  );
}

/** .owner: "Whose checkout is this?" two-way radio (onboarding Shape). value: 'owner' | 'contrib'. */
export function OwnerPick({ value, onChange, label = 'Whose checkout is this?', name }) {
  const auto = useId();
  const group = name || `owner-${auto}`;
  return (
    <div className="owner" role="radiogroup" aria-label={label}>
      <input className="o-own" type="radio" name={group} id={`${group}-own`} checked={value === 'owner'} onChange={() => onChange?.('owner')} />
      <label htmlFor={`${group}-own`}><Icon name="lockOne" /><span className="o-text"><span className="o-title">Mine</span><span className="o-sub">Owner: push straight to main</span></span></label>
      <input className="o-con" type="radio" name={group} id={`${group}-con`} checked={value === 'contrib'} onChange={() => onChange?.('contrib')} />
      <label htmlFor={`${group}-con`}><Icon name="contribOne" /><span className="o-text"><span className="o-title">Someone else's</span><span className="o-sub">Contributor: open pull requests</span></span></label>
    </div>
  );
}

/** .mode-chip: solid with a lock (owner), dashed with a PR mark (contributor). `compact` folds to the icon. */
export function ModeChip({ owner, compact, long = true }) {
  if (owner) {
    return (
      <span className="mode-chip is-owner" aria-label={compact ? 'Owner mode' : undefined} style={compact ? { padding: '0 8px' } : undefined}>
        <Icon name="lock" size={14} />{compact ? null : <>Owner{long ? <span className="tb-long"> · pushes to main</span> : null}</>}
      </span>
    );
  }
  return (
    <span className="mode-chip is-contrib" aria-label={compact ? 'Contributor' : undefined} style={compact ? { padding: '0 8px' } : undefined}>
      <Icon name="contrib" size={14} />{compact ? null : <>Contributor{long ? <span className="tb-long"> · opens PRs</span> : null}</>}
    </span>
  );
}

/** .chip: an attached file. state: undefined | 'loading' | 'error'. */
export function FileChip({ name, meta, state, icon = 'file', onRemove }) {
  return (
    <span className={cx('chip', state && `is-${state}`)}>
      <Icon name={icon} />
      <span className="chip-name">{name}</span>
      {meta ? <span className="chip-meta">{meta}</span> : null}
      {onRemove ? <button className="chip-x" type="button" aria-label={`Remove ${name}`} onClick={onRemove}><Icon name="x" size={12} /></button> : null}
    </span>
  );
}

/** .menu with .menu-item rows. items: [{ icon, label, desc, active, onSelect, sep, role }]. */
export function Menu({ head, items, label, style, role = 'menu' }) {
  return (
    <div className="menu" role={role} aria-label={label} style={style}>
      {head ? <div className="menu-head"><span className="t-caps c-2">{head}</span></div> : null}
      {items.map((it, i) => it.sep ? <div className="menu-sep" key={`s${i}`} /> : (
        <button key={it.key || i} className={cx('menu-item', it.active && 'is-active')} type="button" role={it.role || 'menuitem'} aria-checked={it.role === 'menuitemradio' ? !!it.active : undefined} onClick={it.onSelect}>
          {it.icon ? <Icon name={it.icon} /> : <span />}
          <span>{it.label}{it.desc ? <span className="d">{it.desc}</span> : null}</span>
          {it.end ?? <span />}
        </button>
      ))}
    </div>
  );
}

/**
 * .pause-btn. state: 'run' (Pause / after this step), 'pausing' (spinner,
 * names the step), 'paused' (Resume, gradient: the one place it means go).
 */
export function PauseBtn({ state = 'run', label, sub, onClick, subLong }) {
  const paused = state === 'paused';
  const text = label ?? (paused ? 'Resume' : state === 'pausing' ? 'Pausing' : 'Pause');
  return (
    <button className={cx('pause-btn', paused && 'is-paused')} type="button" onClick={onClick} aria-busy={state === 'pausing' || undefined}>
      <span className="pb-ic">{state === 'pausing' ? <span className="spin" /> : <Icon d={paused ? 'M8 5.5v13l10-6.5z' : 'M9 6v12M15 6v12'} />}</span>
      <span className="pb-text">{text}{sub ? <span className={cx('pb-sub', subLong && 'tb-long')}>{sub}</span> : null}</span>
    </button>
  );
}

/** .loop-status: the cloud loop dot. `paused` hollows the dot. */
export function LoopStatus({ paused, children, longLabel = true }) {
  return (
    <span className="loop-status">
      <span className={cx('loop-dot', paused && 'is-paused')} />
      <span><b className={longLabel ? 'tb-long' : undefined}>Cloud loop </b>{children}</span>
    </span>
  );
}

/** .explain: the well that says what a setting does. */
export function Explain({ children }) {
  return <div className="explain">{children}</div>;
}

export function FileTag({ children }) {
  return <span className="file-tag">{children}</span>;
}

/** .absent: says a control is not rendered here, and why (sheets and settings). */
export function Absent({ children, style }) {
  return <div className="absent" style={style}><Icon name="minus" size={14} />{children}</div>;
}
