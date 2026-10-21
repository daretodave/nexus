// Step 3 · Shape (boards Shape, ShapeContributor, ShapeLight). Four friendly
// questions: what you are building (seeds the first spec), who works on it,
// whose checkout this is (writes or removes .owner), and how agents split
// the work (the run mode, saved to .nexus/local.json through /api/local).
import { useState } from 'react';
import { nextRunMode, Icon, InfoBtn, Seg, OwnerPick, Switch, Check, BadgeAuto, BadgeDef, FileTag, useShell } from '../../ui/index.js';
import { api, server, useLocalSettings } from '../../data/index.js';
import { PATHS } from '../../routes.js';
import { ObFrame, Back, Next } from './frame.jsx';
import { useDraft, localRunMode, saveRunMode } from './draft.js';
import { onboardingCalls } from './calls.js';

const TEAM = [
  { value: 'solo', label: 'Just me' },
  { value: 'team', label: 'A small team' },
  { value: 'oss', label: 'Open source' },
];

const NOTES = {
  sub: 'Every chunk delegates to sub-agents, whatever its size. More briefings, more tokens.',
  wf: 'Every chunk runs as a workflow: several agents in parallel that check each other. The most tokens.',
  both: 'Sub-agents and workflows on every chunk. Thorough, and the most expensive way to run.',
};


function useCheckout() {
  const shell = useShell();
  const [pick, setPick] = useState(null);
  const [err, setErr] = useState(null);
  const value = pick ?? (shell.owner ? 'owner' : 'contrib');
  const change = async (v) => {
    setPick(v);
    setErr(null);
    try {
      await server.setOwner(v === 'owner');
      shell.app?.reload?.();
    } catch (e) {
      setPick(null);
      setErr(e.message);
    }
  };
  return [value, change, err];
}

export default function Shape() {
  const shell = useShell();
  const prefs = shell.app?.data?.prefs;
  const local = useLocalSettings();
  const [d, patch] = useDraft();
  const [checkout, setCheckout, ownerErr] = useCheckout();
  const [tip, setTip] = useState(false);
  const isOwner = checkout === 'owner';

  const v = d.runMode ?? (prefs?.onboarded && local.status === 'ready' ? localRunMode(local.data) : 'size');
  const setRm = (rm) => {
    patch({ runMode: rm });
    saveRunMode(rm, api).catch(() => {});
  };
  const bySize = v === 'size';
  const subOn = v === 'sub' || v === 'both';
  const wfOn = v === 'wf' || v === 'both';

  const push = d.ownerMode !== false;
  const togglePush = () => {
    patch({ ownerMode: !push });
    // .nexus/local.json; until the server stores it, Launch tries again.
    onboardingCalls.setLocal({ ownerMode: !push }).catch(() => {});
  };

  const foot = (
    <>
      <Back to="detect" />
      <span className="ob-count">3 of 6</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Next to={PATHS.onboarding('plot')} onClick={() => { if (d.runMode == null) setRm(v); }} />
      </div>
    </>
  );

  return (
    <ObFrame step="shape" foot={foot}>
      <div className="shape-grid">
        <div className="ob-copy" style={{ gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="kicker">step 3 · shape the project</span>
            <h1 className="t-display-s">A few friendly questions</h1>
          </div>

          <div className="ob-q">
            <div className="ob-q-h"><span className="n">1</span>What are you building?</div>
            <textarea
              className="field" rows={2} aria-label="What are you building?"
              value={d.building} onChange={(e) => patch({ building: e.target.value })}
              placeholder="Docs search for our team handbook. Fast, forgiving of typos, and it jumps straight to the right heading."
            />
            <span className="t-body-s c-3">nexus turns this into the first spec. Plain words are fine.</span>
          </div>

          <div className="ob-q">
            <div className="ob-q-h"><span className="n">2</span>Just you, or a team?</div>
            <div style={{ alignSelf: 'flex-start' }}>
              <Seg options={TEAM} value={d.team} onChange={(t) => patch({ team: t })} label="Just you, or a team?" name="team" />
            </div>
          </div>

          <div className="ob-q">
            <div className="ob-q-h"><span className="n">3</span>Whose checkout is this?</div>
            <OwnerPick value={checkout} onChange={setCheckout} name="checkout" />
            {ownerErr ? <span className="t-body-s" style={{ color: 'var(--st-blocked)' }}>Could not change the .owner file: {ownerErr}</span> : null}
            {isOwner ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 18, alignItems: 'start', padding: '14px 16px', borderRadius: 14, background: 'var(--well)' }}>
                <Switch checked={push} onChange={togglePush} title="Owner mode" sub={push ? 'Push straight to main' : 'Off: open pull requests like a contributor'} iconOn="lockOne" iconOff="lockOpenOne" />
                <span className="t-body-s c-2">nexus writes a <FileTag>.owner</FileTag> file here, so this switch lives in Settings for this checkout only. Chunks land on main as they close; there is no package step.</span>
              </div>
            ) : (
              <div className="absent" style={{ fontFamily: 'inherit', fontSize: 13, lineHeight: '20px', color: 'var(--text-2)', alignItems: 'flex-start' }}>
                <Icon name="contribOne" size={14} style={{ marginTop: 3, flex: 'none' }} />
                <span>No <FileTag>.owner</FileTag> file in this checkout, so owner mode will not appear in its Settings at all. Each session ends with a package PR for the owner to review.</span>
              </div>
            )}
          </div>
        </div>

        <div className="panel" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="ob-q-h" style={{ alignItems: 'center' }}>
            <span className="n">4</span>
            <span style={{ flex: 1 }}>How should agents split the work?</span>
            <InfoBtn label="About token cost" open={tip} onClick={() => setTip(!tip)} />
          </div>
          {tip ? (
            <div className="tip tip-static" role="tooltip" style={{ width: '100%' }}>
              <span className="tip-arrow" style={{ left: 'auto', right: 16 }} />
              <div className="tip-row"><span><b>By size</b> · small chunks stay in this session, medium ones delegate, large ones fan out. Cost follows the work.</span><span className="cost" aria-label="cost varies"><i className="on" /><i /><i /></span></div>
              <div className="tip-row"><span><b>Sub-agents</b> · each is briefed in its own context, so the main one stays clear. You pay for every briefing.</span><span className="cost" aria-label="more tokens"><i className="on" /><i className="on" /><i /></span></div>
              <div className="tip-row"><span><b>Workflows</b> · several agents work one chunk and check each other. The most thorough, and the most tokens.</span><span className="cost" aria-label="most tokens"><i className="on" /><i className="on" /><i className="on" /></span></div>
            </div>
          ) : null}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Check checked={bySize} onChange={() => setRm('size')} title="By size" badge={<BadgeDef>default</BadgeDef>} sub="nexus picks per chunk" />
            <Check checked={subOn} managed={bySize} onChange={() => setRm(nextRunMode(v, 'sub'))} title="Delegate to sub-agents" badge={bySize ? <BadgeAuto>by size</BadgeAuto> : null} sub={bySize ? 'Used for medium chunks' : 'Every chunk, any size'} />
            <Check checked={wfOn} managed={bySize} onChange={() => setRm(nextRunMode(v, 'wf'))} title="Use workflows" badge={bySize ? <BadgeAuto>by size</BadgeAuto> : null} sub={bySize ? 'Multi-agent orchestration, large chunks' : 'Multi-agent orchestration'} />
          </div>
          {bySize ? (
            <div className="explain">
              <b>By size, on a first plan:</b>
              <ul>
                <li style={{ gridTemplateColumns: '26px minmax(0, 1fr)' }}><span className="size-tag">S</span><span>stays in one session, start to finish</span></li>
                <li style={{ gridTemplateColumns: '26px minmax(0, 1fr)' }}><span className="size-tag">M</span><span>delegates to sub-agents, each briefed on its own</span></li>
                <li style={{ gridTemplateColumns: '26px minmax(0, 1fr)' }}><span className="size-tag">L</span><span>fans out as a workflow that checks its own work</span></li>
              </ul>
            </div>
          ) : <div className="explain">{NOTES[v]}</div>}
          <span className="t-body-s c-3">Change it any time from the top bar or Settings.</span>
        </div>
      </div>
    </ObFrame>
  );
}
