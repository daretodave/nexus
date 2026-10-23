// Plan answers go back to the session that asked (spec 53, A1), the screen's pure half.
//
// A plan question's answer is kept on the server (GET/PUT /api/plan-answers, server/plan-answers.mjs) as it is given,
// "answered · not sent yet", until its spec's Continue sends every kept answer of that spec in one message to one
// session: the one that asked when it can be told (continueTarget), else the most recent live session, else a new
// one running /oversight. Never one prompt per answer, never the hidden home session.

/** A plan item's key in the store: its question's `file:line`. */
export const planKey = (x) => x?.raw?.id || (x?.raw?.file ? `${x.raw.file}:${x.raw.line}` : '');

/** A plan item the store may hold: a plan question in words (a secret request goes to the vault, never here). */
export const keepsAnswer = (x) => !!x && x.src === 'durable' && !x.secret;

const HOWS = new Set(['default', 'decide']);

/**
 * The store's entries -> the screen's settled rows for these plan items:
 * { [item id]: { a, how: 'answered'|'default'|'decide', images: [{ file, name, mediaType }], item, sent, to, kept } }.
 */
export function keptDone(items = [], store = {}) {
  const out = {};
  for (const x of items) {
    if (!keepsAnswer(x)) continue;
    const e = store[planKey(x)];
    if (!e || !e.answer) continue;
    out[x.id] = { a: String(e.answer), how: HOWS.has(e.how) ? e.how : 'answered', images: Array.isArray(e.images) ? e.images : [], item: x, sent: !!e.sent, to: e.to || '', kept: true };
  }
  return out;
}

/** The images these settled answers carry, counted. */
export const imageCount = (items = [], done = {}) => items.reduce((n, x) => n + (done[x.id]?.images?.length || 0), 0);

/** Can a Continue reach this session: live, and hosted here or linked (a terminal session must be linked first). */
export function steerable(s) {
  if (!s || s.ended || s.live === false) return false;
  if (['closed', 'fallen', 'paused'].includes(s.state) && !s.hosted) return false;
  return !!(s.hosted || s.linked);
}

const textOf = (v) => (typeof v === 'string' ? v : v && typeof v === 'object' ? [v.text, v.arg].filter(Boolean).join(' ') : '');
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Does this session name the spec: its ledger chunk (`53.1`, or the spec's number), or its last prompt or last message
 * naming the spec file (`plan/53-x.md`, `53-x.md`), a chunk of it (`53.2`) or "spec 53".
 */
export function namesSpec(s, { n, file } = {}) {
  if (!s) return false;
  const num = n ? String(Number(n)) : '';
  const chunk = s.chunk && typeof s.chunk === 'object' ? s.chunk.id : s.chunk;
  if (num && chunk && String(Number(String(chunk).split('.')[0])) === num) return true;
  const hay = [s.lastPrompt, textOf(s.last)].filter(Boolean).join('\n');
  if (!hay) return false;
  const base = file ? String(file).split('/').pop() : '';
  if (base && (hay.includes(file) || hay.includes(base))) return true;
  if (!num) return false;
  const pad = `0*${esc(num)}`;
  return new RegExp(`(?:^|[^\\w.])${pad}\\.\\d+\\b|\\bspec\\s+${pad}\\b|(?:^|[\\s/])${pad}-[a-z]`, 'i').test(hay);
}

/**
 * Where a spec group's Continue goes (spec 53):
 *   (a) a live hosted or linked session that names the spec (namesSpec), the most recent first;
 *   (b) else the most recent live hosted or linked session;
 *   (c) else a new session, which starts running /oversight with the answers.
 * `sessions`: GET /api/sessions rows (newest beat first). -> { kind: 'session', id, name, why: 'asked'|'recent' } | { kind: 'new', name }
 */
export function continueTarget(group = {}, sessions = []) {
  const live = (Array.isArray(sessions) ? sessions : []).filter(steerable);
  const byBeat = [...live].sort((a, b) => String(b.beat || '').localeCompare(String(a.beat || '')));
  const asked = byBeat.find((s) => namesSpec(s, { n: group.n, file: group.file }));
  if (asked) return { kind: 'session', id: asked.id, name: asked.name || asked.id, why: 'asked' };
  if (byBeat[0]) return { kind: 'session', id: byBeat[0].id, name: byBeat[0].name || byBeat[0].id, why: 'recent' };
  return NEW_SESSION;
}

export const NEW_SESSION = Object.freeze({ kind: 'new', id: 'new', name: 'a new session' });

/** The targets the "send to…" picker offers: every live session a Continue can reach (most recent first), then a new one. */
export function continueChoices(sessions = []) {
  const live = (Array.isArray(sessions) ? sessions : []).filter(steerable)
    .sort((a, b) => String(b.beat || '').localeCompare(String(a.beat || '')));
  return [...live.map((s) => ({ kind: 'session', id: s.id, name: s.name || s.id })), NEW_SESSION];
}

/** A group's answers that a Continue sends now: kept and not yet sent, in the group's order. */
export function sendable(groupItems = [], done = {}) {
  return groupItems.filter((x) => keepsAnswer(x) && done[x.id]?.kept && !done[x.id].sent);
}

/** The bar's button: "Send 2 answers to vega and continue", "Send 3 answers (2 images) to a new session and continue". */
export function continueLabel(count, target, images = 0) {
  const who = target?.kind === 'new' ? 'a new session' : target?.name || 'a session';
  const imgs = images ? ` (${images} ${images === 1 ? 'image' : 'images'})` : '';
  return `Send ${count} ${count === 1 ? 'answer' : 'answers'}${imgs} to ${who} and continue`;
}

/**
 * The one POST /api/oversight/answer body a Continue makes: every answer of the group (its words, how it was given
 * and the images it carries: their files and names), and where they go.
 */
export function continueBody(items = [], done = {}, target = NEW_SESSION) {
  return {
    answers: items.map((x) => ({
      file: x.raw.file, line: x.raw.line, text: x.raw.text, answer: done[x.id].a,
      ...(done[x.id].how && done[x.id].how !== 'answered' ? { how: done[x.id].how } : {}),
      ...(done[x.id].images?.length ? { images: done[x.id].images.map((i) => ({ file: i.file, name: i.name })) } : {}),
    })),
    session: target?.kind === 'new' ? 'new' : target?.id,
  };
}
