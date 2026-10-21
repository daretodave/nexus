// Settings (design/handoff/Settings.dc.html for an owner checkout,
// SettingsContributor.dc.html for anyone else's; + Light via tokens). The
// .set-panel sections: this checkout, owner mode (only with a .owner file:
// absent, not disabled, elsewhere), run mode, session rhythm, the cloud
// loop, appearance. Saved as you change them: owner mode, run mode and the
// working phase go to the checkout's local settings (POST /api/local,
// .nexus/local.json); the cloud loop pause is the loop workflow's enabled
// state through gh; AI one-liners on the plan board are a GUI pref
// (POST /api/prefs aiSummaries, on by default); the theme is per browser.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { nextRunMode, localRunMode, saveRunMode, Icon, InfoBtn, Check, BadgeDef, BadgeAuto, Tip, Switch, Seg, ThemeSeg, useShell } from '../ui/index.js';
import { api, useLocalSettings } from '../data/index.js';
import { PATHS } from '../routes.js';
import { useLoop, hhmm } from './cloud-settings/loop.js';
import { Frame, LoopDot } from './cloud-settings/parts.jsx';

const SEC = { padding: '18px 26px', gap: 28 };
const LABEL = { width: 120 };


const PHASES = ['short', 'std', 'night'];

/** ~/code/lantern from /Users/x/code/lantern or C:\Users\x\code\lantern. */
function tildePath(p) {
  if (!p) return '';
  const s = String(p).replace(/\\/g, '/');
  const m = s.match(/^(?:[A-Za-z]:)?\/(?:Users|home)\/[^/]+(\/.*)?$/);
  return m ? `~${m[1] || ''}` : s;
}

/** The GitHub owner from a remote URL: git@github.com:mira/tidepool.git -> mira. */
function remoteOwner(url) {
  const m = String(url || '').match(/github\.com[:/]([^/]+)\//);
  return m ? m[1] : null;
}

/** The view-acts "saved" mark, honest about what happened. */
function Saved({ state }) {
  if (state === 'saving') return <span className="t-body-s c-3" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>saving</span>;
  if (state === 'missing') {
    return (
      <span className="t-body-s c-3" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} title="This server has no /api/local yet; changes last until the page reloads.">
        <Icon name="warn" size={14} style={{ color: 'var(--st-blocked)' }} />not saved · this page only
      </span>
    );
  }
  if (state && state.error) {
    return <span className="t-body-s c-3" role="alert" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="warn" size={14} style={{ color: 'var(--st-failed)' }} />not saved · {state.error}</span>;
  }
  return <span className="t-body-s c-3" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="check" size={14} style={{ color: 'var(--st-done)' }} />saved</span>;
}

export default function Settings() {
  const { app, repo } = useShell();
  const info = app?.data?.info || {};
  const local = useLocalSettings();
  // .owner at the primary checkout (a worktree's Settings sees it too), as /api/local reads it.
  const owner = local.status === 'ready' ? !!local.data?.owner : !!info.owner;
  const loop = useLoop();

  // Local settings: what the server holds, then what this page changed.
  const [mine, setMine] = useState({});
  const [save, setSave] = useState('saved');
  const server = local.status === 'ready' ? local.data || {} : {};
  const s = { ...server, ...mine };
  // Run mode: .nexus/local.json through ui/run-mode.js, the same path the cockpit's menu takes.
  const rm = localRunMode(s);
  const phase = PHASES.includes(s.phase) ? s.phase : 'std';
  const push = s.ownerMode !== false;

  const change = async (patch) => {
    setMine((m) => ({ ...m, ...patch }));
    if (local.status === 'missing') {
      setSave('missing');
      return;
    }
    setSave('saving');
    try {
      const { runMode, ...rest } = patch;
      if (runMode) await saveRunMode(runMode, api);
      if (Object.keys(rest).length) await api('/api/local', rest);
      setSave('saved');
    } catch (e) {
      setSave(e.status === 404 ? 'missing' : { error: e.message });
    }
  };

  // AI one-liners on the plan board: a GUI pref (POST /api/prefs), on unless turned off.
  const [aiMine, setAiMine] = useState(null);
  const ai = aiMine ?? app?.data?.prefs?.aiSummaries !== false;
  const changeAi = async (on) => {
    setAiMine(on);
    setSave('saving');
    try { await api('/api/prefs', { aiSummaries: on }); app?.reload?.(); setSave('saved'); } catch (e) { setSave({ error: e.message }); }
  };

  const [tip, setTip] = useState(false);
  const bySize = rm === 'size';
  const subOn = rm === 'sub' || rm === 'both';
  const wfOn = rm === 'wf' || rm === 'both';

  const who = remoteOwner(info.remote);
  const co = owner
    ? { note: 'You own this repo. Sessions here may push straight to main.' }
    : { note: `${who || 'Someone else'} owns this repo. Sessions here open pull requests, and each one ends with a package for review.` };

  const loopSub = loop.paused ? 'Paused · no runs until you turn this off' : `Live${loop.next ? ` · next run ${hhmm(loop.next)}` : ''}`;

  return (
    <Frame current="settings" title="Settings" sub={repo} end={<LoopDot loop={loop} />}>
      <div style={{ width: '100%', maxWidth: 1080, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="view-head">
          <div className="view-title"><h1 className="t-title-l">Settings</h1><span className="view-sub">{repo} · saved as you change them</span></div>
          <div className="view-acts"><Saved state={save} /></div>
        </div>
        <div className="set-panel">
          <section className="set-sec" style={SEC}>
            <div><h2 className="set-h">This checkout</h2><p className="set-d">nexus keeps one settings file per checkout, next to the plan.</p></div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span className="repo"><b>{repo}</b></span>
                {info.repo ? <span className="file-tag">{tildePath(info.repo)}</span> : null}
                {owner
                  ? <span className="mode-chip is-owner"><Icon name="lockOne" size={14} />Owner checkout</span>
                  : <span className="mode-chip is-contrib"><Icon name="contribOne" size={14} />Contributor checkout</span>}
              </div>
              <p className="t-body-s c-2" style={{ marginTop: 8 }}>{co.note}</p>
            </div>
          </section>

          {owner ? (
            <section className="set-sec" style={SEC}>
              <div><h2 className="set-h">Owner mode</h2><p className="set-d">Only here because this checkout has a <span className="file-tag">.owner</span> file. On anyone else's checkout this section does not exist.</p></div>
              <div style={{ minWidth: 0 }}>
                <div className="set-row">
                  <Switch checked={push} onChange={(on) => change({ ownerMode: on })} title="Owner mode" sub="Push straight to main" iconOn="lockOne" iconOff="lockOpenOne" />
                  <div className="explain">
                    {push
                      ? <><b>On: chunks land on main as they close.</b> No pull requests and no package step. Each chunk drops into the shipped river as a commit, and the session track ends at Questions.</>
                      : <><b>Off: this checkout works like a contributor.</b> Sessions end with a package PR listing what closed, what was assumed and what you answered.</>}
                    <ul>
                      <li><Icon name="lockOne" size={14} /><span>The top bar shows a solid owner chip with a lock while it is on.</span></li>
                      <li><Icon name="git" size={14} /><span>Plotting lands in the plan directly; there are no plan PRs.</span></li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <section className="set-sec" style={SEC}>
            <div><h2 className="set-h">Run mode</h2><p className="set-d">How sessions split a chunk between agents. Changes apply from the next chunk; a chunk mid-build keeps its mode.</p></div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <label className="check">
                  <input type="checkbox" checked={bySize} onChange={() => change({ runMode: 'size' })} />
                  <Icon name="check" className="tick" />
                  <span className="auto" />
                  <span className="check-text"><span className="check-title">By size <BadgeDef>default</BadgeDef></span><span className="check-sub">nexus picks per chunk</span></span>
                </label>
                <Check
                  checked={subOn} managed={bySize} onChange={() => change({ runMode: nextRunMode(rm, 'sub') })}
                  title="Delegate to sub-agents" badge={bySize ? <BadgeAuto>by size</BadgeAuto> : null}
                  sub={bySize ? 'Used for medium chunks' : 'Every chunk, any size'}
                />
                <Check
                  checked={wfOn} managed={bySize} onChange={() => change({ runMode: nextRunMode(rm, 'wf') })}
                  title="Use workflows" badge={bySize ? <BadgeAuto>by size</BadgeAuto> : null}
                  sub={bySize ? 'Multi-agent orchestration, large chunks' : 'Multi-agent orchestration'}
                />
                <InfoBtn label="About token cost" open={tip} onClick={() => setTip((v) => !v)} />
              </div>
              {tip ? (
                <Tip
                  staticPos arrowLeft={168} style={{ width: '100%', maxWidth: 560, marginTop: 12 }}
                  rows={[
                    { text: <><b>By size</b> · small chunks stay in this session, medium ones delegate, large ones fan out. Cost follows the work.</>, cost: 1, costLabel: 'cost varies' },
                    { text: <><b>Sub-agents</b> · each is briefed in its own context, so the main one stays clear. You pay for every briefing.</>, cost: 2, costLabel: 'more tokens' },
                    { text: <><b>Workflows</b> · several agents work one chunk and check each other. The most thorough, and the most tokens.</>, cost: 3, costLabel: 'most tokens' },
                  ]}
                />
              ) : null}
            </div>
          </section>

          <section className="set-sec" style={SEC}>
            <div><h2 className="set-h">Session rhythm</h2><p className="set-d">Questions, then a long quiet Working phase, then the questions it parked.</p></div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <span className="t-body-s c-2" style={LABEL}>Working phase</span>
                  <Seg
                    label="Working phase length" name="phase" value={phase} onChange={(v) => change({ phase: v })}
                    options={[{ value: 'short', label: '2 to 3 hours' }, { value: 'std', label: '3 to 4 hours' }, { value: 'night', label: 'All night' }]}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <span className="t-body-s c-2" style={LABEL}>Chunk target</span>
                  <span className="t-body-s c-1">30 to 40 minutes each</span>
                  <span className="t-body-s c-3">heads-down shows elapsed against it</span>
                </div>
              </div>
            </div>
          </section>

          <section className="set-sec" style={SEC}>
            <div><h2 className="set-h">Plan board</h2><p className="set-d">A chunk the plan leaves without words gets a one-line summary from Claude Haiku, marked as AI.</p></div>
            <div style={{ minWidth: 0 }}>
              <div className="set-row">
                <Switch checked={ai} onChange={changeAi} title="AI one-liners" sub={ai ? 'On · cached, asked again only when a chunk or its spec changes' : 'Off · undescribed chunks show their id alone'} iconOn="sparkle" iconOff="xSmall" />
                <div className="explain">
                  Summaries are kept in <span className="file-tag">.nexus/cache/</span> on this machine and never written to the plan. They run on your own Claude Code login, one small batch per board load.
                </div>
              </div>
            </div>
          </section>

          <section className="set-sec" style={SEC}>
            <div><h2 className="set-h">Cloud loop</h2><p className="set-d">The CI workflow that keeps working while this machine sleeps.</p></div>
            <div style={{ minWidth: 0 }}>
              {loop.wf ? (
                <div className="set-row">
                  <Switch checked={!!loop.paused} onChange={(on) => loop.setPaused(on)} title="Pause the cloud loop" sub={loop.pending ? 'Asking gh' : loop.error ? `Not changed · ${loop.error}` : loopSub} iconOn="pause" iconOff="play" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span className="t-body-s c-1">{loop.schedule?.label ? `${loop.schedule.label}${loop.schedule.window ? `, ${loop.schedule.window}` : ''}` : loop.wf.name}</span>
                    <span className="t-body-s c-3">
                      {loop.schedule?.cron ? <>cron <code className="t-mono-s c-2">{loop.schedule.cron}</code></> : <>workflow <code className="t-mono-s c-2">{loop.wf.path}</code></>}
                      {loop.secret ? <> · secret <code className="t-mono-s c-2">{loop.secret.name || 'CLAUDE_CODE_OAUTH_TOKEN'}</code> {loop.secret.ok ? 'set' : loop.secret.ok == null ? 'unknown' : 'missing'}</> : null}
                    </span>
                    <Link className="t-body-s" to={PATHS.cloud}>Open the cloud loop and its runs</Link>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span className="t-body-s c-2">{loop.status === 'loading' ? 'Asking gh' : loop.status === 'nogh' ? loop.note : 'This repo has no loop workflow yet.'}</span>
                  {loop.status === 'none' ? <Link className="t-body-s" to={PATHS.onboarding('cloud')}>Set up the cloud loop</Link> : null}
                </div>
              )}
            </div>
          </section>

          <section className="set-sec" style={SEC}>
            <div><h2 className="set-h">Appearance</h2><p className="set-d">Motion always respects your system's reduced-motion setting.</p></div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <span className="t-body-s c-2" style={LABEL}>Theme</span>
                <ThemeSeg />
              </div>
            </div>
          </section>
        </div>
      </div>
    </Frame>
  );
}
