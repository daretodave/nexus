// A little terminal that replays `claude setup-token` (the frames: tokenTerm.js): the command typed, the browser
// sign-in (a small card labelled "in your browser", so nobody looks for it in the terminal), and the long token at
// the end, a made-up one. One setTimeout chain drives it, paused while the tab is hidden or the window is scrolled
// out of view; CSS does the line reveal, the caret, the token sweep and the card's slide (styles/mini-term.css).
// Reduced motion (the system's or the app's own) draws the final frame at once: every line, no caret, the card
// still and signed in, no Replay. The window is aria-hidden; a visually hidden list holds the whole transcript.
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../ui/index.js';
import { useFxLevel, useReducedMotion } from '../../fx/pref.js';
import { useCopy, CopyFace } from './frame.jsx';
import { COMMAND, END_MS, browserAt, nextTick, shownAt, tokenFrames, transcript, typedAt } from './tokenTerm.js';
import '../../styles/mini-term.css';

const FRAMES = tokenFrames();

function Line({ f, typed, live }) {
  if (f.kind === 'cmd') {
    return <div className="mt-line is-cmd"><span className="mt-ps">$</span><span>{typed}</span>{live ? <span className="mt-caret" /> : null}</div>;
  }
  if (f.kind === 'callout') return <div className="mt-line is-callout"><span className="mt-arrow">{'↑'}</span>{f.text}</div>;
  return (
    <div className={`mt-line is-${f.kind}`}>
      <span className="mt-text">{f.text}</span>
      {f.note ? <span className="mt-note">{f.note}</span> : null}
    </div>
  );
}

/** The browser card: an address pill, "Authorize Claude Code", a button that turns into "Signed in". */
function BrowserCard({ state }) {
  if (state === 'hidden' || state === 'gone') return null;
  const signed = state === 'signed';
  return (
    <div className={`mt-browser${signed ? ' is-signed' : ''}`}>
      <span className="mt-where">in your browser</span>
      <span className="mt-addr"><Icon name="lockOne" size={12} />claude.ai</span>
      <span className="mt-auth">Authorize Claude Code</span>
      <span className="mt-btn">{signed ? <><Icon name="check" size={12} />Signed in</> : 'Authorize'}</span>
    </div>
  );
}

/**
 * @param {object} p
 * @param {boolean} [p.reduced]  force the final frame (tests); otherwise the motion preference decides
 * @param {boolean} [p.footnotes=true]
 */
export default function TokenTerm({ reduced: forceReduced, footnotes = true }) {
  // The system's reduced motion, or the app's own effects switched off (Settings): the final frame, still.
  const sysReduced = useReducedMotion();
  const [fx] = useFxLevel();
  const reduced = forceReduced ?? (sysReduced || fx === 'off');
  const [t, setT] = useState(reduced ? END_MS : 0);
  const [run, setRun] = useState(0);
  const box = useRef(null);
  const [copied, copy] = useCopy();

  useEffect(() => {
    if (reduced) { setT(END_MS); return undefined; }
    let now = 0;
    let timer = null;
    let visible = true;
    let stopped = false;
    const step = () => {
      if (stopped) return;
      const n = nextTick(FRAMES, now);
      if (n == null) return;
      if (!visible || (typeof document !== 'undefined' && document.hidden)) { timer = setTimeout(step, 250); return; }
      timer = setTimeout(() => { now = n; setT(n); step(); }, n - now);
    };
    let io = null;
    if (typeof IntersectionObserver !== 'undefined' && box.current) {
      io = new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); });
      io.observe(box.current);
    }
    setT(0);
    step();
    return () => { stopped = true; clearTimeout(timer); io?.disconnect(); };
  }, [reduced, run]);

  const shown = reduced ? FRAMES.length : shownAt(FRAMES, t);
  const typed = reduced ? COMMAND : typedAt(t);
  const typing = !reduced && typed.length < COMMAND.length;
  const browser = reduced ? 'signed' : browserAt(t);
  const done = reduced || t >= END_MS;

  return (
    <div className="mt" ref={box}>
      <div className="mt-win" aria-hidden="true">
        <div className="mt-head">
          <span className="mt-dots"><i /><i /><i /></span>
          <span className="mt-title">Terminal · this machine</span>
          <span className="tb-spacer" />
          {!reduced ? (
            <button className="btn btn-ghost btn-s" type="button" tabIndex={-1} onClick={() => setRun((n) => n + 1)} disabled={!done}><Icon name="refresh" size={12} />Replay</button>
          ) : null}
        </div>
        <div className={`mt-body${reduced ? ' is-still' : ''}`}>
          {FRAMES.slice(0, Math.max(1, shown)).map((f, i) => <Line key={`${run}-${i}`} f={f} typed={typed} live={i === 0 && (typing || (shown <= 1 && !reduced))} />)}
          <BrowserCard state={browser} />
        </div>
      </div>
      <ol className="mt-sr">
        {transcript(FRAMES).map((l, i) => <li key={i}>{l}</li>)}
      </ol>
      <div className="mt-acts">
        <button className="btn btn-s" type="button" onClick={() => copy('cmd', COMMAND)}>
          <CopyFace copied={copied === 'cmd'} icon="terminal" doneColor={false}>Copy <code>{COMMAND}</code></CopyFace>
        </button>
        <span className="t-body-s c-3">Roughly what you will see; the words can change between Claude Code versions.</span>
      </div>
      {footnotes ? (
        <ul className="mt-foot">
          <li>If it asks you to paste a code, copy it from the browser page and paste it there.</li>
          <li>If it says your organisation&apos;s policy does not permit it, an admin decides; the loop cannot run on a subscription token there.</li>
        </ul>
      ) : null}
    </div>
  );
}

/** A still terminal (no motion): lines as given, `$` lines in the prompt colour. For "In your terminal". */
export function StillTerm({ lines, title = 'Terminal · this machine' }) {
  return (
    <div className="mt-win is-static">
      <div className="mt-head">
        <span className="mt-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="mt-title">{title}</span>
      </div>
      <div className="mt-body is-still">
        {lines.map((l, i) => (
          l.startsWith('$ ')
            ? <div key={i} className="mt-line is-cmd"><span className="mt-ps">$</span><span>{l.slice(2)}</span></div>
            : <div key={i} className={`mt-line ${l.startsWith('✓') ? 'is-ok' : 'is-out'}`}><span className="mt-text">{l}</span></div>
        ))}
      </div>
    </div>
  );
}
