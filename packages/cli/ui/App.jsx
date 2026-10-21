import { useCallback, useEffect, useState } from 'react';
import { api, useEvents } from './api.js';
import Onboarding from './screens/Onboarding.jsx';
import Cockpit from './screens/Cockpit.jsx';
import HeadsDown from './screens/HeadsDown.jsx';
import Oversight from './screens/Oversight.jsx';
import Claims from './screens/Claims.jsx';
import Actions from './screens/Actions.jsx';

const SCREENS = [
  ['onboarding', 'Start'],
  ['cockpit', 'Cockpit'],
  ['heads-down', 'Heads down'],
  ['oversight', 'Oversight'],
  ['claims', 'Claims'],
  ['actions', 'Cloud loop'],
];

function readTheme() {
  try { return localStorage.getItem('nexus-theme') || 'system'; } catch { return 'system'; }
}

export default function App() {
  const live = useEvents();
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [screen, setScreen] = useState(() => (location.hash.slice(1) || ''));
  const [theme, setTheme] = useState(readTheme);

  const refresh = useCallback(() => api('/api/state').then(setState).catch((e) => setError(e.message)), []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (live.status.state === 'idle') refresh(); }, [live.status.state, refresh]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try { localStorage.setItem('nexus-theme', theme); } catch {}
  }, [theme]);

  const go = (s) => { setScreen(s); history.replaceState(null, '', `#${s}`); };
  const setPrefs = async (patch) => { const prefs = await api('/api/prefs', patch); setState((st) => ({ ...st, prefs })); };

  if (error && !state) {
    return (
      <div className="page">
        <h1>nexus</h1>
        <p className="bad">{error}</p>
        <p className="muted">This page needs the link printed by <code>npx @usenexus/cli</code>; it carries this launch's token. Relaunch and open the new link.</p>
      </div>
    );
  }
  if (!state) return <div className="page muted">connecting...</div>;

  const current = screen || (state.prefs.onboarded ? 'cockpit' : 'onboarding');
  const app = { ...state, refresh, setPrefs };
  const waiting = live.asks.length + live.permissions.length;

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">nexus</span>
        <span className="repo">{state.info.name}{state.info.branch ? ` · ${state.info.branch}` : ''}</span>
        <span className={`pill ${state.info.owner ? 'owner' : ''}`}>{state.info.owner ? 'owner' : 'contributor'}</span>
        <nav className="nav" aria-label="Screens">
          {SCREENS.map(([id, label]) => (
            <button key={id} aria-current={current === id ? 'page' : undefined} onClick={() => go(id)}>
              {label}{id === 'oversight' && waiting > 0 && <span className="badge">{waiting}</span>}
            </button>
          ))}
        </nav>
        <span className="spacer" />
        <label className="check small">
          <input type="checkbox" checked={state.prefs.agents} onChange={(e) => setPrefs({ agents: e.target.checked })} /> sub-agents
        </label>
        <label className="check small">
          <input type="checkbox" checked={state.prefs.workflows} onChange={(e) => setPrefs({ workflows: e.target.checked })} /> workflows
        </label>
        <span className={`small ${live.connected ? 'ok' : 'warn'}`}>{live.connected ? 'o live' : '- reconnecting'}</span>
        <select className="field small" value={theme} onChange={(e) => setTheme(e.target.value)} aria-label="Theme">
          <option value="system">system</option>
          <option value="dark">dark</option>
          <option value="light">light</option>
        </select>
      </header>
      <main className="main">
        {current === 'onboarding' && <Onboarding app={app} go={go} />}
        {current === 'cockpit' && <Cockpit app={app} live={live} />}
        {current === 'heads-down' && <HeadsDown app={app} live={live} />}
        {current === 'oversight' && <Oversight app={app} live={live} />}
        {current === 'claims' && <Claims app={app} />}
        {current === 'actions' && <Actions live={live} />}
      </main>
    </div>
  );
}
