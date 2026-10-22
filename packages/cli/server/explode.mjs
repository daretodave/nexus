// Onboarding's Plot step (spec 47, A1): POST /api/explode and POST /api/plot.
//
// Explode splits the person's messy thoughts into sized idea cards and
// proposes the spec they would become. It writes nothing:
//   - Claude Haiku (SUMMARY_MODEL) through the Agent SDK, called the way
//     summaries.mjs calls it: the person's own Claude Code login, no tools,
//     one turn, no project settings or session file, a budget cap, a timeout
//   - when the SDK is missing, fails, times out or answers nothing usable,
//     a rule split (splitThoughts): blank lines, list bullets, one thought
//     per line, and connectives ("; ", ". also", "and also", ...)
//   - the answer says which one split it: by 'ai' | 'split'
// Each idea is { id, t, q, size }: t a short title, q the excerpt of the
// thoughts it came from, verbatim, so the board can underline it (Plot.jsx
// Marked), size S | M | L. The spec is { n, file }: the next free spec
// number (nextSpec) and plan/<NN>-<slug>.md.
//
// Plot never writes the plan from the server. It builds a /plot run naming
// the kept chunks (title, size, place in line, the excerpts they came from)
// and the raw thoughts (plotPrompt), and server.mjs starts it in a hosted
// session, which researches, writes the pending file and lands it per owner
// mode as /plot says (owner: settled on main; contributor: a plot PR).
import fs from 'node:fs';
import path from 'node:path';
import { SUMMARY_MODEL, MAX_BUDGET_USD, loadQuery } from './summaries.mjs';

export const EXPLODE_TIMEOUT_MS = 45000;
export const MAX_IDEAS = 24;
export const MAX_TEXT = 20000;
export const MAX_TITLE = 60;
const MAX_QUOTE = 240;
const SIZES = ['S', 'M', 'L'];
export const PLACES = ['asap', 'anytime', 'auto'];

// ---- the rule split ----------------------------------------------------------

const BULLET = /^\s*(?:[-*+•]|\d{1,3}[.)])\s+/;
// A connective that starts a new thought inside one line. The match is dropped; the words after it start the next idea.
const CONNECTIVE = /;\s+|[.!?]\s+(?:and\s+)?also\b[,:]?\s*|\s+and\s+also\b[,:]?\s*|[.!?]\s+(?:oh\s+and|plus|another\s+thing|separately|unrelated)\b[,:]?\s*/gi;

/** A title from an excerpt: its first clause, capitalised, no trailing punctuation, at most MAX_TITLE characters. */
export function titleOf(text) {
  let t = String(text ?? '').replace(BULLET, '').replace(/\s+/g, ' ').trim();
  t = t.split(/(?<=[.!?])\s+|\s+[-–—]\s+|:\s+/)[0] || t;
  t = t.replace(/^(?:also|and|plus|maybe|i think|we should|we need to|need to|should)\s+/i, '').replace(/[.,;:!?\s]+$/, '').trim();
  if (t.length > MAX_TITLE) {
    const cut = t.slice(0, MAX_TITLE);
    t = (cut.lastIndexOf(' ') > 20 ? cut.slice(0, cut.lastIndexOf(' ')) : cut).replace(/[.,;:\s]+$/, '');
  }
  return t ? t[0].toUpperCase() + t.slice(1) : '';
}

/** The pieces of one line, split on connectives; each a verbatim substring of the line. */
function splitLine(line) {
  const out = [];
  let at = 0;
  CONNECTIVE.lastIndex = 0;
  for (let m = CONNECTIVE.exec(line); m; m = CONNECTIVE.exec(line)) {
    // Keep a sentence's own full stop with it.
    const end = /^[.!?]/.test(m[0]) ? m.index + 1 : m.index;
    out.push(line.slice(at, end));
    at = m.index + m[0].length;
  }
  out.push(line.slice(at));
  return out;
}

/**
 * The thoughts split into ideas without a model: one per line or list item (blank lines and bullets only separate),
 * each line split again on connectives. Every idea is size S; its q is a verbatim excerpt of the text.
 * @returns {{ id: string, t: string, q: string, size: 'S' }[]}
 */
export function splitThoughts(text) {
  const units = String(text ?? '').split(/\r?\n|\r/).map((l) => l.replace(BULLET, '').trim()).filter(Boolean);
  const seen = new Set();
  const ideas = [];
  for (const u of units) {
    for (const piece of splitLine(u)) {
      const q = piece.trim().replace(/^(?:and\s+)?also\b[,:]?\s*/i, '').trim();
      if (!/\p{L}.*\p{L}/u.test(q)) continue;
      const t = titleOf(q);
      if (!t || seen.has(t.toLowerCase())) continue;
      seen.add(t.toLowerCase());
      ideas.push({ id: String(ideas.length), t, q: q.slice(0, MAX_QUOTE), size: 'S' });
      if (ideas.length >= MAX_IDEAS) return ideas;
    }
  }
  return ideas;
}

// ---- the next spec number ----------------------------------------------------

/** kebab-case, ascii, at most `max` characters, cut at a dash. */
export function slugOf(text, max = 40) {
  let s = String(text ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (s.length > max) {
    s = s.slice(0, max);
    s = (s.lastIndexOf('-') > 8 ? s.slice(0, s.lastIndexOf('-')) : s).replace(/-+$/, '');
  }
  return s || 'first-work';
}

const readText = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };

/**
 * The next free spec number and its width, from every signal the repo has: plan/NN-*.md (and plan/specs/),
 * spec ids in plan/ARCHIVE.md, specs a pending file adds (plan/pending/*.md), and the README's "the next new spec
 * is N". The highest wins; nothing at all is spec 1.
 * @returns {{ n: number, width: number, signals: Record<string, number> }}
 */
export function nextSpec(repo) {
  const plan = path.join(repo, 'plan');
  const signals = {};
  let width = 2;
  const note = (k, n) => { if (Number.isFinite(n) && n > (signals[k] ?? 0)) signals[k] = n; };
  for (const dir of [plan, path.join(plan, 'specs')]) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const f of names) {
      const m = /^(\d+)-.+\.md$/.exec(f);
      if (!m) continue;
      width = Math.max(width, m[1].length);
      note('files', Number(m[1]) + 1);
    }
  }
  // ARCHIVE.md: `- <date> · <spec or chunk id> · ...`; a chunk id 12.3 counts for spec 12.
  for (const m of readText(path.join(plan, 'ARCHIVE.md')).matchAll(/^\s*[-*]\s+[^\n·]*·\s*(\d+)(?:\.\d+[a-z]?)?\s*·/gm)) note('archive', Number(m[1]) + 1);
  let pend = [];
  try { pend = fs.readdirSync(path.join(plan, 'pending')).filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md'); } catch { /* no pending files */ }
  for (const f of pend) for (const m of readText(path.join(plan, 'pending', f)).matchAll(/plan\/(?:specs\/)?(\d+)-[\w.-]+\.md/g)) note('pending', Number(m[1]) + 1);
  const said = /next new spec is\s+(?:spec\s+)?\**(\d+)\**/i.exec(readText(path.join(plan, 'README.md')));
  if (said) note('readme', Number(said[1]));
  const n = Math.max(1, ...Object.values(signals));
  return { n, width, signals };
}

/** { n, file } for a spec named after `title`. */
export function specFor(repo, title) {
  const { n, width } = nextSpec(repo);
  return { n, file: `plan/${String(n).padStart(width, '0')}-${slugOf(title)}.md` };
}

// ---- the model ---------------------------------------------------------------

const TEAM = { solo: 'one person working alone', team: 'a small team', oss: 'an open-source project with outside contributors' };

export const SYSTEM = [
  'You split a person\'s messy notes about a software project into separate ideas for a plan board.',
  'Split on ideas, not sentences: one idea may span several sentences, and one sentence may hold two ideas.',
  'Drop chatter that is not work. Keep the person\'s order.',
  `For each idea give t, a short title (an imperative or noun phrase, at most ${MAX_TITLE} characters, no trailing period, no emoji);`,
  'q, the exact words of the notes the idea came from, copied verbatim (a contiguous excerpt, at most one or two sentences);',
  'and size: S (an hour or two), M (about a day) or L (several days).',
  `At most ${MAX_IDEAS} ideas. Answer with one JSON object {"ideas":[{"t":"...","q":"...","size":"S"}]} and nothing else.`,
].join(' ');

export function buildPrompt(text, team) {
  const who = TEAM[team] ? `Who builds it: ${TEAM[team]}.\n\n` : '';
  const body = text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n...` : text;
  return `${who}The notes:\n<<<\n${body}\n>>>`;
}

/** The model's JSON reply -> ideas, checked; [] when nothing usable came back. */
export function parseIdeas(reply, text = '') {
  const s = String(reply ?? '');
  const bare = s.indexOf('[') >= 0 && (s.indexOf('{') < 0 || s.indexOf('[') < s.indexOf('{'));
  const a = s.indexOf(bare ? '[' : '{');
  const b = s.lastIndexOf(bare ? ']' : '}');
  if (a < 0 || b <= a) return [];
  let j;
  try { j = JSON.parse(s.slice(a, b + 1)); } catch { return []; }
  const list = Array.isArray(j) ? j : Array.isArray(j?.ideas) ? j.ideas : [];
  const lower = String(text).toLowerCase();
  const out = [];
  for (const x of list) {
    if (!x || typeof x !== 'object') continue;
    const t = titleOf(String(x.t ?? x.title ?? '').replace(/\p{Extended_Pictographic}/gu, ''));
    if (!t) continue;
    let q = String(x.q ?? x.quote ?? '').trim().replace(/^["'“]+|["'”]+$/g, '').slice(0, MAX_QUOTE);
    // An excerpt the notes do not hold underlines nothing: keep it as the idea's words, case fixed when it is there.
    const at = q ? lower.indexOf(q.toLowerCase()) : -1;
    if (at >= 0) q = String(text).slice(at, at + q.length);
    const size = SIZES.includes(String(x.size).toUpperCase()) ? String(x.size).toUpperCase() : 'M';
    out.push({ id: String(out.length), t, q: q || t, size });
    if (out.length >= MAX_IDEAS) break;
  }
  return out;
}

/** One model call. `query` is the SDK's query() (tests stub it). */
export async function askIdeas(text, team, { query, repo, timeoutMs = EXPLODE_TIMEOUT_MS, model = SUMMARY_MODEL }) {
  const abortController = new AbortController();
  const cap = setTimeout(() => abortController.abort(), timeoutMs);
  cap.unref?.();
  let q;
  try {
    q = query({
      prompt: buildPrompt(text, team),
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
    const timedOut = new Promise((_, reject) => abortController.signal.addEventListener('abort', () => reject(new Error('timed out')), { once: true }));
    const read = (async () => { for await (const msg of q) if (msg && msg.type === 'result') { result = msg; break; } })();
    read.catch(() => null);
    await Promise.race([read, timedOut]);
    if (!result) return { ideas: [], error: 'no result' };
    if (result.is_error || (result.subtype && result.subtype !== 'success')) return { ideas: [], error: String(result.result || result.subtype) };
    const ideas = parseIdeas(result.result, text);
    return ideas.length ? { ideas } : { ideas: [], error: 'no ideas in the answer' };
  } catch (e) {
    return { ideas: [], error: String(e && e.message ? e.message : e) };
  } finally {
    clearTimeout(cap);
    try { q?.close?.(); } catch { /* already closed */ }
  }
}

/**
 * POST /api/explode's engine: { text, team } -> { ideas, spec: { n, file }, by: 'ai' | 'split', note? }.
 * @param {object} o
 * @param {string} o.repo
 * @param {Function|false} [o.query]  the SDK's query(); loaded lazily when absent, none when false (tests stub it)
 */
export async function explode({ repo, text, team, query, timeoutMs }) {
  const thoughts = String(text ?? '');
  if (!thoughts.trim()) return { status: 400, error: 'nothing to explode: type some thoughts first' };
  const q = query === false ? null : query || await loadQuery();
  let ideas = [];
  let note = q ? null : 'the Claude Agent SDK is not available here';
  if (q) {
    const r = await askIdeas(thoughts, team, { query: q, repo, timeoutMs });
    ideas = r.ideas;
    if (r.error) note = r.error;
  }
  const by = ideas.length ? 'ai' : 'split';
  if (!ideas.length) ideas = splitThoughts(thoughts);
  const title = ideas[0]?.t || thoughts.trim().split('\n')[0];
  return { status: 200, ideas, spec: specFor(repo, title), by, ...(by === 'split' && note ? { note } : {}) };
}

// ---- plot ----------------------------------------------------------------------

const oneLine = (s, max = 200) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * The body of POST /api/plot, checked: { spec, thoughts, chunks: [{ id, title, size, place, from }] }.
 * @returns {{ error: string } | { spec: { n: number, file: string } | null, thoughts: string, chunks: object[] }}
 */
export function plotRequest(b) {
  const list = Array.isArray(b?.chunks) ? b.chunks : [];
  const chunks = [];
  for (const c of list) {
    const title = oneLine(c?.title, 160);
    if (!title) continue;
    chunks.push({
      id: oneLine(c.id, 16),
      title,
      size: SIZES.includes(String(c.size).toUpperCase()) ? String(c.size).toUpperCase() : 'M',
      place: PLACES.includes(c.place) ? c.place : 'auto',
      from: (Array.isArray(c.from) ? c.from : []).map((f) => oneLine(f, MAX_QUOTE)).filter(Boolean).slice(0, 8),
    });
  }
  if (!chunks.length) return { error: 'nothing to plot: keep an idea first' };
  const file = typeof b.spec === 'string' ? b.spec.trim().replace(/\\/g, '/') : typeof b.spec?.file === 'string' ? b.spec.file.trim() : '';
  const m = /^plan\/(\d{1,4})-([a-z0-9][a-z0-9-]{0,60})\.md$/.exec(file);
  return { spec: m ? { n: Number(m[1]), file } : null, thoughts: String(b.thoughts ?? '').replace(/\r\n?/g, '\n').slice(0, MAX_TEXT), chunks };
}

const PLACE_LINE = { asap: 'asap', anytime: 'anytime', auto: 'let nexus decide' };

/**
 * The /plot run that lands the kept chunks: one new spec, researched and placed as /plot does, landed per owner
 * mode. `spec` is what the GUI showed ({ n, file }); the run keeps it if it is still free.
 */
export function plotPrompt({ spec, thoughts, chunks }, owner) {
  const places = new Set(chunks.map((c) => c.place));
  const word = places.size === 1 && !places.has('auto') ? `${[...places][0]} ` : '';
  const task = chunks.length === 1 ? chunks[0].title : `${chunks[0].title}, and ${chunks.length - 1} more`;
  const landing = owner
    ? 'This checkout is in owner mode: land it settled on main, as /plot\'s Step 6 says for the owner.'
    : 'This checkout is in contributor mode: land it as a plot pull request on its own plot/<slug> branch, as /plot\'s Step 6 says. Never push main.';
  const lines = [
    `/plot ${word}"${task.replace(/"/g, '\'')}"`,
    '',
    'From the nexus GUI\'s onboarding (the Plot step). The person split their thoughts into ideas and kept these as chunks, in this order, each with its place in line. Plot them as one new spec with these chunks: research each as /plot does (already built, already planned, or new; an open spec that owns one extends it instead), then write the spec and its chunks through one pending file. Do not ask again; the person already chose. A question only the owner can answer goes in the spec\'s Open questions.',
    spec
      ? `The GUI showed it as ${spec.file} (spec ${spec.n}): use that number if it is still free, else the next free one, and say which.`
      : 'Give it the next free spec number.',
    landing,
    '',
    'Chunks (id the GUI showed · title · size · place in line):',
  ];
  for (const c of chunks) {
    lines.push(`- ${c.id ? `${c.id} · ` : ''}${c.title} · ${c.size} · ${PLACE_LINE[c.place]}`);
    if (c.from.length) lines.push(`  from: ${c.from.map((f) => `"${f.replace(/"/g, '\'')}"`).join(' ; ')}`);
  }
  lines.push('', 'Place in line: asap is the Asap lane; anytime is no priority (table order); let nexus decide means choose and say why, as /plot does with no word.');
  if (thoughts.trim()) lines.push('', 'The thoughts, as the person typed them:', '<<<', thoughts.trim(), '>>>');
  return lines.join('\n');
}
