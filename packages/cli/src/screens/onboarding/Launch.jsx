// Step 6 · Launch (boards Launch, LaunchLight). Everything set up gathers
// into one star: the summary of the answers, the collapse into the first
// session (its star name is the first one free), and the way into its
// cockpit. Opening it saves the run mode and marks setup done.
import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, Orb, Kbd, SessTag, Star, nextSessionName, useShell } from '../../ui/index.js';
import { server, useSessions } from '../../data/index.js';
import { PATHS } from '../../routes.js';
import { ObFrame, Back, markOnboarded, useEnter } from './frame.jsx';
import { useDraft, runModeFromPrefs, prefsFromRunMode, RUN_MODE_LABEL, SCHED_SUMMARY } from './draft.js';
import { onboardingCalls } from './calls.js';

const RIM = [
  [-232, -118, '', 0], [-158, -168, 'v', 37], [-58, -186, '', 74], [72, -172, 'n', 111],
  [182, -138, '', 148], [250, -58, 'v', 185], [232, 62, '', 222], [150, 142, 'n', 259],
  [18, 168, '', 296], [-122, 148, 'v', 33], [-222, 80, '', 70], [-262, -18, 'n', 107],
];
const SPOKES = [0, 3, 6, 9];

function Collapse({ again, name, repo, branch, owner }) {
  return (
    <div className={again ? 'collapse is-again' : 'collapse'}>
      <svg viewBox="-300 -197 600 470" aria-hidden="true">
        {RIM.map(([x, y], i) => {
          const [x2, y2] = RIM[(i + 1) % RIM.length];
          return <line key={`r${i}`} className="lline" x1={x} y1={y} x2={x2} y2={y2} />;
        })}
        {SPOKES.map((i) => <line key={`s${i}`} className="lline" x1={RIM[i][0]} y1={RIM[i][1]} x2="0" y2="0" style={{ strokeDasharray: '2 6' }} />)}
      </svg>
      {RIM.map(([x, y, k, d], i) => <span key={i} className={`lstar ${k}`} style={{ '--x': `${x}px`, '--y': `${y}px`, '--d': `${d}ms` }} />)}
      <div className="mini-cockpit" aria-hidden="true">
        <div className="mc-top">
          <span className="mark" style={{ width: 10, height: 10 }} />
          {name ? <span className={`sess-tag sess-${name}`} style={{ height: 18, fontSize: 10 }}><Star name={name} />{name}</span> : null}
          <span className="t-mono-xs c-3">{repo}{branch ? ` · ${branch}` : ''}</span>
          <span style={{ flex: 1 }} />
          {owner
            ? <span className="mode-chip is-owner" style={{ height: 20, fontSize: 10, padding: '0 8px' }}><Icon name="lockOne" style={{ width: 11, height: 11 }} />Owner</span>
            : <span className="mode-chip is-contrib" style={{ height: 20, fontSize: 10, padding: '0 8px' }}><Icon name="contribOne" style={{ width: 11, height: 11 }} />Contributor</span>}
        </div>
        <div className="mc-left">
          <span className="t-caps c-3">Questions first</span>
          <div className="mc-tug">
            <span className="mc-bar" style={{ width: '82%' }} />
            <span className="mc-bar" style={{ width: '56%' }} />
            <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
              <span className="mc-bar a" style={{ width: 64, height: 14, borderRadius: 5 }} />
              <span className="mc-bar" style={{ width: 52, height: 14, borderRadius: 5 }} />
            </div>
          </div>
          <span className="mc-bar" style={{ width: '70%', marginTop: 8 }} />
          <span className="mc-bar" style={{ width: '48%' }} />
          <span style={{ flex: 1 }} />
          <span className="mc-bar" style={{ height: 34, borderRadius: 8 }} />
        </div>
        <div className="mc-right">
          <Orb state="blocked" size="l" main />
          <span className="orb orb-xs st-idle" style={{ position: 'absolute', left: '24%', top: '22%' }} />
          <span className="orb orb-xs st-idle" style={{ position: 'absolute', left: '74%', top: '26%' }} />
          <span className="orb orb-xs st-idle" style={{ position: 'absolute', left: '70%', top: '70%' }} />
        </div>
      </div>
      <div className="launch-core"><Orb state="thinking" size="xl" main /></div>
    </div>
  );
}

function planLine(d, adopted) {
  const chunks = (d.ideas || []).filter((x) => x.st === 'kept');
  if (chunks.length && d.plotted) {
    const n = d.spec?.n || 1;
    const asap = chunks.findIndex((x) => (d.place || {})[x.id] === 'asap');
    const first = `${n}.${(asap >= 0 ? asap : 0) + 1}`;
    return <>{d.spec?.file ? <><code>{d.spec.file}</code> · </> : null}{chunks.length} chunks · {first} goes first</>;
  }
  if (chunks.length) return <>{chunks.length} chunks kept · not written to the plan yet</>;
  if (d.messy) return <>Sent to <code>/messy</code> · its specs land on the plan board</>;
  if (adopted) return <>Your plan as it stands · <code>/next</code> picks the first ready chunk</>;
  return <>Nothing plotted yet · the session adopts nexus first</>;
}

function cloudLine(d) {
  if (d.cloud !== 'on') return 'Off · it runs on this machine only';
  const s = SCHED_SUMMARY[d.sched || 'night'];
  if (!d.cloudSaved) return `${s} · finish it in Cloud loop`;
  return `${s} · ${d.sched === 'demand' ? 'runs when you press Run one pass' : d.sched === 'two' ? 'first run within two hours' : 'first run tonight'}`;
}

export default function Launch() {
  const shell = useShell();
  const info = shell.app?.data?.info || {};
  const prefs = shell.app?.data?.prefs;
  const sessions = useSessions(0);
  const [d] = useDraft();
  const nav = useNavigate();
  const [again, setAgain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const live = Array.isArray(sessions.data) ? sessions.data.filter((s) => s.kind !== 'other' && s.state !== 'closed') : [];
  const name = nextSessionName(live);
  const owner = !!info.owner;
  const effectiveOwner = owner && d.ownerMode !== false;
  const rm = d.runMode ?? (prefs?.onboarded ? runModeFromPrefs(prefs) : 'size');

  const finish = useCallback(async () => {
    await markOnboarded(prefsFromRunMode(rm));
    if (owner) await onboardingCalls.setLocal({ ownerMode: d.ownerMode !== false }).catch(() => null);
  }, [rm, owner, d.ownerMode]);

  const open = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await finish();
      let id = 'main';
      if (!info.adopted) {
        // A new repo adopts nexus first, in the repo itself: the server's home session does it.
        await server.adopt();
      } else {
        // Its own star, worktree and branch (POST /api/sessions); the server takes the next free star if this one went.
        const s = await server.startSession(name ? { name } : {});
        id = s.id || id;
      }
      nav(PATHS.cockpit(id));
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }, [busy, finish, name, info.adopted, nav]);

  useEnter(open);

  const foot = (
    <>
      <Back to="cloud" />
      <span className="ob-count">6 of 6 · done</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="t-body-s c-3">Press <Kbd>⏎</Kbd> to open</span>
      </div>
    </>
  );

  return (
    <ObFrame step="launch" skipped={d.cloud === 'skipped' ? ['cloud'] : []} foot={foot}>
      <div className="launch">
        <div className="ob-copy">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="kicker">step 6 · launch</span>
            <h1 className="t-display-m">Your first session is ready</h1>
          </div>
          <p className="t-body-l ob-lede">Everything you set up gathers into one star. Open it, answer its first questions, and it goes heads-down for the next few hours.</p>
          <div className="summary-list">
            <div>
              <span className="k">session</span>
              <span className="v" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {name
                  ? <><SessTag session={{ name, kind: 'local' }} /><span className="c-3" style={{ fontWeight: 400 }}>its own star, color and worktree</span></>
                  : <span className="c-3" style={{ fontWeight: 400 }}>All four stars are in use. Close a session on the fleet to free one.</span>}
              </span>
            </div>
            <div><span className="k">repo</span><span className="v"><code>{info.name || shell.repo}</code>{info.branch ? <> on <code>{info.branch}</code></> : null}</span></div>
            <div>
              <span className="k">mode</span>
              <span className="v">{effectiveOwner ? 'Owner · chunks land on main as they close' : owner ? 'Owner, switched off · one package PR at the end' : 'Contributor · one package PR at the end'}</span>
            </div>
            <div><span className="k">run mode</span><span className="v">{RUN_MODE_LABEL[rm]}</span></div>
            <div><span className="k">plan</span><span className="v">{planLine(d, info.adopted)}</span></div>
            <div><span className="k">cloud loop</span><span className="v">{cloudLine(d)}</span></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
            <button className="btn btn-primary btn-xl" type="button" onClick={open} disabled={busy || !name} aria-busy={busy || undefined}>Open the cockpit<Icon name="arrowRight" /></button>
            <Link className="btn btn-ghost btn-l" to={PATHS.fleet} onClick={() => { finish(); }}><Icon name="fleet" size={14} />Go to the fleet</Link>
          </div>
          {err ? <span className="t-body-s" role="alert" style={{ color: 'var(--st-blocked)' }}>The session did not start: {err}. Your answers are saved; try again.</span> : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Collapse again={again} name={name} repo={info.name || shell.repo} branch={info.branch} owner={effectiveOwner} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-ghost btn-s" type="button" onClick={() => setAgain(!again)}><Icon name="refresh" size={14} />Replay</button>
          </div>
        </div>
      </div>
    </ObFrame>
  );
}
