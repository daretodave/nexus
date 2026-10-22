// What the cockpit composer sends, as pure functions (A17).
//
// Plain text goes as typed. A slash command routes as typed. The classifier's
// guess (/bug, /plot) is only a suggestion chip; it reaches the prompt only
// when the person accepts it (a click on the chip, or Ctrl+Enter). A route the
// person picked from the chip's menu (or Pin) is armed and kept.
import { suggest, toPrompt } from '../../../shared/route.mjs';

const bare = (text) => String(text || '').trim();
const slashWord = (text) => /^\/[\w:-]*$/.test(String(text || ''));

/** The route armed for a draft: only the person's own pick. Never a guess. */
export function routeFor(text, override) {
  const t = bare(text);
  if (!t || t.startsWith('/')) return null;
  return override || null;
}

/** The route suggested for a draft, when nothing is armed and the chip was not dismissed. */
export function suggestFor(text, override, dismissed) {
  if (override || dismissed) return null;
  return suggest(text);
}

/** Is this draft showing a route row (armed or suggested)? Mirrors the composer's own rule. */
export function routeShowing(text, route, mode) {
  return !!route && !!bare(text) && !slashWord(text) && mode === 'normal';
}

/**
 * The prompt one send makes. `route` is the armed route, `as` the suggestion
 * the person just accepted (it wins for this send). Neither: the text as typed.
 */
export function promptFor(text, { route = null, as = null, plotMode = 'plan', flags = {} } = {}) {
  const rt = as || route;
  const r = rt === 'nudge' ? 'ask' : rt === 'pin' ? null : rt;
  let prompt = r ? toPrompt(text, r, flags) : toPrompt(text, undefined, flags);
  if (rt === 'plot' && plotMode === 'do') prompt = `${prompt} and do`;
  return prompt;
}
