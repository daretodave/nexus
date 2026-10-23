// The models a session can run on, and the efforts beside them (spec 54): one list in one place, read by the
// server (prefs, the switch route, the helpers) and the GUI (the cockpit's badge, Fleet tiles, Settings).
//
// '' as a model or an effort means Claude Code's own default: nothing is passed to the SDK, so the login's choice
// (`/model`, ~/.claude/settings.json, else the plan's default) stands.

export const MODELS = [
  { id: 'claude-fable-5-1', label: 'Fable 5.1' },
  { id: 'claude-opus-5-5', label: 'Opus 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5' },
];

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

/** The model the GUI's helpers use (Explode, the Plan board's AI summaries). */
export const HELPER_MODEL = 'claude-haiku-5-5';

/** A model id without the suffixes Claude Code adds to it ("[1m]", a date): what the list is keyed by. */
export function baseModel(id) {
  return String(id || '').trim().replace(/\[[^\]]*\]$/, '').replace(/-\d{8}$/, '');
}

/** The listed model `id` names (a dated or [1m] spelling too), or null. */
export function modelOf(id) {
  const b = baseModel(id);
  return MODELS.find((m) => m.id === b) || null;
}

/** A model's name for people: "Opus 5.5"; an id the list does not know is shown as it is. */
export function modelLabel(id) {
  const m = modelOf(id);
  return m ? m.label : String(id || '');
}

/** A pref or a pick: '' (Claude Code's default) or a listed id. Anything else is not a model here. */
export const validModel = (v) => v === '' || MODELS.some((m) => m.id === v);
export const validEffort = (v) => v === '' || EFFORTS.includes(v);

/**
 * The effort levels a model takes, from the SDK's supportedModels() rows (`catalog`, cached per server): [] for a
 * model without effort support, its supportedEffortLevels when listed, else all five (unknown: the model is
 * Claude Code's default, or no session has asked the SDK yet).
 */
export function effortsFor(id, catalog) {
  const info = id ? catalogRow(id, catalog) : null;
  if (!info) return EFFORTS.slice();
  if (info.supportsEffort === false) return [];
  const levels = Array.isArray(info.supportedEffortLevels) ? info.supportedEffortLevels.filter((e) => EFFORTS.includes(e)) : null;
  return levels && levels.length ? EFFORTS.filter((e) => levels.includes(e)) : EFFORTS.slice();
}

/** The SDK's ModelInfo row for `id`: its value, or the wire id an alias row resolves to. */
export function catalogRow(id, catalog) {
  if (!Array.isArray(catalog)) return null;
  const b = baseModel(id);
  return catalog.find((r) => r && (baseModel(r.value) === b || baseModel(r.resolvedModel) === b)) || null;
}

/** The badge's words: "Opus 5.5 · high", the model alone when no effort is sent, "model: starting…" before the SDK says. */
export function badgeText({ model, effort } = {}) {
  if (!model) return 'model: starting…';
  return effort ? `${modelLabel(model)} · ${effort}` : modelLabel(model);
}
