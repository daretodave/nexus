// Agent node and filaments (AgentNode board) and the stage they live on:
// .orb (every st-* state, sizes xl..xs, .is-main, .is-relight), .node-cap,
// .junction, .fil (flow particles, workflow dash, quiet, tug), .snode,
// .stage + .starfield, .river, .drop.
import { Icon } from './icons.jsx';
import { cx } from './controls.jsx';

/** The glyph inside each orb state; idle, fallen, never and relight carry none. */
export const ORB_GLYPH = {
  thinking: { name: 'dots', stroke: 4, strokeS: 4.5 },
  tool: { name: 'prompt' },
  writing: { name: 'pen' },
  blocked: { name: 'question' },
  done: { name: 'tick' },
  failed: { name: 'xSmall' },
};

/** The word under each state (node-tag). blocked reads "asking". */
export const STATE_WORD = { idle: 'idle', thinking: 'thinking', tool: 'tool', writing: 'writing', blocked: 'asking', done: 'done', failed: 'failed', fallen: 'fallen' };

/**
 * .orb. state: idle | thinking | tool | writing | blocked | done | failed |
 * fallen | never; size: xl | l | m | s | xs, or a pixel `px` (--size).
 * `relight` draws the resume animation (the cracks seal).
 */
export function Orb({ state = 'idle', size, px, main, relight, gap, className, style, label }) {
  const g = relight ? null : ORB_GLYPH[state];
  const cls = cx('orb', size && `orb-${size}`, !relight && `st-${state}`, main && 'is-main', relight && 'is-relight', className);
  const st = { ...(px ? { '--size': `${px}px` } : null), ...(gap != null ? { '--gap': gap } : null), ...style };
  const sw = g?.stroke ? (size === 's' ? g.strokeS || g.stroke : g.stroke) : null;
  return (
    <span className={cls} style={Object.keys(st).length ? st : undefined} role={label ? 'img' : undefined} aria-label={label}>
      {g && size !== 'xs' ? <Icon name={g.name} style={sw ? { strokeWidth: sw } : undefined} /> : null}
    </span>
  );
}

/** .node-tag: the state word in its colour. */
export function NodeTag({ state }) {
  return <span className="node-tag" style={{ color: `var(--st-${state})` }}>{STATE_WORD[state] || state}</span>;
}

/** .node-cap: task above, live tool below in mono; never more than two lines. */
export function NodeCap({ label, tool, toolBad, spinning, style }) {
  return (
    <div className="node-cap" style={style}>
      {label ? <span className="node-label">{label}</span> : null}
      {tool ? <span className={cx('node-tool', toolBad && 'is-bad')} style={toolBad ? { color: 'var(--st-failed)' } : undefined}>{spinning ? <span className="spin" style={{ width: 10, height: 10, borderWidth: 1.5 }} /> : null}{tool}</span> : null}
    </div>
  );
}

/** .junction: the workflow fan-out point. */
export function Junction({ style }) {
  return <span className="junction" style={style} />;
}

/** .park-mark on a node: a question parked with its default. */
export function ParkMark({ changed, ok, style }) {
  return <span className={cx('park-mark', ok && 'is-ok', changed && 'is-changed')} style={style} />;
}

/** .fresh-mark: a session resumed fresh, from its recap. */
export function FreshMark({ style }) {
  return <span className="fresh-mark" style={style} />;
}

/**
 * .fil: a box whose corners are two node centres; the svg stretches to it.
 * l/t/w/h are CSS lengths; d is the path in the 100x100 box.
 * kind: undefined (delegated) | 'flow' (workflow dash) | 'quiet' | 'tug'.
 */
export function Fil({ l, t, w, h, d, flow, kind, className, style }) {
  return (
    <div className={cx('fil', kind && `is-${kind}`, className)} style={{ left: l, top: t, width: w, height: h, ...style }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path d={d} />
        {flow ? <path className="flow" d={d} /> : null}
      </svg>
    </div>
  );
}

/** .snode: a zero-size anchor on the stage; the orb centres on it, the caption hangs below (capUp: above). */
export function SNode({ x, y, capUp, atTray, className, children, style }) {
  return <div className={cx('snode', capUp && 'cap-up', atTray && 'at-tray', className)} style={{ left: x, top: y, ...style }}>{children}</div>;
}

export function Starfield() {
  return <div className="starfield" />;
}

/** .stage: the night sky the agents live on. `hushed` while a question is pending (only the tug moves). */
export function Stage({ hushed, className, style, children, label }) {
  return (
    <div className={cx('stage', hushed && 'is-hushed', className)} style={style} aria-label={label}>
      <Starfield />
      {children}
    </div>
  );
}

export function StageLabel({ title = 'Agent stage', cap }) {
  return <div className="stage-label"><span className="t-caps c-2">{title}</span>{cap ? <span className="cap">{cap}</span> : null}</div>;
}

/** .stage-legend: items [{ state, label }] as small orbs with words. */
export function StageLegend({ items }) {
  return (
    <div className="stage-legend">
      {items.map((it) => <span key={it.label}><Orb state={it.state} size="xs" />{it.label}</span>)}
    </div>
  );
}

/** .river: shipped commits flowing along the bottom of the stage (owner sessions). */
export function River({ label = 'Shipped to main', cap, children }) {
  return (
    <div className="river" aria-label={label}>
      <svg className="river-wave" viewBox="0 0 100 18" preserveAspectRatio="none" aria-hidden="true"><path d="M0 9C10 3 20 15 30 9S50 3 60 9 80 15 100 9" /><path d="M0 12C12 7 24 16 36 11S60 6 72 11 90 15 100 11" /></svg>
      <span className="river-label"><span className="t-caps c-2">{label}</span>{cap ? <span className="cap">{cap}</span> : null}</span>
      <div className="river-flow">{children}</div>
    </div>
  );
}

/** .drop: a commit falling into the river as a chunk lands. */
export function Drop({ x = '50%', y = '63%', children }) {
  return <div className="drop" style={{ left: x, top: y }}>{children}</div>;
}
