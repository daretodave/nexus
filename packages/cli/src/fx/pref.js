// The particle effects preference (Settings > Appearance): on | subtle | off,
// kept per browser the way the theme pick is. It is cosmetic, so it never
// goes to /api/local (that file is the checkout's settings, not the eye's).
// The system's reduced-motion setting wins over any pick: the layer then
// draws nothing at all, as the CSS kill-switch does for every animation.
import { useSyncExternalStore } from 'react';

export const FX_LEVELS = ['on', 'subtle', 'off'];
export const FX_KEY = 'nexus-fx';

/** A stored value as a level; anything unknown (or nothing) is on. */
export function parseFx(v) {
  return FX_LEVELS.includes(v) ? v : 'on';
}

/** Whether the layer draws: a level that is not off, and no reduced-motion ask. */
export function fxActive(level, reduced) {
  return parseFx(level) !== 'off' && !reduced;
}

const listeners = new Set();
let current = null;

function readLevel() {
  try { return parseFx(localStorage.getItem(FX_KEY)); } catch { return 'on'; }
}

/** Pick on | subtle | off and remember it in this browser. */
export function setFxLevel(level) {
  const v = parseFx(level);
  try {
    if (v === 'on') localStorage.removeItem(FX_KEY);
    else localStorage.setItem(FX_KEY, v);
  } catch { /* storage blocked: the pick lasts for this page only */ }
  current = v;
  for (const l of listeners) l();
}

function subscribe(l) {
  listeners.add(l);
  // Another tab changing the pick moves this one too.
  const onStorage = (e) => { if (e.key === FX_KEY) { current = readLevel(); l(); } };
  try { window.addEventListener('storage', onStorage); } catch { /* no window: nothing to follow */ }
  return () => {
    listeners.delete(l);
    try { window.removeEventListener('storage', onStorage); } catch { /* as above */ }
  };
}

function snapshot() {
  if (current == null) current = readLevel();
  return current;
}

/** [level, setLevel]. On the server (a static render) the level reads on. */
export function useFxLevel() {
  const level = useSyncExternalStore(subscribe, snapshot, () => 'on');
  return [level, setFxLevel];
}

const REDUCE = '(prefers-reduced-motion: reduce)';

function subscribeMotion(l) {
  let mq;
  try { mq = window.matchMedia(REDUCE); } catch { return () => {}; }
  mq.addEventListener?.('change', l);
  return () => mq.removeEventListener?.('change', l);
}

function reducedNow() {
  try { return window.matchMedia(REDUCE).matches; } catch { return false; }
}

/** True while the system asks for reduced motion; follows the setting live. False on the server. */
export function useReducedMotion() {
  return useSyncExternalStore(subscribeMotion, reducedNow, () => false);
}
