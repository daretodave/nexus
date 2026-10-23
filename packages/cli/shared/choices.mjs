// The wand's limits and the answer box's (0.5.1), shared by the server (server/choices.mjs, plan-answers.mjs) and the
// screens (ui/answer-box.jsx, ui/wand.jsx, screens/Grill.jsx). Pure.

/** A question's choices: at least two, at most four. */
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 4;
/** A choice's label (the answer itself) and its one-line why. */
export const LABEL_MAX = 120;
export const WHY_MAX = 140;
/** Images one answer carries. */
export const MAX_ANSWER_IMAGES = 6;
/** What an answer with images and no words is kept as. */
export const IMAGE_ONLY_TEXT = '(see the attached images)';
/** What a "You decide" answer with no words is kept as. */
export const DECIDE_TEXT = '(left to the session)';
/** An image kept with an answer: a content-named upload under .nexus/uploads/oversight/ (server/uploads.mjs). */
export const IMAGE_FILE_RE = /^[0-9a-f]{16}\.(png|jpe?g|gif|webp)$/;
/** Where an answer's images live: the uploads folder's name (GET /api/uploads/oversight/<file>). */
export const ANSWER_UPLOADS = 'oversight';

/** A label or why compared the way a person would: no case, spaces or punctuation. */
export const normLabel = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** One clean line, clipped to `max` (an ellipsis when cut). */
export function clip(s, max) {
  const t = String(s ?? '').replace(/\s+/g, ' ').replace(/\p{Extended_Pictographic}/gu, '').trim().replace(/^["'`“‘]+|["'`”’]+$/g, '').trim();
  return t.length > max ? `${t.slice(0, max - 3).trimEnd()}...` : t;
}

/** The image refs an answer may keep: [{ file, name, mediaType }] with a content name that `ok` accepts, at most six. */
export function imageRefs(list, ok = () => true) {
  const out = [];
  for (const r of Array.isArray(list) ? list : []) {
    const file = typeof r === 'string' ? r : r?.file;
    if (!IMAGE_FILE_RE.test(String(file || '')) || out.some((o) => o.file === file) || !ok(file)) continue;
    out.push({ file, name: String((typeof r === 'object' && r?.name) || file).slice(0, 200), mediaType: String((typeof r === 'object' && r?.mediaType) || '') });
    if (out.length >= MAX_ANSWER_IMAGES) break;
  }
  return out;
}

/**
 * The choices an answer was given beside (0.5.1): { options: [label], picked: [index] }, cleaned (at most four labels,
 * picks in range, in order), or null when none were shown. Kept with a plan answer and sent with it, so the session
 * knows what "the first one" means.
 */
export function choiceRefs(v) {
  if (!v || typeof v !== 'object' || !Array.isArray(v.options)) return null;
  const options = v.options.slice(0, MAX_OPTIONS).map((o) => clip(typeof o === 'string' ? o : o?.label, LABEL_MAX));
  if (!options.length || options.some((o) => !o)) return null;
  const picked = [...new Set((Array.isArray(v.picked) ? v.picked : []).map(Number))]
    .filter((i) => Number.isInteger(i) && i >= 0 && i < options.length).sort((a, b) => a - b);
  return { options, picked };
}

/** Those choices as a session reads them: { shown: '1) A; 2) B', picked: '1, 2' | 'none' }, or null. */
export function choicesWords(v) {
  const c = choiceRefs(v);
  if (!c) return null;
  return { shown: c.options.map((o, i) => `${i + 1}) ${o}`).join('; '), picked: c.picked.length ? c.picked.map((i) => i + 1).join(', ') : 'none' };
}
