// The answer box's pure half (0.5.1): which choices a question has before and after the wand, what picking one does to
// what is typed, and how a kept answer is labelled. Shared by ui/answer-box.jsx, the Oversight panel and Grill me;
// tested in node (test/answer-box.test.mjs) without a page.

export const REC_WHY = 'What the spec itself recommends.';
export const ASSUMED_WHY = 'What the session assumed.';

/** The wand's id for a question: a plan question's `file:line`, a parked or cloud row's `inbox:<id>`, else null. */
export function choiceId(x) {
  if (!x || x.secret) return null;
  if (x.src === 'durable') return x.raw?.id || (x.raw?.file ? `${x.raw.file}:${x.raw.line}` : null);
  if (x.src === 'inbox') return `inbox:${x.id}`;
  return null;
}

/** The choices a question names itself (no wand): a plan question's recommendation, a parked row's options. */
export function rowOptions(x) {
  if (!x || !Array.isArray(x.opts)) return [];
  if (x.src === 'durable') return x.hasDefault && x.opts[0] ? [{ label: x.opts[0], why: REC_WHY, rec: true }] : [];
  return x.opts.slice(0, 4).map((label, i) => ({ label, why: i === 0 && x.hasDefault ? ASSUMED_WHY : '', ...(i === 0 && x.hasDefault ? { assumed: true } : {}) }));
}

/** The choices to draw: the wand's when it has any, else the row's own. */
export function shownOptions(entry, x) {
  return entry && Array.isArray(entry.options) && entry.options.length ? entry.options : rowOptions(x);
}

const norm = (s) => String(s || '').trim();

/**
 * Picking a choice never loses your words: an empty box, or one holding exactly one of the choices, becomes the
 * picked label; anything else keeps what you wrote under the pick (`label`, a blank line, your words).
 */
export function mergePick(box, label, labels = []) {
  const t = norm(box);
  const l = norm(label);
  if (!t || t === l || labels.some((x) => norm(x) === t)) return l;
  // A pick over an earlier pick and your words: the earlier pick gives way, your words stay.
  for (const x of labels) {
    const head = `${norm(x)}\n\n`;
    if (norm(x) && t.startsWith(head)) return `${l}\n\n${t.slice(head.length)}`;
  }
  return `${l}\n\n${t}`;
}

/** Is this choice the one picked: the box starts with its label. */
export const isPicked = (box, label) => {
  const t = norm(box);
  const l = norm(label);
  return !!l && t.startsWith(l);
};

/**
 * How a kept plan answer is labelled: `decide` from You decide, `default` when the words are exactly the spec's
 * recommendation, else `answered`. A parked or cloud row keeps its own words: `approved` (its assumption) or `changed`.
 */
export function howOf(x, text, options = [], decide = false) {
  const t = norm(text);
  if (x?.src === 'inbox') return t && x.hasDefault && t === norm(x.opts?.[0]) ? 'approved' : 'changed';
  if (decide) return 'decide';
  return options.some((o) => o.rec && norm(o.label) === t) ? 'default' : 'answered';
}

/** "suggested 2h ago" for a cache hit older than ten minutes, else "suggested by Claude". */
export function sourceLine(entry, now = Date.now()) {
  if (!entry) return '';
  if (entry.by === 'demo') return 'Example choices (demo)';
  if (entry.by !== 'ai') return '';
  const ms = now - Number(entry.at || now);
  if (ms < 10 * 60000) return 'suggested by Claude';
  const m = Math.round(ms / 60000);
  if (m < 60) return `suggested ${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `suggested ${h}h ago` : `suggested ${Math.round(h / 24)}d ago`;
}
