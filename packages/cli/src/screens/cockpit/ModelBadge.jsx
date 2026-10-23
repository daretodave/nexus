// The cockpit's model badge (spec 54, A1): the model and effort the SDK says this session runs on ("Opus 5.5 · high",
// "model: starting…" before its first init), and a menu that switches either from the next turn
// (POST /api/sessions/:id/model). The badge keeps what runs until the next init confirms a switch; the menu says
// what is pending meanwhile. A model without effort support shows no effort and offers none.
// Styles: styles/model.css (the .btn, .menu pieces from nexus.css).
import { useState } from 'react';
import { Icon, cx } from '../../ui/index.js';
import { EFFORTS, MODELS, badgeText, baseModel, modelLabel } from '../../../shared/models.mjs';
import { useDismiss } from './CockpitTop.jsx';

/** A model's effort levels from GET /api/models (null: not known yet, so all five). Unlisted ids: all five. */
export function levelsIn(view, id) {
  const b = baseModel(id);
  const m = view?.models?.find((x) => x.id === b);
  return m && Array.isArray(m.efforts) ? m.efforts : EFFORTS.slice();
}

/**
 * The menu's rows: the model list (Claude Code's default first) and the chosen model's effort levels.
 * `at`: the model and effort the menu marks (a pending switch, else what runs).
 */
export function modelMenu({ model, effort, pending, view }) {
  const at = pending ? { model: pending.model, effort: pending.effort } : { model: baseModel(model), effort: effort || '' };
  const current = at.model ?? '';
  const levels = levelsIn(view, current || baseModel(model));
  const models = [
    { id: '', label: 'Claude Code\'s default', desc: view?.lastModel ? `resolved to ${modelLabel(view.lastModel)} last time` : 'what your login picks' },
    ...MODELS.map((m) => ({ id: m.id, label: m.label })),
  ].map((m) => ({ ...m, active: m.id === current }));
  const efforts = levels.length ? [{ id: '', label: 'Default', active: !at.effort }, ...levels.map((e) => ({ id: e, label: e, active: at.effort === e }))] : [];
  const note = pending ? `${pending.model ? modelLabel(pending.model) : 'Claude Code\'s default'}${pending.effort ? ` · ${pending.effort}` : ''} applies from the next turn` : null;
  return { models, efforts, note };
}

/** The open menu (rendered on its own for tests). */
export function ModelMenu({ model, effort, pending, view, onPick, style }) {
  const m = modelMenu({ model, effort, pending, view });
  return (
    <div className="menu model-menu" role="menu" aria-label="Model and effort" style={style}>
      <div className="menu-head"><span className="t-caps c-2">Model</span></div>
      {m.models.map((x) => (
        <button key={`m-${x.id}`} className={cx('menu-item', x.active && 'is-active')} type="button" role="menuitemradio" aria-checked={x.active} onClick={() => onPick?.({ model: x.id })}>
          <span />
          <span>{x.label}{x.desc ? <span className="d">{x.desc}</span> : null}</span>
          {x.active ? <Icon name="check" /> : <span />}
        </button>
      ))}
      {m.efforts.length ? <>
        <div className="menu-sep" />
        <div className="menu-head"><span className="t-caps c-2">Effort</span></div>
        <div className="model-efforts" role="group" aria-label="Effort">
          {m.efforts.map((x) => (
            <button key={`e-${x.id}`} className={cx('model-effort', x.active && 'is-active')} type="button" role="menuitemradio" aria-checked={x.active} onClick={() => onPick?.({ effort: x.id })}>{x.label}</button>
          ))}
        </div>
      </> : null}
      {m.note ? <p className="model-note" role="status">{m.note}</p> : <p className="model-note">A switch applies from the next turn.</p>}
    </div>
  );
}

/**
 * model, effort: what the SDK's last init said (null before it); pending: a switch not yet confirmed;
 * view: GET /api/models (the list's effort levels); onPick({ model } | { effort }).
 */
export default function ModelBadge({ model, effort, pending, view, onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const text = badgeText({ model, effort });
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        className={cx('btn btn-s model-badge', !model && 'is-starting', pending && 'is-pending')} type="button"
        aria-label={`Model: ${text}${pending ? ' (a switch applies from the next turn)' : ''}`} aria-haspopup="menu" aria-expanded={open}
        title={model || undefined} onClick={() => setOpen((o) => !o)}
      >
        <Icon name="sparkle" size={14} /><span className="model-text">{text}</span>{pending ? <span className="model-pend" aria-hidden="true" /> : null}<Icon name="chevronDown" size={14} />
      </button>
      {open ? (
        <ModelMenu
          model={model} effort={effort} pending={pending} view={view}
          style={{ position: 'absolute', zIndex: 9, top: 'calc(100% + 8px)', right: 0, width: 300 }}
          onPick={(pick) => { setOpen(false); onPick?.(pick); }}
        />
      ) : null}
    </span>
  );
}
