// STUB (41.3 foundation). Screen agent: build the cockpit from
// design/handoff/Cockpit.dc.html and its phase boards (CockpitStart,
// CockpitReview, CockpitPackage, CockpitOwner, Cockpit1024, + Light):
// Topbar with Switcher + GitStrip + ModeChip + run mode + LoopStatus +
// PauseBtn, Phases, AppFrame railVariant="cockpit", Panes (Convo or Lp,
// Dock: Tray, Ctx, Composer) and the Stage (SNode, Orb, Fil, Basin, River).
// Data: useEvents(id) for the live stage; useSession(id) for the ledger.
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { AppFrame, Topbar, Wordmark, TbSep, TbTitle, TbSpacer, InboxBtn, Empty } from '../ui/index.js';
import { rememberSession } from '../routes.js';

export default function Cockpit() {
  const { id } = useParams();
  useEffect(() => { rememberSession(id); }, [id]);
  const topbar = (
    <Topbar>
      <Wordmark label="nexus, back to the fleet" />
      <TbSep />
      <TbTitle title={id} />
      <TbSpacer />
      <InboxBtn />
    </Topbar>
  );
  return (
    <AppFrame topbar={topbar} current="cockpit" railVariant="cockpit">
      <main className="view" aria-label={`Cockpit for ${id}`}>
        <Empty sky="quiet" title="The cockpit is on its way" body="This session's stage, conversation and dock arrive with the cockpit screen." />
      </main>
    </AppFrame>
  );
}
