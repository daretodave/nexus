// Composer routing: what free text becomes before it reaches the session.
//
//   "/anything ..."           runs as typed (a slash command)
//   "fix this bug please"     /bug <text>    reproduce, fix if small, else plot asap
//   "add dark mode export"    /plot <text>   research, spec, chunk, slot in line
//   "why is the gate red?"    asked inline   a plain question, answered in place
//
// The UI shows the route before sending and lets the person override it.

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

/** The prompt actually sent for `text` under `route` (default: classify(text)). */
export function toPrompt(text, route = classify(text), flags = {}) {
  const t = String(text || '').trim();
  if (!t || !route) return '';
  let out;
  if (route === 'slash') {
    const [head, ...rest] = t.split(/\s+/);
    const cmd = ALIASES[head.toLowerCase()] || head;
    out = [cmd, ...rest].join(' ');
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
  if (/--(agents|workflow)\b/.test(prompt)) return prompt;
  if (workflows) return `${prompt} --workflow`;
  if (agents) return `${prompt} --agents`;
  return prompt;
}

/** Slash completions for a draft: commands whose name starts with the typed word. */
export function complete(draft, commands) {
  const m = /^\/([\w:-]*)$/.exec(String(draft || ''));
  if (!m) return [];
  const want = m[1].toLowerCase();
  return commands.filter((c) => c.name.toLowerCase().startsWith(want)).slice(0, 8);
}
