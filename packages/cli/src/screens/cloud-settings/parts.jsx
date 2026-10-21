// Pieces the Cloud loop and Settings screens share: the topbar frame both
// boards draw (wordmark, title, the loop dot) and the loop-status line.
import { AppFrame, Topbar, Wordmark, TbSep, TbTitle, TbSpacer, LoopStatus } from '../../ui/index.js';
import { hhmm } from './loop.js';

/** The topbar's cloud loop dot: "next 03:30" live (or "live" until the next tick is known), "paused" hollow. */
export function LoopDot({ loop }) {
  if (!loop.wf || loop.paused == null) return null;
  if (loop.paused) return <LoopStatus paused>paused</LoopStatus>;
  return <LoopStatus>{loop.next ? `next ${hhmm(loop.next)}` : 'live'}</LoopStatus>;
}

/** A view frame whose main scrolls (the Settings board's main carries overflow: auto). */
export function Frame({ current, title, sub, label, end, children }) {
  const topbar = (
    <Topbar>
      <Wordmark />
      <TbSep />
      <TbTitle title={title} sub={sub} />
      <TbSpacer />
      {end}
    </Topbar>
  );
  return (
    <AppFrame topbar={topbar} current={current}>
      <main className="view" aria-label={label || title} style={{ overflow: 'auto' }}>{children}</main>
    </AppFrame>
  );
}

/** "a, b and c". */
export function andList(xs) {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}
