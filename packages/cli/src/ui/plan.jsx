// Plan board kit (PlanKit board): .crow chunk rows (with .plotted-tag,
// .ai-glyph, row actions), .pb-list + .pb-sec, .spec groups with .pct and
// the Chunk it flow, the .crail claims rail, .req-pop and .protect.
import { Icon, Moon } from './icons.jsx';
import { CHUNK_WORD, Grip } from './work.jsx';
import { SessionGlyph, sessClass } from './session.jsx';
import { cx, NavA } from './controls.jsx';

export function SizeTag({ size }) {
  return <span className="size-tag" aria-label={`size ${size}`}>{size}</span>;
}

/** .plotted-tag: "just plotted · plan PR #151"; fades after 40s. */
export function PlottedTag({ children }) {
  return <span className="plotted-tag">{children}</span>;
}

/** .ai-glyph: the description is an AI summary, cached, never in the plan. */
export function AiGlyph({ open, tip = 'Summary written by AI, not in the plan' }) {
  return (
    <button className={cx('ai-glyph', open && 'is-open')} type="button" aria-label={tip}>
      <Icon name="sparkle" /><span className="ai-tip">{tip}</span>
    </button>
  );
}

/**
 * .crow: one chunk in the board. state: ready | claimed | building | review |
 * settled | closed (the moon); `word` overrides the state word ("held").
 * claim: a <Claim> node, or `free` text ("unclaimed"). acts: row action nodes.
 */
export function CRow({ id, title, size, state = 'ready', word, claim, free = 'unclaimed', plotted, ai, covered, closed, hover, bloom, delay, acts, children }) {
  return (
    <div className={cx('crow', `cs-${state}`, closed && 'is-closed', covered && 'is-covered', plotted && 'is-plotted', bloom && 'is-bloom', hover && 'is-hover')} style={delay != null ? { '--d': `${delay}ms` } : undefined}>
      <Grip />
      <Moon state={state} />
      <span className="chunk-id">{id}</span>
      <span className="crow-t"><span className="tt">{title}</span>{ai ? <AiGlyph /> : null}{plotted ? <PlottedTag>{plotted}</PlottedTag> : null}</span>
      <SizeTag size={size} />
      <span className="crow-state">{word ?? CHUNK_WORD[state]}</span>
      {claim ?? <span className="crow-free">{free}</span>}
      {acts ? <div className="crow-acts">{acts}</div> : null}
      {children}
    </div>
  );
}

/** A row action button (.crow-acts .btn): icon + label, ghost unless primary-ish. */
export function RowAct({ icon, children, ghost = true, href, label, onClick }) {
  const cls = cx('btn btn-s', ghost && 'btn-ghost', !children && 'btn-icon');
  if (href) return <NavA className={cls} href={href} aria-label={label}><Icon name={icon} size={14} />{children}</NavA>;
  return <button className={cls} type="button" onClick={onClick} aria-label={label}>{icon ? <Icon name={icon} size={14} /> : null}{children}</button>;
}

export function PbList({ children, style }) {
  return <div className="pb-list" style={style}>{children}</div>;
}

/** .pb-sec: a lane header inside the list ("asap · 2 · pinned on top"). */
export function PbSec({ asap, title, n, d, style }) {
  return <div className={cx('pb-sec', asap && 'is-asap')} style={style}><span className="t-caps c-2">{title}</span>{n != null ? <span className="n">{n}</span> : null}{d ? <span className="d">{d}</span> : null}</div>;
}

/** .pb-fold: "show 12 closed" style toggle. */
export function PbFold({ children, onClick, open }) {
  return <button className="pb-fold" type="button" onClick={onClick} aria-expanded={open}><Icon name="chevronRight" size={14} />{children}</button>;
}

/** .pct: % done as a bar and a count ("2 of 4"). */
export function Pct({ pct, n }) {
  return <div className="pct"><span className="pct-bar"><i style={{ width: `${pct}%` }} /></span><span className="pct-n">{n}</span></div>;
}

/**
 * .spec: a spec with its chunks. `open` turns the chevron; `claimed` rings it.
 * acts: header action nodes; children: the .spec-body rows (or Chunk it).
 * id ("spec-04") makes it a scroll target; the section and toggle are named for it.
 */
export function Spec({ id, name, file, pct, n, open, claimed, acts, onToggle, children }) {
  return (
    <section id={id} className={cx('spec', open && 'is-open', claimed && 'is-claimed')} aria-label={name}>
      <div className="spec-h">
        <button className="spec-tog" type="button" aria-label={`${open ? 'Hide' : 'Show'} chunks of ${name}`} aria-expanded={!!open} onClick={onToggle}><Icon name="chevronRight" size={14} /></button>
        <div className="spec-name"><b>{name}</b>{file ? <span>{file}</span> : null}</div>
        <Pct pct={pct} n={n} />
        <div className="spec-acts">{acts}</div>
      </div>
      {open && children ? children : null}
    </section>
  );
}

export function SpecBody({ children }) {
  return <div className="spec-body">{children}</div>;
}

/** .chunkit: an empty spec's one call to action. */
export function ChunkIt({ onClick, text = 'No chunks yet. nexus asks three short questions, then splits the spec into chunks with acceptance IDs.' }) {
  return (
    <div className="chunkit">
      <span className="cstar is-neutral" />
      <span className="t-body-s c-2" style={{ flex: 1 }}>{text}</span>
      <button className="btn btn-primary" type="button" onClick={onClick}><Icon name="rays8" size={14} />Chunk it</button>
    </div>
  );
}

/** .chunkit-flow: the questions before the chunks. children: CkQ rows; `note` trails the buttons. */
export function ChunkItFlow({ title, onMake, onCancel, note, children }) {
  return (
    <div className="chunkit-flow">
      <span className="t-caps c-2">{title}</span>
      {children}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn btn-primary btn-s" type="button" onClick={onMake}><Icon name="rays8" size={14} />Make the chunks</button>
        <button className="btn btn-ghost btn-s" type="button" onClick={onCancel}>Cancel</button>
        {note ? <span className="t-body-s c-3">{note}</span> : null}
      </div>
    </div>
  );
}

/** .ck-q: a question and its choice (recommended preselected). */
export function CkQ({ q, children }) {
  return <div className="ck-q"><span>{q}</span>{children}</div>;
}

/** .crail: claims by person. */
export function CRail({ cap, children }) {
  return (
    <div className="crail">
      <div className="crail-h"><span className="t-caps c-2">Claims by person</span><span className="tb-spacer" />{cap ? <span className="cap">{cap}</span> : null}</div>
      {children}
    </div>
  );
}

/** .cr-person: av kind you | cloud | undefined (a neutral initial). */
export function CrPerson({ initial, av, name, d, children }) {
  return (
    <div className="cr-person">
      <div className="cr-ph"><span className={cx('cr-av', av && `is-${av}`)}>{initial}</span><span>{name}</span>{d ? <span className="d">{d}</span> : null}</div>
      {children}
    </div>
  );
}

/** .cr-sess: a session's claims (its colour on the left edge); `title` for held/cloud groups. */
export function CrSess({ session, title, state, children }) {
  return (
    <div className={cx('cr-sess', session && sessClass(session))}>
      <div className="cr-sh">{session ? <SessionGlyph session={session} /> : null}<span>{session ? session.name : title}</span><span className="c-3" style={{ fontWeight: 400 }}>{state}</span></div>
      {children}
    </div>
  );
}

/** .cr-claim: id, title, expiry (held | stale | gone), and hover actions; pop: a popover on it (Reassign's picker). */
export function CrClaim({ id, t, exp, expKind, gone, hover, acts, pop }) {
  return (
    <div className={cx('cr-claim', gone && 'is-gone', hover && 'is-hover')}>
      <span className="id">{id}</span><span className="t">{t}</span>
      <span className={cx('exp', expKind && `is-${expKind}`)}>{exp}</span>
      <div className="cr-acts">{acts}</div>
      {pop || null}
    </div>
  );
}

/** .req-pop: why a claim is a request in a protected repo. */
export function ReqPop({ children, onSend, onCancel, style }) {
  return (
    <div className="req-pop" role="dialog" aria-label="About protected claims" style={style}>
      <span className="tip-arrow" style={{ top: -5, right: 64, left: 'auto' }} />
      {children}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-s btn-primary" type="button" onClick={onSend}>Send request</button>
        <button className="btn btn-s btn-ghost" type="button" onClick={onCancel}>Not now</button>
      </div>
    </div>
  );
}

/** .protect: claims are protected; requests go to the owner. */
export function Protect({ children }) {
  return <span className="protect"><Icon name="lockOne" />{children}</span>;
}
