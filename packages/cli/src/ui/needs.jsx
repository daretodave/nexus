// Needs you, on the top bar of every screen: one chip per session waiting on the owner (its star, its name, what it
// needs), the most pressing first, and past three a "+N" menu with the rest. A chip opens the session where the thing
// waits. Live: the `needs` event on the shell's channel moves it the moment a session asks; GET /api/needs is the
// fallback look. The rows and the split: shared/needs.mjs.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CALM, needsBar, needsSay } from '../../shared/needs.mjs';
import { Icon } from './icons.jsx';
import { SessionGlyph } from './session.jsx';
import { sessClass } from './stars.js';
import { cx } from './controls.jsx';
import { useShell } from './shell.jsx';
import { sessionIn } from '../routes.js';
import '../styles/needs.css';

const ICON = { permission: 'lock', question: 'question', fallen: 'refresh', stopped: 'refresh' };

function Chip({ r }) {
  const session = { name: r.name, kind: r.kind };
  return (
    <Link className={cx('need', `is-${r.what}`, sessClass(session))} to={r.to} title={needsSay(r)} aria-label={needsSay(r)}>
      {!CALM.has(r.what) ? <span className="need-pulse" aria-hidden="true" /> : null}
      <SessionGlyph session={session} className="need-glyph" />
      <b className="need-name">{r.name}</b>
      <span className="need-what">{r.label}</span>
    </Link>
  );
}

function More({ rows }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useRef(null);
  const btn = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    // Opened, focus moves to the first row; the arrows walk the rows, Escape closes back onto the "+N" button.
    const items = () => [...(ref.current?.querySelectorAll('[role="menuitem"]') || [])];
    items()[0]?.focus();
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) close(); };
    const key = (e) => {
      if (e.key === 'Escape') { close(); btn.current?.focus(); return; }
      const list = items();
      const at = list.indexOf(document.activeElement);
      if (at < 0 || !list.length) return;
      const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: list.length - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      list[(to + list.length) % list.length].focus();
    };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open, close]);
  const urgent = rows.some((r) => !CALM.has(r.what));
  return (
    <span ref={ref} className="need-more-wrap">
      <button
        ref={btn} className={cx('need need-more', urgent && 'is-question')} type="button" aria-haspopup="menu" aria-expanded={open}
        aria-label={`${rows.length} more ${rows.length === 1 ? 'session needs' : 'sessions need'} you`} onClick={() => setOpen((o) => !o)}
      >
        +{rows.length}
      </button>
      {open ? (
        <div className="menu need-menu" role="menu" aria-label="More sessions that need you">
          {rows.map((r) => (
            <Link key={r.id} className={cx('menu-item', sessClass({ name: r.name, kind: r.kind }))} role="menuitem" to={r.to} onClick={close} style={{ textDecoration: 'none' }}>
              <SessionGlyph session={{ name: r.name, kind: r.kind }} className="need-glyph" />
              <span className="need-row">
                <b>{r.name}</b> {r.label}
                {r.detail ? <span className="d">{r.detail}</span> : null}
              </span>
              <Icon name={ICON[r.what]} size={14} />
            </Link>
          ))}
        </div>
      ) : null}
    </span>
  );
}

/** The chips, or nothing while no session needs the owner. `here`: the session this screen shows (the cockpit's own, read from the path, by default). */
export function NeedsYou({ max = 3, here }) {
  const { needs } = useShell();
  const loc = useLocation();
  const bar = needsBar(needs || [], { max, here: here === undefined ? sessionIn(loc.pathname) : here });
  if (!bar.chips.length && !bar.more.length) return null;
  return (
    <div className="needs" role="group" aria-label="Sessions that need you">
      {bar.chips.map((r) => <Chip key={r.id} r={r} />)}
      {bar.more.length ? <More rows={bar.more} /> : null}
    </div>
  );
}
