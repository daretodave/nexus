// Fleet kit (FleetKit board): .tile (live, needs you, observing, fallen,
// resuming, resumed, resume failed), .git strip + .git-pop commits,
// .switcher + .sw-item, .train + .car (pause all), .dropzone + .runline
// (recover), .wt rows + .flag (git panel).
import { Icon } from './icons.jsx';
import { SessionGlyph, sessClass } from './session.jsx';
import { CiDot } from './work.jsx';
import { Orb } from './agent.jsx';
import { cx, NavA } from './controls.jsx';

/**
 * The session tile. state: live | asking | observing | fallen (resuming and
 * resumed are live tiles with a relight stage / fresh tag). `session` is
 * { name, kind } for the glyph and --sess; `href` makes the name the link
 * that covers the whole tile (the design's stretched link).
 */
export function Tile({ session, state = 'live', href, repo, badge, stage, stageStyle, info, foot, hover, className, nameStyle }) {
  return (
    <div className={cx('tile', sessClass(session), state === 'asking' && 'is-asking', state === 'observing' && 'is-observing', state === 'fallen' && 'is-fallen', hover && 'is-hover', className)}>
      <div className="tile-head">
        <SessionGlyph session={session} />
        <NavA className="tile-name" href={href} style={{ color: state === 'observing' && session?.kind === 'terminal' ? undefined : 'var(--text)', ...nameStyle }}>{session?.name}</NavA>
        {repo ? <span className="tile-repo">{repo}</span> : null}
        <span className="tb-spacer" />
        {badge}
      </div>
      <div className="tile-stage" style={stageStyle}>{stage}</div>
      <div className="tile-info">{info}</div>
      <div className="tile-foot">{foot}</div>
    </div>
  );
}

/** .tile-new: the dashed "start another session" tile. */
export function TileNew({ children }) {
  return <div className="tile-new">{children}</div>;
}

/** .parked-badge: "3 parked" / "4 waiting". */
export function ParkedBadge({ children, style }) {
  return <span className="parked-badge" style={style}><span className="park-mark" />{children}</span>;
}

/** .tile-chip: pausing (spinner) or paused (check). */
export function TileChip({ paused, children }) {
  return <span className={cx('tile-chip', paused && 'is-paused')}>{paused ? <Icon name="check" size={12} /> : <span className="spin" />}{children ?? (paused ? 'paused' : 'pausing')}</span>;
}

/** .observing: a terminal session, read-only here. */
export function Observing() {
  return <span className="observing"><Icon name="observe" size={12} />observing (terminal)</span>;
}

/** .fresh: a session resumed fresh from its recap. */
export function Fresh() {
  return <span className="fresh"><Icon name="refresh" size={12} />fresh session</span>;
}

/** .fell: where a session fell and when its heartbeat stopped. */
export function Fell({ children, style }) {
  return <div className="fell" style={style}>{children}</div>;
}

/** .tile-bar: the ASCII progress line: [████░░░] label. filled/empty are counts. */
export function TileBar({ filled, empty, label }) {
  return <div className="tile-bar">[<span className="f">{'█'.repeat(filled)}</span><span className="e">{'░'.repeat(empty)}</span>] {label}</div>;
}

/** .tile-chunk: the chunk a tile is on. */
export function TileChunk({ id, title, muted }) {
  return <div className="tile-chunk"><span className="id" style={muted ? { color: 'var(--text-2)' } : undefined}>{id}</span><span className="t" style={muted ? { color: 'var(--text-2)' } : undefined}>{title}</span></div>;
}

/** .tile-event: the latest thing that happened. */
export function TileEvent({ children, flexNone }) {
  return <div className="tile-event" style={flexNone ? { flex: 'none' } : undefined}>{children}</div>;
}

/**
 * .git: the git strip. git: { branch, worktree, up, down, behind, dirty,
 * dirtyLabel (its accessible name, never visible), pr: { num, ci: 'green' |
 * 'red' | 'running' | 'queued' }, noPr, claims }. `open` shows .git-pop with
 * commits [{ sha, m, w }]. variant 'kit' draws FleetKit's icons (branch,
 * worktree, 96px); 'fleet' the Fleet board's tile foot (git, worktree2, 104px).
 * Other props (onMouseEnter, onFocus, tabIndex...) go on the strip.
 */
const GIT_ICONS = { kit: ['branch', 'worktree', 96], fleet: ['git', 'worktree2', 104] };
export function GitStrip({ git = {}, open, commits, brMax, long, onToggle, variant = 'kit', ...rest }) {
  const l = long ? 'tb-long' : undefined;
  const [brIcon, wtIcon, brDefault] = GIT_ICONS[variant] || GIT_ICONS.kit;
  const max = brMax === undefined ? brDefault : brMax;
  const clean = git.dirty ? 'uncommitted changes' : 'clean';
  return (
    <span className={cx('git', open && 'is-open')} aria-label="Git state" onClick={onToggle} {...rest}>
      <span><Icon name={brIcon} /><span className="br" style={max ? { maxWidth: max } : undefined}>{git.branch}</span></span>
      {git.worktree ? <span className={l} aria-label="worktree" title={typeof git.worktree === 'string' ? git.worktree : undefined}><Icon name={wtIcon} /></span> : null}
      <span className="ab"><span className="up">↑{git.up ?? 0}</span> <span className={cx('dn', git.behind && 'is-behind')}>↓{git.down ?? 0}</span></span>
      <span aria-label={git.dirtyLabel || clean}><i className={cx('dirty', !git.dirty && 'is-clean')} /></span>
      {git.pr ? <span className={`ci-${git.pr.ci || 'queued'}`}><CiDot state={git.pr.ci} /><span className="pr">{git.pr.num}</span></span> : git.noPr ? <span className={cx('c-3', l)}>{git.noPr}</span> : null}
      {git.claims != null ? <span className={l} aria-label={`${git.claims} claims`}><Icon name="flag" />{git.claims}</span> : null}
      {open && commits ? (
        <div className="git-pop" role="dialog" aria-label={`Recent commits on ${git.branch}`}>
          {commits.map((c) => <Commit key={c.sha} {...c} />)}
        </div>
      ) : null}
    </span>
  );
}

/** .commit: a row in the git popover or the repo panel. */
export function Commit({ sha, m, w }) {
  return <div className="commit"><span className="sha">{sha}</span><span className="m">{m}</span><span className="w">{w}</span></div>;
}

/** .switcher: the cockpit's session switcher. others: sessions shown as small stars. */
export function Switcher({ session, others = [], open, onClick }) {
  return (
    <button className={cx('switcher', sessClass(session))} type="button" aria-haspopup="menu" aria-expanded={!!open} aria-label="Switch session" onClick={onClick}>
      <SessionGlyph session={session} /><span>{session?.name}</span>
      {others.length ? <span className="others tb-long">{others.map((o) => <SessionGlyph key={o.name} session={o} className={sessClass(o)} />)}</span> : null}
      <Icon name="chevronDown" size={14} />
    </button>
  );
}

/** .sw-item: a session in the switcher menu. */
export function SwItem({ session, current, d, end, href, onClick, role }) {
  const body = <><SessionGlyph session={session} /><span>{session?.name}{d ? <span className="d">{d}</span> : null}</span>{end ?? <span />}</>;
  const cls = cx('sw-item', current && 'is-current', sessClass(session));
  return href
    ? <NavA className={cls} href={href} onClick={onClick} role={role} aria-current={current ? 'page' : undefined} style={{ textDecoration: 'none' }}>{body}</NavA>
    : <div className={cls} onClick={onClick} role={role}>{body}</div>;
}

/**
 * .train: pause all, the reboot train. cars: [{ session, state: 'pausing' | 'paused' | 'skipped', text }].
 * `bare` drops its own live region, for a train inside a TrainDock (which is the status).
 */
export function Train({ cars = [], label = 'Pausing all sessions', bare }) {
  return (
    <div className="train" role={bare ? undefined : 'status'} aria-label={bare ? undefined : label}>
      {cars.map((c) => (
        <div key={c.session.name} className={cx('car', c.state === 'paused' && 'is-paused', c.state === 'skipped' && 'is-skipped', sessClass(c.session))}>
          <span className="car-name"><SessionGlyph session={c.session} size={c.session.kind === 'terminal' ? 14 : undefined} />{c.session.name}</span>
          <span className="car-state">
            {c.state === 'pausing' ? <span className="spin" style={{ width: 12, height: 12 }} /> : c.state === 'paused' ? <Icon name="check" size={14} style={{ color: 'var(--st-done)' }} /> : null}
            {c.text}
          </span>
        </div>
      ))}
    </div>
  );
}

/** .train-dock: the train floating over the fleet while it runs. */
export function TrainDock({ title = 'Pause all · the reboot train', sub, children }) {
  return (
    <div className="train-dock" role="status" aria-label="Pausing all sessions">
      <div className="train-dock-head"><span className="t-title-s">{title}</span>{sub ? <span className="t-body-s c-2">{sub}</span> : null}</div>
      {children}
    </div>
  );
}

/** .dropzone: drop a workflow folder (recover). */
export function Dropzone({ over, onPick, onDrop, onDragOver, onDragLeave, children }) {
  return (
    <div className={cx('dropzone', over && 'is-over')} role="button" tabIndex={0} aria-label="Drop a workflow folder here" onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}>
      {children ?? (
        <>
          <Icon name="fileOne" style={{ width: 28, height: 28, color: 'var(--accent)' }} />
          <span className="t-title-s">Drop a workflow folder</span>
          <span className="t-body-s c-2">Every workflow run keeps a folder of its agents, prompts and results. Drop one here and nexus lays it out as a timeline.</span>
          <button className="btn btn-s" type="button" onClick={onPick}><Icon name="fileOne" size={14} />Pick a folder</button>
        </>
      )}
    </div>
  );
}

/**
 * .runline: a workflow run as a timeline. rows: [{ name, role, state (orb),
 * peek, pre, when, here, never, canResume, cantWhy, onPick, onResume }].
 */
export function Runline({ rows = [], acts }) {
  return (
    <div className={cx('runline', acts && 'has-act')}>
      {rows.map((r, i) => (
        <div key={r.name + i} className={cx('rl-row', r.here && 'is-here', r.never && 'is-never')}>
          {acts ? <button className="rl-pick" type="button" onClick={r.onPick} aria-label={`Select ${r.name}`} /> : null}
          <Orb state={r.never ? 'never' : r.state} size="s" style={{ marginTop: 1 }} />
          <div className="rl-name">{r.name}{r.role ? <span className="d">{r.role}</span> : null}</div>
          <div className="rl-peek">{r.peek}{r.pre ? <pre>{r.pre}</pre> : null}</div>
          <span className="rl-when">{r.when}</span>
          {acts ? (
            <div className="rl-act">
              {r.canResume ? <button className="btn btn-s btn-primary" type="button" onClick={r.onResume}><Icon name="refresh" size={14} />Resume from here</button> : r.cantWhy ? <span className="t-body-s c-3">{r.cantWhy}</span> : null}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** .flag: active | idle | orphan | fallen. */
export function Flag({ kind, children, style }) {
  return <span className={cx('flag', kind && `is-${kind}`)} style={style}>{children}</span>;
}

/** .wt-head: the worktree table header. */
export function WtHead() {
  return <div className="wt-head"><span>session</span><span>branch</span><span className="act">last activity</span><span>age</span><span>state</span><span /></div>;
}

/**
 * .wt: a worktree row. session null for a worktree no session owns.
 * flag: { kind, text }; pr: { num, ci }; tidy marks it for removal.
 */
export function Wt({ session, who, branch, path, act, age, flag, dirty, pr, href, tidy }) {
  return (
    <div className={cx('wt', tidy && 'is-tidy')}>
      <span className="who">
        {session?.kind === 'terminal' ? <Icon name="terminal" size={14} style={{ color: 'var(--sess-term)' }} /> : session ? <SessionGlyph session={session} className={sessClass(session)} /> : <Icon name="worktree2" size={14} style={{ color: 'var(--text-3)' }} />}
        {who ?? session?.name}
      </span>
      <span className="br2"><span className="b">{branch}</span><span className="wt-path">{path}</span></span>
      <span className="act">{act}</span>
      <span className="age">{age}</span>
      <span>{flag ? <Flag kind={flag.kind}>{flag.text}</Flag> : null}</span>
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        {dirty ? <span aria-label="uncommitted changes" title="uncommitted changes"><i className="dirty" /></span> : null}
        {pr ? <span className={`ci-${pr.ci || 'queued'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span className="ci-dot" style={{ width: 10, height: 10 }}>{pr.ci === 'green' ? <Icon name="check" /> : pr.ci === 'red' ? <Icon name="x" /> : null}</span><span className="t-mono-xs">{pr.num}</span></span> : null}
        {href ? <NavA className="btn btn-ghost btn-s btn-icon" href={href} aria-label={`Open ${branch}`}><Icon name="external" size={14} /></NavA> : null}
      </span>
    </div>
  );
}
