// Settings' "Model for new sessions" and "Effort for new sessions" (spec 54, A1): the checkout's GUI prefs
// (POST /api/prefs model / effort, '' = Claude Code's default), passed to the SDK when a session starts. The effort
// offers only the levels the chosen model takes (GET /api/models, from the SDK's supportedModels()); all five while
// the model is the default or the SDK has not said; none for a model without effort support. The helpers' model
// is named below. Styles: styles/permission-mode.css (the radios) and styles/model.css.
import { Seg } from '../../ui/index.js';
import { HELPER_MODEL, MODELS, modelLabel } from '../../../shared/models.mjs';
import { levelsIn } from '../cockpit/ModelBadge.jsx';

/** The model radios: Claude Code's default (labelled with what it resolved to last, when known), then the list. */
export function modelChoices(view) {
  const last = view?.lastModel ? modelLabel(view.lastModel) : '';
  return [
    { value: '', label: 'Claude Code\'s default', sub: last ? `Your login's choice: ${last} on the last session.` : 'Your login\'s choice (/model, or your plan\'s default).' },
    ...MODELS.map((m) => ({ value: m.id, label: m.label, sub: m.id })),
  ];
}

/** The effort choices for a model: Default, then its levels; [] when it takes none. */
export function effortChoices(model, view) {
  const levels = levelsIn(view, model);
  return levels.length ? [{ value: '', label: 'Default' }, ...levels.map((e) => ({ value: e, label: e }))] : [];
}

export function ModelPrefs({ model = '', effort = '', view, onModel, onEffort, name = 'model-pref' }) {
  const choices = modelChoices(view);
  const v = choices.some((c) => c.value === model) ? model : '';
  const efforts = effortChoices(v, view);
  const e = efforts.some((c) => c.value === effort) ? effort : '';
  const helper = view?.helper?.label || modelLabel(HELPER_MODEL);
  return (
    <div className="model-prefs">
      <div className="perm-list" role="radiogroup" aria-label="Model for new sessions">
        {choices.map((c) => (
          <label key={c.value || 'default'} className="check perm-opt">
            <input type="radio" name={name} value={c.value} checked={v === c.value} onChange={() => onModel?.(c.value)} />
            <span className="perm-dot" />
            <span className="check-text">
              <span className="check-title">{c.label}{c.value === '' ? <> <span className="badge-def">default</span></> : null}</span>
              <span className="check-sub">{c.sub}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="model-row">
        <span className="t-body-s c-2" style={{ width: 160, flex: 'none' }}>Effort for new sessions</span>
        {efforts.length
          ? <Seg label="Effort for new sessions" name={`${name}-effort`} value={e} onChange={(x) => onEffort?.(x)} options={efforts} />
          : <span className="model-none">{modelLabel(v)} takes no effort level.</span>}
      </div>
      <p className="t-body-s c-2" style={{ margin: 0 }}>Explode and summaries: {helper}</p>
    </div>
  );
}
