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

/** The rail item a path lights: 'fleet', 'cockpit', 'heads', 'inbox', 'board', ..., 'onboarding', or null. */
export function railOf(pathname = '/') {
  const p = String(pathname || '/');
  if (p === '/' || p === '') return 'fleet';
  if (p.startsWith('/s/')) return 'cockpit';
  if (p.startsWith('/onboarding')) return 'onboarding';
  const first = p.split('/')[1];
  const map = { 'heads-down': 'heads', inbox: 'inbox', board: 'board', cloud: 'cloud', settings: 'settings', recover: 'recover', git: 'git', vault: 'vault', design: 'design' };
  return map[first] || null;
}

/** The session whose cockpit a path opens (the id in /s/<id>), or null. */
export function sessionIn(pathname) {
  const m = /^\/s\/([^/?#]+)/.exec(String(pathname || ''));
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}
