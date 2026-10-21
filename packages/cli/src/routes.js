// Every screen's path. Deep-linkable: a browser tab per session works (/s/<id>).
export const PATHS = {
  fleet: '/',
  cockpit: (id) => `/s/${encodeURIComponent(id)}`,
  onboarding: (step = 'welcome') => `/onboarding/${step}`,
  heads: '/heads-down',
  headsFor: (id) => (id ? `/heads-down?s=${encodeURIComponent(id)}` : '/heads-down'),
  inbox: '/inbox',
  board: '/board',
  cloud: '/cloud',
  settings: '/settings',
  recover: '/recover',
  git: '/git',
};

const LAST = 'nexus-last-session';

/** Remember the session a cockpit last showed, so the rail's Cockpit item returns to it. */
export function rememberSession(id) {
  try { sessionStorage.setItem(LAST, id); } catch { /* per-tab nicety only */ }
}

export function lastSession() {
  try { return sessionStorage.getItem(LAST) || null; } catch { return null; }
}
