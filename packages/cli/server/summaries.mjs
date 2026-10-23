// GET /api/summaries: a one-line AI summary for each chunk the plan leaves
// undescribed, cached in `.nexus/cache/summaries.json`, marked as AI on the
// board (src/ui/plan.jsx AiGlyph), never written to the plan.
//
// Undescribed: the title progress.mjs reads off the chunk line has no words
// of its own. That is an empty title, a line that opens straight on its
// size (`- [ ] **12.3** · S · closes A2`, which progress.mjs reads as the
// title "· S · closes A2"), a title with no letters in it, or a stand-in
// (TBD, TODO, WIP, TK, ?). A chunk with any real words keeps them; the plan
// is the source, and the AI only fills a hole.
//
// Cheap by construction:
//   - one call per board load, batching every undescribed chunk that misses
//     the cache; a hit never calls the model
//   - the cache key is sha256(chunk id, the chunk's whole block in its spec
//     file, the spec's Design section): edit any of them and only that
//     chunk's line is asked again
//   - Claude Haiku (SUMMARY_MODEL) through the Agent SDK on the person's own
//     Claude Code login (no API key), no tools, one turn, no project
//     settings or session file, a budget cap
//   - the request waits at most `timeoutMs`; past it the board gets what the
//     cache holds and the call finishes into the cache for the next load
//   - a failed call is not retried for RETRY_MS
//   - off (prefs.aiSummaries false, Settings) the endpoint answers {} and
//     neither reads the plan nor loads the SDK
//
// The answer: { [chunkId]: { text, ai: true } } (src/data/hooks.js).
// Reads plan/<spec file>; writes only .nexus/cache/.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { HELPER_MODEL } from '../shared/models.mjs';

export const SUMMARY_MODEL = HELPER_MODEL; // shared/models.mjs: Settings names it
export const CACHE_FILE = '.nexus/cache/summaries.json';
export const TIMEOUT_MS = 20000;
export const HARD_CAP_MS = 120000;
export const RETRY_MS = 10 * 60 * 1000;
export const MAX_BUDGET_USD = 0.25;
export const MAX_CHARS = 90;
const DESIGN_CHARS = 2400;
const PLACEHOLDER = /^(tbd|todo|wip|tk|\?+|-+|\.+|untitled)$/i;

/** True when a chunk's title has no words of its own (see the header). */
export function undescribed(title) {
  const t = String(title ?? '').replace(/[`*_]/g, '').trim();
  if (!t) return true;
  if (/^·/.test(t)) return true;
  if (!/\p{L}/u.test(t)) return true;
  return PLACEHOLDER.test(t.replace(/[.:!]+$/, '').trim());
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The chunk's block in its spec file: its line, wrapped lines and sub-bullets. Null when absent. */
export function chunkBlock(specText, id) {
  const lines = String(specText).replace(/\r\n/g, '\n').split('\n');
  const head = new RegExp(`^- \\[[ x]\\] \\*\\*${esc(String(id))}\\*\\*`);
  const i = lines.findIndex((l) => head.test(l));
  if (i < 0) return null;
  const out = [lines[i]];
  for (let j = i + 1; j < lines.length && /^\s{2,}\S/.test(lines[j]); j++) out.push(lines[j]);
  return out.join('\n').trim();
}

/** A `## <name>` section's body, trimmed ('' when the spec has none). */
export function section(specText, name) {
  const text = String(specText).replace(/\r\n/g, '\n');
  const m = new RegExp(`^## ${esc(name)}\\s*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(text);
  return m ? m[1].trim() : '';
}

/** The acceptance lines a chunk block closes (`closes A4, A5`). */
export function acceptanceFor(specText, block) {
  const ids = [...String(block).matchAll(/\bA\d+[a-z]?\b/g)].map((m) => m[0]);
  if (!ids.length) return [];
  const acc = section(specText, 'Acceptance').split('\n');
  const out = [];
  for (const id of new Set(ids)) {
    const i = acc.findIndex((l) => new RegExp(`\\*\\*${id}\\*\\*`).test(l));
    if (i < 0) continue;
    const rows = [acc[i]];
    for (let j = i + 1; j < acc.length && /^\s{2,}\S/.test(acc[j]); j++) rows.push(acc[j]);
    out.push(rows.map((r) => r.trim()).join(' '));
  }
  return out;
}

export const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** The cache key: chunk id, its block, its spec's Design section. */
export const cacheKey = (id, block, design) => sha(`${id}\n${block}\n${sha(design)}`);

/**
 * Every undescribed chunk on the board with what the model needs and its
 * cache key. Reads only plan/<spec file>. A chunk with no block in its spec
 * (closed into ARCHIVE.md, or plotted through a pending file) is skipped.
 */
export function collect(repo, plan) {
  const out = [];
  const texts = new Map();
  for (const s of plan?.specs || []) {
    const want = (s.chunks || []).filter((c) => c.state !== 'closed' && undescribed(c.title));
    if (!want.length || !s.file) continue;
    if (!texts.has(s.file)) {
      const f = path.join(repo, 'plan', path.basename(s.file));
      texts.set(s.file, fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null);
    }
    const text = texts.get(s.file);
    if (text == null) continue;
    const design = section(text, 'Design') || section(text, 'Why');
    for (const c of want) {
      const block = chunkBlock(text, c.id);
      if (!block) continue;
      out.push({ id: String(c.id), spec: String(s.id), specTitle: s.title || '', block, design, accept: acceptanceFor(text, block), key: cacheKey(String(c.id), block, design) });
    }
  }
  return out;
}

export function readCache(repo) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(repo, CACHE_FILE), 'utf8'));
    return j && typeof j.entries === 'object' && j.entries ? j : { entries: {} };
  } catch {
    return { entries: {} };
  }
}

/** Merge `fresh` ({ key: entry }) into the cache, keep only `keep` keys, write atomically. */
export function writeCache(repo, fresh, keep) {
  const file = path.join(repo, CACHE_FILE);
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const ignore = path.join(dir, '.gitignore');
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, '# nexus GUI cache: local only\n*\n');
  const cur = readCache(repo).entries;
  const entries = {};
  for (const [k, v] of Object.entries({ ...cur, ...fresh })) if (!keep || keep.has(k)) entries[k] = v;
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ model: SUMMARY_MODEL, entries }, null, 2)}\n`);
  fs.renameSync(tmp, file);
  return entries;
}

export const SYSTEM = [
  'You write one-line summaries of software work items for a plan board.',
  'For each chunk, say what building it delivers, in plain words: an imperative or noun phrase,',
  `at most ${MAX_CHARS - 10} characters, no trailing period, no ids, no size tags, no quotes, no emoji.`,
  'Answer with one JSON object mapping each chunk id to its line, and nothing else.',
].join(' ');

/** The batch prompt: chunks grouped under their spec, the spec's Design once. */
export function buildPrompt(items) {
  const bySpec = new Map();
  for (const it of items) {
    if (!bySpec.has(it.spec)) bySpec.set(it.spec, []);
    bySpec.get(it.spec).push(it);
  }
  const parts = [];
  for (const [spec, list] of bySpec) {
    const d = list[0].design.length > DESIGN_CHARS ? `${list[0].design.slice(0, DESIGN_CHARS)}...` : list[0].design;
    parts.push(`# Spec ${spec}${list[0].specTitle ? `: ${list[0].specTitle}` : ''}`, '', '## Design', d || '(none)', '');
    for (const it of list) {
      parts.push(`## Chunk ${it.id}`, it.block);
      if (it.accept.length) parts.push('Closes:', ...it.accept.map((a) => `- ${a}`));
      parts.push('');
    }
  }
  parts.push(`Return JSON: { ${items.map((i) => `"${i.id}": "..."`).join(', ')} }`);
  return parts.join('\n');
}

/** One clean line: collapsed, unquoted, no pictographs, capped. */
export function clean(text) {
  let t = String(text ?? '').replace(/\s+/g, ' ').replace(/\p{Extended_Pictographic}/gu, '').trim();
  t = t.replace(/^["'`]+|["'`]+$/g, '').replace(/\.$/, '').trim();
  return t.length > MAX_CHARS ? `${t.slice(0, MAX_CHARS - 3).trimEnd()}...` : t;
}

/** The model's JSON reply -> { id: line } for the ids asked about. */
export function parseReply(text, ids) {
  const s = String(text ?? '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return {};
  let j;
  try { j = JSON.parse(s.slice(a, b + 1)); } catch { return {}; }
  const out = {};
  for (const id of ids) {
    const v = j && typeof j === 'object' ? j[id] : null;
    const line = typeof v === 'string' ? clean(v) : '';
    if (line) out[id] = line;
  }
  return out;
}

export async function loadQuery() {
  if (process.env.NEXUS_PROVIDER === 'cli') return null;
  try {
    return (await import('@anthropic-ai/claude-agent-sdk')).query;
  } catch {
    return null;
  }
}

/**
 * One model call for a batch. `query` is the SDK's query() (tests stub it).
 * @returns {Promise<{ lines: Record<string,string>, cost: number|null, error?: string }>}
 */
export async function askModel(items, { query, repo, signal, model = SUMMARY_MODEL } = {}) {
  const abortController = new AbortController();
  const onAbort = () => abortController.abort();
  signal?.addEventListener?.('abort', onAbort);
  const q = query({
    prompt: buildPrompt(items),
    options: {
      model,
      cwd: repo,
      systemPrompt: SYSTEM,
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
  let result = null;
  try {
    for await (const msg of q) if (msg && msg.type === 'result') { result = msg; break; }
  } catch (e) {
    return { lines: {}, cost: null, error: String(e && e.message ? e.message : e) };
  } finally {
    signal?.removeEventListener?.('abort', onAbort);
    try { q.close?.(); } catch { /* already closed */ }
  }
  if (!result) return { lines: {}, cost: null, error: 'no result' };
  const cost = result.total_cost_usd ?? null;
  if (result.is_error || (result.subtype && result.subtype !== 'success')) return { lines: {}, cost, error: String(result.result || result.subtype) };
  return { lines: parseReply(result.result, items.map((i) => i.id)), cost };
}

/**
 * The endpoint's engine.
 * @param {object} o
 * @param {string} o.repo
 * @param {(repo: string) => Promise<object>} o.readPlan  the board's plan (server/plan.mjs readPlan)
 * @param {() => boolean} o.enabled  prefs.aiSummaries
 * @param {Function} [o.query]  the SDK's query(); loaded lazily when absent
 * @param {number} [o.timeoutMs]
 */
export function createSummaries({ repo, readPlan, enabled = () => true, query, timeoutMs = TIMEOUT_MS, now = Date.now }) {
  let inflight = null; // { sig, promise }
  const failed = new Map(); // sig -> ms
  const stats = { calls: 0, cost: 0, last: null };

  function answer(items) {
    const entries = readCache(repo).entries;
    const out = {};
    for (const it of items) if (entries[it.key]?.text) out[it.id] = { text: entries[it.key].text, ai: true };
    return out;
  }

  async function call(items, keep) {
    const q = query || await loadQuery();
    if (!q) return;
    const ac = new AbortController();
    const cap = setTimeout(() => ac.abort(), HARD_CAP_MS);
    cap.unref?.();
    stats.calls += 1;
    try {
      const r = await askModel(items, { query: q, repo, signal: ac.signal });
      stats.cost += r.cost || 0;
      stats.last = { at: new Date(now()).toISOString(), asked: items.length, got: Object.keys(r.lines).length, cost: r.cost, error: r.error || null };
      const at = new Date(now()).toISOString();
      const fresh = {};
      for (const it of items) if (r.lines[it.id]) fresh[it.key] = { id: it.id, text: r.lines[it.id], at };
      if (Object.keys(fresh).length) writeCache(repo, fresh, keep);
      if (r.error || Object.keys(fresh).length < items.length) throw new Error(r.error || 'some chunks came back without a line');
    } finally {
      clearTimeout(cap);
    }
  }

  return {
    stats,
    async get() {
      if (!enabled()) return {};
      const plan = await readPlan(repo);
      if (!plan || plan.available === false) return {};
      const items = collect(repo, plan);
      if (!items.length) return {};
      const entries = readCache(repo).entries;
      const misses = items.filter((it) => !entries[it.key]?.text);
      if (misses.length) {
        const sig = sha(misses.map((m) => m.key).sort().join(','));
        const keep = new Set(items.map((i) => i.key));
        const recent = failed.get(sig);
        if (inflight?.sig !== sig && !(recent && now() - recent < RETRY_MS)) {
          const promise = call(misses, keep)
            .catch(() => { failed.set(sig, now()); })
            .finally(() => { if (inflight?.promise === promise) inflight = null; });
          inflight = { sig, promise };
        }
        if (inflight) {
          let t;
          await Promise.race([inflight.promise, new Promise((r) => { t = setTimeout(r, timeoutMs); t.unref?.(); })]);
          clearTimeout(t);
        }
      }
      return answer(items);
    },
  };
}
