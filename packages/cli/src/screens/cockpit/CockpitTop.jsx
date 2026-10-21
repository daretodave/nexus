// The cockpit's top bar (Cockpit board header): wordmark, session switcher
// (FleetKit's menu), repo, git strip, then owner/contributor chip, run mode,
// the cloud loop and the pause button.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Flag, GitStrip, Icon, LoopStatus, Menu, ModeChip, ParkedBadge, PauseBtn, SessionGlyph, Switcher, Topbar, Wordmark, cx, sessClass,
} from '../../ui/index.js';
import { PATHS } from '../../routes.js';
import { switcherMenu, swDesc } from './switcher.js';

/** Close a popover on an outside click or Escape. */
export function useDismiss(open, close) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) close(); };
    const key = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open, close]);
  return ref;
}

/** One row of the switcher menu, as FleetKit draws it. */
function SwRow({ s, current, onPick }) {
  const d = swDesc(s);
  const end = s.state === 'fallen' ? <Flag kind="fallen" style={{ height: 20 }}>fallen</Flag>
    : s.parked ? <ParkedBadge style={{ height: 20 }}>{s.parked}</ParkedBadge> : <span />;
  return (
    <Link className={cx('sw-item', current && 'is-current', sessClass(s))} to={PATHS.cockpit(s.id)} role="menuitem" aria-current={current ? 'page' : undefined} onClick={onPick} style={{ textDecoration: 'none' }}>
      <SessionGlyph session={s} />
      <span>{s.name}{s.repo ? ` · ${s.repo}` : ''}<span className="d">{d}</span></span>
      {end}
    </Link>
  );
}

const RUN_MODES = [
  { key: 'size', label: 'By size', desc: 'Small chunks stay here, medium delegate, large fan out' },
  { key: 'sub', label: 'Delegate to sub-agents', short: 'Sub-agents', desc: 'Each is briefed in its own context' },
  { key: 'wf', label: 'Use workflows', short: 'Workflows', desc: 'Several agents work one chunk and check each other' },
  { key: 'both', label: 'Sub-agents and workflows', short: 'Both', desc: 'Both overrides, as Settings can set them' },
];

/**
 * session: { id, name, kind }; sessions: the fleet (or null when the server
 * cannot list them); git: the ledger's git (null: only the branch is known).
 */
export default function CockpitTop({
  session, sessions, repo, git, branch, owner, runMode, onRunMode, loop, pause, onPause,
}) {
  const nav = useNavigate();
  const [sw, setSw] = useState(false);
  const [rm, setRm] = useState(false);
  const [gitOpen, setGitOpen] = useState(false);
  const swRef = useDismiss(sw, () => setSw(false));
  const rmRef = useDismiss(rm, () => setRm(false));
  const gitRef = useDismiss(gitOpen, () => setGitOpen(false));

  // G then F: back to the fleet (the switcher menu's shortcut).
  useEffect(() => {
    let g = 0;
    const key = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'g' || e.key === 'G') { g = Date.now(); return; }
      if ((e.key === 'f' || e.key === 'F') && Date.now() - g < 1000) { g = 0; nav(PATHS.fleet); }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [nav]);

  // Local stars, then terminal sessions under a divider; the button shows the other stars only (switcher.js).
  const menu = switcherMenu(sessions, session);
  const mode = RUN_MODES.find((m) => m.key === runMode) || RUN_MODES[0];

  return (
    <Topbar>
      <Wordmark label="nexus, back to the fleet" />
      <span ref={swRef} style={{ position: 'relative', display: 'inline-flex' }}>
        <Switcher session={session} others={menu.others} open={sw} onClick={() => setSw((o) => !o)} />
        {sw ? (
          <div className="menu" role="menu" aria-label="Sessions" style={{ position: 'absolute', zIndex: 9, top: 'calc(100% + 8px)', left: 0, width: 330 }}>
            {menu.stars.map((s) => <SwRow key={s.id} s={s} current={s.id === session.id} onPick={() => setSw(false)} />)}
            {menu.terminals.length ? <>
              {menu.stars.length ? <div className="menu-sep" /> : null}
              {menu.terminals.map((s) => <SwRow key={s.id} s={s} current={s.id === session.id} onPick={() => setSw(false)} />)}
            </> : null}
            <div className="menu-sep" />
            <Link className="sw-item" to={PATHS.fleet} role="menuitem" onClick={() => setSw(false)} style={{ textDecoration: 'none' }}>
              <Icon name="fleetRound" /><span>Back to the fleet<span className="d">all sessions</span></span><span className="kbd">G F</span>
            </Link>
          </div>
        ) : null}
      </span>
      {repo ? <span className="repo tb-long"><b>{repo}</b></span> : null}
      {git ? (
        <span ref={gitRef} style={{ display: 'inline-flex', position: 'relative', minWidth: 0 }}>
          <GitStrip
            git={{ ...git, pr: git.pr && git.pr.num ? { num: `#${String(git.pr.num).replace(/^#/, '')}`, ci: git.pr.ci } : null, noPr: owner && !(git.pr && git.pr.num) ? 'pushes as chunks land' : null }}
            brMax={120} long open={gitOpen} commits={git.commits} onToggle={() => setGitOpen((o) => !o)}
          />
        </span>
      ) : branch ? (
        <span className="git" aria-label="Git state"><span><Icon name="branch" /><span className="br" style={{ maxWidth: 120 }}>{branch}</span></span></span>
      ) : null}
      <span className="tb-spacer" />
      <ModeChip owner={owner} />
      <span ref={rmRef} style={{ position: 'relative', display: 'inline-flex' }}>
        <button className="btn btn-s" type="button" aria-label={`Run mode: ${mode.label.toLowerCase()}`} aria-haspopup="menu" aria-expanded={rm} onClick={() => setRm((o) => !o)}>
          <Icon name="runMode" size={14} /><span className="tb-long">{mode.short || mode.label}</span><Icon name="chevronDown" size={14} />
        </button>
        {rm ? (
          <Menu
            head="Run mode" label="Run mode"
            style={{ position: 'absolute', zIndex: 9, top: 'calc(100% + 8px)', right: 0, width: 300 }}
            items={RUN_MODES.map((m) => ({
              key: m.key, label: m.label, desc: m.desc, role: 'menuitemradio', active: m.key === mode.key,
              end: m.key === mode.key ? <Icon name="check" /> : <span />, onSelect: () => { setRm(false); onRunMode(m.key); },
            }))}
          />
        ) : null}
      </span>
      {loop ? <LoopStatus paused={loop.paused}>{loop.text}</LoopStatus> : null}
      <PauseBtn state={pause.state} sub={pause.sub} subLong onClick={onPause} />
    </Topbar>
  );
}
