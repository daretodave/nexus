// STUB (41.3 foundation). Screen agent: build the cloud loop view from
// design/handoff/CloudLoop.dc.html (+ Light): .cl-wrap with the .runs
// timeline and .cl-side cards. Data: useActions(), useRuns(); useCloudLoop()
// once it lands.
import { ViewFrame, InboxBtn, Empty, useShell } from '../ui/index.js';

export default function CloudLoop() {
  const { repo } = useShell();
  return (
    <ViewFrame current="cloud" title="Cloud loop" sub={repo} actions={<InboxBtn />}>
      <Empty sky="waiting" title="No cloud runs yet" body="The first pass runs at the next scheduled tick, or now if you ask." />
    </ViewFrame>
  );
}
