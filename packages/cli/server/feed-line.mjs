// The change feed's adapter (feed.mjs): one push turned into one plain sentence a non-engineer can read, in the past
// tense ("Added blue to the home background"). Claude Haiku (HELPER_MODEL) through the Agent SDK on the person's own
// Claude Code login, the same way the board's summaries ask (summaries.mjs): no tools, one turn, no settings, a budget
// cap. `query` is injectable, so no test calls a model.
//
// The fallback, when the AI helpers are off or the call fails: the first commit's subject, lightly cleaned (the
// conventional-commit prefix dropped, the first letter raised), with how many more changes came with it.
import { HELPER_MODEL } from '../shared/models.mjs';
import { clean, loadQuery } from './summaries.mjs';

export const LINE_MODEL = HELPER_MODEL;
export const MAX_BUDGET_USD = 0.05;
export const LINE_TIMEOUT_MS = 45000;
const MAX_PATHS = 25;
const MAX_SUBJECTS = 20;

/** "feat(cli)!: add blue to the home background." -> "Add blue to the home background". */
export function cleanSubject(subject) {
  let s = String(subject ?? '').replace(/\s+/g, ' ').trim();
  s = s.replace(/^(revert:\s*)?(feat|fix|chore|docs|style|refactor|perf|test|tests|build|ci|plan|release|deps)(\([^)]*\))?!?:\s*/i, '');
  s = s.replace(/\s*\.+$/, '').trim();
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The line a push gets with no model: its newest commit's subject, cleaned, and how many more came with it. */
export function fallbackLine(commits = []) {
  const list = commits.filter((c) => c && c.subject);
  // The newest commit leads (git log order), but a merge commit says little: the newest non-merge one does.
  const lead = list.find((c) => !/^merge\b/i.test(c.subject)) || list[0];
  const first = lead ? cleanSubject(lead.subject) : '';
  if (!first) return 'New changes landed on main';
  const more = list.length - 1;
  return more > 0 ? `${first} (and ${more} more ${more === 1 ? 'change' : 'changes'})` : first;
}

export const SYSTEM = [
  'You turn a git push into one plain sentence for someone who does not write code.',
  'Past tense, about what changed for a person using the product or reading the project.',
  'At most 80 characters. No trailing period, no commit hashes, no file paths, no quotes, no emoji.',
  'No jargon: never say refactor, chore, CI, lint, deps, merge, commit or push.',
  'Answer with the sentence alone.',
].join(' ');

/** The prompt: the commit subjects (newest first) and the paths they touched. */
export function buildPrompt(ev) {
  const subjects = (ev.commits || []).slice(0, MAX_SUBJECTS).map((c) => `- ${c.subject}`);
  const paths = (ev.paths || []).slice(0, MAX_PATHS).map((p) => `- ${p}`);
  return [
    `Branch: ${ev.branch || 'main'}`,
    `Commits (${ev.count || subjects.length}, newest first):`, ...subjects,
    '', `Files changed (${(ev.paths || []).length}):`, ...(paths.length ? paths : ['- (none listed)']),
    '', 'One sentence:',
  ].join('\n');
}

/** The model's reply -> a clean sentence, or '' when it said nothing usable. */
export function parseLine(text) {
  const first = String(text ?? '').split(/\r?\n/).map((l) => l.trim()).find(Boolean) || '';
  const line = clean(first.replace(/^(sentence|answer)\s*:\s*/i, ''));
  return /\p{L}/u.test(line) ? line : '';
}

/**
 * Ask the model for one push's line. Resolves { line, cost, error? }; never throws.
 * @param {object} ev       the push event (commits, paths, branch, count)
 * @param {object} o
 * @param {Function} [o.query]  the SDK's query(); loaded lazily when absent (null: no SDK)
 */
export async function askLine(ev, { query, repo, timeoutMs = LINE_TIMEOUT_MS, model = LINE_MODEL } = {}) {
  const q0 = query === undefined ? await loadQuery() : query;
  if (!q0) return { line: '', cost: null, error: 'no model' };
  const abortController = new AbortController();
  const cap = setTimeout(() => abortController.abort(), timeoutMs);
  cap.unref?.();
  let q;
  let result = null;
  try {
    q = q0({
      prompt: buildPrompt(ev),
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
    for await (const msg of q) if (msg && msg.type === 'result') { result = msg; break; }
  } catch (e) {
    return { line: '', cost: null, error: String(e && e.message ? e.message : e) };
  } finally {
    clearTimeout(cap);
    try { q?.close?.(); } catch { /* already closed */ }
  }
  if (!result) return { line: '', cost: null, error: 'no result' };
  const cost = result.total_cost_usd ?? null;
  if (result.is_error || (result.subtype && result.subtype !== 'success')) return { line: '', cost, error: String(result.result || result.subtype) };
  const line = parseLine(result.result);
  return line ? { line, cost } : { line: '', cost, error: 'empty reply' };
}
