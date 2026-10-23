// The change feed on the top bar (server/feed.mjs): a quiet ticker with the newest push said plainly and a small dot
// for its deploy (or a secret sent where it runs: "deneb pushed STRIPE_SECRET_KEY to Cloudflare (production)", names
// only, with a key where the dot goes); a new push slides in (no slide under reduced motion). A click opens a small modal with the feed by
// day: each push's line, who made it, its short sha (copyable), how long ago, and its deploy (a link when the host
// gave one). Esc and a click outside close it; focus stays inside while it is open and goes back to the ticker after.
// Off in Settings ("Change feed"): nothing here draws. The rules: change-feed.js.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Icon } from './icons.jsx';
import { SessionGlyph } from './session.jsx';
import { sessClass, sessionLook } from './stars.js';
import { cx } from './controls.jsx';
import { useShell } from './shell.jsx';
import { PATHS } from '../routes.js';
import { ago, byDay, deployWords, mergeEvents, tickerParts, tickerText, whoOf } from './change-feed.js';
import '../styles/change-feed.css';

/** The deploy dot: a tone per state, a breathing ring while it deploys. Nothing at all when the repo has no deploys. */
function Dot({ deploy, ev }) {
  if (ev?.kind === 'secret-push') return <Icon name="key" size={12} className="feed-key" aria-hidden="true" />;
  const d = deployWords(deploy);
  return <span className={cx('feed-dot', d ? `is-${d.tone}` : 'is-plain')} aria-hidden="true" />;
}

function Who({ ev }) {
  const w = whoOf(ev);
  const look = sessionLook(w.session);
  return (
    <span className={cx('feed-who', sessClass(w.session))}>
      {look.glyph === 'initial' ? <span className="feed-initial" aria-hidden="true">{look.initial}</span> : <SessionGlyph session={w.session} className="feed-glyph" />}
      <b>{w.name}</b>
    </span>
  );
}

function Sha({ sha }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = async () => {
    try { await navigator.clipboard?.writeText(sha); setCopied(true); } catch { /* no clipboard: the sha is still on screen */ }
  };
  return (
    <button type="button" className="feed-sha" onClick={copy} title="Copy the commit" aria-label={copied ? `Copied ${sha}` : `Copy commit ${sha}`}>
      <code>{sha}</code>{copied ? <span className="feed-copied">copied</span> : <Icon name="copy" size={12} />}
    </button>
  );
}

function Deploy({ deploy }) {
  const d = deployWords(deploy);
  if (!d) return null;
  const body = <><Dot deploy={deploy} />{d.text}</>;
  return deploy.url
    ? <a className={cx('feed-deploy', `is-${d.tone}`)} href={deploy.url} target="_blank" rel="noreferrer">{body}<Icon name="external" size={12} /></a>
    : <span className={cx('feed-deploy', `is-${d.tone}`)}>{body}</span>;
}

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function FeedModal({ events, onClose, load }) {
  const ref = useRef(null);
  // The fuller list (GET /api/feed), asked once on open; the live channel's newest 40 draw meanwhile.
  const [full, setFull] = useState([]);
  useEffect(() => {
    let on = true;
    Promise.resolve(load?.()).then((d) => { if (on && d && Array.isArray(d.events)) setFull(d.events); }, () => null);
    return () => { on = false; };
  }, [load]);
  const list = mergeEvents(events, full);
  const days = byDay(list);
  useEffect(() => {
    const box = ref.current;
    box?.querySelector('.feed-close')?.focus();
    const key = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab' || !box) return;
      const f = [...box.querySelectorAll(FOCUSABLE)];
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || !box.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !box.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);
  return createPortal(
    <div className="feed-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="feed-modal" role="dialog" aria-modal="true" aria-labelledby="feed-title">
        <div className="feed-head">
          <div>
            <h2 id="feed-title" className="feed-title">Changes on main</h2>
            <p className="feed-sub">Every push to main, and every secret sent where it runs, newest first.</p>
          </div>
          <button type="button" className="btn btn-s btn-icon feed-close" onClick={onClose} aria-label="Close the change feed"><Icon name="x" size={14} /></button>
        </div>
        <div className="feed-body">
          {days.length ? days.map((g) => (
            <section key={g.key} className="feed-day" aria-label={g.label}>
              <h3 className="feed-day-h">{g.label}</h3>
              <ul className="feed-rows">
                {g.events.map((ev) => (
                  <li key={ev.id} className="feed-row">
                    <Dot deploy={ev.deploy} ev={ev} />
                    <div className="feed-row-main">
                      <p className="feed-line">{ev.line}{ev.ai ? <Icon name="sparkle" size={12} className="feed-ai" /> : null}</p>
                      <div className="feed-meta">
                        <Who ev={ev} />
                        {ev.sha ? <Sha sha={ev.sha} /> : null}
                        {ev.kind === 'secret-push' ? <span className="feed-count">names only</span> : null}
                        <time dateTime={ev.at} title={ev.at ? new Date(ev.at).toLocaleString() : ''}>{ago(ev.at)}</time>
                        {ev.count > 1 ? <span className="feed-count">{ev.count} commits</span> : null}
                        <Deploy deploy={ev.deploy} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )) : <p className="feed-empty">Nothing has landed on main since the feed started. The next push shows up here.</p>}
        </div>
        <div className="feed-foot">
          <span>Lines with <Icon name="sparkle" size={12} className="feed-ai" /> are written by AI from the commits.</span>
          <Link to={PATHS.settings} onClick={onClose}>Turn the feed off in Settings</Link>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** One line of the ticker: the dot, the line (cut short when room is tight) and the deploy word (never cut). */
function TickRow({ ev, className, hidden }) {
  const { line, state } = tickerParts(ev);
  const d = deployWords(ev.deploy);
  return (
    <span className={className} aria-hidden={hidden || undefined}>
      <Dot deploy={ev.deploy} ev={ev} />
      <span className="feed-tick-text">{line}</span>
      {state ? <span className={cx('feed-tick-state', `is-${d.tone}`)}>{state}</span> : null}
    </span>
  );
}

/**
 * The top bar's ticker: the newest push, a new one sliding in over the last. Nothing while the feed is off or empty.
 * On a narrow bar it folds to its dot and the word "Changes", still a way into the modal.
 */
export function FeedTicker() {
  const { feed, feedOn, loadFeed } = useShell();
  const events = feedOn && feed?.events ? feed.events : [];
  const top = events[0] || null;
  const [open, setOpen] = useState(false);
  const btn = useRef(null);
  // The line that was showing when a new one came: it slides out above as the new one slides in.
  const [leaving, setLeaving] = useState(null);
  const shown = useRef(null);
  useLayoutEffect(() => {
    const was = shown.current;
    shown.current = top;
    if (was && top && was.id !== top.id) setLeaving(was);
  }, [top]);
  useEffect(() => {
    if (!leaving) return undefined;
    const t = setTimeout(() => setLeaving(null), 520);
    return () => clearTimeout(t);
  }, [leaving]);
  const close = useCallback(() => { setOpen(false); btn.current?.focus(); }, []);
  if (!top) return null;
  const say = tickerText(top);
  return (
    <>
      <button
        ref={btn} type="button" className="feed-tick" aria-haspopup="dialog" aria-expanded={open}
        aria-label={`Latest change: ${say}. Open the change feed`} title={say} onClick={() => setOpen(true)}
      >
        <span className="feed-tick-win" aria-live="polite">
          {leaving ? <TickRow key={`out-${leaving.id}`} ev={leaving} className="feed-tick-row is-out" hidden /> : null}
          <TickRow key={top.id} ev={top} className={cx('feed-tick-row', leaving && 'is-in')} />
        </span>
        <span className="feed-tick-fold" aria-hidden="true"><Dot deploy={top.deploy} ev={top} />Changes</span>
        <span className="feed-tick-ago">{ago(top.at)}</span>
      </button>
      {open ? <FeedModal events={events} onClose={close} load={loadFeed} /> : null}
    </>
  );
}
