// Every screen's path. Deep-linkable: a browser tab per session works (/s/<id>).
export const PATHS = {
  fleet: '/',
  cockpit: (id) => `/s/${encodeURIComponent(id)}`,
  onboarding: (step = 'welcome') => `/onboarding/${step}`,
  heads: '/heads-down',
  headsFor: (id) => (id ? `/heads-down?s=${encodeURIComponent(id)}` : '/heads-down'),
  inbox: '/inbox',
  /** Grill me (0.5.1): the open plan questions full screen, spec by spec; `spec` starts on one, `resume` picks up. */
  grill: ({ spec, resume } = {}) => {
    const q = new URLSearchParams();
    if (spec) q.set('spec', String(spec));
    if (resume) q.set('resume', '1');
    const s = q.toString();
    return `/inbox/grill${s ? `?${s}` : ''}`;
  },
  board: '/board',
  cloud: '/cloud',
  settings: '/settings',
  recover: '/recover',
  git: '/git',
  vault: '/vault',
  design: '/design',
};

const LAST = 'nexus-last-session';

/** Remember the session a cockpit last showed, so the rail's Cockpit item returns to it. */
export function rememberSession(id) {
  try { sessionStorage.setItem(LAST, id); } catch { /* per-tab nicety only */ }
}

export function lastSession() {
  try { return sessionStorage.getItem(LAST) || null; } catch { return null; }
}
