// Night and dawn. data-theme="dark" | "light" on <html>; the default
// follows prefers-color-scheme, and a pick (Settings > Appearance) is kept
// per browser. public/theme-boot.js applies the same rule before first
// paint, so the page never flashes the wrong sky.
import { useEffect, useSyncExternalStore } from 'react';
import { Seg } from './controls.jsx';
import { parsePick, themeFor } from './theme-pick.js';

const KEY = 'nexus-theme';
const listeners = new Set();

function readPick() {
  try {
    return parsePick(localStorage.getItem(KEY));
  } catch { return 'system'; }
}

function systemLight() {
  try { return window.matchMedia('(prefers-color-scheme: light)').matches; } catch { return false; }
}

/** The theme in force for a pick: dark | light. */
export function resolveTheme(pick = readPick()) {
  return themeFor(pick, parsePick(pick) === 'system' && systemLight());
}

export function applyTheme(pick = readPick()) {
  document.documentElement.setAttribute('data-theme', resolveTheme(pick));
}

/** Pick dark | light | system and remember it in this browser. */
export function setThemePick(pick) {
  try {
    if (pick === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pick);
  } catch { /* storage blocked: the pick lasts for this page only */ }
  current = pick;
  applyTheme(pick);
  for (const l of listeners) l();
}

let current = typeof window === 'undefined' ? 'system' : readPick();

function subscribe(l) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** [pick, setPick, resolved]. Re-applies when the system theme changes and the pick is "system". */
export function useTheme() {
  const pick = useSyncExternalStore(subscribe, () => current, () => 'system');
  useEffect(() => {
    let mq;
    try { mq = window.matchMedia('(prefers-color-scheme: light)'); } catch { return undefined; }
    const on = () => { if (current === 'system') { applyTheme('system'); for (const l of listeners) l(); } };
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return [pick, setThemePick, resolveTheme(pick)];
}

/** Settings > Appearance: Night, Paper at dawn, Follow the system. */
export function ThemeSeg() {
  const [pick, setPick] = useTheme();
  return (
    <Seg
      label="Theme" name="theme" value={pick} onChange={setPick}
      options={[{ value: 'dark', label: 'Night' }, { value: 'light', label: 'Paper at dawn' }, { value: 'system', label: 'Follow the system' }]}
    />
  );
}
