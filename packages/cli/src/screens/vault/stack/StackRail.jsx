// The stack's rail (design 8.3, `.stk-rail`): "Your stack", how many milestones are done with a thin aurora bar, the
// milestones joined by a line (done, waiting, ready, blocked), the one next action with its button, the names still
// missing, and once everything is done, the git push line with a one-shot shimmer. In onboarding (compact) it folds to
// one line above the cards.
import { Icon, cx } from '../../../ui/index.js';
import { SERVICES, progress, nextAction, missing } from './model.js';
import { CopyBtn } from './StackCard.jsx';

export function railLine(stack) {
  const p = progress(stack);
  const n = nextAction(p, stack);
  return { p, n, line: `${p.done} of ${p.total} · ${n.kind === 'ready' ? `Next: ${n.text}` : n.text}` };
}

export default function StackRail({ stack, ui, compact }) {
  if (!stack || !stack.picked?.length) return null;
  const { p, n, line } = railLine(stack);
  const miss = missing(stack);
  const pct = p.total ? Math.round((100 * p.done) / p.total) : 0;
  const allDone = n.kind === 'done';
  if (compact) {
    return (
      <div className={cx('stk-rail-line', allDone && 'is-done')} role="status">
        <span className="stk-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
        <span>{line}</span>
        {n.kind === 'ready' ? <button className="btn btn-s btn-ghost" type="button" onClick={() => ui.go(n)}>{n.cta}</button> : null}
      </div>
    );
  }
  return (
    <div className={cx('side-card stk-rail', allDone && 'is-done')} aria-label="Your stack">
      <div className="crail-h">
        <span className="t-caps c-2">Your stack</span>
        <span className="tb-spacer" style={{ flex: 1 }} />
        <span className="cap">{p.done} of {p.total}</span>
      </div>
      <span className="stk-bar" role="progressbar" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.done}><i style={{ width: `${pct}%` }} /></span>
      <ol className="stk-ms">
        {p.milestones.map((m) => (
          <li key={m.id} className={cx('stk-m', `is-${m.state}`)}>
            <span className={cx('stk-m-dot', `is-${m.service}`)} title={SERVICES[m.service].name}>{m.state === 'done' ? <Icon name="check" size={10} /> : SERVICES[m.service].mono}</span>
            <span className="stk-m-t">{m.label}{m.note && m.state !== 'done' ? <span className="c-3"> · {m.note}</span> : null}</span>
          </li>
        ))}
      </ol>
      <div className={cx('stk-next', `is-${n.kind}`)}>
        <span className="t-caps c-2">{allDone ? 'Done' : n.kind === 'waiting' ? 'Waiting' : 'Next'}</span>
        <span className="t-body-s">{n.text}</span>
        {n.kind === 'ready' ? <button className="btn btn-s btn-primary" type="button" onClick={() => ui.go(n)}>{n.action || n.check ? <Icon name="bolt" size={14} /> : null}{n.cta}</button> : null}
        {allDone ? <span className="stk-ns-row"><code>{n.copy}</code><CopyBtn text={n.copy} /></span> : null}
        {allDone ? <span className="t-body-s c-3">nexus does not push for you; run it when you are ready.</span> : null}
      </div>
      {miss.length ? (
        <div className="stk-missing">
          <span className="t-body-s c-2">Still missing:</span>
          <span className="stk-chips">
            {miss.map((m) => <button key={m.name} type="button" className="stk-chip is-link" onClick={() => ui.go({ service: m.service, key: m.key })}>{m.name}</button>)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
