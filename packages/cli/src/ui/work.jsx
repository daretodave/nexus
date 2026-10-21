// Work units (WorkUnits board): .chunk (cs-ready … cs-closed), .acc,
// .line-tag, .claim (session, cloud, stale, releasing, held, other), .log
// rows with .diff, .diffstat, and the .pill family (commit, PR, CI).
import { Icon, Moon } from './icons.jsx';
import { SessionGlyph, sessClass } from './session.jsx';
import { cx } from './controls.jsx';

/** Chunk states and their words. settled and closed share the full moon. */
export const CHUNK_WORD = { ready: 'ready', claimed: 'claimed', building: 'building', review: 'in review', settled: 'closed', closed: 'closed', held: 'held' };

export function Grip({ dots }) {
  return <span className="grip" aria-hidden="true">{dots ? <Icon name="grip2" className="ic-fill" /> : <Icon name="grip" size={12} />}</span>;
}

/** .acc: an acceptance id; met ones carry a check. */
export function Acc({ id, met }) {
  return <span className={cx('acc', met && 'is-met')}>{met ? <Icon name="check" size={12} /> : null}{id}</span>;
}

/** .line-tag: place in line (asap gets the accent edge and a bolt). */
export function LineTag({ asap, children }) {
  return <span className={cx('line-tag', asap && 'is-asap')}>{asap ? <Icon name="bolt" size={12} /> : null}{children ?? (asap ? 'asap' : 'anytime')}</span>;
}

/**
 * .chunk card. state: ready | claimed | building | review | settled | closed.
 * acc: [{ id, met }]; foot: nodes. `dragging` tilts it; `ghost` is the drop slot.
 */
export function Chunk({ id, state = 'ready', title, spec, acc, foot, dragging, grip, hover, children }) {
  return (
    <article className={cx('chunk', `cs-${state}`, dragging && 'is-dragging', hover && 'is-hover')}>
      <div className="chunk-top">{grip ? <Grip dots /> : null}<span className="chunk-id">{id}</span><span className="chunk-state"><Moon state={state} />{CHUNK_WORD[state]}</span></div>
      {title ? <h3 className="chunk-title">{title}</h3> : null}
      {spec ? <p className="chunk-spec">{spec}</p> : null}
      {acc && acc.length ? <div className="chunk-acc">{acc.map((a) => <Acc key={a.id} {...a} />)}</div> : null}
      {foot ? <div className="chunk-foot">{foot}</div> : null}
      {children}
    </article>
  );
}

/** The drop slot while reordering: outlined, says where it lands. */
export function ChunkGhost({ children, style }) {
  return <div className="chunk is-ghost" style={{ height: 112, display: 'grid', placeItems: 'center', ...style }}><span className="t-body-s c-3">{children}</span></div>;
}

/**
 * .claim: who holds a chunk.
 * holder: { kind: 'local' | 'terminal' (a session), 'cloud', 'held', 'other', name, initial }
 * state: undefined | 'stale' | 'releasing'.
 */
export function Claim({ holder = {}, who, since, state, onRelease, releaseHover, className, cloudIcon = 'cloud2' }) {
  const k = holder.kind;
  const sess = k === 'local' || k === 'terminal' ? holder : null;
  const cls = cx('claim', sess && sessClass(sess), k === 'cloud' && 'is-cloud', k === 'held' && 'is-held', k === 'other' && 'is-other', state && `is-${state}`, className);
  let av;
  if (state === 'releasing') av = <span className="spin" style={{ width: 10, height: 10, borderWidth: 1.5 }} />;
  else if (sess) av = <SessionGlyph session={sess} style={{ width: 11, height: 11 }} />;
  else if (k === 'cloud') av = <Icon name={cloudIcon} />;
  else if (k === 'held') av = <Icon name="hold" style={{ width: 11, height: 11 }} />;
  else if (k === 'other') av = <span>{holder.initial || (holder.name || '?').slice(0, 1)}</span>;
  return (
    <span className={cls}>
      <span className="claim-av">{av}</span>
      <span className="claim-who">{who ?? holder.name}</span>
      {since ? <span className="claim-since">{since}</span> : null}
      {onRelease ? <button className={cx('claim-release', releaseHover && 'is-hover')} type="button" onClick={onRelease}>{state === 'stale' ? null : <Icon name="lockOpen" size={12} />}Release</button> : null}
    </span>
  );
}

/** .diffstat with a five-cell bar. */
export function DiffStat({ add, del }) {
  const total = (add || 0) + (del || 0);
  const a = total ? Math.round((5 * (add || 0)) / total) : 0;
  return (
    <span className="diffstat">
      <span className="add">+{add}</span><span className="del">−{del}</span>
      <span className="diffbar">{[0, 1, 2, 3, 4].map((i) => <i key={i} className={i < a ? 'a' : total ? 'd' : undefined} />)}</span>
    </span>
  );
}

/**
 * .diff: a peek at a change. lines: [{ kind: 'hunk' | 'add' | 'del' | 'ctx', ln, text }].
 */
export function Diff({ file, stat, lines = [] }) {
  return (
    <div className="diff">
      <div className="diff-head"><b>{file}</b>{stat ? <span>{stat}</span> : null}</div>
      {lines.map((l, i) => (
        <div key={i} className={cx('dl', l.kind === 'hunk' && 'dl-hunk', l.kind === 'add' && 'dl-add', l.kind === 'del' && 'dl-del')}>
          <span className="ln">{l.ln ?? ''}</span>
          <span className="sg">{l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : l.kind === 'hunk' ? '' : ' '}</span>
          <span>{l.text}</span>
        </div>
      ))}
    </div>
  );
}

/** The cockpit board's tool glyphs (its TI table), verbatim; aliases share a glyph. */
export const TOOL_GLYPH = {
  Read: 'M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8zM14 3.5V8h4.5',
  Edit: 'M5 19.5l1-4.5L15.8 5.2a2.1 2.1 0 0 1 3 3L9 18z',
  Grep: 'M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM20 20l-4.5-4.5',
  Task: 'M12 3.8a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4zM6 15.8a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4zM18 15.8a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4zM12 8.2v3.3M12 11.5 6.8 16M12 11.5l5.2 4.5',
  Bash: 'M5.5 4.5h13A2.5 2.5 0 0 1 21 7v10a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17V7a2.5 2.5 0 0 1 2.5-2.5zM7 9.5l3 2.5-3 2.5M12.5 15H17',
};
const GLYPH_ALIAS = { Write: 'Edit', MultiEdit: 'Edit', NotebookEdit: 'Edit', Glob: 'Grep', Agent: 'Task' };
/** The board glyph for a tool name (Read's for any tool it does not draw). */
export const toolGlyph = (tool) => TOOL_GLYPH[tool] || TOOL_GLYPH[GLYPH_ALIAS[tool]] || TOOL_GLYPH.Read;

/** Tool name to its log icon. */
export const TOOL_ICON = { Read: 'file', Edit: 'pen', Write: 'pen', MultiEdit: 'pen', Task: 'runMode', Agent: 'runMode', Grep: 'eye', Glob: 'eye' };

/**
 * .log row: a tool call. state: undefined | 'running' | 'failed'.
 * `open` shows the body (a Diff, usually). `d` draws a raw glyph path (the
 * cockpit board's tool glyphs, TOOL_GLYPH) in place of a named icon.
 */
export function LogRow({ tool, args, meta, dur, state, open, onToggle, icon, d, hover, children }) {
  const ic = state === 'running' ? <span className="spin" aria-hidden="true" />
    : state === 'failed' ? <Icon name="xSmall" size={14} className="log-ic" />
      : d ? <Icon d={d} size={14} className="log-ic" />
        : <Icon name={icon || TOOL_ICON[tool] || 'prompt'} size={14} className="log-ic" />;
  return (
    <div className={cx('log', open && 'is-open', state && `is-${state}`, hover && 'is-hover')}>
      <button className="log-row" type="button" aria-expanded={!!open} onClick={onToggle}>
        <Icon name="chevronSmall" size={14} className="log-chev" />{ic}
        <span className="log-tool">{tool}</span><span className="log-args">{args}</span>
        {meta ?? <span />}<span className="log-dur">{dur}</span>
      </button>
      {open && children ? <div className="log-body">{children}</div> : null}
    </div>
  );
}

/** .pill: a commit. */
export function CommitPill({ sha, msg, when, style }) {
  return <span className="pill" style={style}><Icon name="commit" /><span className="sha">{sha}</span>{msg ? <span className="msg">{msg}</span> : null}{when ? <span className="when">{when}</span> : null}</span>;
}

const PR_ICON = { open: 'contrib', draft: 'prDraft', merged: 'prMerged', closed: 'prClosed' };

/** .pill-pr. state: open | draft | merged | closed. */
export function PrPill({ num, state = 'open', msg, icon, style }) {
  return <span className={cx('pill pill-pr', `is-${state}`)} style={style}><Icon name={icon || PR_ICON[state]} /><span className="num">{num}</span>{msg ? <span className="msg">{msg}</span> : null}</span>;
}

/** .ci-dot by state: queued (dashed ring), running (arc), green (disc + check), red (square + cross). */
export function CiDot({ state }) {
  return <span className="ci-dot">{state === 'green' ? <Icon name="check" /> : state === 'red' ? <Icon name="x" /> : null}</span>;
}

/** .pill-ci. state: queued | running | green | red. */
export function CiPill({ state = 'queued', children }) {
  return <span className={`pill pill-ci ci-${state}`}><CiDot state={state} />{children ?? state}</span>;
}
