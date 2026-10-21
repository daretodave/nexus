// The topbar's cloud loop line (Fleet, Recover and Git boards): a dot and
// "Cloud loop next 03:30". Drawn from GET /api/cloud; until that is served
// it is left out rather than showing a time nobody scheduled.
import { LoopStatus } from '../../ui/index.js';
import { useCloudLoop } from '../../data/index.js';
import { hhmm } from './util.js';

export default function LoopLine() {
  const cloud = useCloudLoop();
  if (cloud.status !== 'ready' || !cloud.data) return null;
  const c = cloud.data;
  if (c.live === false && !c.paused && !c.next) return null;
  if (c.paused) return <LoopStatus paused>paused</LoopStatus>;
  if (c.running) return <LoopStatus>running</LoopStatus>;
  return c.next ? <LoopStatus>next {hhmm(c.next)}</LoopStatus> : null;
}
