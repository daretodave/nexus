// Routing for every screen, and the shell context every frame reads
// (the inbox badge, owner mode, the repo name). Screens live in screens/.
import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ShellContext, Err } from './ui/index.js';
import { useAppState, useEvents } from './data/index.js';
import { PATHS } from './routes.js';
import Fleet from './screens/Fleet.jsx';
import Cockpit from './screens/Cockpit.jsx';
import Onboarding from './screens/Onboarding.jsx';
import HeadsDown from './screens/HeadsDown.jsx';
import Inbox from './screens/Inbox.jsx';
import Board from './screens/Board.jsx';
import CloudLoop from './screens/CloudLoop.jsx';
import Settings from './screens/Settings.jsx';
import Recover from './screens/Recover.jsx';
import GitPanel from './screens/GitPanel.jsx';

/**
 * Until the person finishes onboarding once, opening the app lands there.
 * Only the first arrival per page load: the rail's Fleet item still works.
 */
let sentToOnboarding = false;
function Home({ app }) {
  const loc = useLocation();
  const [first] = useState(() => !sentToOnboarding);
  const go = first && app.status === 'ready' && !app.data.prefs?.onboarded && loc.pathname === PATHS.fleet;
  useEffect(() => { if (app.status === 'ready') sentToOnboarding = true; }, [app.status]);
  if (go) return <Navigate to={PATHS.onboarding()} replace />;
  return <Fleet />;
}

function Shell() {
  const app = useAppState();
  const live = useEvents();
  if (app.status === 'error' && !app.data) {
    return (
      <div className="ob" style={{ justifyContent: 'center' }}>
        <main className="ob-main" style={{ maxWidth: 560 }}>
          <Err
            title="This page needs its launch link"
            body="Each launch of npx @usenexus/cli prints a link that carries its own token. Open that link, or relaunch and open the new one."
            detail={app.error}
          />
        </main>
      </div>
    );
  }
  const info = app.data?.info || {};
  const shell = { inbox: live.asks.length + live.permissions.length, owner: !!info.owner, repo: info.name || '', app, live };
  return (
    <ShellContext.Provider value={shell}>
      <Routes>
        <Route path="/" element={<Home app={app} />} />
        <Route path="/s/:id" element={<Cockpit />} />
        <Route path="/onboarding" element={<Navigate to={PATHS.onboarding()} replace />} />
        <Route path="/onboarding/:step" element={<Onboarding />} />
        <Route path="/heads-down" element={<HeadsDown />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/board" element={<Board />} />
        <Route path="/cloud" element={<CloudLoop />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/recover" element={<Recover />} />
        <Route path="/git" element={<GitPanel />} />
        <Route path="*" element={<Navigate to={PATHS.fleet} replace />} />
      </Routes>
    </ShellContext.Provider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}
