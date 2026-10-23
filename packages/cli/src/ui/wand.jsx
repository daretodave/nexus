// The wand (0.5.1): the button that asks Claude for answer choices, and the choices it brings back, drawn as one
// radio group above the answer box (ui/answer-box.jsx). The glyph is drawn here, in the icons' stroke style, so
// icon-paths.js stays as handed off; its spark is its own path, so it can breathe while the wand works.
// States: idle (the row's own choice, or a quiet invite), loading (skeleton rows), ready (choices, Ask again),
// fallback (the row's choices and a plain note), error (the note and Try again). CSS: styles/wand.css.
import { useEffect, useState } from 'react';
import { Icon } from './icons.jsx';
import { cx } from './controls.jsx';
import { isPicked, sourceLine } from './answer-logic.js';
import '../styles/wand.css';

/** The wand's stick and its spark, on the icons' 24 viewBox. */
export const WAND_STICK = 'M4 20L14.5 9.5M12.8 7.8l3.4 3.4';
export const WAND_SPARK = 'M18.5 2.5v4M16.5 4.5h4M9.5 3.5v2M8.5 4.5h2M20 11v1.6M19.2 11.8h1.6';
export const WAND_D = `${WAND_STICK}${WAND_SPARK}`;

export function WandGlyph({ size, busy }) {
  return (
    <svg className={cx('ic', size && `ic-${size}`, 'wand-ic', busy && 'is-busy')} viewBox="0 0 24 24" aria-hidden="true">
      <path d={WAND_STICK} />
      <path className="wand-spark" d={WAND_SPARK} />
    </svg>
  );
}

/** Reduced motion asked for: the skeleton says what it is doing in words instead of shimmering. */
export function useReducedMotion() {
  const q = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const [on, setOn] = useState(() => !!q?.matches);
  useEffect(() => {
    if (!q) return undefined;
    const f = () => setOn(q.matches);
    q.addEventListener?.('change', f);
    return () => q.removeEventListener?.('change', f);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return on;
}

/**
 * The wand button. `state`: the choices' status (idle|loading|ready|fallback|error); a dot says choices are ready
 * (accent) or came from the row (quiet). `label` shows beside the glyph when given.
 */
export function WandBtn({ state = 'idle', onClick, label, title = 'Suggest answers (Alt+W)', aria = 'Suggest answers', ghost = true, small = false, className }) {
  const busy = state === 'loading';
  return (
    <button
      className={cx('btn', ghost && 'btn-ghost', 'btn-s', 'wand-btn', small && 'is-small', label && 'has-label', className)}
      type="button" onClick={onClick} disabled={busy} aria-busy={busy || undefined} aria-label={label ? undefined : aria} title={title}
    >
      <WandGlyph size={14} busy={busy} />
      {label ? <span>{busy ? 'Suggesting...' : label}</span> : null}
      {state === 'ready' ? <span className="wand-dot" aria-hidden="true" /> : state === 'fallback' ? <span className="wand-dot is-quiet" aria-hidden="true" /> : null}
    </button>
  );
}

/** The plain note under fallback choices, with Try again when trying again can help. */
export function ChoiceNote({ entry, onAsk }) {
  if (!entry?.note) return null;
  return (
    <div className="achoice-note">
      <Icon name="info" size={14} />
      <span>{entry.note}</span>
      {onAsk && entry.reason !== 'off' ? <button className="btn btn-ghost btn-s" type="button" onClick={() => onAsk(true)}>Try again</button> : null}
    </div>
  );
}

/**
 * The choices above an answer: a radio group of numbered rows (label, why, a "spec recommends" tag), the source line
 * and Ask again. `entry` is the store's (data/choices.js), `options` what to draw (the wand's or the row's own),
 * `box` the answer as typed (a choice reads picked while the box starts with it).
 */
export function ChoiceList({ entry, options = [], box = '', onPick, onAsk, canAsk = true, loadingLabel = 'Thinking...', stagger = false }) {
  const reduced = useReducedMotion();
  const status = entry?.status || 'idle';
  const live = status === 'ready' ? `${options.length} ${options.length === 1 ? 'choice' : 'choices'} ready` : status === 'error' || status === 'fallback' ? "Couldn't get suggestions" : '';
  let body;
  if (status === 'loading') {
    body = (
      <div className="achoices is-loading" aria-busy="true">
        <div className="achoice-head"><WandGlyph size={14} busy /><span>{reduced ? 'Suggesting choices...' : loadingLabel}</span></div>
        {[0, 1, 2].map((i) => <div key={i} className="achoice is-skel" aria-hidden="true"><span className="achoice-n" /><span className="skel-l" /><span className="skel-w" /></div>)}
      </div>
    );
  } else if (!options.length) {
    body = (
      <div className="achoices is-empty">
        {status === 'error' || status === 'fallback' ? <ChoiceNote entry={entry} onAsk={canAsk ? onAsk : null} />
          : canAsk ? (
            <div className="achoice-invite">
              <button className="btn btn-ghost btn-s wand-btn has-label" type="button" onClick={() => onAsk?.(false)}><WandGlyph size={14} /><span>Suggest answers</span></button>
              <span className="t-body-s c-3">Claude drafts 2 to 4 from the spec. You can always write your own.</span>
            </div>
          ) : null}
      </div>
    );
  } else {
    const src = sourceLine(entry);
    body = (
      <div className="achoices">
        <div className="achoice-list" role="radiogroup" aria-label="Suggested answers">
          {options.map((o, i) => {
            const picked = isPicked(box, o.label);
            return (
              <button
                key={`${i}:${o.label}`} type="button" role="radio" aria-checked={picked}
                className={cx('achoice', picked && 'is-picked', stagger && 'is-in')} style={stagger ? { animationDelay: `${i * 40}ms` } : undefined}
                onClick={() => onPick?.(o.label, i)}
              >
                <span className="achoice-n">{i + 1}</span>
                <span className="achoice-b">
                  <span className="achoice-l">{o.label}</span>
                  {o.why ? <span className="achoice-w">{o.why}</span> : null}
                </span>
                {o.rec ? <span className="achoice-tag">spec recommends</span> : o.assumed ? <span className="achoice-tag">assumed</span> : null}
              </button>
            );
          })}
        </div>
        {status === 'fallback' || status === 'error' ? <ChoiceNote entry={entry} onAsk={canAsk ? onAsk : null} />
          : src ? (
            <div className="achoice-src">
              <WandGlyph size={12} /><span>{src}</span>
              {canAsk && entry?.by !== 'demo' ? <button className="btn btn-ghost btn-s" type="button" onClick={() => onAsk?.(true)}>Ask again</button> : null}
            </div>
          ) : null}
      </div>
    );
  }
  return (
    <>
      {body}
      <span className="wand-live" aria-live="polite">{live}</span>
    </>
  );
}
