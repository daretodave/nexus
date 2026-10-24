// The answer box's pure half (0.5.1): which choices a question has before and after the wand, what picking one does to
// what is typed (several can be picked), which choices a kept answer went with, and how it is labelled. Shared by
// ui/answer-box.jsx, the Oversight panel and Grill me; tested in node (test/answer-box.test.mjs) without a page.

export const REC_WHY = 'What the spec itself recommends.';
export const ASSUMED_WHY = 'What the session assumed.';

/** The wand's id for a question: a plan question's `file:line`, a parked or cloud row's `inbox:<id>`, else null. */
export function choiceId(x) {
  if (!x || x.secret) return null;
  if (x.src === 'durable') return x.raw?.id || (x.raw?.file ? `${x.raw.file}:${x.raw.line}` : null);
  if (x.src === 'inbox') return `inbox:${x.id}`;
  return null;
}

/** The id a breakout talks about (server/choices.mjs explain): the wand's, or a live ask's row. Never a permission or secret. */
export function explainId(x) {
  if (x && !x.secret && x.src === 'ask') return `inbox:${x.id}`;
  return choiceId(x);
}

/**
 * Does the question read as an agent's shorthand (a chunk id and sub-item letters, a note with no question in it)?
 * Such a one gets the wand's plain restatement on open, without a press (Inbox.jsx).
 */
export function terseQuestion(q) {
  const s = String(q || '').replace(/[`*_]/g, '').trim();
  if (!s) return false;
  return !s.includes('?') || /\([a-z]\)\s/i.test(s);
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
const same = (a, b) => norm(a).replace(/\s+/g, ' ') === norm(b).replace(/\s+/g, ' ');

/**
 * What the box holds, read against the choices: the picked ones are its first lines, one label per line, then a blank
 * line and your own words. -> { picked: [index], words }
 */
export function splitPicks(box, labels = []) {
  const lines = String(box || '').replace(/\r\n/g, '\n').replace(/^\s*\n/, '').split('\n');
  const picked = [];
  let i = 0;
  for (; i < lines.length; i += 1) {
    const at = labels.findIndex((l, j) => norm(l) && !picked.includes(j) && same(l, lines[i]));
    if (at < 0) break;
    picked.push(at);
  }
  return { picked: picked.sort((a, b) => a - b), words: lines.slice(i).join('\n').trim() };
}

/**
 * Picking a choice toggles it and never loses your words: several can be picked (each on its own line, in the
 * choices' order), and whatever you wrote stays under them after a blank line.
 */
export function togglePick(box, label, labels = []) {
  const all = labels.some((l) => same(l, label)) ? labels : [...labels, label];
  const at = all.findIndex((l) => same(l, label));
  const { picked, words } = splitPicks(box, all);
  const next = picked.includes(at) ? picked.filter((i) => i !== at) : [...picked, at].sort((a, b) => a - b);
  const head = next.map((i) => norm(all[i])).join('\n');
  return head && words ? `${head}\n\n${words}` : head || words;
}

/** Is this choice picked: its label is one of the box's first lines. */
export const isPicked = (box, label, labels = [label]) => {
  if (!norm(label)) return false;
  const at = labels.findIndex((l) => same(l, label));
  return at >= 0 && splitPicks(box, labels).picked.includes(at);
};

/** The choices a kept answer was given beside, for the session: { options: [label], picked: [index] }, or null. */
export function choicesOf(box, options = []) {
  const labels = options.map((o) => (typeof o === 'string' ? o : o?.label)).filter((l) => norm(l));
  if (!labels.length) return null;
  return { options: labels, picked: splitPicks(box, labels).picked };
}

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
