// The grammar engine: highlight.js's grammars through lowlight, which hands back a tree (never an HTML string), read
// into tokens by hast.js. Loaded only by highlighter.js, with a dynamic import, so neither library sits in the main
// chunk; each grammar is its own chunk too (GRAMMARS), fetched the first time a block in it shows.
import { createLowlight } from 'lowlight';
import { hastTokens } from './hast.js';

const low = createLowlight();

/** Each grammar's chunk. A name here is a name in langs.js ENGINE_LANGS. */
export const GRAMMARS = {
  javascript: () => import('highlight.js/lib/languages/javascript'),
  typescript: () => import('highlight.js/lib/languages/typescript'),
  json: () => import('highlight.js/lib/languages/json'),
  python: () => import('highlight.js/lib/languages/python'),
  ruby: () => import('highlight.js/lib/languages/ruby'),
  go: () => import('highlight.js/lib/languages/go'),
  rust: () => import('highlight.js/lib/languages/rust'),
  java: () => import('highlight.js/lib/languages/java'),
  kotlin: () => import('highlight.js/lib/languages/kotlin'),
  swift: () => import('highlight.js/lib/languages/swift'),
  c: () => import('highlight.js/lib/languages/c'),
  cpp: () => import('highlight.js/lib/languages/cpp'),
  csharp: () => import('highlight.js/lib/languages/csharp'),
  php: () => import('highlight.js/lib/languages/php'),
  lua: () => import('highlight.js/lib/languages/lua'),
  css: () => import('highlight.js/lib/languages/css'),
  scss: () => import('highlight.js/lib/languages/scss'),
  less: () => import('highlight.js/lib/languages/less'),
  xml: () => import('highlight.js/lib/languages/xml'),
  markdown: () => import('highlight.js/lib/languages/markdown'),
  yaml: () => import('highlight.js/lib/languages/yaml'),
  ini: () => import('highlight.js/lib/languages/ini'),
  sql: () => import('highlight.js/lib/languages/sql'),
  graphql: () => import('highlight.js/lib/languages/graphql'),
  diff: () => import('highlight.js/lib/languages/diff'),
  dockerfile: () => import('highlight.js/lib/languages/dockerfile'),
  makefile: () => import('highlight.js/lib/languages/makefile'),
  powershell: () => import('highlight.js/lib/languages/powershell'),
};

const pending = new Map();

/** Load a grammar once; resolves true when it is registered, false when there is none. */
export function loadGrammar(name) {
  if (low.registered(name)) return Promise.resolve(true);
  if (!GRAMMARS[name]) return Promise.resolve(false);
  if (!pending.has(name)) {
    pending.set(name, GRAMMARS[name]().then((m) => { low.register(name, m.default); return true; }, () => false));
  }
  return pending.get(name);
}

export const hasGrammar = (name) => low.registered(name);

/** A text's tokens in a loaded grammar, or null when the grammar is not loaded (or chokes on the text). */
export function highlight(name, text) {
  if (!low.registered(name)) return null;
  try { return hastTokens(low.highlight(name, String(text ?? ''))); } catch { return null; }
}
