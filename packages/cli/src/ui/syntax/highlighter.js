// The one door to highlighting: a text in a language to tokens, now. What it returns at first is the quick
// tokenizer's (lite.js), drawn on the first paint and on the server; the grammar engine (engine.js) is fetched
// behind it with a dynamic import, and every component using `useCodeTokens` draws again once it has the grammar.
// Nothing here imports the engine statically: that would pull lowlight into the main chunk.
import { useEffect, useMemo, useState } from 'react';
import { liteTokens } from './lite.js';
import { ENGINE_LANGS } from './langs.js';

/** Past this a text stays with the quick tokens: a grammar on a 200 kB log costs a frame for nothing. */
const ENGINE_MAX = 60000;

let engine = null;
let engineLoad = null;
let version = 0;
const listeners = new Set();
// The grammar's tokens by language and text. Bounded by count and by the characters its keys hold: a key is the whole
// text, and its tokens hold that text again, so a count alone could keep tens of MB of near-copies. A text still
// being typed is never cached (each key makes a new text nobody asks for twice), nor is one past CACHE_TEXT, which
// would push out every other block's entry for one hit.
const cache = new Map();
const CACHE_MAX = 400;
const CACHE_CHARS = 2000000;
const CACHE_TEXT = 20000;
let cacheChars = 0;

const notify = () => { version += 1; cache.clear(); cacheChars = 0; for (const fn of listeners) fn(version); };

function remember(key, tokens) {
  while (cache.size && (cache.size >= CACHE_MAX || cacheChars + key.length > CACHE_CHARS)) {
    const old = cache.keys().next().value;
    cacheChars -= old.length;
    cache.delete(old);
  }
  cache.set(key, tokens);
  cacheChars += key.length;
}

/** Fetch the engine and a grammar (once each). Resolves when the grammar can draw; a failed fetch leaves the quick tokens. */
export function wantGrammar(lang) {
  if (typeof window === 'undefined' || !ENGINE_LANGS.has(lang)) return Promise.resolve(false);
  if (engine?.hasGrammar(lang)) return Promise.resolve(true);
  engineLoad ||= import('./engine.js').then((m) => { engine = m; return m; }, () => { engineLoad = null; return null; });
  return engineLoad.then((m) => (m ? m.loadGrammar(lang) : false)).then((ok) => { if (ok) notify(); return ok; });
}

/** Has the grammar for `lang` arrived? */
export const grammarReady = (lang) => !!engine?.hasGrammar(lang);

/**
 * The best tokens there are for a text right now: the grammar's when it has loaded, else the quick ones. `quick` asks
 * for the quick ones anyway (a block still streaming: a grammar pass over the whole block on every delta costs
 * frames); `cache: false` keeps a text that is still changing out of the cache.
 */
export function codeTokens(lang, text, { quick = false, cache: keep = true } = {}) {
  const s = String(text ?? '');
  if (!s) return [];
  if (quick || !engine || !ENGINE_LANGS.has(lang) || s.length > ENGINE_MAX || !engine.hasGrammar(lang)) return liteTokens(lang, s);
  const key = `${lang}\u0000${s}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const tokens = engine.highlight(lang, s) || liteTokens(lang, s);
  if (keep && s.length <= CACHE_TEXT) remember(key, tokens);
  return tokens;
}

/** Re-render when any grammar arrives; returns the engine's version (a memo key). */
export function useGrammarVersion(lang) {
  const [v, setV] = useState(version);
  useEffect(() => {
    const on = (n) => setV(n);
    listeners.add(on);
    if (lang && !grammarReady(lang)) wantGrammar(lang);
    else if (v !== version) setV(version);
    return () => { listeners.delete(on); };
  }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

/** A text's tokens in `lang`, drawn now and again when the grammar arrives; `quick` as codeTokens takes it. */
export function useCodeTokens(lang, text, { quick = false } = {}) {
  const v = useGrammarVersion(lang);
  return useMemo(() => codeTokens(lang, text, { quick }), [lang, text, v, quick]);
}
