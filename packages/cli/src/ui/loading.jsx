// Loading, drawn as the shape of what is coming: a screen's frame the moment its rail item is clicked (the screen's
// own code may still be on its way), and quiet placeholder rows or tiles while its first read is out. A screen that
// was open before shows what it showed last instead (data/hooks.js keeps it), so these are seen only the first time.
import { useLocation } from 'react-router-dom';
import { railOf } from '../routes.js';
import { AppFrame, Topbar, Wordmark, TbSep, TbTitle, TbSpacer, InboxBtn } from './shell.jsx';
import '../styles/loading.css';

/** One shimmering bar. `w`: its width (a CSS length). */
export function SkelLine({ w = '100%', h = 12, style }) {
  return <span className="skel" style={{ width: w, height: h, ...style }} aria-hidden="true" />;
}

/** Placeholder rows for a list or a table. */
export function SkelRows({ n = 6, label = 'Loading' }) {
  return (
    <div className="skel-rows" role="status" aria-label={label}>
      {Array.from({ length: n }, (_, i) => (
        <div className="skel-row" key={i} style={{ '--i': i }}>
          <SkelLine w="18px" h={18} style={{ borderRadius: 6 }} />
          <SkelLine w={`${46 + ((i * 17) % 34)}%`} />
          <SkelLine w="72px" />
        </div>
      ))}
    </div>
  );
}

/** Placeholder tiles for the fleet's grid. */
export function SkelTiles({ n = 3, label = 'Loading the sessions' }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div className="skel-tile" key={i} role={i ? undefined : 'status'} aria-label={i ? undefined : label} style={{ '--i': i }}>
          <div className="skel-tile-head"><SkelLine w="14px" h={14} style={{ borderRadius: '50%' }} /><SkelLine w="38%" h={14} /></div>
          <div className="skel-tile-body">
            <span className="skel skel-stage" aria-hidden="true" />
            <div className="skel-tile-lines"><SkelLine w="40%" /><SkelLine w="86%" h={14} /><SkelLine w="70%" /><SkelLine w="92%" h={6} /></div>
          </div>
          <SkelLine w="64%" h={20} style={{ borderRadius: 999 }} />
        </div>
      ))}
    </>
  );
}

const TITLES = {
  fleet: 'Fleet', cockpit: 'Cockpit', heads: 'Heads-down', inbox: 'Oversight', board: 'Plan', cloud: 'Cloud loop',
  git: 'Git', vault: 'Vault', settings: 'Settings', recover: 'Recover', design: 'Design',
};

/**
 * The frame a screen lands in while its code loads: its rail item lit and its name on the top bar at once, then
 * placeholder rows. Onboarding draws its own frame, so it waits on a plain field.
 */
export function ScreenLoading() {
  const { pathname } = useLocation();
  const id = railOf(pathname);
  if (id === 'onboarding') return <div className="skel-blank" aria-busy="true" />;
  const topbar = (
    <Topbar>
      <Wordmark />
      <TbSep />
      <TbTitle title={TITLES[id] || 'nexus'} />
      <TbSpacer />
      <InboxBtn />
    </Topbar>
  );
  return (
    <AppFrame topbar={topbar} current={id}>
      <main className="view" aria-label={TITLES[id] || 'Loading'} aria-busy="true">
        {id === 'fleet' ? <div className="fleet-grid"><SkelTiles /></div> : <SkelRows label={`Loading ${TITLES[id] || 'this screen'}`} />}
      </main>
    </AppFrame>
  );
}
