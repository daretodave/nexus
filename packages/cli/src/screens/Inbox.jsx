// STUB (41.3 foundation). Screen agent: build the oversight inbox from
// design/handoff/Inbox.dc.html (+ Light): .inbox with grouped .ibx-row
// lists and the .ibx-panel (Tug, context, done). Data: live asks and
// permissions (useShell().live), useOversight(); useInbox() once it lands.
import { ViewFrame, Empty } from '../ui/index.js';

export default function Inbox() {
  return (
    <ViewFrame current="inbox" title="Oversight" label="Oversight inbox">
      <Empty sky="quiet" title="Nothing needs you" body="No open questions in any session. Parked ones will show up here at the end of each run." />
    </ViewFrame>
  );
}
