// Grill me's spec side (0.5.1): the spec you are in, what it is and why it matters (server/spec-brief.mjs, read from
// the spec itself), its wand, and an index of its questions to jump between. Under 1200px it sits above the question,
// its brief behind "About this spec" (open on the first visit to each spec).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Markdown, cx } from '../../ui/index.js';
import { WandBtn } from '../../ui/wand.jsx';
import { PATHS } from '../../routes.js';
import { standing } from './model.js';

const DOT = { kept: 'is-kept', decided: 'is-decided', skipped: 'is-skipped', open: '' };
const DOT_WORD = { kept: 'answered', decided: 'left to the session', skipped: 'skipped', open: 'open' };

/** Wide enough for the spec to sit beside the question (its brief always open there). */
function useWide() {
  const q = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(min-width: 1200px)') : null;
  const [on, setOn] = useState(() => !!q?.matches);
  useEffect(() => {
    if (!q) return undefined;
    const f = () => setOn(q.matches);
    q.addEventListener?.('change', f);
    return () => q.removeEventListener?.('change', f);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return on;
}

export function SpecSide({ spec, brief, curId, done, skipped, wand, onWand, onJump, firstVisit }) {
  const wide = useWide();
  const [about, setAbout] = useState(!!firstVisit);
  useEffect(() => { setAbout(!!firstVisit); }, [spec.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = spec.ids.filter((id) => standing(id, done, skipped) === 'open').length;
  return (
    <aside className="grill-side" aria-label={spec.n ? `Spec ${spec.n}` : spec.file} key={spec.key}>
      <div className="grill-side-top">
        {spec.n ? <span className="grill-side-n">{spec.n}</span> : null}
        <div className="grill-side-t">{spec.n ? brief?.title || spec.title : 'Other files'}</div>
        <div className="grill-side-f"><span>{spec.file}</span> · <Link to={PATHS.board}>Open the spec</Link></div>
      </div>
      <details className="grill-about" open={wide || about} onToggle={(e) => { if (!wide) setAbout(e.currentTarget.open); }}>
        <summary>About this spec</summary>
        {brief?.lede ? <div className="grill-lede"><Markdown text={brief.lede} /></div> : null}
        {brief?.why ? (
          <div className="grill-why">
            <div className="t-caps c-3">Why it matters</div>
            <Markdown text={brief.why} />
          </div>
        ) : null}
      </details>
      {onWand && open ? <WandBtn state={wand} label={`Suggest again for all ${open}`} onClick={onWand} /> : null}
      <ol className="grill-index" aria-label="Questions in this spec">
        {spec.ids.map((id, i) => {
          const s = standing(id, done, skipped);
          return (
            <li key={id}>
              <button type="button" className={cx('grill-dot', DOT[s], id === curId && 'is-cur')} onClick={() => onJump(id)} aria-label={`Question ${i + 1}, ${DOT_WORD[s]}`} aria-current={id === curId ? 'step' : undefined}>
                {i + 1}
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
