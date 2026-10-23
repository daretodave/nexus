// Routing for every screen, and the shell context every frame reads
// (the inbox badge, owner mode, the repo name). Screens live in screens/.
import { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ShellContext, Err, ScreenLoading } from './ui/index.js';
import { useAppState, useEvents, useInbox, useNeeds, useReloadOn } from './data/index.js';
import { fromInbox } from './screens/headsdown-inbox/inboxModel.js';
import { PATHS } from './routes.js';
// Every screen is its own chunk, fetched when its route first renders, so
// the first paint loads the shell and one screen, not all ten. Once the
// first screen is up, the rest are fetched in the background, so moving
// between screens never waits on the network.
const SCREENS = {
  Fleet: () => import('./screens/Fleet.jsx'),
  Cockpit: () => import('./screens/Cockpit.jsx'),
  Onboarding: () => import('./screens/Onboarding.jsx'),
  HeadsDown: () => import('./screens/HeadsDown.jsx'),
  Inbox: () => import('./screens/Inbox.jsx'),
  Grill: () => import('./screens/Grill.jsx'),
  Board: () => import('./screens/Board.jsx'),
  CloudLoop: () => import('./screens/CloudLoop.jsx'),
  Settings: () => import('./screens/Settings.jsx'),
  Recover: () => import('./screens/Recover.jsx'),
  GitPanel: () => import('./screens/GitPanel.jsx'),
  Vault: () => import('./screens/Vault.jsx'),
  Design: () => import('./screens/Design.jsx'),
};
// A screen whose code has arrived renders straight away; until then it is lazy and its route shows ScreenLoading.
// (lazy alone suspends on every first render, even for code already here, which would flash the loading frame.)
function screen(load) {
  let mod = null;
  const fetch = () => load().then((m) => { mod = m; return m; });
  const Lazy = lazy(fetch);
  // Chosen once per mount: switching from Lazy to the module later would remount the screen and lose its state.
  const Screen = (props) => {
    const [Comp] = useState(() => (mod ? mod.default : Lazy));
    return <Comp {...props} />;
  };
  Screen.preload = fetch;
  return Screen;
}
const Fleet = screen(SCREENS.Fleet);
const Cockpit = screen(SCREENS.Cockpit);
const Onboarding = screen(SCREENS.Onboarding);
const HeadsDown = screen(SCREENS.HeadsDown);
const Inbox = screen(SCREENS.Inbox);
const Grill = screen(SCREENS.Grill);
const Board = screen(SCREENS.Board);
const CloudLoop = screen(SCREENS.CloudLoop);
const Settings = screen(SCREENS.Settings);
const Recover = screen(SCREENS.Recover);
const GitPanel = screen(SCREENS.GitPanel);
const Vault = screen(SCREENS.Vault);
const Design = screen(SCREENS.Design);
const ALL = [Fleet, Cockpit, Onboarding, HeadsDown, Inbox, Grill, Board, CloudLoop, Settings, Recover, GitPanel, Vault, Design];

function usePrefetchScreens() {
  useEffect(() => {
    const go = () => { for (const s of ALL) s.preload().catch(() => {}); };
    const t = setTimeout(go, 1500);
    return () => clearTimeout(t);
  }, []);
}

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
  const inbox = useInbox();
  const polled = useNeeds();
  usePrefetchScreens();
  // A question asked or answered on the live channel moves the badge now, not at the next poll.
  useReloadOn(live.asks.length + live.permissions.length, inbox);
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
  // The Oversight badge: the merged inbox once the server serves it (so it
  // matches the Inbox's "All N"), else today's live questions and permissions.
  const open = inbox.status === 'ready' && inbox.data
    ? fromInbox(inbox.data).filter((x) => !x.settled).length
    : live.asks.length + live.permissions.length;
  // Who needs the owner: the live channel's word when it is the newer, else the last look.
  const seen = polled.status === 'ready' ? polled.data : null;
  const needs = (live.needs && (!seen || (live.needs.at || 0) >= (seen.at || 0)) ? live.needs : seen)?.items || [];
  const shell = { inbox: open, owner: !!info.owner, repo: info.name || '', app, live, needs };
  return (
    <ShellContext.Provider value={shell}>
      {/* A screen whose code is still on its way lands in its frame at once: rail lit, name up, rows to come. */}
      <Suspense fallback={<ScreenLoading />}>
      <Routes>
        <Route path="/" element={<Home app={app} />} />
        <Route path="/s/:id" element={<Cockpit />} />
        <Route path="/onboarding" element={<Navigate to={PATHS.onboarding()} replace />} />
        <Route path="/onboarding/:step" element={<Onboarding />} />
        <Route path="/heads-down" element={<HeadsDown />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/inbox/grill" element={<Grill />} />
        <Route path="/board" element={<Board />} />
        <Route path="/cloud" element={<CloudLoop />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/recover" element={<Recover />} />
        <Route path="/git" element={<GitPanel />} />
        <Route path="/vault" element={<Vault />} />
        <Route path="/design" element={<Design />} />
        <Route path="*" element={<Navigate to={PATHS.fleet} replace />} />
      </Routes>
      </Suspense>
    </ShellContext.Provider>
  );
}

export default function App() {
  return (
    // Not a transition: a click on the rail changes the screen now (its frame, while its code loads), rather than
    // keeping the old screen up until the new one is ready.
    <BrowserRouter useTransitions={false}>
      <Shell />
    </BrowserRouter>
  );
}
