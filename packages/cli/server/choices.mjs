// The wand (0.5.1): 2 to 4 ranked answers for an open question, each with a one-line why, drafted by the helper model
// from the spec the question lives in. Modelled on summaries.mjs.
//
//   GET  /api/oversight/choices                 -> { choices: { [id]: Choice } }   the cache only, never the model
//   POST /api/oversight/choices { ids, fresh? } -> { choices: { [id]: Choice }, errors?: { [id]: "plain words" } }
//
//   Choice = { options: [{ label, why, rec? }], plain?, by: 'ai'|'row'|'none'|'demo', at, note?, reason? }
//
// `plain` (0.5.3): the question in one or two plain sentences for someone who knows the project but not the chunk it
// came from: what is being decided and what it changes. A parked row an agent wrote tersely ("01.13 (a) ..., (c) ...")
// then reads as a question a person can answer.
//
//   POST /api/oversight/explain { id, messages: [{ role: 'you'|'claude', text }] } -> { reply } | { error }
//
// The breakout (0.5.3, explain below): a short side conversation about one question before answering it. Its first
// turn (no messages) says briefly what the question asks, what it affects, and the trade-off of each choice shown.
// Same helper model, same resolve (a secret or unlisted id is refused), no tools, nothing cached: each turn is
// pressed by a person.
//
// An id is a plan question's `file:line` or a parked or cloud row's `inbox:<row id>`. The server resolves each one
// itself (the plan as it reads now, the inbox as it serves now), so a stale tab never asks about words that changed. A
// secret request, a permission or an id nobody lists is refused: a value never reaches the model.
//
// Cheap by construction:
//   - nothing runs unless a person presses a wand (or opens Grill me on a spec); a cache hit never calls the model
//   - one call per spec, at most ten questions a call, at most two calls at once; a wand pressed while its spec is
//     drafting joins that call
//   - the helper model (SUMMARY_MODEL), no tools, one turn, no project settings or session file, a budget cap
//   - the cache key is the id, its question's words and its spec's Design section: editing anything else asks nothing
//   - a reply waits at most 25 s for one question, 45 s for a spec; past it the row's own choices answer and the call
//     finishes into the cache, so Ask again usually hits
//   - off (prefs.aiSummaries false) or no SDK: the row's own choices, said plainly, and the SDK is never loaded
//
// Reads plan/**; writes only .nexus/cache/choices.json at the primary checkout.
import fs from 'node:fs';
import path from 'node:path';
import { primaryRoot } from './local.mjs';
import { chunkBlock, loadQuery, MAX_BUDGET_USD, section, sha, SUMMARY_MODEL } from './summaries.mjs';
import { textHash } from './plan-answers.mjs';
import { recommendedDefault } from '../shared/recommend.mjs';
import { clip, LABEL_MAX, MAX_OPTIONS, MIN_OPTIONS, normLabel, WHY_MAX } from '../shared/choices.mjs';

export const CHOICES_FILE = '.nexus/cache/choices.json';
export const ONE_MS = 25000;
export const SPEC_MS = 45000;
export const HARD_CAP_MS = 120000;
export const MAX_IDS = 40;
export const PER_CALL = 10;
export const AT_ONCE = 2;
const DESIGN_CHARS = 2400;
const OPEN_CHARS = 6000;
const AROUND = 15;
export const REC_WHY = 'What the spec itself recommends.';
export const REFUSED = 'not a question the wand can answer';
export const PLAIN_MAX = 320;
export const EXPLAIN_TURNS = 12;
const EXPLAIN_CHARS = 2000;

export const SYSTEM = [
  "You draft answer choices for open questions in a software project's plan.",
  'For each question id give 2 to 4 distinct answers a thoughtful owner could pick as they are, best first.',
  `Each has a label (the answer itself, at most ${LABEL_MAX} characters, a decision someone can act on, not a restatement of the question)`,
  `and a why (one plain line, at most ${WHY_MAX} characters, the reason it fits this project).`,
  'If the spec names a recommendation, include it as one choice, worded close to the original, with "rec": true.',
  `Also give plain: the question restated in one or two plain sentences (at most ${PLAIN_MAX} characters) for someone who knows the project but not this chunk:`,
  'what is being decided and what the answer changes. Name things, not chunk ids or sub-item letters.',
  'No emoji, no quotes around labels.',
  'Reply with JSON only: {"<id>": {"plain": "...", "options": [{"label": "...", "why": "...", "rec": true}]}}.',
].join(' ');

// ---- what a fallback says ------------------------------------------------------------------

const REASON_LEAD = {
  off: 'AI helpers are off in Settings',
  unavailable: "Claude isn't available here",
};

/** The note under a fallback's choices (or its lack of any). `why`: 'off' | 'unavailable' | a failure in plain words. */
export function fallbackNote(reason, why, hasOptions) {
  const lead = REASON_LEAD[reason] || `Couldn't get suggestions (${why || 'it failed'})`;
  if (hasOptions) return reason in REASON_LEAD ? `${lead}, so these are the choices the question already names.` : `${lead}. These are the choices the question already names.`;
  return `${lead}, and this question names none. Write your answer.`;
}

// ---- the reply -------------------------------------------------------------------------------

/** The first JSON object in a reply (a ```json fence and prose around it tolerated), or null. */
function firstObject(text) {
  const s = String(text ?? '');
  const a = s.indexOf('{');
  if (a < 0) return null;
  // Walk to the brace that closes the first one, minding strings.
  let depth = 0;
  let inStr = false;
  for (let i = a; i < s.length; i += 1) {
    const c = s[i];
    if (inStr) {
      if (c === '\\') i += 1;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) {
        try { return JSON.parse(s.slice(a, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

/**
 * The model's reply -> { choices: { id: [{ label, why, rec? }] }, plain: { id: words }, errors: { id: words } } for the
 * ids asked. Each id's value is { plain, options } or, as the wand asked before 0.5.3, the options list alone.
 */
export function parseReply(text, ids) {
  const j = firstObject(text);
  const choices = {};
  const plain = {};
  const errors = {};
  for (const id of ids) {
    const val = j && typeof j === 'object' ? j[id] : null;
    const whole = val && typeof val === 'object' && !Array.isArray(val);
    const raw = whole ? val.options : val;
    const p = whole ? clip(val.plain, PLAIN_MAX) : '';
    if (p) plain[id] = p;
    const seen = new Set();
    const out = [];
    for (const o of Array.isArray(raw) ? raw : []) {
      const label = clip(typeof o === 'string' ? o : o?.label, LABEL_MAX);
      const key = normLabel(label);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ label, why: clip(typeof o === 'object' ? o?.why : '', WHY_MAX), ...(o && o.rec === true ? { rec: true } : {}) });
      if (out.length >= MAX_OPTIONS) break;
    }
    if (out.length >= MIN_OPTIONS) choices[id] = out;
    else errors[id] = j ? 'the reply had too few choices' : 'the reply was not readable';
  }
  return { choices, plain, errors };
}

/**
 * The spec's own recommendation is never lost: an option that matches it (either contains the other, ignoring case
 * and punctuation) is marked rec and the rest unmarked; with none matching it joins last (taking a fourth option's
 * place). Then the rec option goes first: the spec's recommendation is the owner's own earlier thinking.
 */
export function mergeRec(options, rec) {
  let out = (options || []).map((o) => ({ label: o.label, why: o.why || '' }));
  const r = clip(rec, LABEL_MAX);
  if (!r) return out.slice(0, MAX_OPTIONS);
  const want = normLabel(r);
  const hit = out.findIndex((o) => { const k = normLabel(o.label); return k && want && (k.includes(want) || want.includes(k)); });
  if (hit >= 0) out[hit] = { ...out[hit], rec: true };
  else {
    if (out.length >= MAX_OPTIONS) out = out.slice(0, MAX_OPTIONS - 1);
    out.push({ label: r, why: REC_WHY, rec: true });
  }
  const i = out.findIndex((o) => o.rec);
  return [out[i], ...out.filter((_, k) => k !== i)].slice(0, MAX_OPTIONS);
}

// ---- the context -----------------------------------------------------------------------------

/** A spec's "Open questions" section (any heading level) whole, to the next heading as high or higher. */
export function openSection(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const i = lines.findIndex((l) => /^#{1,6}\s+.*\bopen questions?\b/i.test(l));
  if (i < 0) return '';
  const level = /^(#+)/.exec(lines[i])[1].length;
  const out = [];
  for (let j = i + 1; j < lines.length; j += 1) {
    const h = /^(#+)\s/.exec(lines[j]);
    if (h && h[1].length <= level) break;
    out.push(lines[j]);
  }
  return out.join('\n').trim();
}

const cut = (s, n) => (s.length > n ? `${s.slice(0, n)}...` : s);

/** The lines from AROUND above to AROUND below a 1-based line. */
export function around(text, line) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const at = Math.max(1, Number(line) || 1);
  return lines.slice(Math.max(0, at - 1 - AROUND), at + AROUND).join('\n');
}

/**
 * The prompt for one call. `group`:
 *   { kind: 'spec', n, title, file, design, open, questions: [{ id, text, around, rec, kept: [{ q, a }] }] }
 *   { kind: 'inbox', questions: [{ id, text, block, assumed }] }
 */
export function buildPrompt(group) {
  const parts = [];
  if (group.kind === 'inbox') {
    parts.push('# Questions a working session parked', '');
    for (const q of group.questions) {
      parts.push(`## Question ${q.id}`, q.text, '');
      if (q.block) parts.push('Its chunk in the plan:', q.block, '');
      if (q.assumed) parts.push(`The session assumed: ${q.assumed}`, '');
    }
  } else {
    parts.push(group.n ? `# Spec ${group.n}${group.title ? `: ${group.title}` : ''}` : `# File ${group.file}`, `(${group.file})`, '');
    parts.push('## Design', cut(group.design || '', DESIGN_CHARS) || '(none)', '');
    if (group.open) parts.push('## Open questions (the whole section)', cut(group.open, OPEN_CHARS), '');
    for (const q of group.questions) {
      parts.push(`## Question ${q.id}`, q.text, '', 'Where it sits in the file:', '```', q.around, '```');
      if (q.rec) parts.push(`Spec recommends: ${q.rec}`);
      if (q.kept?.length) parts.push('Already answered for this spec (keep the choices consistent with these):', ...q.kept.map((k) => `- ${k.q.replace(/\s+/g, ' ').slice(0, 160)} -> ${k.a.replace(/\s+/g, ' ').slice(0, 200)}`));
      parts.push('');
    }
  }
  parts.push(`Return JSON: { ${group.questions.map((q) => `"${q.id}": { "plain": "...", "options": [...] }`).join(', ')} }`);
  return parts.join('\n');
}

// ---- the breakout ----------------------------------------------------------------------------

export const EXPLAIN_SYSTEM = [
  "You help a project's owner think through one open question from the project's plan before they answer it.",
  'They know the project and its plan, but not the chunk or session the question came from.',
  'Answer in plain prose, short: a few sentences or a short list, never more than about 150 words. No emoji, no headings.',
  'Say what is actually being decided, what it affects, and the trade-off of each choice, when asked or on the first turn.',
  'Stay on this question. If something cannot be told from what you were given, say so plainly rather than guess.',
].join(' ');

/** The first turn's ask, when the person opens a breakout. */
export const EXPLAIN_FIRST = 'Briefly: what is this question really asking, what will the answer affect, and what is the trade-off of each choice?';

/**
 * The breakout's prompt: the question, where it sits, the choices shown, then the conversation so far (the last
 * EXPLAIN_TURNS turns, each clipped) ending on the person's turn. `q` is a resolved question (createChoices resolve).
 */
export function buildExplainPrompt(q, { options = [], messages = [], fileText = '' } = {}) {
  const parts = ['# The question', q.text, ''];
  if (q.kind === 'plan') {
    parts.push(q.spec?.n ? `It is an open question in spec ${q.spec.n}${q.spec.title ? `: ${q.spec.title}` : ''} (${q.file}).` : `It is in ${q.file}.`, '');
    if (q.design) parts.push('## The spec\'s Design', cut(q.design, DESIGN_CHARS), '');
    if (fileText) parts.push('## Where it sits in the file', '```', around(fileText, q.line), '```', '');
    if (q.rec) parts.push(`The spec recommends: ${q.rec}`, '');
  } else {
    parts.push(q.live
      ? 'A working session is asking it now and waits for the owner; past its timer it takes the default.'
      : 'A working session parked it: it took a default and kept going, and waits for the owner to approve or change it.', '');
    if (q.block) parts.push(`## Its chunk in the plan (${q.chunk})`, cut(q.block, DESIGN_CHARS), '');
    if (q.assumed) parts.push(`${q.live ? 'Its default' : 'The session assumed'}: ${q.assumed}`, '');
    if (q.why) parts.push(`Why, in the session's words: ${q.why}`, '');
  }
  const shown = options.map((o) => (typeof o === 'string' ? { label: o } : o)).filter((o) => o?.label);
  if (shown.length) parts.push('## The choices shown to the owner', ...shown.map((o) => `- ${o.label}${o.why ? `: ${o.why}` : ''}`), '');
  const turns = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && (m.role === 'you' || m.role === 'claude') && String(m.text || '').trim())
    .slice(-EXPLAIN_TURNS);
  if (!turns.length || turns[turns.length - 1].role !== 'you') turns.push({ role: 'you', text: EXPLAIN_FIRST });
  parts.push('## The conversation');
  for (const m of turns) parts.push(`${m.role === 'you' ? 'Owner' : 'You'}: ${cut(String(m.text).trim(), EXPLAIN_CHARS)}`);
  parts.push('', 'Reply to the owner\'s last message.');
  return parts.join('\n');
}

// ---- the cache -------------------------------------------------------------------------------

export function readChoicesCache(root) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(root, CHOICES_FILE), 'utf8'));
    return j && typeof j.entries === 'object' && j.entries ? j.entries : {};
  } catch {
    return {};
  }
}

/** Merge `fresh` ({ id: entry }) in, keep only ids in `keep` (when given), write atomically. */
export function writeChoicesCache(root, fresh, keep) {
  const file = path.join(root, CHOICES_FILE);
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const ignore = path.join(dir, '.gitignore');
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, '# nexus GUI cache: local only\n*\n');
  const entries = {};
  for (const [k, v] of Object.entries({ ...readChoicesCache(root), ...fresh })) if (!keep || keep.has(k)) entries[k] = v;
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ model: SUMMARY_MODEL, entries }, null, 2)}\n`);
  fs.renameSync(tmp, file);
  return entries;
}

/** The cache key: the id, its question's words, its context (the spec's Design, or a parked row's chunk block). */
export const choiceKey = (id, text, context) => sha(`${id}\n${textHash(text)}\n${sha(String(context || ''))}`);

// ---- the model call --------------------------------------------------------------------------

/** One model call. -> { text, cost, error? } */
export async function callModel(prompt, { query, repo, signal, model = SUMMARY_MODEL, system = SYSTEM } = {}) {
  const abortController = new AbortController();
  const onAbort = () => abortController.abort();
  signal?.addEventListener?.('abort', onAbort);
  let q;
  try {
    q = query({
      prompt,
      options: {
        model,
        cwd: repo,
        systemPrompt: system,
        tools: [],
        allowedTools: [],
        settingSources: [],
        mcpServers: {},
        maxTurns: 1,
        maxBudgetUsd: MAX_BUDGET_USD,
        persistSession: false,
        abortController,
        env: { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: 'nexus-cli' },
      },
    });
  } catch (e) {
    signal?.removeEventListener?.('abort', onAbort);
    return { text: '', cost: null, error: String(e?.message || e) };
  }
  let result = null;
  try {
    for await (const msg of q) if (msg && msg.type === 'result') { result = msg; break; }
  } catch (e) {
    return { text: '', cost: null, error: String(e?.message || e) };
  } finally {
    signal?.removeEventListener?.('abort', onAbort);
    try { q.close?.(); } catch { /* already closed */ }
  }
  if (!result) return { text: '', cost: null, error: 'no reply' };
  const cost = result.total_cost_usd ?? null;
  if (result.is_error || (result.subtype && result.subtype !== 'success')) return { text: '', cost, error: String(result.result || result.subtype) };
  return { text: String(result.result || ''), cost };
}

/** A tiny limiter: at most `n` jobs run at once. */
function limiter(n) {
  let running = 0;
  const queue = [];
  const next = () => {
    if (running >= n || !queue.length) return;
    running += 1;
    const { job, ok, no } = queue.shift();
    job().then(ok, no).finally(() => { running -= 1; next(); });
  };
  return (job) => new Promise((ok, no) => { queue.push({ job, ok, no }); next(); });
}

// ---- the engine ------------------------------------------------------------------------------

/**
 * @param {object} o
 * @param {string} o.repo
 * @param {() => Array} o.questions        the plan's questions now (repo.durableQuestions)
 * @param {(text: string) => boolean} [o.isSecret]  a secret request (secrets.mjs parseRequest)
 * @param {() => Promise<Array>} [o.inboxRows]  the parked and cloud rows now (GET /api/inbox rows with src 'inbox')
 * @param {() => object} [o.kept]           the plan-answers store now ({ "<file:line>": { answer } })
 * @param {() => boolean} [o.enabled]       prefs.aiSummaries
 * @param {Function|false} [o.query]        the SDK's query(); false: never; absent: loaded on first use
 * @param {{ one?: number, spec?: number }} [o.timeoutMs]
 */
export function createChoices({ repo, questions, isSecret = () => false, inboxRows = async () => [], kept = () => ({}), enabled = () => true, query, timeoutMs = {}, now = Date.now }) {
  // The primary checkout does not move while the server runs: asked of git once.
  let rootDir = null;
  const root = () => (rootDir ??= primaryRoot(repo));
  const inflight = new Map(); // key -> { ids: Set, promise }
  const run = limiter(AT_ONCE);
  const stats = { calls: 0, cost: 0, last: null };
  const texts = new Map();
  const fileText = (file) => {
    if (!texts.has(file)) {
      const f = path.join(repo, file);
      texts.set(file, fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
    }
    return texts.get(file);
  };

  /** Every id the wand may answer now, resolved: { id, kind, text, file?, line?, spec?, rec?, opts, context }. */
  async function resolve(ids, { asks = false } = {}) {
    texts.clear();
    const want = new Set(ids);
    const out = new Map();
    const refused = [];
    const qs = (questions() || []);
    for (const q of qs) {
      if (!want.has(q.id)) continue;
      if (isSecret(q.text)) continue;
      const text = fileText(q.file);
      const design = section(text, 'Design') || section(text, 'Why');
      const rec = recommendedDefault(q.text);
      out.set(q.id, { id: q.id, kind: 'plan', text: q.text, file: q.file, line: q.line, spec: q.spec || null, rec, opts: rec ? [{ label: clip(rec, LABEL_MAX), why: REC_WHY, rec: true }] : [], context: design, design });
    }
    if (ids.some((id) => String(id).startsWith('inbox:'))) {
      const rows = (await inboxRows().catch(() => [])) || [];
      for (const r of rows) {
        const id = `inbox:${r.id}`;
        // A live ask (a session waiting now) is the breakout's alone: its own choices are already the session's.
        if (!want.has(id) || !(r.src === 'inbox' || (asks && r.src === 'ask')) || !r.question) continue;
        const block = r.chunk ? blockFor(r.chunk) : '';
        const opts = (r.options || []).map((o) => (typeof o === 'string' ? o : o?.label || '')).filter(Boolean);
        const live = r.src === 'ask';
        out.set(id, { id, kind: 'inbox', live, text: String(r.question), chunk: r.chunk || '', block, assumed: opts[0] || '', why: typeof r.why === 'string' ? r.why : '', opts: opts.slice(0, MAX_OPTIONS).map((label, i) => ({ label: clip(label, LABEL_MAX), why: i === 0 ? (live ? 'The default it takes.' : 'What the session assumed.') : '' })), context: block });
      }
    }
    for (const id of ids) if (!out.has(id)) refused.push(id);
    return { found: out, refused };
  }

  /** A parked row's chunk block: the first plan file that carries it. */
  function blockFor(chunk) {
    const dir = path.join(repo, 'plan');
    if (!fs.existsSync(dir)) return '';
    const stack = [dir];
    while (stack.length) {
      const d = stack.pop();
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) stack.push(p);
        else if (e.name.endsWith('.md')) {
          const b = chunkBlock(fs.readFileSync(p, 'utf8'), chunk);
          if (b) return b;
        }
      }
    }
    return '';
  }

  const keyOf = (q) => choiceKey(q.id, q.text, q.context);

  /** The cache's choice for a resolved question, or null. */
  function hit(entries, q) {
    const e = entries[q.id];
    return e && e.key === keyOf(q) && Array.isArray(e.options) && e.options.length ? { options: e.options, ...(e.plain ? { plain: e.plain } : {}), by: 'ai', at: e.at } : null;
  }

  function fallback(q, reason, why) {
    const options = q.opts || [];
    return { options, by: options.length ? 'row' : 'none', at: now(), note: fallbackNote(reason, why, options.length > 0), reason };
  }

  /** The groups one ask makes: per spec file (at most PER_CALL a call), and the parked rows together. */
  function groupsOf(list) {
    const byFile = new Map();
    for (const q of list) {
      const k = q.kind === 'inbox' ? 'inbox:' : q.file;
      if (!byFile.has(k)) byFile.set(k, []);
      byFile.get(k).push(q);
    }
    const store = kept() || {};
    const groups = [];
    for (const [k, qsAll] of byFile) {
      for (let i = 0; i < qsAll.length; i += PER_CALL) {
        const qs = qsAll.slice(i, i + PER_CALL);
        if (k === 'inbox:') {
          groups.push({ kind: 'inbox', questions: qs.map((q) => ({ id: q.id, text: q.text, block: q.block, assumed: q.assumed })), list: qs });
          continue;
        }
        const text = fileText(k);
        const first = qs[0];
        const listed = (questions() || []).filter((x) => x.file === k);
        const keptHere = listed.filter((x) => store[x.id]?.answer && !qs.some((q) => q.id === x.id)).map((x) => ({ q: x.text, a: String(store[x.id].answer) }));
        groups.push({
          kind: 'spec', n: first.spec?.n || '', title: first.spec?.title || '', file: k, design: first.design, open: openSection(text),
          questions: qs.map((q) => ({ id: q.id, text: q.text, around: around(text, q.line), rec: q.rec, kept: keptHere })),
          list: qs,
        });
      }
    }
    return groups;
  }

  /** One call for a group, into the cache. -> { errors: { id: words } } (never rejects) */
  function launch(group, q) {
    const ids = group.list.map((x) => x.id);
    const key = `${group.kind === 'inbox' ? 'inbox' : group.file}|${[...ids].sort().join(',')}`;
    if (inflight.has(key)) return inflight.get(key).promise;
    const promise = run(async () => {
      const ac = new AbortController();
      const cap = setTimeout(() => ac.abort(), HARD_CAP_MS);
      cap.unref?.();
      stats.calls += 1;
      try {
        const r = await callModel(buildPrompt(group), { query: q, repo, signal: ac.signal });
        stats.cost += r.cost || 0;
        if (r.error) return { errors: Object.fromEntries(ids.map((id) => [id, 'it failed'])), error: r.error };
        const { choices, plain, errors } = parseReply(r.text, ids);
        const at = now();
        const fresh = {};
        for (const x of group.list) {
          if (!choices[x.id]) continue;
          const options = x.kind === 'plan' ? mergeRec(choices[x.id], x.rec) : choices[x.id].map(({ label, why }) => ({ label, why }));
          fresh[x.id] = { key: keyOf(x), options, ...(plain[x.id] ? { plain: plain[x.id] } : {}), at };
        }
        if (Object.keys(fresh).length) {
          const keep = new Set([...(questions() || []).map((x) => x.id), ...Object.keys(readChoicesCache(root())).filter((id) => id.startsWith('inbox:')), ...Object.keys(fresh)]);
          writeChoicesCache(root(), fresh, keep);
        }
        stats.last = { at: new Date(at).toISOString(), asked: ids.length, got: Object.keys(fresh).length, cost: r.cost };
        return { errors };
      } catch (e) {
        return { errors: Object.fromEntries(ids.map((id) => [id, 'it failed'])), error: String(e?.message || e) };
      } finally {
        clearTimeout(cap);
      }
    }).finally(() => { inflight.delete(key); });
    inflight.set(key, { ids: new Set(ids), promise });
    return promise;
  }

  return {
    stats,
    /**
     * The breakout: one reply about one question. -> { reply } or { error } (a refused id, the helpers off, no SDK, a
     * failure), never rejects. The choices shown are the cache's (the wand's), else the row's own.
     */
    async explain(rawId, messages = []) {
      const id = String(rawId || '');
      const { found } = await resolve([id], { asks: true });
      const q = found.get(id);
      if (!q) return { error: REFUSED };
      if (!enabled()) return { error: 'AI helpers are off in Settings' };
      const call = query === false ? null : query || await loadQuery();
      if (!call) return { error: "Claude isn't available here" };
      const cachedOpts = hit(readChoicesCache(root()), q)?.options;
      const prompt = buildExplainPrompt(q, { options: cachedOpts || q.opts, messages, fileText: q.kind === 'plan' ? fileText(q.file) : '' });
      const ac = new AbortController();
      const cap = setTimeout(() => ac.abort(), SPEC_MS);
      cap.unref?.();
      stats.calls += 1;
      try {
        const r = await callModel(prompt, { query: call, repo, signal: ac.signal, system: EXPLAIN_SYSTEM });
        stats.cost += r.cost || 0;
        if (r.error) return { error: ac.signal.aborted ? 'took too long' : r.error };
        const reply = String(r.text || '').trim();
        return reply ? { reply } : { error: 'no reply' };
      } finally {
        clearTimeout(cap);
      }
    },
    /** GET: what the cache holds for questions listed now with the same words. Never calls the model. */
    async cached() {
      if (!enabled()) return { choices: {} };
      const entries = readChoicesCache(root());
      const ids = Object.keys(entries);
      if (!ids.length) return { choices: {} };
      const { found } = await resolve(ids);
      const choices = {};
      for (const q of found.values()) { const h = hit(entries, q); if (h) choices[q.id] = h; }
      return { choices };
    },

    /** POST: choices for these ids, from the cache or one call per spec; fallbacks said plainly. */
    async ask(rawIds, { fresh = false } = {}) {
      const started = now();
      const ids = [...new Set((Array.isArray(rawIds) ? rawIds : []).map(String).filter(Boolean))].slice(0, MAX_IDS);
      const { found, refused } = await resolve(ids);
      const choices = {};
      const errors = Object.fromEntries(refused.map((id) => [id, REFUSED]));
      const list = [...found.values()];
      if (!enabled()) {
        for (const q of list) choices[q.id] = fallback(q, 'off');
        return { choices, ...(Object.keys(errors).length ? { errors } : {}) };
      }
      const entries = readChoicesCache(root());
      const misses = [];
      for (const q of list) {
        const h = fresh ? null : hit(entries, q);
        if (h) choices[q.id] = h;
        else misses.push(q);
      }
      if (misses.length) {
        const q = query === false ? null : query || await loadQuery();
        if (!q) {
          for (const x of misses) choices[x.id] = fallback(x, 'unavailable');
        } else {
          // Join what is already drafting; group the rest per spec.
          const waits = [];
          const rest = [];
          for (const x of misses) {
            const job = !fresh && [...inflight.values()].find((j) => j.ids.has(x.id));
            if (job) waits.push(job.promise);
            else rest.push(x);
          }
          for (const g of groupsOf(rest)) waits.push(launch(g, q));
          const limit = misses.length === 1 ? (timeoutMs.one ?? ONE_MS) : (timeoutMs.spec ?? SPEC_MS);
          let t;
          const late = new Promise((ok) => { t = setTimeout(() => ok('late'), limit); t.unref?.(); });
          const results = await Promise.race([Promise.all(waits), late]);
          clearTimeout(t);
          const failed = results === 'late' ? {} : Object.assign({}, ...results.map((r) => r?.errors || {}));
          const after = readChoicesCache(root());
          for (const x of misses) {
            // Ask again takes only what this ask brought back, not the choices it was asked to replace.
            const h = hit(after, x);
            if (h && (!fresh || h.at >= started)) { choices[x.id] = h; continue; }
            const why = results === 'late' ? 'took too long' : failed[x.id] || 'it failed';
            errors[x.id] = why;
            choices[x.id] = fallback(x, 'failed', why);
          }
        }
      }
      return { choices, ...(Object.keys(errors).length ? { errors } : {}) };
    },
  };
}
