// How infinite runs, asked inline when Infinite is picked: two mode tiles (march | next loop) with a sliding puck,
// then the chosen mode's one question as a three-step control whose thumb glows stronger toward the bold end: how
// hard march's ideate passes push, or what the next loop does when the plan runs dry. A meaning line says each step
// in plain words, and the preview shows exactly what reaches the session. Keyboard: each group is one tab stop,
// arrows move and select, Home/End jump; an owner-only step stays visible but can't be chosen. Words: follow.js.
import { useId, useRef, useState } from 'react';
import { Icon, cx } from '../../ui/index.js';
import { DRY, DRY_COPY, IDEAS, IDEAS_COPY, MODES, MODE_COPY, followPrompt, normFollow } from './follow.js';
import '../../styles/infinite-follow.css';

const OWNER_ONLY = "Owner mode only: a contributor's ideas wait for review.";

/** Arrow / Home / End over `list`, skipping disabled values; returns the value to select, or null. */
function stepKey(key, list, current, isOff) {
  const on = list.filter((v) => !isOff(v));
  if (!on.length) return null;
  const at = Math.max(0, on.indexOf(current));
  if (key === 'Home') return on[0];
  if (key === 'End') return on[on.length - 1];
  if (key === 'ArrowRight' || key === 'ArrowDown') return on[(at + 1) % on.length];
  if (key === 'ArrowLeft' || key === 'ArrowUp') return on[(at - 1 + on.length) % on.length];
  return null;
}

/** A radiogroup whose buttons share one roving tab stop. `render(v, chosen)` draws each button's inside. */
function Radios({ list, value, onPick, label, describedBy, className, disabled, isOff = () => false, render, titleOf = () => undefined, itemClass = '' }) {
  const refs = useRef({});
  function onKeyDown(e) {
    if (disabled) return;
    const v = stepKey(e.key, list, value, isOff);
    if (v == null) return;
    e.preventDefault();
    onPick(v);
    refs.current[v]?.focus();
  }
  return (
    <div className={className} role="radiogroup" aria-label={label} aria-describedby={describedBy} aria-disabled={disabled || undefined} onKeyDown={onKeyDown}
      style={{ '--i': Math.max(0, list.indexOf(value)), '--n': list.length }}>
      {list.map((v) => {
        const chosen = v === value;
        const off = isOff(v);
        return (
          <button key={v} ref={(el) => { refs.current[v] = el; }} type="button" role="radio" aria-checked={chosen} aria-disabled={off || undefined}
            tabIndex={chosen ? 0 : -1} title={titleOf(v)} className={cx(itemClass, chosen && 'is-on', off && 'is-off')}
            onClick={() => { if (!off && !disabled) onPick(v); }}>
            {render(v, chosen)}
          </button>
        );
      })}
    </div>
  );
}

/** `value` a follow choice (follow.js), `onChange(next)`; `owner === false` keeps Build it off; `busy` while starting. */
export default function InfiniteFollow({ value, onChange, owner = true, busy = false, open = true }) {
  const f = normFollow(value, { owner });
  const [played, setPlayed] = useState(null); // the mode whose icon plays its one flourish
  const set = (patch) => onChange?.(normFollow({ ...f, ...patch }, { owner }));
  const march = f.mode === 'march';
  const list = march ? IDEAS : DRY;
  const current = march ? f.ideas : f.dry;
  const copy = march ? IDEAS_COPY : DRY_COPY;
  const isOff = (v) => !march && v === 'build' && owner === false;
  const meaningId = `${useId()}-meaning`;
  const level = Math.max(0, list.indexOf(current));

  return (
    <div className={cx('sp-follow', open && 'is-open')} inert={!open} aria-hidden={open ? undefined : true}>
      <div className="if-inner">
        <div className="if-head cap">How should infinite run?</div>
        <Radios className="if-modes" itemClass="if-mode" list={MODES} value={f.mode} label="How infinite runs" disabled={busy}
          onPick={(mode) => { setPlayed(mode); set({ mode }); }}
          render={(m, chosen) => (
            <>
              <span className={cx('if-ic', `if-ic-${m}`, chosen && played === m && 'is-played')} onAnimationEnd={() => setPlayed(null)}>
                <Icon name={MODE_COPY[m].icon} size={16} />
              </span>
              <span className="if-mode-text">
                <span className="if-mode-label">{MODE_COPY[m].label}</span>
                <span className="if-mode-sub">{MODE_COPY[m].sub}</span>
              </span>
            </>
          )} />
        <div className="if-mode-note">{MODE_COPY[f.mode].sub}</div>

        <div className="if-q">
          <div className="if-q-head">
            <span className="cap">{march ? 'New ideas' : 'When the plan runs dry'}</span>
            {!march ? <span className="if-chip cap">most autonomous</span> : null}
          </div>
          <Radios key={f.mode} className={cx('if-steps', `is-lvl${level}`)} itemClass="if-step" list={list} value={current} disabled={busy}
            label={march ? 'New ideas' : 'When the plan runs dry'} describedBy={meaningId} isOff={isOff}
            titleOf={(v) => (isOff(v) ? OWNER_ONLY : copy[v].meaning)}
            onPick={(v) => set(march ? { ideas: v } : { dry: v })}
            render={(v) => (
              <>
                {v === 'build' ? <span className="if-orbit"><Icon name="orbit" size={13} /></span> : null}
                <span className="if-step-label">{copy[v].label}</span>
              </>
            )} />
          <div className="if-meaning" id={meaningId} aria-live="polite" key={`${f.mode}-${current}`}>{copy[current].meaning}</div>
        </div>
        <div className="if-preview">sends <code>{followPrompt(f)}</code></div>
      </div>
    </div>
  );
}
