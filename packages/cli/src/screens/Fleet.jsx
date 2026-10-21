// STUB (41.3 foundation). Screen agent: build the fleet home from
// design/handoff/Fleet.dc.html (+ FleetTrain, FleetLight) with the
// FleetKit components (Tile, GitStrip, Train, TrainDock, MTrack, TileBar).
// Data: useSessions() (status 'missing' until GET /api/sessions lands).
import { ViewFrame, InboxBtn, Empty } from '../ui/index.js';
import { useSessions } from '../data/index.js';

export default function Fleet() {
  const sessions = useSessions();
  return (
    <ViewFrame current="fleet" title="Fleet" actions={<InboxBtn />}>
      {sessions.status === 'ready' && sessions.data?.length ? null : (
        <Empty sky="none" title="No sessions running" body="Start one from a terminal or here; each gets a tile and a star." />
      )}
    </ViewFrame>
  );
}
