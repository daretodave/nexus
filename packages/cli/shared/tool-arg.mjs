// The one argument a tool row shows for a tool call, as the cockpit's rows pick it (server/normalize.mjs
// summarize): a Bash command (else its description), else a file path, a pattern, a url, a description, a prompt
// or a query. Full text, unclipped; the caller clips it for display. Shared by the server (a permission's view
// carries it as `args`) and the GUI (spec 47, A15: the onboarding strip).

const BASH_KEYS = ['command', 'description'];
const KEYS = ['command', 'file_path', 'pattern', 'url', 'description', 'prompt', 'query'];
const keysFor = (tool) => (tool === 'Bash' || tool === 'BashOutput' ? BASH_KEYS : KEYS);

/** @returns {string} the argument, '' when the input names none */
export function toolArg(tool, input) {
  if (!input || typeof input !== 'object') return '';
  for (const k of keysFor(tool)) if (input[k]) return String(input[k]);
  return '';
}

/** A permission card's title (spec 49, A11): the input's own description when it has one, else the tool. */
export function toolTitle(tool, input) {
  const d = input && typeof input === 'object' && typeof input.description === 'string' ? input.description.trim() : '';
  return d || String(tool || '');
}

/**
 * The same argument from a JSON summary that may be clipped mid-string (a permission's `summary` is the input's JSON
 * cut at 400 characters): parsed when it parses, else the first wanted field read up to where the text stops.
 */
export function toolArgFromJson(tool, text) {
  const s = String(text || '');
  try { return toolArg(tool, JSON.parse(s)); } catch { /* clipped: read the field by hand */ }
  for (const k of keysFor(tool)) {
    const m = new RegExp(`"${k}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`).exec(s);
    if (!m) continue;
    // A cut escape at the end (a lone backslash, or a \u with under four digits) is dropped before decoding.
    const raw = m[1].replace(/\\u[0-9a-fA-F]{0,3}$/, '').replace(/(^|[^\\])((?:\\\\)*)\\$/, '$1$2');
    try { return JSON.parse(`"${raw}"`); } catch { return raw; }
  }
  return '';
}
