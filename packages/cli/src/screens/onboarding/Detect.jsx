// Step 2 · Detect (boards Detect, DetectMissing, DetectLight). Four checks
// from GET /api/preflight, each lighting a star; the constellation's lines
// take the state of the stars they join. Continue unlocks once Claude Code
// is found and signed in.
import { useState } from 'react';
import { Icon, Err, stepCount, stepAfter, stepBefore, stepNo } from '../../ui/index.js';
import { usePreflight } from '../../data/index.js';
import { PATHS } from '../../routes.js';
import { ObFrame, Back, Next, useCopy, CopyFace } from './frame.jsx';

const INSTALL = 'npm install -g @anthropic-ai/claude-code';

/** The lock's pin as words: "2.0.0", or the ref when the lock names no version. */
export function kitVersion(kit) {
  return kit?.version || kit?.ref || null;
}
const kitShort = (kit) => (kitVersion(kit) ? `nexus ${kitVersion(kit)}` : null);
/** ", nexus 2.0.0 (plan/nexus.lock)" for an adopted repo with a lock; nothing without one. */
const kitLine = (kit) => (kitVersion(kit) ? <>, <code>nexus {kitVersion(kit)}</code> (plan/nexus.lock)</> : null);

/** star: 'lit' | 'warn' | 'neutral' | 'wait'; state: 'ok' | 'warn' | 'new' | 'wait'. */
export function rowsFrom(pf) {
  if (!pf) {
    const wait = { star: 'wait', state: 'wait', word: 'checking', detail: 'Checking…' };
    return {
      claude: { ...wait, short: 'checking' },
      git: { ...wait, short: 'checking' },
      gh: { ...wait, short: 'checking' },
      nexus: { ...wait, short: 'checking' },
    };
  }
  const c = Object.fromEntries(pf.checks.map((x) => [x.id, x]));
  const info = pf.info || {};
  const installed = !!c.claude?.ok;
  const signedIn = !!c.login?.ok;
  const claude = installed && signedIn
    ? { star: 'lit', state: 'ok', word: 'found', short: 'found', detail: 'Found on your PATH and signed in.' }
    : installed
      ? { star: 'warn', state: 'warn', word: 'not signed in', short: 'not signed in', detail: 'Found on your PATH, but not signed in yet.', fix: 'login' }
      : { star: 'warn', state: 'warn', word: 'not found', short: 'not found', detail: 'Not found. nexus drives Claude Code, so it has to be here first.', fix: 'install' };
  const git = info.isGit
    ? {
      star: 'lit', state: 'ok', word: 'found', short: `${info.name}${info.branch ? ` · ${info.branch}` : ''}`,
      detail: <><code>{info.name}</code>{info.branch ? <> on <code>{info.branch}</code></> : null}{info.remote ? ', with an origin remote.' : ', no origin remote yet.'}</>,
    }
    : { star: 'warn', state: 'warn', word: 'not a repo', short: 'not a repo', detail: c.remote?.fix || 'This folder is not a git repo.' };
  const gh = c.gh?.ok
    ? { star: 'lit', state: 'ok', word: 'signed in', short: 'signed in', detail: <><code>gh</code> is signed in, so sessions can open pull requests.</> }
    : { star: 'neutral', state: 'new', word: 'optional', short: 'optional', detail: <>{c.gh?.detail || 'Not signed in.'} Only the cloud loop and pull requests need <code>gh</code>.</> };
  const nexus = info.adopted
    ? { star: 'lit', state: 'ok', word: 'adopted', short: kitShort(info.kit) || 'adopted', detail: <>Already adopted{kitLine(info.kit)}: agents.md, plan/ and .claude/commands are here.</> }
    : { star: 'neutral', state: 'new', word: 'new here', short: 'not adopted yet', detail: 'Not adopted yet. The next steps set it up.' };
  return { claude, git, gh, nexus };
}

const lineCls = (a, b) => {
  const s = [a.star, b.star];
  if (s.includes('wait')) return 'const-line';
  if (s.includes('warn')) return 'const-line is-warn';
  if (s.includes('neutral')) return 'const-line is-new';
  return 'const-line is-lit';
};

export function tally(r, pf) {
  if (!pf) return 'checking 4 things…';
  const all = [r.claude, r.git, r.gh, r.nexus];
  const warn = all.filter((x) => x.state === 'warn').length;
  if (warn) {
    const what = [r.claude.state === 'warn' && (r.claude.fix === 'login' ? 'Claude Code not signed in' : 'Claude Code missing'), r.git.state === 'warn' && 'no git repo'].filter(Boolean).join(' · ');
    return `${4 - warn} of 4 ready · ${what}`;
  }
  return `4 of 4 checked · ${r.nexus.state === 'ok' ? 'nexus is already here' : 'nexus is new here'}`;
}

function Row({ title, r, children }) {
  return (
    <div className="chk-row">
      <span className={`cstar is-${r.star}`} />
      <div>
        <div className="chk-title">{title}</div>
        <div className="chk-detail">{r.detail}</div>
        {children}
      </div>
      <span className={`chk-state is-${r.state}`}>{r.state === 'ok' ? <Icon name="check" size={14} /> : null}{r.word}</span>
    </div>
  );
}

function ClaudeFix({ kind, onRecheck, checking }) {
  const [copied, copy] = useCopy();
  const install = kind === 'install';
  const cmd = install ? INSTALL : 'claude';
  return (
    <div className="chk-fix">
      <span className="t-body-s c-1" style={{ fontWeight: 600 }}>{install ? 'Install it, then check again' : 'Sign in, then check again'}</span>
      <div className="cmd-line">
        <span className="p">$</span><span>{cmd}</span><span className="tb-spacer" />
        <button className="btn btn-s btn-ghost" type="button" onClick={() => copy('cmd', cmd)} aria-label={install ? 'Copy the install command' : 'Copy the sign-in command'}>
          <CopyFace copied={copied === 'cmd'}>Copy</CopyFace>
        </button>
      </div>
      <span className="t-body-s c-2">
        {install
          ? <>Then run <code>claude</code> once in a terminal to sign in. nexus picks it up from your PATH.</>
          : <>Run <code>claude</code> in a terminal and use <code>/login</code>. nexus picks the sign-in up from there.</>}
      </span>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn btn-s btn-warn" type="button" onClick={onRecheck} disabled={checking} aria-busy={checking || undefined}><Icon name="refresh" size={14} />Check again</button>
        <span className="t-body-s c-3">Other ways to install are in the nexus README.</span>
      </div>
    </div>
  );
}

const STARS = [
  { key: 'claude', x: '19.57%', y: '65.79%', d: 0, label: 'Claude Code' },
  { key: 'git', x: '41.30%', y: '28.95%', d: 250, label: 'git' },
  { key: 'gh', x: '71.74%', y: '21.05%', d: 500, label: 'gh' },
  { key: 'nexus', x: '82.61%', y: '65.79%', d: 750, label: 'nexus' },
];

export default function Detect() {
  const pre = usePreflight();
  const pf = pre.data;
  const r = rowsFrom(pf);
  const [again, setAgain] = useState(false);
  const checking = pre.status === 'loading' || again;
  const recheck = async () => { setAgain(true); try { await pre.reload(); } finally { setAgain(false); } };
  const ready = !!pf?.ready;

  const foot = (
    <>
      <Back to={stepBefore('detect')} />
      <span className="ob-count">{stepCount('detect')}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {ready
          ? <Next to={PATHS.onboarding(stepAfter('detect'))} />
          : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
              <span className="t-body-s c-3">{pf ? 'Continue unlocks once Claude Code is found' : 'Checking this machine…'}</span>
              <button className="btn btn-primary btn-l" type="button" disabled>Continue<Icon name="arrowRight" size={14} /></button>
            </span>
          )}
      </div>
    </>
  );

  return (
    <ObFrame step="detect" foot={foot}>
      <div className="ob-grid" style={{ gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, .9fr)' }}>
        <div className="ob-copy" style={{ gap: 16 }}>
          <span className="kicker">step {stepNo('detect')} · detect</span>
          <h1 className="t-display-s">Looking around this machine</h1>
          <p className="t-body-l ob-lede" style={{ marginTop: -4 }}>Four quick checks. Nothing gets installed and nothing leaves this machine. Each one lights a star.</p>
          {pre.status === 'error' && !pf
            ? <Err title="The checks did not run" body="Nothing changed on this machine. Try them again." detail={pre.error} actions={<button className="btn btn-s" type="button" onClick={recheck}><Icon name="refresh" size={14} />Check again</button>} />
            : (
              <div className="panel chk" style={{ padding: '4px 20px' }} aria-busy={checking || undefined}>
                <Row title="Claude Code" r={r.claude}>
                  {r.claude.fix ? <ClaudeFix kind={r.claude.fix} onRecheck={recheck} checking={checking} /> : null}
                </Row>
                <Row title="Git repo" r={r.git} />
                <Row title="Git host CLI" r={r.gh} />
                <Row title="nexus in this repo" r={r.nexus} />
              </div>
            )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
          <div className="const" aria-hidden="true">
            <svg viewBox="0 0 460 380">
              <path className={lineCls(r.claude, r.git)} d="M90 250L190 110" />
              <path className={lineCls(r.git, r.gh)} d="M190 110L330 80" />
              <path className={lineCls(r.gh, r.nexus)} d="M330 80L380 250" />
              <path className={lineCls(r.nexus, r.claude)} d="M380 250Q235 330 90 250" />
            </svg>
            {STARS.map((s) => (
              <div key={s.key} className="const-star" style={{ left: s.x, top: s.y, '--d': `${s.d}ms` }}>
                <span className={`cstar is-${r[s.key].star}`} />
                <span className="const-label">{s.label}<span className="d">{r[s.key].short}</span></span>
              </div>
            ))}
          </div>
          <span className="cap" aria-live="polite">{tally(r, pf)}</span>
        </div>
      </div>
    </ObFrame>
  );
}
