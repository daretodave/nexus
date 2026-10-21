// Session rhythm and packaging (Package board): .phases + .ph (the phase
// track), .mtrack (mini, on tiles), .pkg (package PR: forming, blocked,
// ready, opening, opened, merged), .stack (stacked PRs), .retarget,
// .planpr (a plot as a contribution), .basin (the package forming on stage).
import { Icon, Moon } from './icons.jsx';
import { cx } from './controls.jsx';

/**
 * The phase track. phases: [{ key: 'q' | 'w' | 'p', name, meta, state: 'done' | 'now' | undefined,
 * ask, fill: '48%', fillAsk, marks: [{ kind: 'tick' | 'park' | 'ship' | 'bead', at: '18%' }], href, flex }].
 * `end` closes the track (owner: "no package: chunks land on main").
 */
export function Phases({ phases, end, style, label = 'Session phases' }) {
  return (
    <nav className="phases" aria-label={label} style={style}>
      {phases.map((p, i) => {
        const cls = cx('ph', p.key, p.state === 'done' && 'is-done', p.state === 'now' && 'is-now', p.ask && 'is-ask');
        const body = (
          <>
            <span className="ph-head"><span className="ph-dot" /><span className="ph-name">{p.name}</span>{p.meta ? <span className="ph-meta">{p.meta}</span> : null}</span>
            <span className="ph-rail">
              {p.fill ? <span className="fill" style={p.fillAsk ? { width: p.fill, background: 'var(--st-blocked)', boxShadow: 'none' } : { width: p.fill }} /> : null}
              {(p.marks || []).map((m, j) => <span key={j} className={m.kind} style={{ left: m.at }} />)}
            </span>
          </>
        );
        const st = p.flex ? { flex: p.flex } : p.style;
        return p.href
          ? <a key={i} className={cls} href={p.href} style={st} aria-current={p.state === 'now' ? 'step' : undefined}>{body}</a>
          : <div key={i} className={cls} style={st}>{body}</div>;
      })}
      {end ? <span className="ph-end"><Icon name="commit" size={14} />{end}</span> : null}
    </nav>
  );
}

/**
 * .mtrack: the phase track in miniature. items: [{ key: 'q' | 'w' | 'p', label, state: 'done' | 'now' | 'ask', p: '48%' }].
 */
export function MTrack({ items }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div className="mtrack-labels">{items.map((it, i) => <span key={i} className={cx(it.key === 'w' && 'w', (it.state === 'now' || it.state === 'ask') && 'now')}>{it.label}</span>)}</div>
      <div className="mtrack">{items.map((it, i) => <i key={i} className={cx(it.key === 'w' && 'w', it.state === 'done' && 'done', it.state === 'now' && 'now', it.state === 'ask' && 'ask') || undefined} style={it.state === 'now' && it.p ? { '--p': it.p } : undefined} />)}</div>
    </div>
  );
}

/** .pkg-row: an id, a title, a meta. `mark` replaces the id with a park mark. */
export function PkgRow({ id, t, m, mark }) {
  return (
    <div className="pkg-row" style={mark ? { gridTemplateColumns: '14px minmax(0, 1fr) auto' } : undefined}>
      {mark ? <span className={cx('park-mark', mark === 'ok' && 'is-ok', mark === 'changed' && 'is-changed')} /> : <span className="id">{id}</span>}
      <span className="t">{t}</span><span className="m">{m}</span>
    </div>
  );
}

/** .pkg-sec: a labelled column of the package preview. */
export function PkgSec({ k, children }) {
  return <div className="pkg-sec"><span className="pkg-k">{k}</span>{children}</div>;
}

/** .pkg-strip: the two-line ASCII strip (lines of nodes). */
export function PkgStrip({ lines }) {
  return <div className="pkg-strip">{lines.map((l, i) => <div key={i}>{l}</div>)}</div>;
}

/**
 * .pkg. state: ready (default) | forming | blocked | merged. The ready
 * preview is composed from head/strip/grid/retarget/foot children.
 */
export function Pkg({ state, style, children }) {
  return <div className={cx('pkg', state === 'forming' && 'is-forming', state === 'blocked' && 'is-blocked', state === 'merged' && 'is-merged')} style={style}>{children}</div>;
}

/** .pkg-head with the package icon (iconSize 20 for the full card; null for the 16px compact ones). */
export function PkgHead({ icon = 'layers3', iconStyle, iconSize = 20, title, sub, end, align }) {
  return (
    <div className="pkg-head" style={align ? { alignItems: align } : undefined}>
      <span className="pkg-ic" style={iconStyle}>{typeof icon === 'string' ? <Icon name={icon} size={iconSize || undefined} /> : icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}><span className="pkg-title" style={{ display: 'block' }}>{title}</span>{sub ? <span className="pkg-sub">{sub}</span> : null}</span>
      {end}
    </div>
  );
}

/** .retarget: a stacked PR's base, and what happens when it merges. `wait` when the stack is full. */
export function Retarget({ wait, icon = 'refresh2', spin, children, style }) {
  return (
    <div className={cx('retarget', wait && 'is-wait')} style={style}>
      {spin ? <span className="spin" /> : icon ? <Icon name={icon} size={14} /> : null}
      <span>{children}</span>
    </div>
  );
}

/** .stack: at most two deep. bases: [{ content, cls: 's1' | 's2' }] behind the top package. */
export function Stack({ two, bases = [], children }) {
  return (
    <div className={cx('stack', two && 'is-two')}>
      {bases.map((b, i) => <div key={i} className={cx('stack-base', b.cls)}>{b.content}</div>)}
      {children}
    </div>
  );
}

/** .planpr: a plot as a contribution. adds: [{ id, title }]. `landed` is the owner's straight-to-main. */
export function PlanPr({ landed, head, adds = [], children, style }) {
  return (
    <div className={cx('planpr', landed && 'is-landed')} style={style}>
      <div className="planpr-head">{head}</div>
      {adds.map((a) => <div key={a.id} className="planpr-add"><span className="plus">+</span><span className="id">{a.id}</span><span>{a.title}</span></div>)}
      {children}
    </div>
  );
}

/**
 * .basin: the package forming in the stage (contributor), replacing the
 * shipped river. items: [{ id, title, state (moon), color, slot }].
 */
export function Basin({ head, items = [] }) {
  return (
    <div className="basin" aria-label="Package forming">
      <div className="basin-head"><Icon name="package" size={14} /><b>Package</b><span>{head}</span></div>
      <div className="basin-row">
        {items.map((b, i) => (
          <span key={b.id || i} className={cx('pill', b.slot && 'is-slot')}>
            <Moon state={b.state || 'closed'} style={b.color ? { color: b.color } : undefined} />
            <span className="sha">{b.id}</span><span className="msg">{b.title}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** .pkg-node: the package as a node on the stage. */
export function PkgNode() {
  return <span className="pkg-node" style={{ position: 'absolute', left: 0, top: 0, transform: 'translate(-50%, -50%)' }}><Icon name="layers3" size={24} /></span>;
}
