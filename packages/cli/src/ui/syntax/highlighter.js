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
const cache = new Map();
const CACHE_MAX = 400;

const notify = () => { version += 1; cache.clear(); for (const fn of listeners) fn(version); };

/** Fetch the engine and a grammar (once each). Resolves when the grammar can draw; a failed fetch leaves the quick tokens. */
export function wantGrammar(lang) {
  if (typeof window === 'undefined' || !ENGINE_LANGS.has(lang)) return Promise.resolve(false);
  if (engine?.hasGrammar(lang)) return Promise.resolve(true);
  engineLoad ||= import('./engine.js').then((m) => { engine = m; return m; }, () => { engineLoad = null; return null; });
  return engineLoad.then((m) => (m ? m.loadGrammar(lang) : false)).then((ok) => { if (ok) notify(); return ok; });
}

/** Has the grammar for `lang` arrived? */
export const grammarReady = (lang) => !!engine?.hasGrammar(lang);

/** The best tokens there are for a text right now: the grammar's when it has loaded, else the quick ones. */
export function codeTokens(lang, text) {
  const s = String(text ?? '');
  if (!s) return [];
  if (!engine || !ENGINE_LANGS.has(lang) || s.length > ENGINE_MAX || !engine.hasGrammar(lang)) return liteTokens(lang, s);
  const key = `${lang}\u0000${s}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = engine.highlight(lang, s) || liteTokens(lang, s);
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, hit);
  }
  return hit;
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

/** A text's tokens in `lang`, drawn now and again when the grammar arrives. */
export function useCodeTokens(lang, text) {
  const v = useGrammarVersion(lang);
  return useMemo(() => codeTokens(lang, text), [lang, text, v]);
}
