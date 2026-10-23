// The wand's choices (0.5.1): one store for the app, shared by the Oversight panel and Grill me, so a route change
// keeps what came back. GET /api/oversight/choices is read once, on first use (the cache: nothing is spent); a wand
// press is one POST for its ids (server/choices.mjs), and the same ids asked again while one is out join it.
//
//   get(id) -> { status: 'idle'|'loading'|'ready'|'fallback'|'error', options, by, note, reason, at }
//     ready     the model's choices (or the demo's)
//     fallback  the row's own choices, with a note saying why
//     error     nothing to offer, with a note (a refused id, a failure with no choices named)
import { useEffect, useSyncExternalStore } from 'react';

// client.js reads the page's URL as it loads; it comes in on first use, so ui/ stays importable without a page.
const client = () => import('./client.js');

const IDLE = Object.freeze({ status: 'idle', options: [], by: '', note: '', reason: '', at: 0 });
const state = new Map();
const flying = new Map(); // ids signature -> promise
const listeners = new Set();
let version = 0;
let loaded = null;
const emit = () => { version += 1; for (const l of listeners) l(); };
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const snap = () => version;

/** A Choice from the server -> the store's entry. */
export function entryOf(c, error) {
  if (!c) return { ...IDLE, status: 'error', note: error ? `Couldn't get suggestions (${error}).` : "Couldn't get suggestions." };
  const options = Array.isArray(c.options) ? c.options : [];
  const status = c.by === 'ai' || c.by === 'demo' ? 'ready' : options.length ? 'fallback' : 'error';
  return { status, options, by: c.by || '', note: c.note || '', reason: c.reason || (error ? 'failed' : ''), at: c.at || Date.now() };
}

function load() {
  if (loaded) return loaded;
  loaded = client().then((c) => c.api('/api/oversight/choices')).then((r) => {
    for (const [id, c] of Object.entries(r?.choices || {})) if (!state.has(id) || state.get(id).status === 'idle') state.set(id, entryOf(c));
    emit();
  }).catch(() => { /* an older server: the wand still asks */ });
  return loaded;
}

/** The choices for one question id (a plan question's `file:line`, a parked row's `inbox:<id>`). */
export const getChoices = (id) => (id && state.get(id)) || IDLE;

/** Ask for these ids (`fresh`: skip the cache). The same ids already out return the same promise. */
export function askChoices(ids, { fresh = false } = {}) {
  const list = [...new Set((ids || []).filter(Boolean))];
  if (!list.length) return Promise.resolve();
  const sig = `${fresh ? '!' : ''}${[...list].sort().join('|')}`;
  if (flying.has(sig)) return flying.get(sig);
  for (const id of list) state.set(id, { ...getChoices(id), status: 'loading' });
  emit();
  const p = client().then((c) => c.server.choices(list, fresh)).then((r) => {
    for (const id of list) {
      const err = r?.errors?.[id];
      const c = r?.choices?.[id];
      state.set(id, c ? entryOf(c, err) : { ...IDLE, status: 'error', note: err === 'not a question the wand can answer' ? "The wand can't answer this one. Write your answer." : `Couldn't get suggestions (${err || 'no reply'}).`, reason: 'failed', at: Date.now() });
    }
  }).catch((e) => {
    for (const id of list) {
      const was = getChoices(id);
      state.set(id, { ...was, status: was.options.length && was.status !== 'loading' ? was.status : 'error', note: `Couldn't get suggestions (${e?.message || 'it failed'}).`, reason: 'failed', at: Date.now() });
    }
  }).finally(() => { flying.delete(sig); emit(); });
  flying.set(sig, p);
  return p;
}

/** The store, live: { get(id), ask(ids, { fresh }) }. Reads the cache on first use. */
export function useChoices() {
  useSyncExternalStore(subscribe, snap, snap);
  useEffect(() => { load(); }, []);
  return { get: getChoices, ask: askChoices };
}
