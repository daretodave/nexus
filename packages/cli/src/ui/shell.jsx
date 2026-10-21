// App shell (Main/Fleet/Cockpit boards): .app, .topbar (.wordmark .mark,
// .tb-*), .shell, .rail, .view, .panes (.pane-left/.pane-right), .convo +
// .msg, .dock, .ctx layers, .lp, the onboarding frame (.ob + .aurora-field)
// and the heads-down frame (.tui-wrap).
import { createContext, useContext } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './icons.jsx';
import { Orb } from './agent.jsx';
import { cx } from './controls.jsx';
import { PATHS, lastSession } from '../routes.js';

/** What every frame shows from live data: the inbox badge, owner mode, the loop line. */
export const ShellContext = createContext({ inbox: 0, owner: false, repo: '' });
export const useShell = () => useContext(ShellContext);

export function Wordmark({ to = PATHS.fleet, label = 'nexus, the fleet' }) {
  return <Link className="wordmark" to={to} aria-label={label} style={{ color: 'var(--text)', textDecoration: 'none' }}><span className="mark" />nexus</Link>;
}

export const TbSep = () => <span className="tb-sep" />;
export const TbSpacer = () => <span className="tb-spacer" />;
export const TbBadge = ({ children }) => (children ? <span className="tb-badge">{children}</span> : null);

/** .tb-title: the view's name, then a longer line that folds below 1240px. */
export function TbTitle({ title, sub }) {
  return <span className="tb-title"><b>{title}</b>{sub ? <span className="tb-long">{sub}</span> : null}</span>;
}

export function Topbar({ children }) {
  return <header className="topbar">{children}</header>;
}

const RAIL = [
  { id: 'fleet', label: 'Fleet', icon: 'fleet', cockpitIcon: 'fleetRound' },
  { id: 'cockpit', label: 'Cockpit', icon: 'eye', cockpitIcon: 'orbit' },
  { id: 'heads', label: 'Heads-down', icon: 'terminal', cockpitIcon: 'terminalBox' },
  { id: 'inbox', label: 'Oversight', icon: 'inbox', cockpitIcon: 'inbox2', badge: true },
  { id: 'board', label: 'Plan', icon: 'list', cockpitIcon: 'list2' },
  { id: 'cloud', label: 'Cloud', icon: 'cloud', cockpitIcon: 'cloud2' },
  { id: 'git', label: 'Git', icon: 'git', cockpitIcon: 'branch' },
  null,
  { id: 'settings', label: 'Settings', icon: 'sliders', cockpitIcon: 'sliders2' },
];

function railHref(id) {
  if (id === 'cockpit') { const s = lastSession(); return s ? PATHS.cockpit(s) : PATHS.fleet; }
  const p = PATHS[id];
  return typeof p === 'function' ? p() : p;
}

/** .rail: the views. `variant="cockpit"` draws the cockpit board's icon set. */
export function Rail({ current, badge, variant }) {
  const shell = useShell();
  const n = badge ?? shell.inbox;
  return (
    <nav className="rail" aria-label="Views">
      {RAIL.map((r, i) => (r === null ? <span className="rail-spacer" key={`sp${i}`} /> : (
        <Link key={r.id} className={cx('rail-item', current === r.id && 'is-current')} to={railHref(r.id)} aria-current={current === r.id ? 'page' : undefined}>
          <Icon name={variant === 'cockpit' ? r.cockpitIcon : r.icon} /><span>{r.label}</span>
          {r.badge && n > 0 ? <span className="rail-badge">{n}</span> : null}
        </Link>
      )))}
    </nav>
  );
}

/** .app: topbar, optional phase track, then the shell (rail + the view). */
export function AppFrame({ topbar, phases, current, railVariant, hushed, children }) {
  return (
    <div className={cx('app', hushed && 'is-hushed')}>
      {topbar}
      {phases}
      <div className="shell">
        <Rail current={current} variant={railVariant} />
        {children}
      </div>
    </div>
  );
}

/** The Oversight button most views carry in the topbar. */
export function InboxBtn() {
  const { inbox } = useShell();
  return <Link className="btn btn-s" to={PATHS.inbox}><Icon name="inbox" size={14} />Oversight<TbBadge>{inbox || null}</TbBadge></Link>;
}

/** A plain view: wordmark, title, spacer, actions; then rail + main.view. */
export function ViewFrame({ current, title, sub, actions, label, children }) {
  const topbar = (
    <Topbar>
      <Wordmark />
      <TbSep />
      <TbTitle title={title} sub={sub} />
      <TbSpacer />
      {actions}
    </Topbar>
  );
  return (
    <AppFrame topbar={topbar} current={current}>
      <main className="view" aria-label={label || title}>{children}</main>
    </AppFrame>
  );
}

/** .view-head: the view's controls row. */
export function ViewHead({ children, style }) {
  return <div className="view-head" style={style}>{children}</div>;
}

export function ViewTitle({ title, sub }) {
  return <div className="view-title">{title}{sub ? <span className="view-sub">{sub}</span> : null}</div>;
}

/** .panes: the cockpit's two halves. hasRoute moves the tray tether up with a routed composer. */
export function Panes({ hasRoute, children }) {
  return <div className={cx('panes', hasRoute && 'has-route')}>{children}</div>;
}

export function PaneLeft({ children, label = 'Conversation and context', tether }) {
  return <section className="pane-left" aria-label={label}>{children}{tether ? <span className="tether-l" aria-hidden="true" /> : null}</section>;
}

export function PaneRight({ children, label = 'Agent stage' }) {
  return <section className="pane-right" aria-label={label}>{children}</section>;
}

/** .convo: the conversation, newest at the bottom, fading out at the top. */
export function Convo({ children }) {
  return <div className="convo" aria-live="polite">{children}</div>;
}

/** .msg: an agent's message with its orb, name, time, text and tool rows. */
export function Msg({ state = 'thinking', name, time, text, tools }) {
  return (
    <div className="msg">
      <Orb state={state} size="s" style={{ marginTop: 1 }} />
      <div style={{ minWidth: 0 }}>
        <div className="msg-meta"><b>{name}</b><span>{time}</span></div>
        {text ? <p className="msg-text">{text}</p> : null}
        {tools ? <div className="msg-tools">{tools}</div> : null}
      </div>
    </div>
  );
}

/** .msg-you: your note, right-aligned; `pinned` adds the tag. */
export function MsgYou({ time, text, pinned }) {
  return (
    <div className="msg-you">
      <div className="msg-meta" style={{ margin: 0 }}><b>you</b><span>{time}</span></div>
      <div className="bubble">{text}</div>
      {pinned ? <span className="pinned-tag"><Icon name="pinNote" size={12} />Pinned · read on the next step</span> : null}
    </div>
  );
}

/** .dock: tray, context strip, composer, pinned to the bottom of the left pane. */
export function Dock({ children }) {
  return <div className="dock">{children}</div>;
}

/**
 * .ctx: what this session knows, as receding layers.
 * layers: [{ k, v, m, depth: 1..5, pin, strata: [s1, s2, s3] }].
 */
export function Ctx({ layers = [], short }) {
  return (
    <div className={cx('ctx', short && 'is-short')} aria-label="What this session knows">
      {layers.map((c, i) => (
        <div key={c.k + i} className={cx('ctx-layer', c.depth > 1 && `d${c.depth}`, c.pin && 'ctx-pin')}>
          <span className="ctx-k">{c.k}</span>
          <span className="ctx-v">
            {c.strata ? <span className="strata" aria-hidden="true">{c.strata.map((w, j) => <i key={j} style={{ width: w }} />)}<i className="room" /></span> : null}
            <span className="trunc">{c.v}</span>
          </span>
          <span className="ctx-m">{c.m}</span>
        </div>
      ))}
    </div>
  );
}

/** .lp: a left-pane page (Questions start/end, Package): title, sub, body. */
export function Lp({ title, sub, children }) {
  return (
    <div className="lp">
      <div><h2 className="lp-title">{title}</h2>{sub ? <p className="lp-sub">{sub}</p> : null}</div>
      {children}
    </div>
  );
}

/** The aurora behind onboarding. */
export function AuroraField({ rays = true }) {
  return (
    <div className="aurora-field" aria-hidden="true">
      <div className="aurora-blob b1" /><div className="aurora-blob b2" /><div className="aurora-blob b3" />
      {rays ? <div className="aurora-rays" /> : null}
    </div>
  );
}

/** .ob: the onboarding frame. top: wordmark + stepper; foot: back/next. */
export function Ob({ top, foot, children, aurora = true }) {
  return (
    <div className="ob">
      {aurora ? <AuroraField /> : null}
      {top ? <div className="ob-top">{top}</div> : null}
      <main className="ob-main">{children}</main>
      {foot ? <div className="ob-foot">{foot}</div> : null}
    </div>
  );
}

/** .tui-wrap: heads-down, the terminal view, centred on the page. */
export function TuiWrap({ children, aurora }) {
  return <div className="tui-wrap">{aurora ? <AuroraField rays={false} /> : null}{children}</div>;
}

/** .panel: a frosted card (onboarding). */
export function Panel({ children, className, style }) {
  return <div className={cx('panel', className)} style={style}>{children}</div>;
}

/** .kicker: a mono line above a title. */
export function Kicker({ children }) {
  return <span className="kicker">{children}</span>;
}
