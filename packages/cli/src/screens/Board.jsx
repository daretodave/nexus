// STUB (41.3 foundation). Screen agent: build the plan board from
// design/handoff/Board.dc.html and BoardOwner (+ Light) with the PlanKit
// components (CRow, PbList, PbSec, Spec, ChunkIt, CRail, ReqPop, Protect).
// Data: usePlan(), useClaims(), useSummaries().
import { ViewFrame, InboxBtn, Empty, useShell } from '../ui/index.js';

export default function Board() {
  const { repo, owner } = useShell();
  return (
    <ViewFrame current="board" title={repo || 'Plan'} sub={owner ? 'owner · changes land on main' : 'contributor · changes open PRs'} label="Plan board" actions={<InboxBtn />}>
      <Empty sky="flat" title="Nothing ready" body="Every planned chunk is claimed or done. Plot more work, or let the loop rest." />
    </ViewFrame>
  );
}
