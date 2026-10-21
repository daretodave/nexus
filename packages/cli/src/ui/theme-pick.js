// The theme rule, pure so it is tested: a stored pick is 'dark' or 'light',
// anything else (nothing stored, a stale value) follows the system; the
// system is dark unless it says light. public/theme-boot.js applies the same
// rule before first paint.

/** A stored value -> a pick: 'dark' | 'light' | 'system'. */
export function parsePick(v) {
  return v === 'dark' || v === 'light' ? v : 'system';
}

/** The theme in force: a pick of dark or light wins; 'system' follows prefers-color-scheme (dark by default). */
export function themeFor(pick, systemLight) {
  const p = parsePick(pick);
  return p === 'system' ? (systemLight ? 'light' : 'dark') : p;
}
