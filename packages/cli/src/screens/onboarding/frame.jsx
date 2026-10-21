// The onboarding frame, as every onboarding board draws it: the aurora and
// the starfield behind, a header (wordmark, the stepper's stars, Skip
// setup), the step in main, and a footer (Back, "n of N", the way on).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ob, Stepper, STEPS, Icon } from '../../ui/index.js';
import { server } from '../../data/index.js';
import { PATHS } from '../../routes.js';

/** Leaving setup from anywhere marks it done, so opening the app goes to the fleet next time. */
export function markOnboarded(extra) {
  return server.setPrefs({ onboarded: true, ...extra }).catch(() => null);
}

export function ObFrame({ step, skipped = [], foot, mainStyle, mainClass, children }) {
  const at = STEPS.findIndex((s) => s.id === step);
  const done = STEPS.slice(0, at).map((s) => s.id).filter((id) => !skipped.includes(id));
  const top = (
    <>
      <span className="wordmark"><span className="mark" />nexus</span>
      <Stepper current={step} done={done} skipped={skipped} hrefFor={PATHS.onboarding} label="Setup steps" />
      <Link className="btn btn-ghost btn-s" to={PATHS.fleet} onClick={() => { markOnboarded(); }}>
        Skip setup<Icon name="chevronRight" size={14} />
      </Link>
    </>
  );
  return <Ob top={top} foot={foot ?? <span />} mainStyle={mainStyle} mainClass={mainClass}>{children}</Ob>;
}

/** The footer's Back link. */
export function Back({ to }) {
  return <Link className="btn btn-ghost" to={PATHS.onboarding(to)}><Icon name="chevronLeft" size={14} />Back</Link>;
}

/** The footer's way on: a primary .btn-l link. */
export function Next({ to, children = 'Continue', onClick, size = 'l', iconSize = 14 }) {
  return (
    <Link className={`btn btn-primary btn-${size}`} to={to} onClick={onClick}>
      {children}<Icon name="arrowRight" size={iconSize || undefined} />
    </Link>
  );
}

/**
 * Copy to the clipboard and remember which thing was copied, for the
 * "Copied" swap. Returns [copiedKey, copy(key, text)].
 */
export function useCopy() {
  const [copied, setCopied] = useState(null);
  const t = useRef(null);
  useEffect(() => () => clearTimeout(t.current), []);
  const copy = useCallback((key, text) => {
    try { navigator.clipboard?.writeText(text).catch(() => {}); } catch { /* no clipboard: the text stays on screen to select */ }
    setCopied(key);
    clearTimeout(t.current);
    t.current = setTimeout(() => setCopied(null), 2400);
  }, []);
  return [copied, copy];
}

/** The two faces of a copy button: an icon and label, then a done check and "Copied". */
export function CopyFace({ copied, icon = 'copy', doneColor = true, children }) {
  return copied
    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="check" size={14} style={doneColor ? { color: 'var(--st-done)' } : undefined} />Copied</span>
    : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name={icon} size={14} />{children}</span>;
}

/** ⏎ anywhere outside a control runs `go` (the footer's "Press ⏎ to …"). */
export function useEnter(go) {
  useEffect(() => {
    const on = (e) => {
      if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing) return;
      const el = e.target;
      if (el && el.closest?.('input, textarea, select, button, a, [contenteditable="true"], [role="textbox"]')) return;
      go();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [go]);
}
