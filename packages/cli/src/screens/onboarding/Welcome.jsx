// Step 1 · Welcome (boards Welcome, WelcomeAgent, WelcomeLight). The loop
// art, or (the agent path) the prompt to give another agent: the server's
// canonical paste text, the same one the nexus README hands out.
// ?path=agent opens on the prompt, as WelcomeAgent does.
import { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Icon, Orb, Kbd, useShell, stepCount, stepAfter } from '../../ui/index.js';
import { usePrompts } from '../../data/index.js';
import { PATHS } from '../../routes.js';
import { ObFrame, Next, useCopy, CopyFace, useEnter } from './frame.jsx';

const LOOP = [
  { x: '50%', y: '14.1%', label: 'plan', cap: 'picks the next chunk', d: 0 },
  { x: '85.9%', y: '50%', label: 'build', cap: 'Claude Code writes it', d: 300 },
  { x: '50%', y: '85.9%', label: 'check', cap: 'against its acceptance IDs', d: 600 },
  { x: '14.1%', y: '50%', label: 'commit', cap: 'and around again', d: 900 },
];

function LoopArt({ repo }) {
  return (
    <div className="loop-art" aria-hidden="true">
      <svg viewBox="0 0 440 440">
        <circle className="loop-ring" cx="220" cy="220" r="158" />
        <circle className="loop-flow" cx="220" cy="220" r="158" />
        <path className="loop-spoke" d="M220 62V172M378 220H268M220 378V268M62 220H172" />
      </svg>
      {LOOP.map((n) => (
        <div key={n.label} className="loop-node" style={{ left: n.x, top: n.y }}>
          <span className="cstar is-lit" style={{ animation: `nx-light 1.4s var(--ease-settle) ${n.d}ms both` }} />
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <span className="t-label c-1">{n.label}</span>
            <span className="cap">{n.cap}</span>
          </span>
        </div>
      ))}
      <div className="loop-core">
        <Orb state="thinking" size="xl" main />
        <span className="cap" style={{ marginTop: 18 }}>{repo ? `${repo} · main` : 'main'}</span>
      </div>
    </div>
  );
}

function PromptPanel() {
  const prompts = usePrompts();
  const [copied, copy] = useCopy();
  const text = prompts.data?.paste || '';
  return (
    <div className="panel prompt-panel" role="region" aria-label="Prompt for another agent">
      <div className="prompt-head">
        <Icon name="terminal" style={{ color: 'var(--accent)' }} />
        <span className="t-title-s">Give this to your agent</span>
        <span className="tb-spacer" style={{ flex: 1 }} />
        <button className="btn btn-s" type="button" disabled={!text} onClick={() => copy('prompt', text)}>
          <CopyFace copied={copied === 'prompt'}>Copy prompt</CopyFace>
        </button>
      </div>
      <div className="prompt-text">
        {text
          ? text.split('\n').map((l, i) => <div key={i}>{l}</div>)
          : <div><span className="c">{prompts.status === 'loading' ? 'Fetching the prompt…' : 'The prompt is not available from this server.'}</span></div>}
      </div>
      <p className="t-body-s c-2" style={{ margin: 0 }}>It asks your agent to read the nexus README and adopt this repo the way Claude Code would: a plan, chunks with acceptance IDs, claims, and questions parked with a default. Its claims and commits show up on the plan board either way.</p>
    </div>
  );
}

export default function Welcome() {
  const { repo } = useShell();
  const [params] = useSearchParams();
  const [reveal, setReveal] = useState(params.get('path') === 'agent');
  const nav = useNavigate();
  useEnter(useCallback(() => nav(PATHS.onboarding(stepAfter('welcome'))), [nav]));
  const host = typeof window !== 'undefined' ? window.location.host : '';

  const foot = (
    <>
      <span className="t-body-s c-3" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <Icon name="lockOne" size={14} />Runs at {host}. Nothing leaves this machine unless you turn on the cloud loop.
      </span>
      <span className="ob-count">{stepCount('welcome')}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="t-body-s c-3">Press <Kbd>⏎</Kbd> to begin</span>
      </div>
    </>
  );

  return (
    <ObFrame step="welcome" foot={foot}>
      <div className="ob-grid">
        <div className="ob-copy">
          <span className="kicker"><span className="cstar is-lit" style={{ width: 8, height: 8 }} />nexus · running on this machine</span>
          <h1 className="t-display-l">Using Claude Code?<br />Enjoy a GUI on us.<br /><span className="aurora-text">For free.</span></h1>
          <p className="t-body-l ob-lede">nexus turns this repo into a project that ships itself. Claude Code agents pick work off a plan, build it, check it and commit it, in loops that can run for hours. This is the window into that.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', marginTop: 6 }}>
            <Next to={PATHS.onboarding(stepAfter('welcome'))} size="xl" iconSize={null}>Set up this repo</Next>
            <span className="t-body-s c-3">About 2 minutes. You can skip any step.</span>
          </div>
          <div style={{ marginTop: 10 }}>
            <button className={reveal ? 'ob-link is-open' : 'ob-link'} type="button" onClick={() => setReveal(!reveal)} aria-expanded={reveal}>
              <Icon name="chevronRight" />
              <span>Using another agent? <b>Here's the prompt to give it.</b></span>
            </button>
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          {reveal ? <PromptPanel /> : <LoopArt repo={repo} />}
        </div>
      </div>
    </ObFrame>
  );
}
