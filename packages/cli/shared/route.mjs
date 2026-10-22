// Composer routing: what free text becomes before it reaches the session.
//
//   "/anything ..."           runs as typed (a slash command)
//   anything else             goes as typed, always
//
// The classifier only advises. For "fix this bug please" it suggests /bug, for
// "add dark mode export" /plot; the composer shows that as a chip, and only a
// click on the chip (or Ctrl+Enter) sends `/bug <text>`. A route the person
// picks from the chip's menu is theirs and is kept; a guess is never applied.

export const ROUTES = ['ask', 'bug', 'plot', 'slash'];

/** GUI-only aliases: the name on the button, the command it runs. */
export const ALIASES = { '/explode': '/messy' };

const QUESTION_START = /^(what|why|how|where|when|who|which|is|are|was|were|can|could|does|do|did|should|would|will|has|have|explain|tell me)\b/i;
const BUG_WORDS = /\b(bug|bugs|broken|breaks|crash(?:es|ed|ing)?|error|errors|exception|fails?|failing|failed|regression|doesn'?t work|does not work|not working|wrong|fix|fixes|glitch)\b/i;

export function classify(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  if (t.startsWith('/')) return 'slash';
  if (BUG_WORDS.test(t) && !/\?$/.test(t)) return 'bug';
  if (/\?$/.test(t) || QUESTION_START.test(t)) return BUG_WORDS.test(t) && /\b(fix|please)\b/i.test(t) ? 'bug' : 'ask';
  return 'plot';
}

/**
 * The route the composer suggests for plain text: 'bug' or 'plot', else null.
 * Advisory only; nothing is sent under it unless the person accepts it.
 */
export function suggest(text) {
  const r = classify(text);
  return r === 'bug' || r === 'plot' ? r : null;
}

/** The route text takes when nobody picked one: a slash command as typed, anything else as typed. */
export function asTyped(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  return t.startsWith('/') ? 'slash' : 'ask';
}

/** The prompt actually sent for `text` under `route` (default: as typed, never a guess). */
export function toPrompt(text, route = asTyped(text), flags = {}) {
  const t = String(text || '').trim();
  if (!t || !route) return '';
  let out;
  if (route === 'slash') {
    // Only the command word is touched (an alias resolved); the rest keeps its newlines: a pasted report, a trace.
    const [, head, rest] = /^(\S+)([\s\S]*)$/.exec(t);
    out = (ALIASES[head.toLowerCase()] || head) + rest;
  } else if (route === 'bug') out = `/bug ${t}`;
  else if (route === 'plot') out = `/plot ${t}`;
  else out = t;
  return withRunFlags(out, flags);
}

/**
 * "Delegate to sub-agents" / "Use workflows": overrides for /next and
 * /heads-down. Neither checked leaves the size default (S/M agent, L workflow).
 */
export function withRunFlags(prompt, { agents = false, workflows = false } = {}) {
  if (!/^\/(next|heads-down)\b/.test(prompt)) return prompt;
  // The flag goes on the command's own line, ahead of any text pasted under it.
  const nl = prompt.indexOf('\n');
  const first = nl === -1 ? prompt : prompt.slice(0, nl);
  const after = nl === -1 ? '' : prompt.slice(nl);
  if (/--(agents|workflow)\b/.test(first)) return prompt;
  if (workflows) return `${first} --workflow${after}`;
  if (agents) return `${first} --agents${after}`;
  return prompt;
}

/** Slash completions for a draft: commands whose name starts with the typed word. */
export function complete(draft, commands) {
  const m = /^\/([\w:-]*)$/.exec(String(draft || ''));
  if (!m) return [];
  const want = m[1].toLowerCase();
  return commands.filter((c) => c.name.toLowerCase().startsWith(want)).slice(0, 8);
}
